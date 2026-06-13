// 通り雨（夕立）の描画。斜めに降る雨筋。intensity(0..1) で強さを変える。

export function createRain() {
  const drops = Array.from({ length: 150 }, () => ({
    x: Math.random(),
    y: Math.random(),
    len: 0.018 + Math.random() * 0.03,
    sp: 0.9 + Math.random() * 0.7,
  }))
  return {
    draw(ctx, view, frame, intensity) {
      if (intensity <= 0.02) return
      const { w, h } = view
      ctx.save()
      ctx.strokeStyle = `rgba(205,218,228,${0.4 * intensity})`
      ctx.lineWidth = Math.max(1, h * 0.0014)
      ctx.lineCap = 'round'
      const t = frame.now / 1000
      for (const d of drops) {
        const y = (d.y + t * d.sp) % 1.1
        const x = (d.x + y * 0.05) % 1
        const px = x * w
        const py = y * h
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px - w * 0.012, py + d.len * h)
        ctx.stroke()
      }
      ctx.restore()
    },
  }
}
