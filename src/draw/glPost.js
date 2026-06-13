// WebGL の「仕上げ」層（best-of-both の要）。
// 2D で描いた一枚絵をそのままテクスチャとして受け取り、夏の“空気”をGPUで足す：
//   ・ブルーム（明るい所のにじむ光）＝Canvas2Dでは難しい、夏の光のにじみ
//   ・地平線の陽炎（日中、地平線のすぐ上をゆらす）
// WebGL が使えない環境では available:false を返し、呼び出し側は従来の Canvas2D 仕上げに戻る。
//
// 設計のねらい：今の 2D 描画（や将来の水彩画像）には一切手を入れず、最後に一枚かけるだけ。
// 全画面エフェクトを CPU(Canvas2D) から GPU(シェーダー) に逃がすので、発熱も下がる。

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;     // 0..1（一日の時刻）
uniform float u_now;      // ミリ秒
uniform float u_horizon;  // 画面下からの割合での地平線位置

void main(){
  vec2 uv = v_uv;

  // ── 陽炎：日中、地平線のすぐ上の帯だけ、横方向にゆらす ──
  float day = smoothstep(0.18, 0.30, u_time) * (1.0 - smoothstep(0.50, 0.62, u_time));
  float d = uv.y - u_horizon;                 // >0 で空側（上）
  float band = exp(-pow((d - 0.04) / 0.06, 2.0)); // 地平線のやや上を中心にした帯
  float warp = sin(uv.x * 38.0 + (1.0 - uv.y) * 130.0 + u_now * 0.005) * 0.0016 * day * band;
  uv.x += warp;

  vec3 col = texture2D(u_tex, uv).rgb;

  // ── ブルーム：明るい部分を周囲からにじませて加算（夏の光のにじみ） ──
  vec2 px = 1.0 / u_res;
  vec3 bloom = vec3(0.0);
  const int DIRS = 8;
  for (int i = 0; i < DIRS; i++) {
    float a = (float(i) / float(DIRS)) * 6.2831853;
    vec2 dir = vec2(cos(a), sin(a));
    for (int r = 1; r <= 2; r++) {
      vec2 off = dir * px * float(r) * 5.0;
      vec3 s = texture2D(u_tex, uv + off).rgb;
      // 本当に明るい所(ハイライト)だけ。パステルの中間色はにじませない。
      float lum = max(s.r, max(s.g, s.b));
      float b = smoothstep(0.80, 0.96, lum);
      bloom += s * b;
    }
  }
  bloom /= float(DIRS * 2);
  // 昼ほど強く、夜は控えめに（夏の陽射しのにじみ）
  float bright = 0.8 + 0.5 * (1.0 - smoothstep(0.62, 0.86, u_time));
  col += bloom * 1.5 * bright;

  gl_FragColor = vec4(col, 1.0);
}`

export function createGLPost(canvas) {
  let gl = null
  try {
    const opts = { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: false }
    gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts)
  } catch (e) {
    gl = null
  }
  if (!gl) return { available: false }

  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[glPost] shader compile:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }

  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return { available: false }

  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[glPost] link:', gl.getProgramInfoLog(prog))
    return { available: false }
  }

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'a_pos')

  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

  const uRes = gl.getUniformLocation(prog, 'u_res')
  const uTime = gl.getUniformLocation(prog, 'u_time')
  const uNow = gl.getUniformLocation(prog, 'u_now')
  const uHor = gl.getUniformLocation(prog, 'u_horizon')
  const uTex = gl.getUniformLocation(prog, 'u_tex')

  let ok = true

  return {
    available: true,
    // src: 2Dで描いたキャンバス（バッファ）。frame: 時刻など。
    render(src, frame) {
      if (!ok) return
      try {
        gl.viewport(0, 0, canvas.width, canvas.height)
        gl.useProgram(prog)
        gl.bindBuffer(gl.ARRAY_BUFFER, quad)
        gl.enableVertexAttribArray(aPos)
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
        gl.uniform1i(uTex, 0)
        gl.uniform2f(uRes, canvas.width, canvas.height)
        gl.uniform1f(uTime, frame.time)
        gl.uniform1f(uNow, frame.now % 100000)
        gl.uniform1f(uHor, 1.0 - 0.37) // 地平線(上から0.37) を 下からの割合に
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      } catch (e) {
        console.warn('[glPost] render failed, falling back:', e)
        ok = false
      }
    },
    get ok() {
      return ok
    },
  }
}
