// ひと夏の一日 ― 3D試作（低ポリ＋トゥーン）
// 目的：本物の3Dで「僕君を操作して歩く／斜めの固定カメラ／高台に座って指スワイプで360度見回す」を確かめる縦スライス。
// 既存の2Dゲームとは別ページ(proto3d.html)。ここで操作感・没入感・絵の方向を実機で判定する。

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { loadAudioUrls } from '../data/audioAssets.js'

const canvas = document.getElementById('c')
const actBtn = document.getElementById('act')
const lookHint = document.getElementById('look')

// ── 地面の高さ（解析式）。地面メッシュもキャラの足元もこの式で揃える。──
const POND = { x: 26, z: 18, r: 11 } // 池の位置・半径
const HOUSE = { x: -17, z: 13 } // 昭和の田舎家（縁側）の位置
const TOWN = { x: 1000, z: 0 } // 住宅街エリアは遠くにオフセット（霧で野原と分離）。x>500=街
const MOUNT = { x: TOWN.x + 6, z: TOWN.z + 92, h: 34, w: 40, d: 18 } // 町の北にそびえる裏山（頂上で街を一望）
function heightAt(x, z) {
  if (x > 500) {
    // 住宅街は平地。北（+z奥）へ行くほど裏山がせり上がる
    const mdx = x - MOUNT.x, mdz = z - MOUNT.z
    const m = MOUNT.h * Math.exp(-(mdx * mdx / (2 * MOUNT.w * MOUNT.w) + mdz * mdz / (2 * MOUNT.d * MOUNT.d)))
    const undul = 0.4 * Math.sin(x * 0.1) * Math.cos(z * 0.1)
    return m + (m > 0.5 ? undul : 0)
  }
  const hill = 6.0 * Math.exp(-((x * x) + (z + 28) * (z + 28)) / (2 * 18 * 18)) // -Z側のなだらかな高台
  const undul = 0.6 * Math.sin(x * 0.08) * Math.cos(z * 0.08) // 微妙なうねり
  const pond = -2.8 * Math.exp(-(((x - POND.x) ** 2) + ((z - POND.z) ** 2)) / (2 * 7 * 7)) // 池のくぼみ
  return hill + undul + pond
}
const WATER_Y = -1.05 // 水面の高さ
const SEAT = new THREE.Vector3(0, 0, -27) // 高台のベンチ位置
SEAT.y = heightAt(SEAT.x, SEAT.z)

// ── レンダラ ──
// antialias は EffectComposer 経由だと最終ブリットにしか効かず実質無駄なので切る（軽量化）
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true }) // 絵日記に画面を取り込むため
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25)) // 発熱対策でさらに控えめ
renderer.outputColorSpace = THREE.SRGBColorSpace
// トゥーンの明るく彩度のある色を保つため、Neutral トーンマップ（ACESは色がくすむ）
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.18
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap // Softより軽い（トゥーンなら十分）

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xdfeaf0, 48, 185) // 空気遠近（霞）。遠景を空の色へ溶かす

const swayables = [] // 風で揺らす草木（{ obj, ph, amp }）

// ── トゥーン用のグラデ（数段の階調）──
function toonGradient(steps = 4) {
  // 影側が真っ暗にならないよう、最暗を 0.5 まで持ち上げる（やわらかく明るいトゥーン）
  const min = 0.5
  const data = new Uint8Array(steps)
  for (let i = 0; i < steps; i++) data[i] = Math.round(255 * (min + (1 - min) * (i / (steps - 1))))
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}
const GRAD = toonGradient(4)
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: GRAD })

// ── トゥーンの輪郭線（インクのフチ）：少し膨らませた裏面を暗色で描く＝アニメ/僕夏的な線 ──
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x2c2419, side: THREE.BackSide, fog: true })
function addOutline(mesh, thickness = 0.05) {
  mesh.geometry.computeBoundingSphere()
  const r = (mesh.geometry.boundingSphere && mesh.geometry.boundingSphere.radius) || 1
  const o = new THREE.Mesh(mesh.geometry, OUTLINE_MAT)
  o.scale.setScalar(1 + thickness / r) // 世界でほぼ一定の太さに
  mesh.add(o)
}
function outlineObj(obj, thickness = 0.05) {
  const meshes = []
  obj.traverse((m) => { if (m.isMesh) meshes.push(m) })
  for (const m of meshes) addOutline(m, thickness)
}

// ── 接地影（やわらかい丸影）：物が地面から浮いて見える低ポリの安っぽさを消す ──
const SHADOW_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d')
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30)
  g.addColorStop(0, 'rgba(24,28,18,0.5)'); g.addColorStop(1, 'rgba(24,28,18,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()
const shadowMat = new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, fog: true })
function addContactShadow(parent, radius, y = 0.05) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), shadowMat)
  m.rotation.x = -Math.PI / 2; m.position.y = y
  parent.add(m); return m
}

// ── ライト ──
const sunDir = new THREE.Vector3(-0.5, 0.82, -0.32).normalize()
const sun = new THREE.DirectionalLight(0xfff2d8, 2.1)
sun.position.copy(sunDir.clone().multiplyScalar(120))
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
sun.shadow.camera.near = 10
sun.shadow.camera.far = 260
const sc = sun.shadow.camera
sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70
sun.shadow.bias = -0.0004
scene.add(sun)
scene.add(sun.target) // 影カメラと光の向きを主人公に追従させるため
const hemi = new THREE.HemisphereLight(0xcfeaf6, 0x86a05a, 1.15) // 空色↔草色の柔らかい環境光（明るめ）
scene.add(hemi)
// 逆光のリムライト（太陽の反対側から低く差す暖色。輪郭をふちどり、夕方は特に強く）。影は落とさない。
const rim = new THREE.DirectionalLight(0xffd9a8, 0.4)
scene.add(rim); scene.add(rim.target)

