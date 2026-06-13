// 画面のすみに出す、ごく控えめな時間帯の表示（システム用語は出さない）。
// 例: 左上に小さな丸（太陽/月）と「朝」「昼」「夕方」「夜」。

import { rgbToCss } from '../util/color.js'

export function drawHud(ctx, view, frame, phase) {
  const { w, h } = view
  const pad = Math.round(Math.min(w, h) * 0.03)
  const fontSize = Math.round(Math.min(w, h) * 0.045)
  ctx.save()

  ctx.font = `${fontSize}px sans-serif`
  ctx.textBaseline = 'middle'
  const label = phase.label
  const iconR = fontSize * 0.42
  const textW = ctx.measureText(label).width
  const panelH = fontSize * 1.6
  const panelW = iconR * 2 + fontSize * 0.5 + textW + fontSize * 0.9
  const x = pad
  const y = pad

  // 半透明のやわらかいパネル
  ctx.fillStyle = 'rgba(255,250,240,0.72)'
  roundRect(ctx, x, y, panelW, panelH, panelH * 0.4)
  ctx.fill()

  // 太陽 or 月の小さな丸
  const cx = x + fontSize * 0.7
  const cy = y + panelH / 2
  if (phase.icon === 'moon') {
    ctx.fillStyle = rgbToCss(frame.palette.moon)
  } else {
    ctx.fillStyle = rgbToCss(frame.palette.sun)
  }
  // 丸が白すぎてパネルに埋もれないよう、輪郭を薄く付ける
  ctx.strokeStyle = 'rgba(120,110,90,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, iconR, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // 時間帯の文字
  ctx.fillStyle = '#3B3024'
  ctx.fillText(label, cx + iconR + fontSize * 0.4, cy + 1)

  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
