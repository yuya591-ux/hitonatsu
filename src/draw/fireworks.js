// 夏の夜の花火。夜にときどき遠くの空で開く。
// シンプルな粒子で、ふわっと開いて落ちながら消える。

const COLORS = ['#FF8A8A', '#FFD978', '#8FD3FF', '#C0A8FF', '#A6F0B4', '#FF9ED6']

export function createFireworks() {
  let bursts = []
  let timer = 1500

  function spawn(view) {
    const x = (0.2 + Math.random() * 0.6) * view.w
    const y = (0.1 + Math.random() * 0.18) * view.h
    const n = 36 + Math.floor(Math.random() * 28)
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]
    const particles = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.12
      const sp = (0.05 + Math.random() * 0.06) * view.h
      particles.push({ a, sp })
    }
    bursts.push({ x, y, age: 0, particles, color })
  }

  return {
    update(dt, view, night) {
      if (night > 0.5) {
        timer -= dt
        if (timer <= 0) {
          spawn(view)
          timer = 2200 + Math.random() * 3200
        }
      }
      for (const b of bursts) b.age += dt
      bursts = bursts.filter((b) => b.age < 1900)
    },
    draw(ctx, view, night) {
      if (night <= 0.1 || bursts.length === 0) return
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const b of bursts) {
        const t = b.age / 1900
        const ease = 1 - Math.pow(1 - t, 2.2)
        const grav = t * t * view.h * 0.06
        const alpha = Math.max(0, 1 - t) * night
        ctx.fillStyle = b.color
        const r = view.h * 0.0035 * (1 - t * 0.4)
        for (const p of b.particles) {
          const dist = p.sp * ease
          const px = b.x + Math.cos(p.a) * dist
          const py = b.y + Math.sin(p.a) * dist + grav
          ctx.globalAlpha = alpha
          ctx.beginPath()
          ctx.arc(px, py, r, 0, Math.PI * 2)
          ctx.fill()
        }
        // 中心の閃光（開いた瞬間）
        if (t < 0.15) {
          ctx.globalAlpha = (1 - t / 0.15) * night
          ctx.beginPath()
          ctx.arc(b.x, b.y, view.h * 0.02, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      ctx.restore()
    },
  }
}