// ── 空（グラデのドーム。霧は掛けない）──
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x8fc4e6) },
    mid: { value: new THREE.Color(0xcfe8f0) },
    bottom: { value: new THREE.Color(0xeef4e6) },
  },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
    void main(){ float h = normalize(vP).y; vec3 c = h>0.0 ? mix(mid, top, clamp(h*1.4,0.0,1.0)) : mix(mid, bottom, clamp(-h*2.0,0.0,1.0)); gl_FragColor = vec4(c,1.0);} `,
})
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat)
scene.add(skyDome)

// 太陽（明るい球。ブルームでにじむ）
const sunBall = new THREE.Mesh(
  new THREE.SphereGeometry(9, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff4cf, fog: false }),
)
sunBall.position.copy(sunDir.clone().multiplyScalar(300))
scene.add(sunBall)

// ── 時間帯のライティング（朝→昼→夕→夜。光色・影の長さ・空・霞が移ろう＝郷愁の核）──
const PAL = {
  morn: { light: 0xffe9c8, li: 2.0, sky: 0x9fc8e8, mid: 0xdcebef, bot: 0xf3efe0, fog: 0xe7eee6, hi: 1.5, hsky: 0xcfe6f4, hgnd: 0x9ab468, ball: 0xfff0cf, rim: 0xffdcb0, ri: 0.5 },
  noon: { light: 0xfff6e8, li: 2.5, sky: 0x7fbce6, mid: 0xc3e1ef, bot: 0xeff5e7, fog: 0xdfeaf0, hi: 1.7, hsky: 0xdaf0fb, hgnd: 0x9ab468, ball: 0xfff6d8, rim: 0xfff0d8, ri: 0.3 },
  dusk: { light: 0xffa85f, li: 2.0, sky: 0x7a6aa6, mid: 0xeaa672, bot: 0xf8d59a, fog: 0xeec096, hi: 1.15, hsky: 0xe0aa86, hgnd: 0x7e7a54, ball: 0xffac63, rim: 0xff944e, ri: 0.95 },
  night: { light: 0x7d93cc, li: 0.7, sky: 0x0d1322, mid: 0x1a2340, bot: 0x2c3a58, fog: 0x222c48, hi: 0.62, hsky: 0x35487a, hgnd: 0x32434e, ball: 0xcdd6ff, rim: 0x6a82c4, ri: 0.18 },
}
const _a = new THREE.Color(), _b = new THREE.Color()
const lc = (out, ha, hb, u) => out.copy(_a.set(ha)).lerp(_b.set(hb), u)
const ln = (a, b, u) => a + (b - a) * u
function pickPal(t) {
  if (t < 0.5) return { from: PAL.morn, to: PAL.noon, u: t / 0.5 }
  if (t < 0.78) return { from: PAL.noon, to: PAL.dusk, u: (t - 0.5) / 0.28 }
  return { from: PAL.dusk, to: PAL.night, u: (t - 0.78) / 0.22 }
}
function setTimeOfDay(t) {
  const { from, to, u } = pickPal(t)
  // 太陽の運行（朝=低い東 → 昼=高い → 夕=低い西）。夜は地平線下。
  const elev = Math.sin(Math.min(t, 0.9) / 0.9 * Math.PI) // 0..1..0
  const elevAngle = elev * 1.25
  const az = Math.PI * (0.12 + t * 0.95)
  sunDir.set(Math.cos(az) * Math.cos(elevAngle), Math.sin(elevAngle) + 0.04, Math.sin(az) * Math.cos(elevAngle)).normalize()
  sun.position.copy(sunDir).multiplyScalar(120)
  sunBall.position.copy(sunDir).multiplyScalar(300)
  lc(sun.color, from.light, to.light, u)
  sun.intensity = ln(from.li, to.li, u)
  lc(sunBall.material.color, from.ball, to.ball, u)
  lc(skyMat.uniforms.top.value, from.sky, to.sky, u)
  lc(skyMat.uniforms.mid.value, from.mid, to.mid, u)
  lc(skyMat.uniforms.bottom.value, from.bot, to.bot, u)
  lc(scene.fog.color, from.fog, to.fog, u)
  hemi.intensity = ln(from.hi, to.hi, u)
  lc(hemi.color, from.hsky, to.hsky, u)
  lc(hemi.groundColor, from.hgnd, to.hgnd, u)
  // リムライト：太陽の水平反対側から、やや低く差す（輪郭の暖かいふち）
  lc(rim.color, from.rim, to.rim, u)
  rim.intensity = ln(from.ri, to.ri, u)
}
let tday = 0.18 // 朝から始める
let dayAuto = true // ゆっくり一日が流れる
setTimeOfDay(tday)

// ── 地面（高台つきの草地。頂点を heightAt で持ち上げる）──
const gGeo = new THREE.PlaneGeometry(240, 240, 90, 90)
gGeo.rotateX(-Math.PI / 2)
const gPos = gGeo.attributes.position
const gCol = []
const cGrassLo = new THREE.Color(0x84b252)
const cGrassHi = new THREE.Color(0xb6d97a)
const cGrassDry = new THREE.Color(0xb0ac6e) // 夏の日に焼けた乾いた草＝大きなムラで点在
for (let i = 0; i < gPos.count; i++) {
  const x = gPos.getX(i), z = gPos.getZ(i)
  const y = heightAt(x, z)
  gPos.setY(i, y)
  const t = THREE.MathUtils.clamp(0.4 + y * 0.06 + 0.5 * Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.2, 0, 1)
  const c = cGrassLo.clone().lerp(cGrassHi, t)
  // 低い周波数の大きなパッチで、ところどころ乾いた色へ寄せる（のっぺり単一緑を崩す）
  const dry = 0.5 + 0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05 - 0.7)
  c.lerp(cGrassDry, THREE.MathUtils.smoothstep(dry, 0.74, 1.0) * 0.55)
  gCol.push(c.r, c.g, c.b)
}
gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3))
gGeo.computeVertexNormals()
// 水彩風のムラ（無地の面に手描きの濃淡を足す＝のっぺり感を消す）
const watercolorTex = (() => {
  const s = 256
  const c = document.createElement('canvas'); c.width = c.height = s
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 300; i++) {
    const r = 6 + Math.random() * 46
    const v = 188 + Math.random() * 60 // 薄いグレーの濃淡
    x.globalAlpha = 0.05
    x.fillStyle = `rgb(${v|0},${v|0},${v|0})`
    const px = Math.random() * s, py = Math.random() * s
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { // 継ぎ目をまたいで描く
      x.beginPath(); x.arc(px + ox, py + oy, r, 0, Math.PI * 2); x.fill()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(7, 7)
  return t
})()
const ground = new THREE.Mesh(gGeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, map: watercolorTex }))
ground.receiveShadow = true
scene.add(ground)

// ── 池（様式化したトゥーン水面：さざ波＋きらめき）──
const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    uTime: { value: 0 },
    deep: { value: new THREE.Color(0x2f6f86) },
    shallow: { value: new THREE.Color(0x7fc0c8) },
  },
  vertexShader: `varying vec2 vUv; varying vec3 vW;
    void main(){ vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime; uniform vec3 deep; uniform vec3 shallow;
    void main(){
      float d = distance(vUv, vec2(0.5)) * 2.0;
      vec3 col = mix(deep, shallow, smoothstep(0.45, 1.0, d)); // 岸ほど淡く
      float w = sin(vW.x * 0.7 + uTime * 0.9) * sin(vW.z * 0.7 - uTime * 0.7); // さざ波
      col += vec3(0.07, 0.11, 0.11) * smoothstep(0.35, 0.95, w);
      float sp = sin(vW.x * 6.0 + uTime * 3.0) * sin(vW.z * 5.3 + uTime * 2.1); // きらめき
      col += vec3(0.95, 0.98, 1.0) * 0.22 * smoothstep(0.93, 1.0, sp);
      float edge = smoothstep(0.85, 1.0, d); // 岸ぎわは少し透ける
      gl_FragColor = vec4(col, 0.9 - edge * 0.35);
    }`,
})
const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 48), waterMat)
water.rotation.x = -Math.PI / 2
water.position.set(POND.x, WATER_Y, POND.z)
scene.add(water)
// 岸の小石
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + 0.4
  const rr = POND.r * (0.92 + Math.random() * 0.18)
  const rx = POND.x + Math.cos(a) * rr, rz = POND.z + Math.sin(a) * rr
  const sz = 0.4 + Math.random() * 0.5
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(sz, 0), toon(0x9a958c))
  rock.position.set(rx, heightAt(rx, rz) + sz * 0.3, rz); rock.castShadow = true
  addOutline(rock, 0.05); addContactShadow(rock, sz * 1.4, -sz * 0.28)
  scene.add(rock)
}

// ── 低ポリの木（幹＋葉のかたまり）──
function makeTree(x, z, s = 1) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 3.4 * s, 6), toon(0x7a5a3a))
  trunk.position.y = 1.7 * s
  trunk.castShadow = true
  g.add(trunk)
  // 葉のかたまり：少し多めに重ね、上のひとかたまりは陽が当たって明るい＝立体感。
  // detail=1 のイコサヘドロンで、カクカクのまま角だけやわらげる。
  const greens = [0x6f9a47, 0x79a44e, 0x5f8b3c, 0x86b257]
  const blobs = [[1.85, 3.3, 0], [1.5, 4.0, 0], [1.25, 4.7, 1], [1.3, 3.8, 0], [1.05, 4.4, 0]]
  for (let i = 0; i < blobs.length; i++) {
    const [r, by, light] = blobs[i]
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), toon(light ? 0x9ec06c : greens[i % greens.length]))
    blob.position.set((Math.random() - 0.5) * 1.8 * s, by * s, (Math.random() - 0.5) * 1.8 * s)
    blob.castShadow = true
    g.add(blob)
  }
  g.position.set(x, heightAt(x, z), z)
  outlineObj(g, 0.08)
  addContactShadow(g, 2.0 * s)
  scene.add(g)
  swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.02 })
}
for (const [x, z, s] of [[14, 6, 1.1], [-16, 2, 1.0], [22, -10, 1.2], [-22, -14, 1.1], [9, -22, 0.9], [-10, -24, 0.95], [30, 12, 1.0], [-30, 14, 1.1]]) makeTree(x, z, s)

// ── 昭和の田舎家（縁側・瓦屋根・障子）＝時代の空気の核。麦わら帽子の少年の“おばあちゃんち”的な原風景 ──
function makeHouse(x, z, rot, roofHex) {
  const g = new THREE.Group()
  const wall = toon(0xe6dcc4), wood = toon(0x8a6a44), roofC = toon(roofHex || 0x586472), woodDark = toon(0x6a4e30)
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.1, 5), wall); body.position.y = 1.75; g.add(body)
  // 縁側（前面の木の床）と支柱
  const engawa = new THREE.Mesh(new THREE.BoxGeometry(7, 0.28, 1.5), wood); engawa.position.set(0, 0.62, 3.2); g.add(engawa)
  for (const px of [-3.2, 3.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), woodDark); post.position.set(px, 1.9, 3.7); g.add(post) }
  // 障子（前面の白い格子）
  for (let i = 0; i < 3; i++) {
    const sho = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 2.0), new THREE.MeshToonMaterial({ color: 0xf2efe2, gradientMap: GRAD }))
    sho.position.set(-2.2 + i * 2.2, 1.85, 2.51); g.add(sho)
  }
  // 軒（前面の小庇）
  const eave = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.16, 1.7), roofC); eave.position.set(0, 3.25, 3.3); eave.rotation.x = -0.12; g.add(eave)
  // 瓦屋根（寄棟・青灰）
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.1, 2.7, 4), roofC); roof.position.y = 4.7; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.76); g.add(roof)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  outlineObj(g, 0.06)
  addContactShadow(g, 5.2)
  scene.add(g)
  return g
}
makeHouse(HOUSE.x, HOUSE.z, 0.35)
// 縁側の生活感：蚊取り線香（煙がゆらぐ）。風鈴は音とともに後段で。
const HENG = { x: HOUSE.x + Math.sin(0.35) * 3.0, y: heightAt(HOUSE.x, HOUSE.z), z: HOUSE.z + Math.cos(0.35) * 3.0 }
{
  const katori = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 18), toon(0x3a5a3a))
  katori.rotation.x = -Math.PI / 2; katori.position.set(HENG.x + 1.4, HENG.y + 0.62, HENG.z); katori.castShadow = true
  scene.add(katori)
}
const smokers = [] // 蚊取り線香などの細い煙。複数の発生源を持てる
function makeSmoke(x, y, z, n = 14) {
  const g = new THREE.BufferGeometry(); const sp = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { sp[i * 3] = x; sp[i * 3 + 1] = y + i * 0.16; sp[i * 3 + 2] = z }
  g.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xeceae2, size: 0.13, transparent: true, opacity: 0.3, depthWrite: false, fog: true }))
  scene.add(pts); smokers.push({ pts, x, y, z, n })
}
makeSmoke(HENG.x + 1.4, HENG.y + 0.7, HENG.z) // 縁側の蚊取り線香

// ── 時代の生活痕（昭和後期〜平成初期）：丸ポスト・物干し・電柱と電線・自販機 ──
function placeProp(g, x, z, rot, outline, shadowR) {
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  outlineObj(g, outline); addContactShadow(g, shadowR); scene.add(g)
  return g
}
// 丸ポスト
{
  const g = new THREE.Group(); const red = toon(0xc0392b)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 2.2, 12), red); body.position.y = 1.1; g.add(body)
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); top.position.y = 2.2; g.add(top)
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.06), toon(0x241712)); slot.position.set(0, 1.72, 0.42); g.add(slot)
  placeProp(g, -7, 22, 0, 0.04, 0.7)
}
// 物干し（洗濯もの）
{
  const g = new THREE.Group(); const pole = toon(0xb4b4b0)
  for (const px of [-1.8, 1.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), pole); p.position.set(px, 1.0, 0); g.add(p) }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.9, 6), pole); bar.rotation.z = Math.PI / 2; bar.position.y = 1.85; g.add(bar)
  const cols = [0xeaeae6, 0x9fc6e0, 0xeaeae6, 0xe8b7a0]
  for (let i = 0; i < 4; i++) { const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.85), new THREE.MeshToonMaterial({ color: cols[i], gradientMap: GRAD, side: THREE.DoubleSide })); cloth.position.set(-1.3 + i * 0.86, 1.4, 0); g.add(cloth) }
  placeProp(g, -22, 18, 0.4, 0.03, 1.6)
}
// 当時の自販機（前面が光る）
{
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.9), toon(0xc23a2c)); body.position.y = 1.1; g.add(body)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.25, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff3c8 })); panel.position.set(0, 1.45, 0.46); g.add(panel)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const can = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), toon([0xd24a3a, 0x3a6a9a, 0x3e8a4a][(i + j) % 3])); can.position.set(-0.3 + i * 0.3, 1.05 + j * 0.4, 0.5); g.add(can) }
  placeProp(g, -2, 24, 0.2, 0.04, 1.0)
}
// 電柱２本＋電線（drooping）
function makePole(x, z) {
  const g = new THREE.Group(); const pole = toon(0x9a958c)
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 9, 8), pole); p.position.y = 4.5; g.add(p)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), toon(0x6a5a44)); arm.position.y = 8.2; g.add(arm)
  placeProp(g, x, z, 0, 0.05, 0.6)
  return new THREE.Vector3(x, heightAt(x, z) + 8.2, z)
}
const poleA = makePole(-6, 30)
const poleB = makePole(10, 32)
function drawWire(a, b, sag) {
  const pts = []
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t)) }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.7 }))
  scene.add(line)
}
drawWire(poleA, poleB, 1.2)
drawWire(poleB, new THREE.Vector3(HOUSE.x, heightAt(HOUSE.x, HOUSE.z) + 3.5, HOUSE.z), 0.8)

// ── 住宅街エリア（昭和の街並み：家・ブロック塀・電柱・空き地の土管）＝ドラえもん的な往来先 ──
const GATE_FIELD = new THREE.Vector3(42, 0, 36)            // 野原側の出入口（→町へ）
const GATE_TOWN = new THREE.Vector3(TOWN.x, 0, TOWN.z - 26) // 街側の出入口（→はらっぱへ）
function makeGate(p, rot) {
  const g = new THREE.Group(); const w = toon(0x9a6a3a)
  for (const px of [-1.7, 1.7]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3.4, 8), w); post.position.set(px, 1.7, 0); g.add(post) }
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.34, 0.34), toon(0x7a5230)); top.position.y = 3.3; g.add(top)
  placeProp(g, p.x, p.z, rot || 0, 0.05, 1.6)
}
makeGate(GATE_FIELD, 0)
makeGate(GATE_TOWN, 0)
// 野原から門へ続く土の道（往来の導線＝門が「町への道」だと分かる）
{
  const pgeo = new THREE.PlaneGeometry(5, 38); pgeo.rotateX(-Math.PI / 2)
  const path = new THREE.Mesh(pgeo, new THREE.MeshToonMaterial({ color: 0xc6aa7c, gradientMap: GRAD, map: watercolorTex }))
  path.rotation.y = 1.05; path.position.set(36, 0.06, 31); path.receiveShadow = true; scene.add(path)
}
// 門の外へ続く田舎道＝往来の先が「もう一方の場所へ続く道」だと分かる導線。
// 電柱と電線が霧の奥へ遠ざかり、道がそのまま続いている気配を出す。
function makeApproach(cx, cz, dz, len) {
  const pg = new THREE.PlaneGeometry(5, len); pg.rotateX(-Math.PI / 2)
  const road = new THREE.Mesh(pg, new THREE.MeshToonMaterial({ color: 0xc6aa7c, gradientMap: GRAD, map: watercolorTex }))
  road.position.set(cx, 0.05, cz + dz * (len / 2)); road.receiveShadow = true; scene.add(road)
  let prev = null
  for (let i = 1; i <= 3; i++) { const top = makePole(cx + 3.4, cz + dz * (i * len / 3.2)); if (prev) drawWire(prev, top, 0.9); prev = top }
}
makeApproach(GATE_FIELD.x, GATE_FIELD.z + 1.5, 1, 28)  // 野原の門→（町の方へ続く道）
makeApproach(GATE_TOWN.x, GATE_TOWN.z - 1.5, -1, 28)   // 町の門→（野原の方へ続く道）
// 道しるべ（木の標識）＝どこへ行けるか ひと目で分かるように。プレイヤーの方を向く面に文字。
function makeSignpost(x, z, rot, text) {
  const g = new THREE.Group(); const w = toon(0x8a5e34)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), w); post.position.y = 1.3; g.add(post)
  const c = document.createElement('canvas'); c.width = 320; c.height = 90; const cx = c.getContext('2d')
  cx.fillStyle = '#ecdfc2'; cx.fillRect(0, 0, 320, 90)
  cx.strokeStyle = '#6a5230'; cx.lineWidth = 7; cx.strokeRect(4, 4, 312, 82)
  cx.fillStyle = '#4a3a24'; cx.font = 'bold 38px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'
  cx.fillText(text, 160, 48)
  const tex = new THREE.CanvasTexture(c)
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 0.1), new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: GRAD }))
  board.position.y = 2.15; g.add(board)
  placeProp(g, x, z, rot || 0, 0.03, 0.5)
}
// 野原側：門の手前に立て、野原から来る人（-z向き）に見えるよう板を-zへ向ける
makeSignpost(GATE_FIELD.x + 3.0, GATE_FIELD.z - 2.2, Math.PI, 'このさき 町（まち）')
// 町側：門の手前に立て、町から来る人（+z向き）に見えるよう板を+zへ向ける
makeSignpost(GATE_TOWN.x - 3.0, GATE_TOWN.z + 2.2, 0, 'このさき はらっぱ')
// 商店街の一軒（昭和の店構え：店先・縞テント・看板・袖看板・品物）
function makeShop(x, z, rot, opt) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 5), toon(0xe2d6bc)); body.position.y = 2.1; g.add(body)
  const front = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.3), new THREE.MeshBasicMaterial({ color: 0x2a221a })); front.position.set(0, 1.35, 2.51); g.add(front)
  // 暖簾（のれん・切れ目つき）
  for (let i = 0; i < 4; i++) { const nr = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.95), toon(opt.sign)); nr.position.set(-1.8 + i * 1.2, 2.05, 2.53); g.add(nr) }
  // 縞テント（白×店色）
  const tent = new THREE.Group()
  const stripes = 6
  for (let i = 0; i < stripes; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(6.2 / stripes, 0.18, 1.7), toon(i % 2 ? 0xf2efe6 : opt.awn))
    s.position.set(-3.1 + (i + 0.5) * (6.2 / stripes), 0, 0); tent.add(s)
  }
  tent.position.set(0, 2.75, 3.2); tent.rotation.x = -0.18; g.add(tent)
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 0.2), toon(opt.sign)); sign.position.set(0, 3.55, 2.5); g.add(sign)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 0.72), toon(opt.sign)); blade.position.set(-3.05, 2.7, 2.7); g.add(blade)
  // 品物
  if (opt.kind === 'yaoya') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 1.1), toon(0x9c6b3a)); crate.position.set(0, 0.5, 3.4); g.add(crate)
    const veg = [0xd2542a, 0xe0a030, 0x5a8a3a, 0xc03030, 0xe8c040]
    for (let i = 0; i < 5; i++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), toon(veg[i])); v.position.set(-1.6 + i * 0.8, 0.85, 3.4); g.add(v) }
  } else if (opt.kind === 'denki') {
    for (let i = 0; i < 2; i++) { const tv = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.6), toon(0x2a2a30)); tv.position.set(-1 + i * 2, 1.2, 2.7); g.add(tv); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ color: [0x88c8e0, 0xe0c060][i] })); sc.position.set(-1 + i * 2, 1.25, 3.01); g.add(sc) }
  } else if (opt.kind === 'dagashi') {
    for (let i = 0; i < 4; i++) { const jar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), toon([0xe05a6a, 0x5aa0e0, 0xe0c040, 0x7ac060][i])); jar.position.set(-1.5 + i * 1, 0.85, 3.3); g.add(jar) }
  } else if (opt.kind === 'niku') {
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 1.1), new THREE.MeshToonMaterial({ color: 0xdadfe2, gradientMap: GRAD, transparent: true, opacity: 0.7 })); caseM.position.set(0, 0.6, 3.4); g.add(caseM)
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  outlineObj(g, 0.05); addContactShadow(g, 4)
  scene.add(g)
  return g
}
{
  const T = TOWN
  // 地面：手前＝住宅街の平地、奥（+z）＝裏山へせり上がる。頂点をheightAtで持ち上げ、高さで色分け
  const TGX = T.x + 5, TGZ = T.z + 35 // 地面メッシュの中心（北へ広げ裏山を含む）
  const tgeo = new THREE.PlaneGeometry(190, 210, 95, 105); tgeo.rotateX(-Math.PI / 2)
  const tpos = tgeo.attributes.position, tcol = []
  const cTownGnd = new THREE.Color(0xb6ad99), cMntGrass = new THREE.Color(0x86b257), cMntDark = new THREE.Color(0x6f9a47)
  for (let i = 0; i < tpos.count; i++) {
    const wx = tpos.getX(i) + TGX, wz = tpos.getZ(i) + TGZ
    const y = heightAt(wx, wz); tpos.setY(i, y)
    const c = cTownGnd.clone().lerp(cMntGrass, THREE.MathUtils.smoothstep(y, 1, 6))
    c.lerp(cMntDark, THREE.MathUtils.smoothstep(y, 16, 30))
    tcol.push(c.r, c.g, c.b)
  }
  tgeo.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3)); tgeo.computeVertexNormals()
  const tg = new THREE.Mesh(tgeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, map: watercolorTex }))
  tg.position.set(TGX, 0, TGZ); tg.receiveShadow = true; scene.add(tg)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 64), new THREE.MeshToonMaterial({ color: 0x8c8c8c, gradientMap: GRAD }))
  road.rotation.x = -Math.PI / 2; road.position.set(T.x, 0.02, T.z); scene.add(road)
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 64), new THREE.MeshBasicMaterial({ color: 0xeeeae0 }))
  cl.rotation.x = -Math.PI / 2; cl.position.set(T.x, 0.03, T.z); scene.add(cl)
  // 右側：家＋ブロック塀（道を向く・屋根色をばらして“クローン感”を消す）
  const roofs = [0x586472, 0x6a5a4a, 0x4a6a5a, 0x705a52, 0x556088]
  for (let i = 0; i < 4; i++) {
    const hx = T.x + 12, hz = T.z - 18 + i * 13
    makeHouse(hx, hz, -Math.PI / 2, roofs[i % roofs.length])
    const wall = new THREE.Mesh(new THREE.BoxGeometry(9, 1.0, 0.4), toon(0xbcb6a4))
    wall.position.set(hx - 4.4, 0.5, hz); wall.rotation.y = Math.PI / 2; wall.castShadow = true
    addOutline(wall, 0.03); scene.add(wall)
  }
  // 左側：商店街（八百屋・肉屋・電器屋・駄菓子屋）
  const shopDefs = [
    { awn: 0x3e8a4a, sign: 0x2e7a3e, kind: 'yaoya' },
    { awn: 0xc0492f, sign: 0xb03020, kind: 'niku' },
    { awn: 0x3a6a9a, sign: 0x2a5080, kind: 'denki' },
    { awn: 0xc85a95, sign: 0xa84080, kind: 'dagashi' },
  ]
  for (let i = 0; i < shopDefs.length; i++) makeShop(T.x - 12, T.z - 18 + i * 13, Math.PI / 2, shopDefs[i])
  // 電柱＋電線
  const tp = []
  for (let i = 0; i < 4; i++) tp.push(makePole(T.x + 5.5, T.z - 22 + i * 15))
  for (let i = 0; i < tp.length - 1; i++) drawWire(tp[i], tp[i + 1], 1.0)
  // 空き地＋土管（ドラえもん的）＋雑草
  function pipe(x, y, z) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.3, 18, 1, true), new THREE.MeshToonMaterial({ color: 0xc0bcb0, gradientMap: GRAD, side: THREE.DoubleSide }))
    p.rotation.z = Math.PI / 2; p.position.set(x, y, z); p.castShadow = true; addOutline(p, 0.04); scene.add(p)
  }
  const lx = T.x - 33, lz = T.z + 12
  pipe(lx, 1.0, lz); pipe(lx + 2.4, 1.0, lz); pipe(lx + 1.2, 2.7, lz)
  for (let i = 0; i < 34; i++) {
    const wx = lx - 7 + Math.random() * 18, wz = lz - 9 + Math.random() * 16
    const w = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), toon(0x88a250)); w.scale.set(1, 0.4, 1)
    w.position.set(wx, 0.1, wz); scene.add(w)
  }
  // 街かどの生活痕：丸ポスト・当時の自販機
  {
    const pg = new THREE.Group(); const red = toon(0xc0392b)
    const pbody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 2.2, 12), red); pbody.position.y = 1.1; pg.add(pbody)
    const ptop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); ptop.position.y = 2.2; pg.add(ptop)
    placeProp(pg, T.x + 5.5, T.z - 25, 0, 0.04, 0.7)
    const vg = new THREE.Group()
    const vb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.9), toon(0xc23a2c)); vb.position.y = 1.1; vg.add(vb)
    const vp = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.25, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff3c8 })); vp.position.set(0, 1.45, 0.46); vg.add(vp)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const can = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), toon([0xd24a3a, 0x3a6a9a, 0x3e8a4a][(i + j) % 3])); can.position.set(-0.3 + i * 0.3, 1.05 + j * 0.4, 0.5); vg.add(can) }
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.04), toon(0x241712)); slot.position.set(0.4, 0.7, 0.46); vg.add(slot) // 取り出し口
    placeProp(vg, T.x + 4.5, T.z + 16, -Math.PI / 2, 0.04, 1.0)
  }
  // 夕涼みの縁台＋蚊取り線香（商店街の軒先）
  {
    const en = new THREE.Group(); const w = toon(0x9a6a3a)
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.66), w); top.position.y = 0.46; en.add(top)
    for (const lx of [-0.9, 0.9]) for (const lz of [-0.22, 0.22]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.12), toon(0x7a5230)); leg.position.set(lx, 0.23, lz); en.add(leg) }
    placeProp(en, T.x - 6.5, T.z + 2, Math.PI / 2, 0.03, 1.3) // 道と平行に置く
    const ey = heightAt(T.x - 6.5, T.z + 3)
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), toon(0x3a6a8a)); dish.position.set(T.x - 6.5, ey + 0.55, T.z + 3); dish.castShadow = true; scene.add(dish)
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 16), toon(0x3a5a3a)); coil.rotation.x = -Math.PI / 2; coil.position.set(T.x - 6.5, ey + 0.59, T.z + 3); coil.castShadow = true; scene.add(coil)
    makeSmoke(T.x - 6.5, ey + 0.66, T.z + 3)
  }
  // 簾（すだれ）＝八百屋の軒先に掛ける。横筋のテクスチャで葦の感じ
  {
    const c = document.createElement('canvas'); c.width = 8; c.height = 80; const x = c.getContext('2d')
    x.fillStyle = '#c9b079'; x.fillRect(0, 0, 8, 80)
    x.strokeStyle = '#9a7f4c'; x.lineWidth = 1
    for (let i = 2; i < 80; i += 3) { x.beginPath(); x.moveTo(0, i); x.lineTo(8, i); x.stroke() }
    const tex = new THREE.CanvasTexture(c)
    const sud = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: GRAD, side: THREE.DoubleSide }))
    sud.position.set(T.x - 9.1, 2.7, T.z - 18); sud.rotation.y = Math.PI / 2; scene.add(sud)
  }
}
const VENDING = new THREE.Vector3(TOWN.x + 4.5, 0, TOWN.z + 16) // 街の自販機（ラムネを買える）

// ── 小さな草花（赤・白・黄の点。場を生き生きと）──
{
  const flowerCols = [0xe06a6a, 0xf2efe6, 0xe8c84a, 0x6e7fd0]
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * 110, z = (Math.random() - 0.5) * 110
    if (x * x + (z + 28) * (z + 28) < 30) continue
    if ((x - POND.x) ** 2 + (z - POND.z) ** 2 < POND.r * POND.r) continue // 池の上は空ける
    const fg = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), toon(0x5f8b3c)); stem.position.y = 0.3; fg.add(stem)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toon(flowerCols[i % flowerCols.length])); head.position.y = 0.62; fg.add(head)
    fg.position.set(x, heightAt(x, z), z)
    scene.add(fg)
  }
}

// ── 遠くの丘（360度の景色のため、周囲に低い丘をぐるりと）──
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2 + 0.3
  const r = 150 + Math.random() * 40
  const hx = Math.cos(a) * r, hz = Math.sin(a) * r
  const hill = new THREE.Mesh(new THREE.SphereGeometry(30 + Math.random() * 24, 16, 10), toon(0x86b06a))
  hill.position.set(hx, -10 + Math.random() * 4, hz)
  hill.scale.y = 0.4
  scene.add(hill)
}

// ── 草むら（低い茂みのかたまり。InstancedMeshで安く密に・風になびく）──
let grassShader = null
{
  const tuft = new THREE.IcosahedronGeometry(0.5, 0)
  tuft.scale(1, 0.45, 1) // ぺたっと平たく＝草むらのかたまり
  const N = 860
  const grassMat = toon(0x76a249)
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gw = sin(uTime * 1.3 + (instanceMatrix[3].x + instanceMatrix[3].z) * 0.25);
        transformed.x += gw * 0.18 * max(position.y, 0.0);`)
    grassShader = sh
  }
  const grass = new THREE.InstancedMesh(tuft, grassMat, N)
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s2 = new THREE.Vector3()
  let n = 0
  while (n < N) {
    let x, z
    if (n < N * 0.45) { // 半分弱は中央の遊び場を密に＝歩く所がいちばん草深い
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 44
      x = Math.cos(a) * r; z = Math.sin(a) * r
    } else { x = (Math.random() - 0.5) * 150; z = (Math.random() - 0.5) * 150 }
    if (x * x + (z + 28) * (z + 28) < 36) continue // ベンチ周りは空ける
    if ((x - POND.x) ** 2 + (z - POND.z) ** 2 < POND.r * POND.r) continue // 池の上は空ける
    if ((x - HOUSE.x) ** 2 + (z - HOUSE.z) ** 2 < 40) continue // 家の周りは空ける
    p.set(x, heightAt(x, z) + 0.12, z)
    q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0))
    const sc2 = 0.5 + Math.random() * 1.1
    const yh = Math.random() < 0.28 ? 1.0 + Math.random() * 0.7 : 0.7 + Math.random() * 0.5 // 約3割は背が高くこんもり
    s2.set(sc2, sc2 * yh, sc2)
    m.compose(p, q, s2)
    grass.setMatrixAt(n++, m)
  }
  grass.castShadow = false
  scene.add(grass)
}

