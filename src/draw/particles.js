// 空気を“生かす”微細な粒子。昼は光に舞う埃、夜は草むらの蛍。
// 軽さ優先（数十個・単純な円）。場面の上、仕上げ(post)の前に描く。

import { rgbToCss, smoothstep } from '../util/color.js'

// 昼の埃（光の中をゆっくり漂う）
const MOTES = Array.from({ length: 30 }, (_, i) => ({
  x: ((i * 61) % 100) / 100,
  y: ((i * 29) % 70) / 100,
  r: 0.6 + ((i * 13) % 10) / 8,
  sx: 0.2 + ((i * 7) % 10) / 30, // 横の漂い速度
  sy: 0.1 + ((i * 5) % 10) / 40,
  seed: (i * 97) % 1000,
}))

// 夜の蛍（地面近くをふわふわ）
const FLIES = Array.from({ length: 16 }, (_, i) => ({
  x: ((i * 53) % 100) / 100,
  y: 0.5 + ((i * 37) % 35) / 100,
  seed: (i * 131) % 1000,
}))

// 一日は朝(t=0)から始まる。夜は終盤(0.82〜1.0)だけ。t=0は完全に朝＝夜ではない。
function nightFactor(t) {
  return t >= 0.82 ? smoothstep(0.82, 0.92, t) : 0
}

function softDot(ctx, x, y, r, css, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, css.replace('rgb', 'rgba').replace(')', `,${alpha})`))
  g.addColorStop(1, css.replace('rgb', 'rgba').replace(')', ',0)'))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

export function drawParticles(ctx, view, frame) {
  const { w, h } = view
  const t = frame.time
  const night = nightFactor(t)
  const day = 1 - night

  ctx.save()

  // 昼：光に舞う埃（加算でほわっと）
  if (day > 0.05) {
    ctx.globalCompositeOperation = 'lighter'
    const light = rgbToCss(frame.palette.light)
    const sec = frame.now / 1000
    for (const m of MOTES) {
      const x = (((m.x + sec * 0.01 * m.sx) % 1) + Math.sin(sec * 0.3 + m.seed) * 0.01) * w
      const y = (((m.y + sec * 0.004 * m.sy) % 1)) * h * 0.85
      const tw = 0.5 + 0.5 * Math.sin(sec * 1.2 + m.seed)
      softDot(ctx, x, y, m.r * Math.min(w, h) * 0.006 + 1.2, light, 0.12 * day * tw)
    }
  }

  // 夜：草むらの蛍（ゆっくり明滅しながら漂う）
  if (night > 0.05) {
    ctx.globalCompositeOperation = 'lighter'
    const glow = 'rgb(190,245,150)'
    const sec = frame.now / 1000
    for (const f of FLIES) {
      const x = (f.x + Math.sin(sec * 0.25 + f.seed) * 0.04) * w
      const y = (f.y + Math.cos(sec * 0.2 + f.seed * 1.3) * 0.03) * h
      const pulse = Math.max(0, Math.sin(sec * 1.1 + f.seed))
      const r = Math.min(w, h) * 0.012
      softDot(ctx, x, y, r * 2.4, glow, 0.5 * night * pulse)
      ctx.fillStyle = `rgba(210,255,180,${0.8 * night * pulse})`
      ctx.beginPath()
      ctx.arc(x, y, 1.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}
