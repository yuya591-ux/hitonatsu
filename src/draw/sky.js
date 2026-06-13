// シグネチャ表現：時間とともに移ろう「空グラデ＋ゆっくり流れる雲＋差し込む光」。
// 全場面で共通の空が、その日の時間の流れを静かに語る主役になる。

import { rgbToCss, smoothstep } from '../util/color.js'

// 雲のたね（決め打ちで毎回同じ並び）。x は割合、y は空の上側に配置、speed は流れる速さ(px/秒)。
const CLOUDS = [
  { baseX: 0.05, y: 0.18, scale: 1.1, speed: 5, alpha: 0.9 },
  { baseX: 0.38, y: 0.1, scale: 1.5, speed: 3.2, alpha: 1.0 },
  { baseX: 0.68, y: 0.24, scale: 0.85, speed: 6.5, alpha: 0.8 },
  { baseX: 0.88, y: 0.14, scale: 1.25, speed: 4, alpha: 0.95 },
]

// 星のたね（夜だけ見える）。決め打ちで瞬く。
const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: ((i * 73) % 100) / 100,
  y: ((i * 37) % 55) / 100, // 空の上〜中ほどに散らす
  seed: (i * 911) % 1000,
  size: 0.6 + ((i * 17) % 10) / 10,
}))

// 「どれくらい夜か」を 0..1 で返す（星・月の出方に使う）。
function nightFactor(t) {
  // 夕方の後半(0.80)から夜にかけて立ち上がり、翌朝の手前(0.04)で消える
  if (t >= 0.8) return smoothstep(0.8, 0.9, t)
  if (t <= 0.05) return 1 - smoothstep(0.0, 0.05, t)
  return 0
}

// やわらかい光の円（ぼかし）を1つ描く
function softBlob(ctx, x, y, r, css, alpha) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
  g.addColorStop(0, css.replace('rgb', 'rgba').replace(')', `,${alpha})`))
  g.addColorStop(1, css.replace('rgb', 'rgba').replace(')', ',0)'))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawSunMoon(ctx, view, frame) {
  const { w, h } = view
  const p = frame.palette
  const t = frame.time
  const nf = nightFactor(t)

  // 太陽：朝〜夕方にかけて、空を左から右へ弧を描いて運行する
  if (t < 0.84) {
    const u = t / 0.84
    const x = (0.12 + 0.78 * u) * w
    const y = (0.12 + (1 - Math.sin(u * Math.PI)) * 0.4) * h
    const r = Math.min(w, h) * 0.05
    const sun = rgbToCss(p.sun)
    softBlob(ctx, x, y, r * 3.2, sun, 0.35) // ふんわりした光暈
    ctx.fillStyle = sun
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 月：夜にだけ、ゆっくり昇る
  if (nf > 0) {
    const mu = t >= 0.8 ? smoothstep(0.8, 0.99, t) : 1
    const x = (0.28 + 0.42 * mu) * w
    const y = (0.4 - Math.sin(mu * Math.PI) * 0.22) * h
    const r = Math.min(w, h) * 0.045
    const moon = rgbToCss(p.moon)
    softBlob(ctx, x, y, r * 3, moon, 0.25 * nf)
    ctx.globalAlpha = nf
    ctx.fillStyle = moon
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

function drawStars(ctx, view, frame) {
  const nf = nightFactor(frame.time)
  if (nf <= 0) return
  const { w, h } = view
  const star = rgbToCss(frame.palette.star)
  ctx.fillStyle = star
  for (const s of STARS) {
    const twinkle = 0.5 + 0.5 * Math.sin(frame.now / 700 + s.seed)
    ctx.globalAlpha = nf * (0.3 + 0.7 * twinkle)
    ctx.beginPath()
    ctx.arc(s.x * w, s.y * h, s.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawClouds(ctx, view, frame) {
  const { w, h } = view
  const p = frame.palette
  // 夜は雲を控えめに
  const dayAmount = 1 - nightFactor(frame.time) * 0.7
  const margin = w * 0.3

  for (const c of CLOUDS) {
    // 時間とともに右へゆっくり流す
    const drift = (frame.now / 1000) * c.speed
    let x = (c.baseX * w + drift) % (w + 2 * margin)
    x -= margin
    const y = c.y * h
    const r = Math.min(w, h) * 0.09 * c.scale
    const a = c.alpha * dayAmount

    // やわらかい白の楕円を複数重ねて雲のかたまりに
    const cloud = rgbToCss(p.cloud)
    const shade = rgbToCss(p.cloudShade)
    softBlob(ctx, x, y + r * 0.25, r * 1.3, shade, a * 0.5) // 下側の陰
    softBlob(ctx, x - r * 0.8, y, r * 0.9, cloud, a)
    softBlob(ctx, x, y - r * 0.25, r * 1.15, cloud, a)
    softBlob(ctx, x + r * 0.9, y, r * 0.85, cloud, a)
  }
}

function drawLightShaft(ctx, view, frame) {
  const { w, h } = view
  // 日中ほど強く、夕方後半で弱め、夜は出さない
  const dayAmount = 1 - smoothstep(0.7, 0.86, frame.time)
  if (dayAmount <= 0.02) return

  const light = rgbToCss(frame.palette.light)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter' // 光は加算して淡く輝かせる
  const grad = ctx.createLinearGradient(w * 0.6, 0, w * 0.1, h * 0.9)
  grad.addColorStop(0, light.replace('rgb', 'rgba').replace(')', `,${0.18 * dayAmount})`))
  grad.addColorStop(1, light.replace('rgb', 'rgba').replace(')', ',0)'))
  ctx.fillStyle = grad
  // 斜めに差し込む光の帯（台形）
  ctx.beginPath()
  ctx.moveTo(w * 0.45, 0)
  ctx.lineTo(w * 0.95, 0)
  ctx.lineTo(w * 0.55, h)
  ctx.lineTo(w * 0.0, h)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// 空一式を描く。場面によらず共通で呼ぶシグネチャ表現。
export function drawSky(ctx, view, frame) {
  const { w, h } = view
  const p = frame.palette

  // 1) 縦のグラデーション（空の主役）
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, rgbToCss(p.skyTop))
  g.addColorStop(0.55, rgbToCss(p.skyMid))
  g.addColorStop(1, rgbToCss(p.skyBottom))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // 2) 太陽・月の運行
  drawSunMoon(ctx, view, frame)
  // 3) 星（夜）
  drawStars(ctx, view, frame)
  // 4) 流れる雲
  drawClouds(ctx, view, frame)
  // 5) 差し込む光
  drawLightShaft(ctx, view, frame)
}