// ── ひまわり ──
function makeSunflower(x, z) {
  const g = new THREE.Group()
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), toon(0x5f8b3c)); stem.position.y = 1.2; g.add(stem)
  const petals = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 16), toon(0xf2cb50)); petals.position.y = 2.5; petals.rotation.x = 0.5; g.add(petals)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12), toon(0x7a4a22)); core.position.set(0, 2.55, 0.04); core.rotation.x = 0.5; g.add(core)
  g.position.set(x, heightAt(x, z), z)
  g.children.forEach((c) => (c.castShadow = true))
  outlineObj(g, 0.05)
  addContactShadow(g, 0.7)
  scene.add(g)
  swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.05 })
}
for (const [x, z] of [[6, 8], [7.2, 9], [-5, 7], [4, -4]]) makeSunflower(x, z)

// ── ベンチ（高台の上）──
function makeBench() {
  const g = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.0), toon(0x9c7a4a)); seat.position.y = 0.9; g.add(seat)
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.16), toon(0x9c7a4a)); back.position.set(0, 1.35, -0.42); g.add(back)
  for (const lx of [-1.4, 1.4]) for (const lz of [-0.4, 0.4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), toon(0x6a5230)); leg.position.set(lx, 0.45, lz); g.add(leg)
  }
  g.children.forEach((c) => (c.castShadow = true))
  g.position.copy(SEAT)
  g.rotation.y = Math.PI // 背を-Z側に＝座ると景色(-Z, 外側)を向く
  outlineObj(g, 0.05)
  addContactShadow(g, 1.8)
  scene.add(g)
}
makeBench()

// 数個の石
for (const [x, z, r] of [[3, -20, 0.7], [-4, -18, 0.5], [12, -2, 0.6]]) {
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), toon(0x9a958c))
  rock.position.set(x, heightAt(x, z) + r * 0.4, z); rock.castShadow = true; rock.receiveShadow = true
  addOutline(rock, 0.05)
  addContactShadow(rock, r * 1.5, -r * 0.32)
  scene.add(rock)
}

// ── 蝶（昼に舞う。夜は消える）──
const butterflies = []
function makeButterfly(cx, cz) {
  const g = new THREE.Group()
  const col = [0xf2c84a, 0xe8743c, 0xf0f0f0, 0x8a6ed0][Math.floor(Math.random() * 4)]
  const wmat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true })
  const wing = new THREE.PlaneGeometry(0.34, 0.46)
  const wl = new THREE.Mesh(wing, wmat); wl.position.x = -0.18; g.add(wl)
  const wr = new THREE.Mesh(wing, wmat); wr.position.x = 0.18; g.add(wr)
  g.userData = { wl, wr, cx, cz, r: 4 + Math.random() * 6, ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 0.5, mat: wmat }
  scene.add(g)
  butterflies.push(g)
}
for (const [x, z] of [[5, 2], [-8, -4], [12, -8]]) makeButterfly(x, z)

// ── 赤とんぼ（夕方に飛ぶ＝夏の終わりの象徴）──
const dragonflies = []
function makeDragonfly(cx, cz) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.75, 5), new THREE.MeshToonMaterial({ color: 0xd0503a, gradientMap: GRAD, transparent: true })); body.rotation.z = Math.PI / 2; g.add(body)
  const wmat = new THREE.MeshBasicMaterial({ color: 0xdcecff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.15), wmat); w.position.set(s * 0.05, 0.03, s * 0.12); g.add(w) }
  g.userData = { cx, cz, ph: Math.random() * 6.28, r: 3 + Math.random() * 5, sp: 0.5 + Math.random() * 0.4, body: body.material, wing: wmat }
  scene.add(g); dragonflies.push(g)
}
for (const [x, z] of [[7, 4], [-6, 6], [10, -6], [-12, -2]]) makeDragonfly(x, z)

// ── 夕方のカラス（夕焼け空を ねぐらへ帰っていく＝「そろそろ帰る時間」）──
const crows = []
function makeCrow() {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0x23252f, fog: false, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat); body.scale.set(1, 0.7, 2.4); g.add(body)
  // 翼は体の中心をピボットにして はばたかせる（翼端が上下する＝鳥のV字）
  const wl = new THREE.Group(); g.add(wl)
  const wlm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), mat); wlm.position.x = -0.7; wlm.rotation.x = -Math.PI / 2; wl.add(wlm)
  const wr = new THREE.Group(); g.add(wr)
  const wrm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), mat); wrm.position.x = 0.7; wrm.rotation.x = -Math.PI / 2; wr.add(wrm)
  g.rotation.y = -Math.PI / 2 // 進行方向（+x）を向く
  g.userData = { wl, wr, mat, off: Math.random() * 240, sp: 5 + Math.random() * 2, alt: 17 + Math.random() * 9, lane: -85 + Math.random() * 45, flap: 7 + Math.random() * 3, fph: Math.random() * 6.28 }
  g.visible = false; scene.add(g); crows.push(g)
}
for (let i = 0; i < 5; i++) makeCrow()

// ── 足元の砂ぼこり（走ると ふっと土が舞う）──
const DUSTN = 36
const dustPos = new Float32Array(DUSTN * 3).fill(-9999)
const dustVel = new Float32Array(DUSTN * 3)
const dustLife = new Float32Array(DUSTN)
const dustGeo = new THREE.BufferGeometry()
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd8c6a2, size: 0.42, transparent: true, opacity: 0.45, depthWrite: false, fog: true }))
dustPts.frustumCulled = false; scene.add(dustPts)
let dustHead = 0
function spawnDust(x, y, z) {
  const i = dustHead; dustHead = (dustHead + 1) % DUSTN
  dustPos[i * 3] = x + (Math.random() - 0.5) * 0.3; dustPos[i * 3 + 1] = y; dustPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3
  dustVel[i * 3] = (Math.random() - 0.5) * 0.5; dustVel[i * 3 + 1] = 0.4 + Math.random() * 0.4; dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.5
  dustLife[i] = 0.55
}
let lastStepS = 0

