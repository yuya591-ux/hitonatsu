// 仕上げ（ポストプロセス）。場面を描いたあと、画面全体に一枚絵としての空気をかける。
// ・地平線の霞（空気遠近）
// ・周辺減光（ビネット）
// ・時間帯の色味（カラーグレード）
// ・紙のグレイン（水彩紙の質感）
// どれも“うっすら”が肝心。やりすぎない。

import { rgbToCss, smoothstep } from '../util/color.js'

const HORIZON = 0.37

// 地平線あたりにうっすら霞をかけ、遠くがけむって見えるようにする
export function applyHaze(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const c = frame.palette.skyBottom
  const g = ctx.createLinearGradient(0, y - h * 0.16, 0, y + h * 0.04)
  g.addColorStop(0, rgbToCss(c, 0))
  g.addColorStop(1, rgbToCss(c, 0.45))
  ctx.save()
  ctx.fillStyle = g
  ctx.fillRect(0, y - h * 0.16, w, h * 0.2)
  ctx.restore()
}

// 時間帯に応じた色味を全体に薄くかける。
// これは置いた水彩画像の上にも乗るので、静止画でも一日の移ろいを感じられる。
export function applyColorGrade(ctx, view, frame) {
  const { w, h } = view
  const t = frame.time
  ctx.save()

  // 夕方：黄金色をやわらかく足す（最も色が乗る時間）
  if (t > 0.5 && t < 0.85) {
    const k = Math.sin(Math.min(Math.max((t - 0.5) / 0.35, 0), 1) * Math.PI)
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = 0.4 * k
    ctx.fillStyle = rgbToCss(frame.palette.sun)
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  }

  // 夜：藍をかぶせて沈ませる（静止画も夜らしく）。夜は終盤だけ＝t=0は朝。
  const night = t >= 0.82 ? Math.min((t - 0.82) / 0.1, 1) : 0
  if (night > 0) {
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.32 * night
    ctx.fillStyle = '#3a4a72'
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  }

  // 朝：ごく淡い暖かみ
  if (t < 0.18) {
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = 0.16
    ctx.fillStyle = '#ffe9c4'
    ctx.fillRect(0, 0, w, h)
  }

  ctx.restore()
}

// 周辺減光。四隅をうっすら落として中央へ視線を集める
export function applyVignette(ctx, view) {
  const { w, h } = view
  const g = ctx.createRadialGradient(
    w / 2, h * 0.46, Math.min(w, h) * 0.32,
    w / 2, h * 0.5, Math.max(w, h) * 0.72,
  )
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(28,22,16,0.30)')
  ctx.save()
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

// 紙のグレイン（一度だけ作ったノイズタイルを薄く重ねる）
let grainTile = null
function getGrain() {
  if (grainTile) return grainTile
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const x = c.getContext('2d')
  const img = x.createImageData(s, s)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 145
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  x.putImageData(img, 0, 0)
  grainTile = c
  return c
}

export function applyGrain(ctx, view) {
  const pattern = ctx.createPattern(getGrain(), 'repeat')
  ctx.save()
  ctx.globalAlpha = 0.045
  ctx.globalCompositeOperation = 'overlay'
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, view.w, view.h)
  ctx.restore()
}

// 朝もや：朝のあいだ、地平線あたりに低くたなびく白い霞
function applyMorningMist(ctx, view, frame) {
  const t = frame.time
  const amount = t < 0.22 ? 1 - smoothstep(0.08, 0.22, t) : 0
  if (amount <= 0.02) return
  const { w, h } = view
  const y = h * HORIZON
  ctx.save()
  for (let i = 0; i < 3; i++) {
    const yy = y - h * 0.02 + i * h * 0.035
    const g = ctx.createLinearGradient(0, yy - h * 0.03, 0, yy + h * 0.03)
    g.addColorStop(0, 'rgba(250,250,245,0)')
    g.addColorStop(0.5, `rgba(250,250,245,${0.28 * amount})`)
    g.addColorStop(1, 'rgba(250,250,245,0)')
    ctx.fillStyle = g
    const drift = Math.sin(frame.now / 4000 + i) * w * 0.02
    ctx.fillRect(drift, yy - h * 0.03, w, h * 0.06)
  }
  ctx.restore()
}

