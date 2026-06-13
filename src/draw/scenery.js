// 各場面の風景パーツ（コード描画版）。
// 空はシグネチャ(drawSky)を全場面で共通利用し、ここでは遠景・地面・場面ごとの前景を描く。
// すべて将来 image 差し替え可能なように、場面ファクトリ側で createLayer に渡す。

import { rgbToCss, lerpColor } from '../util/color.js'

// 「僕の夏休み」的な“上から覗き込む”高い画角。地平線を上げ、地面（歩く場所）を広く見せる。
export const HORIZON = 0.42 // 地平線の高さ（画面の上から42%）

// 遠景：なだらかな山並みを3枚重ね、奥ほど淡く霞ませて空気遠近を出す（全場面で共通利用）
export function drawFarHills(ctx, view, frame) {
  const { w, h } = view
  const far = frame.palette.far
  const sky = frame.palette.skyBottom
  const y = h * HORIZON

  // 一番奥のうっすらした稜線（空の色に近づけて霞ませる）
  const farthest = lerpColor(far, sky, 0.55)
  ctx.fillStyle = rgbToCss(farthest, 0.6)
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.quadraticCurveTo(w * 0.2, y - h * 0.18, w * 0.46, y - h * 0.1)
  ctx.quadraticCurveTo(w * 0.72, y - h * 0.2, w, y - h * 0.12)
  ctx.lineTo(w, y)
  ctx.closePath()
  ctx.fill()

  // 中景の山
  ctx.fillStyle = rgbToCss(lerpColor(far, sky, 0.25), 0.7)
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.quadraticCurveTo(w * 0.25, y - h * 0.11, w * 0.5, y - h * 0.04)
  ctx.quadraticCurveTo(w * 0.78, y - h * 0.15, w, y - h * 0.05)
  ctx.lineTo(w, y)
  ctx.closePath()
  ctx.fill()

  // 手前の山（濃いめ）
  ctx.fillStyle = rgbToCss(far, 0.9)
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.quadraticCurveTo(w * 0.35, y - h * 0.07, w * 0.62, y - h * 0.02)
  ctx.quadraticCurveTo(w * 0.85, y - h * 0.08, w, y - h * 0.01)
  ctx.lineTo(w, y)
  ctx.closePath()
  ctx.fill()
}

// 地面：地平線から下を草地のグラデーションで塗る（全場面で共通利用）
export function drawGround(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const g = ctx.createLinearGradient(0, y, 0, h)
  g.addColorStop(0, rgbToCss(frame.palette.ground))
  g.addColorStop(1, rgbToCss(frame.palette.groundShade))
  ctx.fillStyle = g
  ctx.fillRect(0, y, w, h - y)
}

// 木陰のやわらかい影を画面の片側に落とす（神社など）
export function drawShade(ctx, view, frame, side = 'left') {
  const { w, h } = view
  const x0 = side === 'left' ? 0 : w
  const x1 = side === 'left' ? w * 0.5 : w * 0.5
  const g = ctx.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, 'rgba(20,30,20,0.22)')
  g.addColorStop(1, 'rgba(20,30,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

// 小さな草のかたまりを1つ描く
function grassTuft(ctx, x, baseY, size, css) {
  ctx.strokeStyle = css
  ctx.lineWidth = Math.max(1, size * 0.12)
  ctx.lineCap = 'round'
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(x + i * size * 0.18, baseY)
    ctx.quadraticCurveTo(x + i * size * 0.3, baseY - size * 0.8, x + i * size * 0.5, baseY - size)
    ctx.stroke()
  }
}

// ── 前景：場面ごと ──