// ── 虫採り（つかまえる遊び）：蝶・カブトムシ・セミ ──
const caught = { count: 0, kinds: {} }
const catchables = []
for (const b of butterflies) catchables.push({ obj: b, kind: 'チョウ', done: false })
function makeBug(x, y, z, kind) {
  const g = new THREE.Group()
  if (kind === 'カブトムシ') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toon(0x3a2a1a)); body.scale.set(1, 0.7, 1.35); g.add(body)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), toon(0x241810)); horn.position.set(0, 0.1, 0.34); horn.rotation.x = -0.7; g.add(horn)
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toon(0x5a5a50)); body.scale.set(1, 0.8, 1.7); g.add(body)
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, y, z); scene.add(g)
  catchables.push({ obj: g, kind, done: false })
}
makeBug(14, 2.2, 6.5, 'カブトムシ')
makeBug(22, 2.4, -9.6, 'カブトムシ')
makeBug(-16, 2.6, 2.5, 'セミ')
makeBug(9, 2.0, -21.5, 'セミ')

// ── うろつく猫（茶トラ）。家のまわりを気ままに歩き、近づくと なでられる ──
function makeCat() {
  const g = new THREE.Group()
  const fur = toon(0xd98a4a), dark = toon(0xa86a34)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), fur); body.scale.set(1.4, 0.8, 0.85); body.position.y = 0.36; g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), fur); head.position.set(0.46, 0.5, 0); g.add(head)
  for (const ez of [-0.12, 0.12]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.17, 5), dark); ear.position.set(0.44, 0.72, ez); g.add(ear) }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.03, 0.55, 6), fur); tail.position.set(-0.52, 0.5, 0); tail.rotation.z = -1.0; g.add(tail)
  for (const [lx, lz] of [[0.32, 0.18], [0.32, -0.18], [-0.32, 0.18], [-0.32, -0.18]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 6), fur); leg.position.set(lx, 0.18, lz); g.add(leg) }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  outlineObj(g, 0.022); addContactShadow(g, 0.6)
  g.userData.tail = tail
  scene.add(g)
  return g
}
const cat = makeCat()
cat.position.set(-10, heightAt(-10, 18), 18)
Object.assign(cat.userData, { tx: -10, tz: 18, rest: 2000, phase: 0 })

// ── 主人公（低ポリの少年・麦わら帽子）──
function makeBoy() {
  const g = new THREE.Group()
  const skin = toon(0xe9bb8e), shirt = toon(0xf4f1e8), pants = toon(0x3f5a77), hat = toon(0xe0bc72)
  // 足の裏が原点(y=0)に来るように全体を下げる＝地面にぴったり接地（浮き防止）
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.38), shirt); torso.position.y = 0.98; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), skin); head.position.y = 1.6; g.add(head)
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 16), hat); brim.position.y = 1.78; g.add(brim)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hat); cap.position.y = 1.78; g.add(cap)
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), pants); legL.position.set(-0.16, 0.38, 0); g.add(legL)
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), skin); armL.position.set(-0.42, 0.98, 0); g.add(armL)
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR)
  // 虫取り網（ふだんは肩にかつぐ。採取時に前へ振る）
  const net = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), toon(0x9a7b4a)); pole.position.y = 0.55; net.add(pole)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 14), toon(0x8a6b3a)); ring.position.y = 1.3; ring.rotation.x = Math.PI / 2; net.add(ring)
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshBasicMaterial({ color: 0xf5f5ee, transparent: true, opacity: 0.28, side: THREE.DoubleSide })); bag.position.y = 1.3; bag.rotation.x = Math.PI; net.add(bag)
  net.position.set(0.34, 0.10, -0.05); net.rotation.set(-0.2, 0, -0.55) // 肩にかつぐ（本体を下げたぶん網も下げる）
  g.add(net)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.userData = { legL, legR, armL, armR, head, net, swing: 0 }
  return g
}
const boy = makeBoy()
boy.position.set(0, heightAt(0, 6), 6)
outlineObj(boy, 0.035)
// 顔（輪郭線の後に付ける＝目はフチ無し）。少年は+z方向を向く。
{
  const eye = new THREE.MeshBasicMaterial({ color: 0x2a2018 })
  for (const ex of [-0.12, 0.12]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eye)
    e.position.set(ex, 0.04, 0.29)
    boy.userData.head.add(e)
  }
}
scene.add(boy)
// 主人公の接地影（地面に沿って追従。歩いて弾んでも影は地面に）
const boyShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), shadowMat)
boyShadow.rotation.x = -Math.PI / 2
scene.add(boyShadow)

// ── 村の人（“人の気配”。近づくと話せる。台詞は時間帯で変わる）──
function makeVillager(x, z, opt) {
  const g = new THREE.Group()
  const skin = toon(0xe9bb8e)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.34), toon(opt.shirt)); torso.position.y = 1.5; g.add(torso)
  if (opt.boy) { const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.36), toon(opt.skirt)); shorts.position.y = 1.05; g.add(shorts) }
  else { const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.62, 12), toon(opt.skirt)); skirt.position.y = 1.05; g.add(skirt) }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), skin); head.position.y = 2.05; g.add(head)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), toon(opt.hair)); hair.position.y = 2.09; hair.rotation.x = -0.25; g.add(hair)
  if (!opt.boy) for (const hx of [-0.3, 0.3]) { const pt = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), toon(opt.hair)); pt.position.set(hx, 2.0, -0.04); g.add(pt) }
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), skin); legL.position.set(-0.13, 0.7, 0); g.add(legL)
  const legR = legL.clone(); legR.position.x = 0.13; g.add(legR)
  // 腕（肩から下げる。肩を回転軸にしたいので、肩位置にピボット用Groupを置く）
  const armL = new THREE.Group(); armL.position.set(-0.34, 1.72, 0); g.add(armL)
  const armLm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.16), skin); armLm.position.y = -0.28; armL.add(armLm)
  const armR = new THREE.Group(); armR.position.set(0.34, 1.72, 0); g.add(armR)
  const armRm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.56, 0.16), skin); armRm.position.y = -0.28; armR.add(armRm)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z)
  g.rotation.y = opt.face || 0
  outlineObj(g, 0.03)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 })
  for (const ex of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat); e.position.set(ex, 2.05, 0.27); g.add(e) }
  addContactShadow(g, 0.6)
  g.userData = { info: opt.info, baseY: heightAt(x, z), legL, legR, armL, armR, head, wph: 0, wave: 0, waveCd: 2 + Math.random() * 4 }
  scene.add(g)
  return g
}
const villager = makeVillager(13, 9, {
  shirt: 0xe08aa8, skirt: 0xd2698a, hair: 0x4a3a2e, face: 2.5,
  info: {
    name: '女の子',
    // 3日かけて進む関係（最初はそっけない→打ちとける→夏の終わりの別れ）
    arcByDay: {
      1: ['（女の子は こちらを ちらっと見て、すこし はにかんだ）', 'えっと…　こんにちは。'],
      2: ['あ、きのうの。また 会ったね。', 'この はらっぱ、わたしの おきにいりなんだ。いっしょに 見る？'],
      3: ['今日で 夏休みも おわりだね。', 'はい、これ おまもり。…また 来年、ここで 会えたら いいな。'],
    },
    byPhase: {
      morning: ['おはよう。今日も いい天気だね。', '朝の はらっぱは すずしくて すきなんだ。'],
      noon: ['暑いねえ。日かげで すこし 休もうよ。', 'むこうの 池に、メダカが いるんだよ。'],
      evening: ['夕やけ、きれいだね。', 'ヒグラシが 鳴きはじめたね。そろそろ おうちかな。'],
      night: ['もう こんな時間。', '星が たくさん 見えるね。'],
    },
  },
})
// 生活リズム：時間帯で居場所が変わる（朝＝池ばた、昼＝木かげ、夕＝家のそば、夜＝縁側）
villager.userData.spots = {
  morning: new THREE.Vector3(18, 0, 20),
  noon: new THREE.Vector3(13, 0, 7),
  evening: new THREE.Vector3(-13, 0, 17),
  night: new THREE.Vector3(-15.5, 0, 15),
}
// 街の店のおばさん（商店街の八百屋の前。会話は時間帯で変わる）
const townLady = makeVillager(TOWN.x - 7.5, TOWN.z - 18, {
  shirt: 0xd8c0a0, skirt: 0x9a7a5a, hair: 0x8c8c86, face: Math.PI / 2,
  info: {
    name: '店のおばさん',
    byPhase: {
      morning: ['あら、おはよう。はやいねえ。', 'トマト、いいのが 入ってるよ。'],
      noon: ['いらっしゃい。暑いから 気をつけてね。', 'ラムネ、ひやしてあるよ。'],
      evening: ['そろそろ 店じまいだねえ。', 'おまけ しとくよ。もってきな。'],
      night: ['もう しまっちゃったよ。', '気をつけて お帰り。'],
    },
  },
})
// 近所の子（空き地の土管のそば＝ひみつきち。昭和の原風景）
const townKid = makeVillager(TOWN.x - 30, TOWN.z + 16, {
  boy: true, shirt: 0x6aa0d8, skirt: 0x3f5a77, hair: 0x3a2e22, face: -0.6,
  info: {
    name: '近所の子',
    byPhase: {
      morning: ['おはよう！ 虫とり 行く？', 'この 土管、ぼくらの ひみつきちなんだ。'],
      noon: ['ここで かくれんぼ するんだ。', 'きみも 入って みる？'],
      evening: ['もう 帰らないと おこられちゃう。', 'また あした 遊ぼうな！'],
      night: ['まだ 起きてるの？', '夜の 空き地は ちょっと こわいや。'],
    },
  },
})
// 会話できる人たち（いちばん近い人に話しかける）
const npcs = [villager, townLady, townKid]

// NPC共通：腕は基本だらんと下げ、近づくと たまに手を振る。
function npcArms(n, near, dt, tsec) {
  const u = n.userData
  if (!u.armR) return
  if (near && u.wave <= 0) { u.waveCd -= dt; if (u.waveCd <= 0) { u.wave = 1; u.waveCd = 5 + Math.random() * 6 } }
  if (u.wave > 0) u.wave = Math.max(0, u.wave - dt / 1.6) // 約1.6秒かけて上げて振って下ろす
  const w = Math.sin(Math.min(u.wave, 1) * Math.PI) // 0→1→0 でなめらか
  u.armR.rotation.z += (-2.1 * w - u.armR.rotation.z) * Math.min(1, dt * 10)
  u.armR.rotation.x = Math.sin(tsec * 9) * 0.35 * w // 手先を左右に振る
  u.armL.rotation.z += (0 - u.armL.rotation.z) * Math.min(1, dt * 6)
  u.armL.rotation.x = Math.sin(tsec * 1.3 + n.position.x) * 0.05 // 反対の腕は息で少し揺れる
}
let talkTarget = null

// 商店街の通行人（道を行き来＝賑わい。会話はしない）
const pedestrians = []
for (const [dx, col, sp, boyP] of [[-2.8, 0x7a8a9a, 1.2, false], [2.8, 0x9a7a6a, 1.0, true], [-3.6, 0x6f8a6a, 1.5, false], [3.4, 0x8a6a8a, 1.3, true]]) {
  const p = makeVillager(TOWN.x + dx, TOWN.z - 18, { shirt: col, skirt: 0x4a4038, hair: 0x3a2e22, boy: boyP, face: 0, info: { name: '', byPhase: { noon: [''] } } })
  p.userData.ped = { sp, dir: 1, z0: TOWN.z - 28, z1: TOWN.z + 28, x: TOWN.x + dx, ph: Math.random() * 6 }
  pedestrians.push(p)
}

// ── 空気中の光の粒（ふわふわ漂う埃／花粉）＝生気と奥行き ──
{
  const N = 140
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 90
    pos[i * 3 + 1] = 1 + Math.random() * 14
    pos[i * 3 + 2] = (Math.random() - 0.5) * 90
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xfff6d8, size: 0.16, transparent: true, opacity: 0.5, depthWrite: false, fog: true,
  }))
  motes.userData.isMotes = true
  scene.add(motes)
  window.__motes = motes
}

// ── 夜の演出：月・星・蛍（夜になるほど現れる）──
const nightFactor = (t) => THREE.MathUtils.smoothstep(t, 0.72, 0.99)
const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xeef0ff, fog: false, transparent: true, opacity: 0 }))
moon.position.set(70, 95, -90); scene.add(moon)
const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(13, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xbcd0ff, fog: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }))
moonGlow.position.copy(moon.position); scene.add(moonGlow)
const stars = (() => {
  const g = new THREE.BufferGeometry(); const p = []
  for (let i = 0; i < 170; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.random() * 0.55 + 0.15, r = 380
    p.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r)
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
  scene.add(pts); return pts
})()
const fireflies = (() => {
  const g = new THREE.BufferGeometry(); const p = []
  for (let i = 0; i < 55; i++) p.push((Math.random() - 0.5) * 80, 0.6 + Math.random() * 3.5, (Math.random() - 0.5) * 80)
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcaff86, size: 0.34, transparent: true, opacity: 0, depthWrite: false, fog: true, blending: THREE.AdditiveBlending }))
  scene.add(pts); return pts
})()
// 提灯（家の軒先・夜にあかりが灯る）
const lanterns = []
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff8a4a, fog: false, transparent: true, opacity: 0 }))
  m.scale.y = 1.25
  m.position.set(HOUSE.x - 3 + i * 1.5, heightAt(HOUSE.x, HOUSE.z) + 3.3, HOUSE.z + 4.1)
  scene.add(m); lanterns.push(m)
}
// 夏の夜の花火（夜に空へ開く。3日目はおまつりで多め）
const fireworksGroup = new THREE.Group(); scene.add(fireworksGroup)
let fwTimer = 3
function spawnFirework() {
  const N = 72
  const cx = (Math.random() - 0.5) * 70, cy = 34 + Math.random() * 18, cz = -36 - Math.random() * 28
  const pos = new Float32Array(N * 3); const vel = []
  for (let i = 0; i < N; i++) {
    pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz
    vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 5))
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const c = new THREE.Color().setHSL(Math.random(), 0.7, 0.62)
  const mat = new THREE.PointsMaterial({ color: c, size: 0.7, transparent: true, opacity: 1, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
  const pts = new THREE.Points(geo, mat); pts.userData = { vel, age: 0 }
  fireworksGroup.add(pts)
}

// ── 入道雲（高くにゆっくり流れる。寝ころんで空を見ると気持ちいい）──
const clouds = []
{
  const cmat = new THREE.MeshBasicMaterial({ color: 0xfbfbf6, fog: false, transparent: true, opacity: 0.95 })
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group()
    const n = 3 + Math.floor(Math.random() * 3)
    for (let k = 0; k < n; k++) {
      const r = 7 + Math.random() * 8
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cmat)
      puff.position.set((k - n / 2) * 9 + Math.random() * 4, Math.random() * 4, Math.random() * 6)
      puff.scale.y = 0.6
      g.add(puff)
    }
    g.position.set((Math.random() - 0.5) * 260, 60 + Math.random() * 25, (Math.random() - 0.5) * 260)
    g.userData = { sp: 0.6 + Math.random() * 0.7 }
    scene.add(g); clouds.push(g)
  }
}