// 昼の陽炎：日中、地平線のすぐ上がゆらゆらと揺らいで見える（ごく控えめ）
function applyHeatHaze(ctx, view, frame) {
  const t = frame.time
  const amount = smoothstep(0.2, 0.32, t) * (1 - smoothstep(0.45, 0.58, t))
  if (amount <= 0.02) return
  const { w, h } = view
  const y = h * HORIZON
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 5; i++) {
    const yy = y - h * 0.04 + i * h * 0.012
    const wob = Math.sin(frame.now / 200 + i * 1.7) * h * 0.003
    ctx.strokeStyle = rgbToCss(frame.palette.skyBottom, 0.06 * amount)
    ctx.lineWidth = h * 0.01
    ctx.beginPath()
    for (let x = 0; x <= w; x += w / 20) {
      const off = Math.sin(frame.now / 220 + x / w * 10 + i) * h * 0.003 + wob
      if (x === 0) ctx.moveTo(x, yy + off)
      else ctx.lineTo(x, yy + off)
    }
    ctx.stroke()
  }
  ctx.restore()
}

// 手前のぼけた近景（草むら）を下の両隅に重ねて、奥行き（額縁）を出す。
// カメラのすぐ手前にある＝大きく・暗く・ぼけて見える。
function applyForegroundFrame(ctx, view, frame) {
  if (frame.noGroundFrame) return // 町・室内では手前の草むらを出さない
  const { w, h } = view
  const g = frame.palette.groundShade
  const dark = { r: g.r * 0.55, g: g.g * 0.6, b: g.b * 0.55 }
  ctx.save()
  for (const side of [0, 1]) {
    const cx = side === 0 ? -w * 0.04 : w * 1.04
    // ぼけた塊
    const grad = ctx.createRadialGradient(cx, h * 1.02, 0, cx, h * 1.02, h * 0.5)
    grad.addColorStop(0, rgbToCss(dark, 0.5))
    grad.addColorStop(0.6, rgbToCss(dark, 0.28))
    grad.addColorStop(1, rgbToCss(dark, 0))
    ctx.fillStyle = grad
    ctx.fillRect(side === 0 ? 0 : w * 0.6, h * 0.7, w * 0.4, h * 0.3)
    // ぼけた草の穂（数本）
    ctx.strokeStyle = rgbToCss(dark, 0.4)
    ctx.lineWidth = h * 0.012
    ctx.lineCap = 'round'
    const baseX = side === 0 ? w * 0.04 : w * 0.96
    for (let i = -2; i <= 2; i++) {
      const x = baseX + i * w * 0.025
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.quadraticCurveTo(x + i * w * 0.01, h * 0.86, x + (side === 0 ? 1 : -1) * w * 0.02, h * 0.82)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// 天気の色味：くもりは灰色をかぶせ、雨は青灰色で暗くする
function applyWeather(ctx, view, frame) {
  const { w, h } = view
  if (frame.weather === 'cloudy') {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.18
    ctx.fillStyle = '#9aa0a8'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
  if (frame.rain > 0.02) {
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    ctx.globalAlpha = 0.3 * frame.rain
    ctx.fillStyle = '#4a5870'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
}

// まとめて仕上げる
export function applyPost(ctx, view, frame) {
  applyWeather(ctx, view, frame)
  applyForegroundFrame(ctx, view, frame)
  applyMorningMist(ctx, view, frame)
  if (!frame.gl) applyHeatHaze(ctx, view, frame) // WebGL有効時は陽炎をシェーダー側で出す
  applyHaze(ctx, view, frame)
  applyColorGrade(ctx, view, frame)
  applyVignette(ctx, view)
  applyGrain(ctx, view)
}
