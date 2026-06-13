// 仕上げ（ポストプロセス）。場面を描いたあと、画面全体に一枚絵としての空気をかける。
// ・地平線の霞（空気遠近）
// ・周辺減光（ビネット）
// ・時間帯の色味（カラーグレード）
// ・紙のグレイン（水彩紙の質感）
// どれも“うっすら”が肝心。やりすぎない。

import { rgbToCss } from '../util/color.js'

const HORIZON = 0.56

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

// 時間帯に応じた色味を全体に薄くかける（夕は暖色、夜は寒色に寄せる）
export function applyColorGrade(ctx, view, frame) {
  const { w, h } = view
  const t = frame.time
  ctx.save()
  // 夕方の黄金色をやわらかく足す
  if (t > 0.55 && t < 0.85) {
    ctx.globalCompositeOperation = 'soft-light'
    ctx.globalAlpha = 0.35
    ctx.fillStyle = rgbToCss(frame.palette.sun)
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

// まとめて仕上げる
export function applyPost(ctx, view, frame) {
  applyHaze(ctx, view, frame)
  applyColorGrade(ctx, view, frame)
  applyVignette(ctx, view)
  applyGrain(ctx, view)
}