// ── カメラ（既定は斜め見下ろし。視点はユーザーが回せる/寄れる） ──
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 600)
// 視点の制御値（球面）。yaw=水平角, pitch=見下ろし角, dist=距離。
const camCtl = { yaw: 0.32, pitch: 0.62, dist: 19, minDist: 8, maxDist: 34, minPitch: 0.18, maxPitch: 1.25 }
function camOffset(out) {
  const cp = Math.cos(camCtl.pitch)
  out.set(Math.sin(camCtl.yaw) * cp, Math.sin(camCtl.pitch), Math.cos(camCtl.yaw) * cp).multiplyScalar(camCtl.dist)
  return out
}
camera.position.copy(boy.position).add(camOffset(new THREE.Vector3()))

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 3, innerHeight / 3), 0.5, 0.5, 0.86) // 強さ・半径・しきい値（控えめ）。1/3解像度で軽量化（ぼかしなので見た目は変わらない）
composer.addPass(bloom)

// 木漏れ日（ゴッドレイ）：太陽の画面位置から、明るい所を放射状に伸ばす光条
const godrayPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, lightPos: { value: new THREE.Vector2(0.5, 0.8) }, strength: { value: 0.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 lightPos; uniform float strength;
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (strength > 0.001) {
        const int N = 18;
        vec2 uv = vUv;
        vec2 delta = (uv - lightPos) * (0.55 / float(N));
        float illum = 1.0;
        vec3 ray = vec3(0.0);
        for (int i = 0; i < N; i++) {
          uv -= delta;
          vec3 s = texture2D(tDiffuse, uv).rgb;
          float b = max(0.0, max(s.r, max(s.g, s.b)) - 0.75); // 明るい所だけ
          ray += s * b * illum;
          illum *= 0.92;
        }
        col += ray * (strength / float(N)) * 6.0;
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
})
composer.addPass(godrayPass)