// 縁側の庇（ひさし）と吊り風鈴を、手前の額縁として上部に描く。
// 「軒下から外を眺める」構図になり、奥行きと“その場所”の感じが出る。
function drawEaves(ctx, view, frame) {
  const { w, h } = view
  const eaveColor = rgbToCss(frame.palette.woodShade)
  // 上辺から垂れる庇（ゆるい曲線で軒先を表現）
  ctx.fillStyle = eaveColor
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h * 0.1)
  ctx.quadraticCurveTo(w * 0.5, h * 0.155, 0, h * 0.1)
  ctx.closePath()
  ctx.fill()
  // 軒先の細い影
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.moveTo(0, h * 0.1)
  ctx.quadraticCurveTo(w * 0.5, h * 0.155, w, h * 0.1)
  ctx.lineTo(w, h * 0.118)
  ctx.quadraticCurveTo(w * 0.5, h * 0.173, 0, h * 0.118)
  ctx.closePath()
  ctx.fill()

  // 右寄りに吊り風鈴のシルエット（そよ風でわずかに揺れる）
  const sway = Math.sin(frame.now / 1100) * w * 0.004
  const cx = w * 0.82 + sway
  const top = h * 0.12
  ctx.strokeStyle = eaveColor
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(w * 0.82, h * 0.1)
  ctx.lineTo(cx, top)
  ctx.stroke()
  // 釣鐘（ベル）
  ctx.fillStyle = eaveColor
  ctx.beginPath()
  ctx.arc(cx, top + h * 0.03, h * 0.03, Math.PI, 0)
  ctx.lineTo(cx + h * 0.03, top + h * 0.035)
  ctx.quadraticCurveTo(cx, top + h * 0.05, cx - h * 0.03, top + h * 0.035)
  ctx.closePath()
  ctx.fill()
  // 短冊
  ctx.fillRect(cx - h * 0.006, top + h * 0.05, h * 0.012, h * 0.06)
}

// 縁側：手前の木の縁側
export function foreEngawa(ctx, view, frame) {
  const { w, h } = view
  const wood = frame.palette.wood
  const woodShade = frame.palette.woodShade
  const top = h * 0.74

  const shadeGrad = ctx.createLinearGradient(0, top - h * 0.08, 0, top)
  shadeGrad.addColorStop(0, rgbToCss(woodShade, 0))
  shadeGrad.addColorStop(1, rgbToCss(woodShade, 0.25))
  ctx.fillStyle = shadeGrad
  ctx.fillRect(0, top - h * 0.08, w, h * 0.08)

  const floor = ctx.createLinearGradient(0, top, 0, h)
  floor.addColorStop(0, rgbToCss(wood))
  floor.addColorStop(1, rgbToCss(woodShade))
  ctx.fillStyle = floor
  ctx.fillRect(0, top, w, h - top)

  ctx.strokeStyle = rgbToCss(woodShade, 0.5)
  ctx.lineWidth = Math.max(1, h * 0.003)
  const planks = 6
  for (let i = 1; i < planks; i++) {
    const f = i / planks
    const yy = top + (h - top) * f * f
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
  }
  ctx.strokeStyle = rgbToCss(wood, 0.9)
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(0, top + 1)
  ctx.lineTo(w, top + 1)
  ctx.stroke()

  // 軒下から眺める額縁（庇＋吊り風鈴）を最前面に
  drawEaves(ctx, view, frame)
}

// 原っぱ：草の生い茂る野原と、片隅の木
export function foreHarappa(ctx, view, frame) {
  const { w, h } = view
  const blade = rgbToCss(frame.palette.groundShade)

  // 右手前に一本の木（幹＋こんもりした葉）
  const tx = w * 0.82
  const ty = h * HORIZON
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(tx - w * 0.008, ty - h * 0.12, w * 0.016, h * 0.16)
  ctx.fillStyle = rgbToCss(frame.palette.groundShade, 0.95)
  for (const [dx, dy, r] of [[0, -0.16, 0.07], [-0.05, -0.12, 0.055], [0.05, -0.12, 0.055], [0, -0.1, 0.05]]) {
    ctx.beginPath()
    ctx.arc(tx + w * dx, ty + h * dy, Math.min(w, h) * r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 手前に点々と草むら（奥は小さく、手前は大きく）
  const rows = [
    { y: 0.66, size: 0.02, n: 9 },
    { y: 0.78, size: 0.035, n: 7 },
    { y: 0.92, size: 0.055, n: 5 },
  ]
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const x = ((i + 0.5) / row.n) * w + (((i * 53) % 20) - 10) * 0.01 * w
      grassTuft(ctx, x, h * row.y, Math.min(w, h) * row.size, blade)
    }
  }
}

