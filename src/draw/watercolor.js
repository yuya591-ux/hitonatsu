// 水彩画っぽさを出すための小道具。
// 「やわらかいにじみ」「うねる森の稜線」「絵具のムラ」を重ねて、平らな塗りを避ける。

import { rgbToCss, lerpColor } from '../util/color.js'

// やわらかい円のにじみ（絵具のブルーム）
export function bloom(ctx, x, y, r, rgb, alpha) {
  const css = rgbToCss(rgb)
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, css.replace('rgb', 'rgba').replace(')', `,${alpha})`))
  g.addColorStop(0.6, css.replace('rgb', 'rgba').replace(')', `,${alpha * 0.5})`))
  g.addColorStop(1, css.replace('rgb', 'rgba').replace(')', ',0)'))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

// 決め打ちの擬似乱数（同じ絵を毎回出す）
export function rng(seed) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// うねる森の稜線で塗りつぶす（手前ほど濃い緑、奥ほど空色に近づけて霞ませる）
// crestY: 稜線のおおよその高さ(px) / amp: 起伏(px) / bumps: 山の細かさ
export function forestRidge(ctx, view, crestY, amp, bumps, rgb, alpha, seed) {
  const { w, h } = view
  const r = rng(seed)
  ctx.fillStyle = rgbToCss(rgb, alpha)
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, crestY)
  const n = bumps
  let prev = crestY
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w
    // 大小の起伏を重ねて自然なギザギザに
    const wob =
      Math.sin(i * 0.7 + seed) * 0.5 +
      Math.sin(i * 1.9 + seed * 1.3) * 0.3 +
      (r() - 0.5) * 0.4
    const y = crestY + wob * amp
    // 木立のこぶ（小さな丸み）
    ctx.quadraticCurveTo((x + (i - 1) / n * w) / 2, Math.min(prev, y) - amp * 0.3, x, y)
    prev = y
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
}

// 画面全体に絵具のムラ（低周波の色ゆらぎ）を薄く重ねる＝のっぺり防止
export function paperWash(ctx, view, rgb, seed) {
  const { w, h } = view
  const r = rng(seed)
  ctx.save()
  ctx.globalCompositeOperation = 'soft-light'
  for (let i = 0; i < 7; i++) {
    const x = r() * w
    const y = r() * h
    const rad = (0.25 + r() * 0.4) * Math.max(w, h)
    const tint = lerpColor(rgb, r() > 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }, 0.5)
    bloom(ctx, x, y, rad, tint, 0.05)
  }
  ctx.restore()
}

// にじむ草の一筆（やわらかい曲線）
export function grassBlade(ctx, x, baseY, len, lean, rgb, alpha) {
  ctx.strokeStyle = rgbToCss(rgb, alpha)
  ctx.lineWidth = Math.max(1, len * 0.12)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, baseY)
  ctx.quadraticCurveTo(x + lean * 0.5, baseY - len * 0.6, x + lean, baseY - len)
  ctx.stroke()
}