// 仕上げ：退色フィルム調のカラーグレード＋周辺減光（“あの頃の記憶の色”）
// 影を青緑へ・ハイライトを暖色へ転がし、彩度をわずかに落とし、黒を少し浮かせる。
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.14 }, amount: { value: 1.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float vig; uniform float amount;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 graded = c;
      graded += vec3(-0.018, 0.010, 0.030) * (1.0 - smoothstep(0.0, 0.5, lum)); // 影に青緑
      graded += vec3(0.030, 0.014, -0.020) * smoothstep(0.45, 1.0, lum);        // ハイライトに暖色
      graded = mix(vec3(lum), graded, 0.90);                                    // 退色（彩度を少し落とす）
      graded = graded * 0.975 + 0.018;                                          // フィルムの黒浮き
      c = mix(c, graded, amount);
      // 紙のグレイン（水彩紙のような微かなザラつき）
      float grain = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      c += (grain - 0.5) * 0.022;
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - vig * smoothstep(0.5, 0.95, d);                                // 周辺減光
      gl_FragColor = vec4(c, 1.0);
    }`,
})
composer.addPass(gradePass)

function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h)
  composer.setSize(w, h)
  bloom.setSize(w / 3, h / 3) // ブルームは1/3解像度を維持（発熱対策）
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// ── 環境音（蝉↔ヒグラシを時間帯でブレンド＋夕焼けチャイム）──
// 音は癒しの半分。2D版の素材(MP3)を流用し、時刻で滑らかにクロスフェード。
const listener = new THREE.AudioListener()
camera.add(listener)
const audioUrls = loadAudioUrls()
const ambients = {} // id -> THREE.Audio
let audioStarted = false
let chimeArmed = true
;(function initAmbients() {
  const loader = new THREE.AudioLoader()
  for (const id of ['morning', 'cicada', 'higurashi', 'night']) {
    const url = audioUrls[id]
    if (!url) continue
    const a = new THREE.Audio(listener)
    a.setLoop(true); a.setVolume(0)
    loader.load(url, (buf) => { a.setBuffer(buf); if (audioStarted) try { a.play() } catch (e) {} }, undefined, () => {})
    ambients[id] = a
  }
})()
let chimeAudio = null // 縁側の風鈴（立体音響）
function startAudio() {
  if (audioStarted) return
  audioStarted = true
  try {
    const ctx = listener.context
    if (ctx.state === 'suspended') ctx.resume()
    for (const id in ambients) { const a = ambients[id]; if (a.buffer && !a.isPlaying) a.play() }
    if (chimeAudio && chimeAudio.buffer && !chimeAudio.isPlaying) chimeAudio.play()
  } catch (e) {}
}
function ambientWeights(t) {
  const ss = (a, b) => THREE.MathUtils.smoothstep(t, a, b)
  return {
    morning: Math.max(0, 1 - Math.abs(t - 0.03) / 0.14),
    cicada: ss(0.08, 0.2) * (1 - ss(0.5, 0.66)),
    higurashi: ss(0.52, 0.64) * (1 - ss(0.8, 0.9)),
    night: ss(0.82, 0.93) + (t < 0.02 ? 0.3 : 0),
  }
}
function playChime() {
  // 完全オリジナルの素朴な5音（特定の防災チャイム旋律は使わない）。遠くから聞こえるよう強めにLPF。
  try {
    const ctx = listener.context
    const now = ctx.currentTime
    const base = 523.25 // C5
    const notes = [0, 2, 4, 7, 4]
    notes.forEach((n, i) => {
      const t0 = now + i * 0.5
      const f = base * Math.pow(2, n / 12)
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7)
      for (const mul of [1, 2.01]) {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f * mul
        osc.connect(g); osc.start(t0); osc.stop(t0 + 1.8)
      }
      g.connect(lp); lp.connect(ctx.destination)
    })
  } catch (e) {}
}
// ── 効果音の自前合成（外部素材ゼロ。AudioContextで都度つくる）──
let noiseBuf = null
function getNoise() {
  if (noiseBuf) return noiseBuf
  const ctx = listener.context
  noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}
function playStep(vol, town) { // 足音：草はやわらかい低音、舗装は少し明るい擦れ
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    const src = ctx.createBufferSource(); src.buffer = getNoise(); src.playbackRate.value = 0.8 + Math.random() * 0.35
    const bp = ctx.createBiquadFilter()
    bp.type = town ? 'bandpass' : 'lowpass'; bp.frequency.value = town ? 1300 + Math.random() * 500 : 360 + Math.random() * 140; bp.Q.value = town ? 0.9 : 0.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + (town ? 0.10 : 0.15))
    src.connect(bp); bp.connect(g); g.connect(ctx.destination); src.start(now); src.stop(now + 0.25)
  } catch (e) {}
}
function playThunk() { // 自販機のガコン＋カラン
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(155, now); o.frequency.exponentialRampToValueAtTime(58, now + 0.12)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.22, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
    o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 0.22)
    const t1 = now + 0.14 // 瓶/缶の高い余韻＝カラン
    for (const f of [900, 1340]) {
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t1); g2.gain.exponentialRampToValueAtTime(0.05, t1 + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.26)
      o2.connect(g2); g2.connect(ctx.destination); o2.start(t1); o2.stop(t1 + 0.3)
    }
  } catch (e) {}
}

// 縁側の風鈴（軒先・立体音響）。近づくとちりんと聞こえる
const windchime = new THREE.Group()
{
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), toon(0x999999)); str.position.y = 0.25; windchime.add(str)
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshToonMaterial({ color: 0xcfe6ee, gradientMap: GRAD, transparent: true, opacity: 0.85 })); windchime.add(bell)
  const tan = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.3), new THREE.MeshToonMaterial({ color: 0xf4f0e2, gradientMap: GRAD, side: THREE.DoubleSide })); tan.position.y = -0.32; windchime.add(tan)
  windchime.userData = { tan }
  windchime.position.set(HENG.x - 1.2, HENG.y + 3.0, HENG.z + 0.3)
  scene.add(windchime)
}
chimeAudio = new THREE.PositionalAudio(listener)
windchime.add(chimeAudio)
if (audioUrls.windchime) {
  new THREE.AudioLoader().load(audioUrls.windchime, (buf) => {
    chimeAudio.setBuffer(buf); chimeAudio.setLoop(true); chimeAudio.setRefDistance(5); chimeAudio.setRolloffFactor(1.6); chimeAudio.setVolume(0.7)
    if (audioStarted) try { chimeAudio.play() } catch (e) {}
  }, undefined, () => {})
}

// ── 入力・状態 ──
let mode = 'walk' // 'walk' | 'sit' | 'lie'
let moving = false
let phase = 0
let facing = 0 // 向き(rad)
const keys = {}
const seatLook = { yaw: Math.PI, pitch: -0.05 } // 座/寝の視線
const vel = new THREE.Vector3() // 歩きの慣性（世界速度 x,z）
let idleTime = 0 // 立ち止まっている時間（“間”の演出用）
let lookUp = 0 // 立ち止まると少し空を見上げる量(0..1)
const BASE_FOV = 45
const BASE_DIST = 19
const lieBtn = document.getElementById('lie')
const npcEl = document.getElementById('npc')
const dialogueEl = document.getElementById('dialogue')
const dlgNameEl = document.getElementById('dlg-name')
const dlgTextEl = document.getElementById('dlg-text')
let dialogue = null // { lines, idx }
const phaseOf = (t) => (t < 0.18 ? 'morning' : t < 0.5 ? 'noon' : t < 0.78 ? 'evening' : 'night')
function startDialogue() {
  const who = talkTarget || villager
  const info = who.userData.info
  // その日の関係の台詞（あれば）→ なければ時間帯の台詞
  const lines = (info.arcByDay && info.arcByDay[day]) || info.byPhase[phaseOf(tday)] || info.byPhase.noon
  dialogue = { lines, idx: 0 }
  dlgNameEl.textContent = info.name
  dlgTextEl.textContent = lines[0]
  dialogueEl.style.display = 'block'
  npcEl.style.display = 'none'
  endPuni()
  if (who === villager) todayFlags.metGirl = true
  if (who === villager && day >= 3) { gotOmamori = true; try { localStorage.setItem('hn3d_omamori', '1') } catch (e) {} } // 最終日に会えたら おまもりを受け取る
  if (who === townLady) todayFlags.metShop = true
  who.rotation.y = Math.atan2(boy.position.x - who.position.x, boy.position.z - who.position.z) // こちらを向く
}

// ── 「3日だけの夏」＋絵日記（その日やったこと→翌日への予告／夏の終わり）──
let day = 1
let gotOmamori = false // 夏の終わりに女の子から おまもりを もらった（日をまたいで残る＝関係の証）
try { gotOmamori = localStorage.getItem('hn3d_omamori') === '1' } catch (e) {}
const dayEvents = { radio: false, dinner: false } // 昭和の日課（1日1回）
let diaryOpen = false
const todayFlags = { metGirl: false, sawPond: false, satHill: false, layDown: false, wentTown: false, petCat: false, lamune: false, metShop: false }
try { const s = +localStorage.getItem('hn3d_day'); if (s >= 1 && s <= 3) day = s } catch (e) {}
const sleepEl = document.getElementById('sleep')
const diaryEl = document.getElementById('diary')
const diaryTitleEl = document.getElementById('diary-title')
const diaryBodyEl = document.getElementById('diary-body')
const diaryCloseEl = document.getElementById('diary-close')
const diaryPicEl = document.getElementById('diary-pic')
// 紙の質感タイル（絵日記の絵に重ねる）
const paperPat = (() => {
  const s = 80, c = document.createElement('canvas'); c.width = c.height = s
  const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 420; i++) { const v = 200 + Math.random() * 55; x.fillStyle = `rgba(${v | 0},${(v - 8) | 0},${(v - 20) | 0},0.08)`; x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2) }
  return c
})()
// いまの3Dの眺めを「絵」に：やわらかく退色させ、紙の質感を重ねて子どもの絵日記風にする
function makeDiaryPicture() {
  try {
    const src = renderer.domElement
    if (!src.width) return null
    const w = 480, h = Math.max(1, Math.round((w * src.height) / src.width))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d')
    x.filter = 'saturate(0.85) contrast(1.04) brightness(1.13) blur(0.6px)' // クレヨン/水彩風＋少し明るく（夜でも見やすい）
    x.drawImage(src, 0, 0, w, h)
    x.filter = 'none'
    x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.5
    x.fillStyle = x.createPattern(paperPat, 'repeat'); x.fillRect(0, 0, w, h)
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'
    const g = x.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.5, w * 0.72) // ふちの紙の余白
    g.addColorStop(0, 'rgba(252,247,236,0)'); g.addColorStop(1, 'rgba(252,247,236,0.55)')
    x.fillStyle = g; x.fillRect(0, 0, w, h)
    return c.toDataURL('image/png')
  } catch (e) { return null }
}
const badgeEl = document.getElementById('badge')
function refreshBadge() { if (badgeEl) badgeEl.textContent = `なつやすみ ${day}にちめ` }
refreshBadge()
function openDiary() {
  diaryOpen = true; dayAuto = false
  const body = []
  if (caught.count) body.push(`むしを ${caught.count}ひき つかまえた（${Object.keys(caught.kinds).join('・')}）。`)
  if (fish.count) body.push(`池で さかなを ${fish.count}ひき つった（${Object.keys(fish.kinds).join('・')}）。`)
  if (todayFlags.metGirl) body.push('はらっぱで 女の子と はなした。')
  if (todayFlags.petCat) body.push('ねこを なでた。ごろごろ いっていた。')
  if (todayFlags.wentTown) body.push('街の 商店街まで あるいた。')
  if (todayFlags.metShop) body.push('商店街の おばさんと はなした。')
  if (todayFlags.lamune) body.push('自販機で ラムネを 買った。すずしかった。')
  if (todayFlags.sawPond) body.push('池を のぞいた。メダカが いた きがする。')
  if (todayFlags.satHill) body.push('高台で ぼーっと した。')
  if (todayFlags.layDown) body.push('草の上で ねころんで 空を ながめた。')
  if (!body.length) body.push('きょうは のんびり あるいた。')
  if (day >= 3) {
    diaryTitleEl.textContent = 'ひと夏が おわった'
    if (gotOmamori) { body.push('女の子に おまもりを もらった。'); body.push('ずっと わすれない 夏に なった。…また 来年、あの はらっぱで。') }
    else { body.push('たのしい 夏休みだった。…また 来年。') }
  } else { diaryTitleEl.textContent = `${day}にちめ ― えにっき`; body.push(day === 1 ? '明日は もっと 話せるかな。' : 'もうすぐ おまつりらしい。') }
  diaryBodyEl.innerHTML = body.map((l) => `<div class="line">${l}</div>`).join('')
  // その日の眺めを「絵」として貼る
  if (diaryPicEl) {
    const pic = makeDiaryPicture()
    diaryPicEl.innerHTML = ''
    if (pic) { const im = new Image(); im.src = pic; diaryPicEl.appendChild(im); diaryPicEl.style.display = 'block' }
    else diaryPicEl.style.display = 'none'
  }
  diaryEl.style.display = 'flex'
}
function nextDay() {
  diaryEl.style.display = 'none'; diaryOpen = false
  day = day >= 3 ? 1 : day + 1 // プロトなので3日のあとは1日目へ
  for (const k in todayFlags) todayFlags[k] = false
  tday = 0.18; dayAuto = true; setTimeOfDay(tday)
  dayEvents.radio = false; dayEvents.dinner = false
  try { localStorage.setItem('hn3d_day', day) } catch (e) {}
  refreshBadge()
}
sleepEl.addEventListener('click', () => { if (!diaryOpen && !dialogue) openDiary() })
diaryCloseEl.addEventListener('click', () => { if (diaryOpen) nextDay() })

// ── エリアの往来（野原 ⇄ 昭和の住宅街）。門に近づくとボタン→フェードで移動 ──
let area = 'field'
let transitioning = false
let autoWalk = null // 往来中の自動歩行 {x,z}（門をくぐって前進）
const goEl = document.getElementById('go')
const fadeEl = document.getElementById('fade')
function curGate() { return area === 'field' ? GATE_FIELD : GATE_TOWN }
function travel() {
  if (transitioning || dialogue || diaryOpen) return
  transitioning = true
  endPuni()
  // 門の方へ向き直って歩き出す（その先が、もう一方の場所へ続く道）
  const g = curGate()
  facing = Math.atan2(g.x - boy.position.x, g.z - boy.position.z)
  autoWalk = { x: Math.sin(facing), z: Math.cos(facing) }
  fadeEl.style.opacity = '1'
  setTimeout(() => {
    if (area === 'field') { area = 'town'; boy.position.set(GATE_TOWN.x, 0, GATE_TOWN.z + 2.0); facing = 0; goEl.textContent = 'はらっぱへ →'; todayFlags.wentTown = true }
    else { area = 'field'; boy.position.set(GATE_FIELD.x, 0, GATE_FIELD.z - 2.0); facing = Math.PI; goEl.textContent = '町へ →' }
    // 門をくぐって、前へ歩きながら現れる（ぷつっと切り替わらない）
    autoWalk = { x: Math.sin(facing), z: Math.cos(facing) }
    vel.set(autoWalk.x * 3, 0, autoWalk.z * 3)
    boy.position.y = heightAt(boy.position.x, boy.position.z)
    boy.rotation.y = facing
    camera.position.copy(boy.position).add(camOffset(tmp))
    if (camera.userData._look) camera.userData._look.set(boy.position.x, boy.position.y + 1.4, boy.position.z)
    setTimeout(() => { fadeEl.style.opacity = '0' }, 240)
    setTimeout(() => { autoWalk = null; transitioning = false }, 780) // 数歩あるいてから操作にもどす
  }, 470)
}
goEl.addEventListener('click', travel)
function advanceDialogue() {
  if (!dialogue) return
  dialogue.idx++
  if (dialogue.idx >= dialogue.lines.length) { dialogue = null; dialogueEl.style.display = 'none' }
  else dlgTextEl.textContent = dialogue.lines[dialogue.idx]
}
npcEl.addEventListener('click', () => {
  const act = npcEl.dataset.act
  if (act === 'pet') petCat()
  else if (act === 'buy') buyRamune()
  else startDialogue()
})
dialogueEl.addEventListener('click', advanceDialogue)
function petCat() {
  showToast('ねこは ごろごろ いっている。')
  cat.userData.rest = Math.max(cat.userData.rest, 3000)
  cat.rotation.y = Math.atan2(boy.position.x - cat.position.x, boy.position.z - cat.position.z)
  todayFlags.petCat = true
}
let lamuneCd = 0
function buyRamune() {
  if (lamuneCd > 0) return
  lamuneCd = 2.2
  facing = Math.atan2(VENDING.x - boy.position.x, VENDING.z - boy.position.z); boy.rotation.y = facing // 自販機の方を向く
  playThunk()
  showToast(todayFlags.lamune ? 'もう一本。やっぱり つめたい。' : 'ガコン。つめたい ラムネ。100円なり。')
  todayFlags.lamune = true
}

// 虫採りの「つかまえる」とお知らせ（トースト）
const catchEl = document.getElementById('catch')
const toastEl = document.getElementById('toast')
let catchTarget = null
function showToast(msg) {
  if (!toastEl) return
  toastEl.textContent = msg; toastEl.classList.add('show')
  clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 1800)
}
function doCatch() {
  if (!catchTarget || catchTarget.done) return
  const tp = catchTarget.obj.position
  facing = Math.atan2(tp.x - boy.position.x, tp.z - boy.position.z); boy.rotation.y = facing // 虫の方を向く
  boy.userData.swing = 320 // 網を振る
  catchTarget.done = true
  catchTarget.obj.visible = false
  catchTarget.obj.userData.done = true
  caught.count += 1
  caught.kinds[catchTarget.kind] = (caught.kinds[catchTarget.kind] || 0) + 1
  showToast(`${catchTarget.kind}を つかまえた！`)
  catchTarget = null
  if (catchEl) catchEl.style.display = 'none'
}
if (catchEl) catchEl.addEventListener('click', doCatch)

// ── 釣り（池）──
const fishEl = document.getElementById('fish')
const FISH_NAMES = ['フナ', 'メダカ', 'ザリガニ', 'ナマズ', 'おたまじゃくし']
const fish = { count: 0, kinds: {} }
let fishState = 'idle'
let fishTimer = null
const floatMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshToonMaterial({ color: 0xe0544a, gradientMap: GRAD }))
floatMesh.visible = false; scene.add(floatMesh)
function castLine() {
  const dir = new THREE.Vector3(POND.x - boy.position.x, 0, POND.z - boy.position.z)
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); dir.normalize()
  floatMesh.position.set(boy.position.x + dir.x * 2.5, WATER_Y + 0.15, boy.position.z + dir.z * 2.5)
  floatMesh.visible = true
  fishState = 'wait'; showToast('…あたりを まつ')
  clearTimeout(fishTimer)
  fishTimer = setTimeout(() => {
    fishState = 'bite'; if (fishEl) fishEl.textContent = 'ひく！'; showToast('！ いまだ！')
    clearTimeout(fishTimer); fishTimer = setTimeout(() => { if (fishState === 'bite') endFishing('にげられた…') }, 1300)
  }, 1500 + Math.random() * 2500)
}
function reel() {
  if (fishState === 'bite') {
    const name = FISH_NAMES[Math.floor(Math.random() * FISH_NAMES.length)]
    fish.count++; fish.kinds[name] = (fish.kinds[name] || 0) + 1
    showToast(`${name}が つれた！`); endFishing()
  } else if (fishState === 'wait') endFishing('はやい！ にげられた')
}
function endFishing(msg) { fishState = 'idle'; clearTimeout(fishTimer); floatMesh.visible = false; if (fishEl) fishEl.textContent = 'つる'; if (msg) showToast(msg) }
if (fishEl) fishEl.addEventListener('click', () => { if (fishState === 'idle') castLine(); else reel() })

// ぷにコン（指でスライドした方向へ歩く・白猫プロジェクト風）
const stickEl = document.getElementById('stick')
const knobEl = document.getElementById('knob')
const STICK_R = 60
const puni = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vy: 0 } // vx,vy = -1..1
const pointers = new Map() // 多点タッチ（2本指で視点操作）
let orbit = null // { mx, my, d }
let sitTap = null // 座っている時のタップ判定（軽タップ＝立つ）

function startPuni(id, x, y) {
  puni.active = true; puni.id = id; puni.ox = x; puni.oy = y; puni.vx = 0; puni.vy = 0
  stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px'
  knobEl.style.left = '50%'; knobEl.style.top = '50%'
  stickEl.style.display = 'block'
}
function endPuni() { puni.active = false; puni.id = -1; puni.vx = 0; puni.vy = 0; stickEl.style.display = 'none' }
function midDist() {
  const a = [...pointers.values()]
  return { mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }
}

canvas.addEventListener('pointerdown', (e) => {
  startAudio() // 最初のタッチで音を立ち上げる（iOSの自動再生制限への先回り）
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  canvas.setPointerCapture(e.pointerId)
  if (mode !== 'walk') { sitTap = { x: e.clientX, y: e.clientY, moved: false }; return }
  if (pointers.size === 1) startPuni(e.pointerId, e.clientX, e.clientY)
  else if (pointers.size === 2) { endPuni(); orbit = midDist() }
})
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return
  const prev = pointers.get(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (mode !== 'walk') {
    if (sitTap) {
      seatLook.yaw -= (e.clientX - prev.x) * 0.005
      seatLook.pitch = THREE.MathUtils.clamp(seatLook.pitch + (e.clientY - prev.y) * 0.005, -1.4, 1.45)
      if (Math.abs(e.clientX - sitTap.x) + Math.abs(e.clientY - sitTap.y) > 8) sitTap.moved = true
    }
    return
  }
  if (pointers.size >= 2 && orbit) {
    // 2本指：視点を回す・つまんで寄る
    const m = midDist()
    camCtl.yaw -= (m.mx - orbit.mx) * 0.006
    camCtl.pitch = THREE.MathUtils.clamp(camCtl.pitch - (m.my - orbit.my) * 0.005, camCtl.minPitch, camCtl.maxPitch)
    if (m.d > 0) camCtl.dist = THREE.MathUtils.clamp(camCtl.dist * (orbit.d / m.d), camCtl.minDist, camCtl.maxDist)
    orbit = m
  } else if (puni.active && e.pointerId === puni.id) {
    let dx = e.clientX - puni.ox, dy = e.clientY - puni.oy
    const len = Math.hypot(dx, dy) || 1
    const cl = Math.min(len, STICK_R)
    dx = (dx / len) * cl; dy = (dy / len) * cl
    knobEl.style.left = `calc(50% + ${dx}px)`; knobEl.style.top = `calc(50% + ${dy}px)`
    puni.vx = dx / STICK_R; puni.vy = dy / STICK_R
  }
})
function onUp(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  if (mode !== 'walk') { if (sitTap && !sitTap.moved) standUp(); sitTap = null; return }
  if (pointers.size < 2) orbit = null
  if (e.pointerId === puni.id) endPuni()
  // 2本指→1本に戻ったら、残った指でぷにコン再開
  if (pointers.size === 1 && !puni.active) {
    const [id, p] = [...pointers.entries()][0]
    startPuni(id, p.x, p.y)
  }
}
canvas.addEventListener('pointerup', onUp)
canvas.addEventListener('pointercancel', onUp)
addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true })
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false })

actBtn.addEventListener('click', () => { if (mode === 'walk') sitDown(actBtn.dataset.spot || 'bench') })
lieBtn.addEventListener('click', () => { if (mode === 'walk') lieDown() })

function lieDown() {
  mode = 'lie'
  todayFlags.layDown = true
  endPuni()
  vel.set(0, 0, 0)
  boy.position.y = heightAt(boy.position.x, boy.position.z) + 0.25
  boy.rotation.x = -1.35 // あおむけ
  boy.userData.legL.rotation.x = 0; boy.userData.legR.rotation.x = 0
  boy.visible = false // 一人称で空を見る（自分の体は映さない）
  seatLook.yaw = boy.rotation.y; seatLook.pitch = 1.2 // 空を見上げる
  // カメラを地面すぐ上へ置き、空へ向ける（スナップ）
  camera.fov = BASE_FOV; camera.updateProjectionMatrix()
  const ex = boy.position.x, ey = heightAt(boy.position.x, boy.position.z) + 0.55, ez = boy.position.z
  const cp = Math.cos(seatLook.pitch)
  camera.position.set(ex, ey, ez)
  camera.userData._look = camera.userData._look || new THREE.Vector3()
  camera.userData._look.set(ex + Math.sin(seatLook.yaw) * cp, ey + Math.sin(seatLook.pitch), ez + Math.cos(seatLook.yaw) * cp)
  actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  lookHint.style.display = 'block'
}

// 縁側の座る位置（家の前・外を向く）
const ENGAWA = new THREE.Vector3(HOUSE.x + Math.sin(0.35) * 3.4, 0, HOUSE.z + Math.cos(0.35) * 3.4)
ENGAWA.y = heightAt(ENGAWA.x, ENGAWA.z)
const curSitEye = new THREE.Vector3()
function sitDown(which) {
  mode = 'sit'
  todayFlags.satHill = true
  endPuni()
  let eye, yaw
  if (which === 'engawa') {
    boy.position.set(ENGAWA.x, ENGAWA.y + 0.6, ENGAWA.z)
    boy.rotation.y = 0.35
    // 目線は縁側の少し前・上（支柱に遮られず庭を見渡す）
    eye = curSitEye.set(ENGAWA.x + Math.sin(0.35) * 1.7, ENGAWA.y + 1.55, ENGAWA.z + Math.cos(0.35) * 1.7)
    yaw = 0.35 // 庭と空の方（外）を向く
  } else {
    boy.position.copy(SEAT); boy.position.y = SEAT.y + 0.55
    boy.rotation.y = Math.PI
    eye = curSitEye.set(SEAT.x, SEAT.y + 2.3, SEAT.z - 0.9)
    yaw = Math.PI
  }
  boy.rotation.x = 0
  boy.userData.legL.rotation.x = -1.4; boy.userData.legR.rotation.x = -1.4 // 座り姿勢
  moving = false
  seatLook.yaw = yaw; seatLook.pitch = -0.05
  const cp = Math.cos(seatLook.pitch)
  camera.position.copy(eye)
  camera.userData._look = camera.userData._look || new THREE.Vector3()
  camera.userData._look.set(eye.x + Math.sin(yaw) * cp, eye.y + Math.sin(seatLook.pitch), eye.z + Math.cos(yaw) * cp)
  actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  lookHint.style.display = 'block'
}
function standUp() {
  mode = 'walk'
  boy.userData.legL.rotation.x = 0; boy.userData.legR.rotation.x = 0
  boy.rotation.x = 0
  boy.visible = true
  boy.position.y = heightAt(boy.position.x, boy.position.z)
  idleTime = 0
  lookHint.style.display = 'none'
}

// ── ループ ──
const clock = new THREE.Clock()
const seatEye = new THREE.Vector3()
const lookTo = new THREE.Vector3()
const camGoal = new THREE.Vector3()
const lookGoal = new THREE.Vector3()
const tmp = new THREE.Vector3()
const camFwd = new THREE.Vector3()
const camRight = new THREE.Vector3()
const sunProj = new THREE.Vector3()

function update(dt) {
  // 一日の移ろい（朝→夜で止まり、「ねる」で翌日へ。ループしない＝3日間の区切り）
  if (dayAuto) {
    const prev = tday
    tday = Math.min(0.97, tday + dt / 240)
    setTimeOfDay(tday)
    // 昭和の日課（1日1回）：朝のラジオ体操・夕飯の呼び声・就寝のうながし
    if (!dayEvents.radio && tday < 0.22) { dayEvents.radio = true; showToast('ラジオ体操の じかんだ。') }
    if (!dayEvents.dinner && prev < 0.7 && tday >= 0.7) { dayEvents.dinner = true; showToast('「ごはんよー」と よばれた。') }
    if (prev < 0.9 && tday >= 0.9 && !diaryOpen) showToast('そろそろ ねる じかんだ…')
  }
  // 空・太陽・星・月を主人公/カメラに追従（遠くの街エリアでも空が正しく回り、影も届く）
  skyDome.position.copy(camera.position)
  sunBall.position.copy(camera.position).addScaledVector(sunDir, 300)
  stars.position.copy(camera.position)
  moon.position.set(camera.position.x + 70, 95, camera.position.z - 90)
  moonGlow.position.copy(moon.position)
  sun.position.copy(boy.position).addScaledVector(sunDir, 120)
  sun.target.position.copy(boy.position)
  // リム＝太陽の水平反対側から低く。後ろ上から輪郭をふちどる
  rim.position.set(boy.position.x - sunDir.x * 80, boy.position.y + 26, boy.position.z - sunDir.z * 80)
  rim.target.position.copy(boy.position)
  // 風で草木をゆらす・光の粒を漂わせる（生気）
  const tsec = clock.elapsedTime
  for (const s of swayables) s.obj.rotation.z = Math.sin(tsec * 1.1 + s.ph) * s.amp
  if (grassShader) grassShader.uniforms.uTime.value = tsec // 草が風になびく
  waterMat.uniforms.uTime.value = tsec // 水面のさざ波・きらめき
  if (window.__motes) window.__motes.rotation.y = tsec * 0.02
  // 入道雲がゆっくり流れる
  for (const c of clouds) { c.position.x += dt * c.userData.sp; if (c.position.x > 150) c.position.x -= 300 }
  // 蚊取り線香の煙がゆらゆら昇る（複数の発生源）
  for (const sm of smokers) {
    const pa = sm.pts.geometry.attributes.position
    for (let i = 0; i < sm.n; i++) {
      let y = pa.getY(i) + dt * 0.4
      let x = pa.getX(i) + Math.sin(tsec * 1.5 + i) * dt * 0.18
      if (y > sm.y + 2.3) { y = sm.y; x = sm.x }
      pa.setX(i, x); pa.setY(i, y)
    }
    pa.needsUpdate = true
  }
  // 風鈴の短冊がそよぐ
  windchime.userData.tan.rotation.z = Math.sin(tsec * 2.2) * 0.3
  windchime.rotation.z = Math.sin(tsec * 1.7) * 0.05
  // 主人公の接地影は地面に沿わせる
  boyShadow.position.set(boy.position.x, heightAt(boy.position.x, boy.position.z) + 0.05, boy.position.z)
  boyShadow.visible = boy.visible
  // 虫取り網を振る（採取時）
  if (boy.userData.swing > 0) {
    boy.userData.swing = Math.max(0, boy.userData.swing - dt * 1000)
    const sw = Math.sin((1 - boy.userData.swing / 320) * Math.PI)
    boy.userData.net.rotation.x = -0.2 - sw * 1.9
  } else boy.userData.net.rotation.x = -0.2
  // 池に近づいたら“見た”ことを記録（絵日記用）
  if (Math.hypot(boy.position.x - POND.x, boy.position.z - POND.z) < POND.r + 2) todayFlags.sawPond = true
  // 環境音：時刻でクロスフェード＋夕方に一度だけ夕焼けチャイム
  if (audioStarted) {
    const w = ambientWeights(tday)
    for (const id in ambients) { const a = ambients[id]; if (a.buffer) a.setVolume(Math.min(1, w[id] || 0) * 0.6) }
    if (tday < 0.4) chimeArmed = true
    if (chimeArmed && tday > 0.69) { chimeArmed = false; playChime() }
  }
  // 夜の演出
  const nf = nightFactor(tday)
  moon.material.opacity = nf
  moonGlow.material.opacity = nf * 0.45
  stars.material.opacity = nf
  fireflies.material.opacity = nf * (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(tsec * 3)))
  fireflies.rotation.y = tsec * 0.05
  // 提灯のあかり（夜に灯る・ゆらぐ）
  for (let i = 0; i < lanterns.length; i++) lanterns[i].material.opacity = nf * (0.8 + 0.2 * Math.sin(tsec * 3 + i))
  // 花火（夜・3日目はおまつりで多め）
  if (nf > 0.4) {
    fwTimer -= dt
    if (fwTimer <= 0) { fwTimer = (day >= 3 ? 1.4 : 3.2) + Math.random() * 2.5; spawnFirework() }
  }
  for (const pts of [...fireworksGroup.children]) {
    const u = pts.userData; u.age += dt
    const pa = pts.geometry.attributes.position
    for (let i = 0; i < u.vel.length; i++) {
      const v = u.vel[i]
      pa.setXYZ(i, pa.getX(i) + v.x * dt, pa.getY(i) + v.y * dt - 2.2 * dt, pa.getZ(i) + v.z * dt)
      v.multiplyScalar(0.95)
    }
    pa.needsUpdate = true
    pts.material.opacity = Math.max(0, 1 - u.age / 2.3)
    if (u.age > 2.3) { fireworksGroup.remove(pts); pts.geometry.dispose(); pts.material.dispose() }
  }
  // 商店街の通行人（道を行き来）
  for (const p of pedestrians) {
    const u = p.userData.ped
    p.position.z += u.sp * u.dir * dt
    if (p.position.z > u.z1) { u.dir = -1; p.rotation.y = Math.PI }
    else if (p.position.z < u.z0) { u.dir = 1; p.rotation.y = 0 }
    p.position.x = u.x
    p.userData.wph += dt * 7
    p.position.y = heightAt(u.x, p.position.z) + Math.abs(Math.sin(p.userData.wph)) * 0.05
    const sw = Math.sin(p.userData.wph) * 0.5; p.userData.legL.rotation.x = sw; p.userData.legR.rotation.x = -sw
    p.userData.armL.rotation.x = -sw; p.userData.armR.rotation.x = sw // 腕を振って歩く
  }
  // うろつく猫（家のまわりを気ままに・休む）
  {
    const u = cat.userData
    if (u.rest > 0) { u.rest -= dt * 1000 } else {
      const dx = u.tx - cat.position.x, dz = u.tz - cat.position.z; const d = Math.hypot(dx, dz)
      if (d < 0.3) {
        if (Math.random() < 0.5) u.rest = 2000 + Math.random() * 4000
        else { u.tx = HOUSE.x + (Math.random() - 0.5) * 18; u.tz = HOUSE.z + (Math.random() - 0.5) * 18 }
      } else { const s = 1.1 * dt; cat.position.x += (dx / d) * s; cat.position.z += (dz / d) * s; cat.rotation.y = Math.atan2(dx, dz); u.phase += dt * 8 }
    }
    cat.position.y = heightAt(cat.position.x, cat.position.z) + (u.rest <= 0 ? Math.abs(Math.sin(u.phase)) * 0.03 : 0)
    u.tail.rotation.z = -1.0 + Math.sin(tsec * 2.5) * 0.28 // 尻尾をゆらす
  }
  // 女の子の生活リズム（時間帯の居場所へゆっくり歩く・会話中は止まる）
  if (!dialogue) {
    const sp = villager.userData.spots[phaseOf(tday)]
    const dx = sp.x - villager.position.x, dz = sp.z - villager.position.z
    const dd = Math.hypot(dx, dz)
    const vu = villager.userData
    if (dd > 0.3) {
      const step = Math.min(1.6 * dt, dd)
      villager.position.x += (dx / dd) * step
      villager.position.z += (dz / dd) * step
      vu.wph += dt * 8
      villager.position.y = heightAt(villager.position.x, villager.position.z) + Math.abs(Math.sin(vu.wph)) * 0.05
      villager.rotation.y = Math.atan2(dx, dz)
      const sw = Math.sin(vu.wph) * 0.5; vu.legL.rotation.x = sw; vu.legR.rotation.x = -sw
      vu.armL.rotation.x = -sw; vu.armR.rotation.x = sw; vu.armL.rotation.z *= 0.8; vu.armR.rotation.z *= 0.8 // 歩くと腕を振る
      vu.wave = 0
      vu.head.rotation.y *= 0.85 // 歩く時は前を向く
    } else {
      villager.position.y = heightAt(villager.position.x, villager.position.z) + Math.abs(Math.sin(tsec * 1.3)) * 0.012 // 息づかい
      vu.legL.rotation.x *= 0.8; vu.legR.rotation.x *= 0.8
      const pd = Math.hypot(boy.position.x - villager.position.x, boy.position.z - villager.position.z)
      const near = pd < 4.5 && area === 'field'
      if (near) { // 近づくと気づいてこちらを向く
        let dd2 = Math.atan2(boy.position.x - villager.position.x, boy.position.z - villager.position.z) - villager.rotation.y
        while (dd2 > Math.PI) dd2 -= Math.PI * 2; while (dd2 < -Math.PI) dd2 += Math.PI * 2
        villager.rotation.y += dd2 * Math.min(1, dt * 4); vu.head.rotation.y *= 0.85
      } else vu.head.rotation.y = Math.sin(tsec * 0.4) * 0.45 // ゆっくり見回す
      npcArms(villager, near, dt, tsec)
    }
  }
  // 立っている街の人：息づかい＋ふだんは見回し、近づくと気づいてこちらを向く
  for (const n of [townLady, townKid]) {
    n.position.y = n.userData.baseY + Math.abs(Math.sin(tsec * 1.3 + n.position.x)) * 0.012
    const pd = Math.hypot(boy.position.x - n.position.x, boy.position.z - n.position.z)
    const near = pd < 4.5 && area === 'town'
    if (near) {
      let dd = Math.atan2(boy.position.x - n.position.x, boy.position.z - n.position.z) - n.rotation.y
      while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2
      n.rotation.y += dd * Math.min(1, dt * 4)
      n.userData.head.rotation.y *= 0.85
    } else {
      n.userData.head.rotation.y = Math.sin(tsec * 0.4 + n.position.x) * 0.45
    }
    npcArms(n, near, dt, tsec)
  }
  // 蝶（昼に舞い、夜は消える）
  for (const b of butterflies) {
    const u = b.userData
    if (u.done) { b.visible = false; continue } // つかまえた蝶は出さない
    const a = tsec * u.sp + u.ph
    const bx = u.cx + Math.cos(a) * u.r, bz = u.cz + Math.sin(a) * u.r
    b.position.set(bx, heightAt(bx, bz) + 1.6 + Math.sin(a * 3) * 0.3, bz)
    b.rotation.y = -a + Math.PI / 2
    const flap = Math.sin(tsec * 14 + u.ph) * 0.9
    u.wl.rotation.y = flap; u.wr.rotation.y = -flap
    u.mat.opacity = 1 - nf
    b.visible = nf < 0.96
  }
  // 赤とんぼ（夕方に飛ぶ）
  const eveningF = THREE.MathUtils.smoothstep(tday, 0.42, 0.58) * (1 - THREE.MathUtils.smoothstep(tday, 0.82, 0.92))
  for (const d of dragonflies) {
    const u = d.userData
    const a = tsec * u.sp + u.ph
    const dx = u.cx + Math.cos(a) * u.r, dz = u.cz + Math.sin(a * 1.3) * u.r
    d.position.set(dx, heightAt(dx, dz) + 1.9 + Math.sin(a * 2) * 0.4, dz)
    d.rotation.y = -a * 1.3 + Math.PI / 2
    u.body.opacity = eveningF; u.wing.opacity = eveningF * 0.5
    d.visible = eveningF > 0.02
  }
  // 夕方のカラス（夕焼け〜宵に かけて 空を横切る）
  const crowF = THREE.MathUtils.smoothstep(tday, 0.60, 0.72) * (1 - THREE.MathUtils.smoothstep(tday, 0.80, 0.90))
  for (const c of crows) {
    const u = c.userData
    c.visible = crowF > 0.02
    if (!c.visible) continue
    const span = ((tsec * u.sp + u.off) % 260) - 130 // -130→+130 で横切り、端でループ
    c.position.set(boy.position.x + span, u.alt + Math.sin(tsec * 0.3 + u.off) * 1.5, boy.position.z + u.lane)
    const f = Math.sin(tsec * u.flap + u.fph) * 0.7
    u.wl.rotation.z = f; u.wr.rotation.z = -f // はばたき
    u.mat.opacity = crowF
  }
  // 足元の砂ぼこり：舞い上がって ゆっくり落ち、消える
  for (let i = 0; i < DUSTN; i++) {
    if (dustLife[i] <= 0) continue
    dustLife[i] -= dt
    dustPos[i * 3] += dustVel[i * 3] * dt
    dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt
    dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt
    dustVel[i * 3 + 1] -= dt * 0.7 // 重力で失速
    if (dustLife[i] <= 0) dustPos[i * 3 + 1] = -9999
  }
  dustGeo.attributes.position.needsUpdate = true
  if (lamuneCd > 0) lamuneCd -= dt
  // 木漏れ日：太陽の画面位置と強さ（昼に強く・画面内のときだけ）
  sunProj.copy(sunBall.position).project(camera)
  godrayPass.uniforms.lightPos.value.set(sunProj.x * 0.5 + 0.5, sunProj.y * 0.5 + 0.5)
  const sunOnScreen = sunProj.z < 1 && Math.abs(sunProj.x) < 1.15 && Math.abs(sunProj.y) < 1.15
  godrayPass.uniforms.strength.value = sunOnScreen ? (1 - nf) * 0.5 : 0
  godrayPass.enabled = godrayPass.uniforms.strength.value > 0.001 // 太陽が画面外/夜は丸ごとスキップ＝軽量化

  if (mode === 'walk') {
    // カメラ基準の前/右（地面上）。指のスライド方向を世界の向きへ変換。
    camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize()
    camRight.set(-camFwd.z, 0, camFwd.x)
    const kx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0)
    const kz = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0)
    let sx = 0, sy = 0
    if (puni.active && Math.hypot(puni.vx, puni.vy) > 0.06) { sx = puni.vx; sy = puni.vy }
    else if (kx || kz) { sx = kx; sy = kz }
    if (dialogue || diaryOpen || fishState !== 'idle') { sx = 0; sy = 0 } // 会話・絵日記・釣り中は歩かない
    const mag = Math.min(1, Math.hypot(sx, sy))
    // 目標速度（倒し量で“そろり〜小走り”）。慣性で滑らかに加減速。
    let tx = 0, tz = 0
    if (mag > 0.06) {
      const wx = camRight.x * sx + camFwd.x * (-sy)
      const wz = camRight.z * sx + camFwd.z * (-sy)
      const l = Math.hypot(wx, wz) || 1
      const speed = 7 * mag
      tx = (wx / l) * speed; tz = (wz / l) * speed
    }
    if (autoWalk) { tx = autoWalk.x * 4.4; tz = autoWalk.z * 4.4 } // 往来中は門の先へ自動で歩く
    // 加速はやや速く・減速はゆっくり（歩いてる身体の惰性）
    const k = (Math.abs(tx) + Math.abs(tz) > Math.abs(vel.x) + Math.abs(vel.z)) ? 6 : 3.5
    vel.x += (tx - vel.x) * Math.min(1, dt * k)
    vel.z += (tz - vel.z) * Math.min(1, dt * k)
    const speedNow = Math.hypot(vel.x, vel.z)
    moving = speedNow > 0.25
    boy.position.x += vel.x * dt
    boy.position.z += vel.z * dt
    // エリアの外（霧の何もない空間）へ迷い込まないように境界で止める
    if (area === 'field') {
      boy.position.x = THREE.MathUtils.clamp(boy.position.x, -92, 92)
      boy.position.z = THREE.MathUtils.clamp(boy.position.z, -92, 92)
      // 池には入らない：水ぎわでとまる（岸に沿って押し戻す）
      let pdx = boy.position.x - POND.x, pdz = boy.position.z - POND.z
      const pdist = Math.hypot(pdx, pdz), SHORE = POND.r - 0.6
      if (pdist < SHORE) {
        if (pdist < 0.001) { pdx = 1; pdz = 0 } // 中心ちょうどでも向きを決める
        const k = SHORE / (pdist || 1)
        boy.position.x = POND.x + pdx * k; boy.position.z = POND.z + pdz * k
        vel.x *= 0.15; vel.z *= 0.15 // 水際で勢いを止める
      }
    } else {
      boy.position.x = THREE.MathUtils.clamp(boy.position.x, TOWN.x - 72, TOWN.x + 78)
      boy.position.z = THREE.MathUtils.clamp(boy.position.z, TOWN.z - 30, TOWN.z + 96)
    }
    boy.position.y = heightAt(boy.position.x, boy.position.z)
    if (speedNow > 0.05) facing = Math.atan2(vel.x, vel.z)
    phase += dt * 1.3 * speedNow // 歩調は実速度に連動
    // 向きをなめらかに
    let d = facing - boy.rotation.y
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2
    boy.rotation.y += d * Math.min(1, dt * 10)
    // 歩行/走行アニメ（速いほど大きく振り、前傾し、ぴょこぴょこ跳ねる）
    const run = THREE.MathUtils.clamp(speedNow / 7, 0, 1) // 0=そろり 1=全力
    const amp = 0.35 + run * 0.9
    const sw = Math.sin(phase) * amp
    // 足が着くたび（sin(phase)の符号が変わる瞬間）に足音、走っていれば砂ぼこりも
    if (moving && sw * lastStepS < 0) {
      playStep(0.04 + run * 0.06, area === 'town')
      if (run > 0.4) spawnDust(boy.position.x, boy.position.y + 0.05, boy.position.z)
    }
    lastStepS = sw
    boy.userData.legL.rotation.x = sw; boy.userData.legR.rotation.x = -sw
    boy.userData.armL.rotation.x = -sw - run * 0.25; boy.userData.armR.rotation.x = sw - run * 0.25 // 走ると肘を前に振る
    boy.rotation.x += ((moving ? run * 0.28 : 0) - boy.rotation.x) * Math.min(1, dt * 8) // 走ると前傾

    // “間”：立ち止まると idleTime が伸び、少し空を見上げ、カメラが引いて構図化
    idleTime = moving ? 0 : idleTime + dt
    const calm = THREE.MathUtils.clamp((idleTime - 1.2) / 3, 0, 1) // 1.2秒後から3秒かけて
    lookUp += ((moving ? 0 : calm * 0.18) - lookUp) * Math.min(1, dt * 2)
    boy.userData.head.rotation.x = -lookUp * 1.6 // 空を見上げる
    boy.position.y += moving ? Math.abs(Math.sin(phase)) * (0.05 + run * 0.22) : Math.sin(tsec * 1.4) * 0.012 // ぴょこぴょこ跳ねる/立つ呼吸

    const nearBench = Math.hypot(boy.position.x - SEAT.x, boy.position.z - SEAT.z) < 3.2
    const nearEngawa = Math.hypot(boy.position.x - ENGAWA.x, boy.position.z - ENGAWA.z) < 3.0
    // いちばん近い人を話し相手に
    talkTarget = null; let nd = 3
    for (const n of npcs) { const d = Math.hypot(boy.position.x - n.position.x, boy.position.z - n.position.z); if (d < nd) { nd = d; talkTarget = n } }
    const nearCat = area === 'field' && Math.hypot(boy.position.x - cat.position.x, boy.position.z - cat.position.z) < 2.2
    const nearVending = area === 'town' && Math.hypot(boy.position.x - VENDING.x, boy.position.z - VENDING.z) < 2.8
    const nearNpc = !!talkTarget
    if (talkTarget && !dialogue) { npcEl.textContent = 'はなしかける'; npcEl.dataset.act = 'talk'; npcEl.style.display = 'block' }
    else if (nearCat && !dialogue) { npcEl.textContent = 'なでる'; npcEl.dataset.act = 'pet'; npcEl.style.display = 'block' }
    else if (nearVending && !dialogue) { npcEl.textContent = 'ラムネを買う'; npcEl.dataset.act = 'buy'; npcEl.style.display = 'block' }
    else npcEl.style.display = 'none'
    if (!nearNpc && !dialogue && nearEngawa) { actBtn.textContent = '縁側にすわる'; actBtn.dataset.spot = 'engawa'; actBtn.style.display = 'block' }
    else if (!nearNpc && !dialogue && nearBench) { actBtn.textContent = 'すわる'; actBtn.dataset.spot = 'bench'; actBtn.style.display = 'block' }
    else actBtn.style.display = 'none'
    lieBtn.style.display = dialogue ? 'none' : 'block'
    // 門に近づくと往来ボタン
    const g = curGate()
    const gateD = Math.hypot(boy.position.x - g.x, boy.position.z - g.z)
    goEl.style.display = (!dialogue && gateD < 7) ? 'block' : 'none' // 判定をひろげて見つけやすく
    goEl.classList.toggle('near', gateD < 3.2) // 門の目の前ではボタンを強調
    // いちばん近い虫を「つかまえる」対象に（野原のみ）
    catchTarget = null
    if (area === 'field') { let cd = 3.2; for (const c of catchables) { if (c.done) continue; const p = c.obj.position; const dd2 = Math.hypot(boy.position.x - p.x, boy.position.z - p.z); if (dd2 < cd) { cd = dd2; catchTarget = c } } }
    catchEl.style.display = (catchTarget && !dialogue) ? 'block' : 'none'
    if (catchTarget) npcEl.style.display = 'none'
    // 池のそばで「つる」（釣り中は出したまま）
    const nearPond = area === 'field' && Math.hypot(boy.position.x - POND.x, boy.position.z - POND.z) < POND.r + 3
    fishEl.style.display = ((nearPond || fishState !== 'idle') && !dialogue && !catchTarget) ? 'block' : 'none'
    if (fishState === 'bite') floatMesh.position.y = WATER_Y + 0.15 + Math.sin(tsec * 30) * 0.08

    // カメラ：今の視点で追従。立ち止まるとゆっくり引いて画角を少し締める＝一枚絵に。
    camCtl.dist += (BASE_DIST * (1 + calm * 0.18) - camCtl.dist) * Math.min(1, dt * 1.2)
    camera.fov += ((BASE_FOV - calm * 4) - camera.fov) * Math.min(1, dt * 1.5)
    camera.updateProjectionMatrix()
    camGoal.copy(boy.position).add(camOffset(tmp))
    // ごく微かな“息”の揺れ
    camGoal.x += Math.sin(tsec * 0.6) * 0.06
    camGoal.y += Math.sin(tsec * 0.8 + 1) * 0.05
    lookGoal.copy(boy.position); lookGoal.y += 1.4 + calm * 0.5
  } else if (mode === 'lie') {
    // 寝ころんで空を見る：目線は地面すぐ上、上を向く
    seatEye.set(boy.position.x, heightAt(boy.position.x, boy.position.z) + 0.55, boy.position.z)
    const cp = Math.cos(seatLook.pitch)
    lookTo.set(seatEye.x + Math.sin(seatLook.yaw) * cp, seatEye.y + Math.sin(seatLook.pitch), seatEye.z + Math.cos(seatLook.yaw) * cp)
    camGoal.copy(seatEye); lookGoal.copy(lookTo)
    actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  } else {
    // 座って360度見回す（高台のベンチ or 縁側。目線は座る位置）
    seatEye.copy(curSitEye)
    const cp = Math.cos(seatLook.pitch)
    lookTo.set(
      seatEye.x + Math.sin(seatLook.yaw) * cp,
      seatEye.y + Math.sin(seatLook.pitch),
      seatEye.z + Math.cos(seatLook.yaw) * cp,
    )
    camGoal.copy(seatEye)
    lookGoal.copy(lookTo)
    actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  }
  // カメラを目標へなめらかに寄せる
  camera.position.lerp(camGoal, Math.min(1, dt * (mode !== 'walk' ? 6 : 5)))
  // 注視点もなめらかに
  camera.userData._look = camera.userData._look || new THREE.Vector3().copy(lookGoal)
  camera.userData._look.lerp(lookGoal, Math.min(1, dt * 6))
  camera.lookAt(camera.userData._look)
}

// 30fps上限（スマホの発熱対策）。requestAnimationFrameは60で来るが、描画は約30回/秒に間引く。
let frameAcc = 0
renderer.setAnimationLoop(() => {
  frameAcc += Math.min(clock.getDelta(), 0.1)
  if (frameAcc < 1 / 30) return
  const dt = Math.min(frameAcc, 0.05); frameAcc = 0
  update(dt)
  composer.render()
})

// 横画面のおすすめ（縦持ちのスマホにだけ、やさしく一度。閉じれる/数秒で消える）
const rotateEl = document.getElementById('rotate')
function fadeRotate() {
  if (!rotateEl) return
  setTimeout(() => { rotateEl.style.opacity = '0' }, 4500)
}
fadeRotate()
// 可能なら横向きに固定（Android等。iOSは無視されるが害なし）
addEventListener('pointerdown', function lockOnce() {
  removeEventListener('pointerdown', lockOnce)
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}) } catch (e) {}
}, { once: true })

// タイトル画面：「はじめる」で消えて、音を立ち上げる（iOSの自動再生制限への先回り）
const titleEl = document.getElementById('title')
const startBtn = document.getElementById('t-start')
if (startBtn) startBtn.addEventListener('click', () => { startAudio(); if (titleEl) titleEl.classList.add('hidden') })

// 自己検証用の最小ハンドル
window.__proto3d = {
  THREE, scene, camera, boy, get mode() { return mode }, sitDown, standUp, lieDown,
  setDay(t) { dayAuto = false; tday = t; setTimeOfDay(t) }, // 検証用に時刻固定
  startAudio,
  placeBoy(x, z) { standUp(); boy.position.set(x, heightAt(x, z), z) }, // 検証用
  talk() { startDialogue() }, // 検証用
  openDiary() { openDiary() }, // 検証用
  get day() { return day },
  setGameDay(d) { day = d; refreshBadge() }, // 検証用
  spawnFirework() { spawnFirework() }, // 検証用
  goArea(a) { // 検証用：エリアへ瞬間移動
    area = a
    if (a === 'town') { boy.position.set(TOWN.x - 2, 0, TOWN.z); facing = 0 }
    else { boy.position.set(GATE_FIELD.x, 0, GATE_FIELD.z - 3.5); facing = Math.PI }
    boy.position.y = heightAt(boy.position.x, boy.position.z); boy.rotation.y = facing
    camera.position.copy(boy.position).add(camOffset(new THREE.Vector3()))
    if (camera.userData._look) camera.userData._look.set(boy.position.x, boy.position.y + 1.4, boy.position.z)
  },
  get area() { return area },
  doCatch() { doCatch() }, // 検証用
  get caught() { return caught.count },
  villager,
  aimSun(t) { // 検証用：太陽の方を向いて座る（木漏れ日の確認）
    if (t !== undefined) { dayAuto = false; tday = t; setTimeOfDay(t) }
    sitDown()
    const eye = new THREE.Vector3(SEAT.x, SEAT.y + 2.3, SEAT.z - 0.9)
    const dir = sunBall.position.clone().sub(eye)
    seatLook.yaw = Math.atan2(dir.x, dir.z)
    seatLook.pitch = Math.asin(THREE.MathUtils.clamp(dir.y / dir.length(), -1, 1))
  },
  audioState() {
    const playing = Object.keys(ambients).filter((id) => ambients[id].isPlaying)
    return { started: audioStarted, ctx: listener.context.state, loaded: Object.keys(ambients).length, playing }
  },
  aimSky(t) { // 検証用：ベンチに座って空を見上げる（夕方のカラスを見る視点）
    if (t !== undefined) { dayAuto = false; tday = t; setTimeOfDay(t) }
    sitDown()
    const eye = new THREE.Vector3(SEAT.x, SEAT.y + 2.3, SEAT.z - 0.9)
    let best = null, bd = 1e9
    for (const c of crows) { const d = c.position.distanceTo(eye); if (c.visible && d < bd) { bd = d; best = c } }
    const dir = (best ? best.position.clone() : new THREE.Vector3(SEAT.x, SEAT.y + 25, SEAT.z - 60)).sub(eye)
    seatLook.yaw = Math.atan2(dir.x, dir.z)
    seatLook.pitch = Math.asin(THREE.MathUtils.clamp(dir.y / dir.length(), -1, 1))
  },
  crowsVisible() { // 検証用：画面内に見えているカラスの数
    const v = new THREE.Vector3(); let n = 0
    for (const c of crows) {
      if (!c.visible) continue
      v.copy(c.position).project(camera)
      if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) n++
    }
    return n
  },
}