// 神社：石段と鳥居のシルエット、木陰
export function foreJinja(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const stone = rgbToCss(frame.palette.far, 0.9)
  const stoneShade = rgbToCss(frame.palette.groundShade)

  // 中央へ続く石段（手前ほど広い台形）
  const steps = 6
  for (let i = 0; i < steps; i++) {
    const f = i / steps
    const sw = (0.12 + f * 0.28) * w
    const sy = y + (h - y) * (f * f)
    const sh = (h - y) * 0.06
    ctx.fillStyle = i % 2 === 0 ? stone : stoneShade
    ctx.fillRect(w / 2 - sw / 2, sy, sw, sh)
  }

  // 鳥居のシルエット（奥・地平線あたり）
  const tw = w * 0.16
  const th = h * 0.16
  const cx = w / 2
  const top = y - th
  ctx.fillStyle = 'rgba(120,40,30,0.55)'
  // 二本の柱
  ctx.fillRect(cx - tw / 2, top, w * 0.012, th)
  ctx.fillRect(cx + tw / 2 - w * 0.012, top, w * 0.012, th)
  // 笠木と貫
  ctx.fillRect(cx - tw / 2 - w * 0.02, top, tw + w * 0.04, h * 0.018)
  ctx.fillRect(cx - tw / 2, top + h * 0.05, tw, h * 0.012)

  // 左から木陰
  drawShade(ctx, view, frame, 'left')
}

// 田んぼ道：奥へ続く一本道と、両脇の田んぼ（空を映す水面）
export function foreTanbomichi(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON

  // 田んぼ（地平線近くは空の色をうっすら映す水面）
  const water = ctx.createLinearGradient(0, y, 0, h)
  water.addColorStop(0, rgbToCss(frame.palette.skyBottom, 0.5))
  water.addColorStop(0.5, rgbToCss(frame.palette.ground, 0.2))
  water.addColorStop(1, rgbToCss(frame.palette.groundShade, 0))
  ctx.fillStyle = water
  ctx.fillRect(0, y, w, (h - y) * 0.7)

  // あぜ道（中央から手前へ広がる土の道）
  ctx.fillStyle = rgbToCss(frame.palette.wood)
  ctx.beginPath()
  ctx.moveTo(w * 0.47, y)
  ctx.lineTo(w * 0.53, y)
  ctx.lineTo(w * 0.72, h)
  ctx.lineTo(w * 0.28, h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = rgbToCss(frame.palette.woodShade, 0.6)
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.stroke()
}

// 川辺：横に流れる川と、せせらぎの照り返し
export function foreKawabe(ctx, view, frame) {
  const { w, h } = view
  const top = h * 0.6
  const bottom = h * 0.92

  // 水面（空の色を映す）
  const water = ctx.createLinearGradient(0, top, 0, bottom)
  water.addColorStop(0, rgbToCss(frame.palette.skyMid, 0.7))
  water.addColorStop(1, rgbToCss(frame.palette.skyBottom, 0.85))
  ctx.fillStyle = water
  ctx.fillRect(0, top, w, bottom - top)

  // 照り返し（ゆっくり揺れる横線）
  ctx.strokeStyle = rgbToCss(frame.palette.light, 0.35)
  ctx.lineWidth = Math.max(1, h * 0.004)
  for (let i = 0; i < 6; i++) {
    const yy = top + ((bottom - top) * (i + 0.5)) / 6
    const phase = frame.now / 1400 + i
    ctx.beginPath()
    for (let x = 0; x <= w; x += w / 16) {
      const off = Math.sin(phase + x / w * 6) * h * 0.004
      if (x === 0) ctx.moveTo(x, yy + off)
      else ctx.lineTo(x, yy + off)
    }
    ctx.stroke()
  }

  // 手前の岸（草地）
  ctx.fillStyle = rgbToCss(frame.palette.groundShade)
  ctx.fillRect(0, bottom, w, h - bottom)
}
