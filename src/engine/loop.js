// ゲームループ。毎フレーム（1秒に約60回）onFrame を呼び、画面を描き直し続ける仕組み。

export function createLoop(onFrame) {
  let last = 0
  let rafId = 0
  let alive = false

  function tick(now) {
    if (!alive) return
    // タブを離れて戻ったときなどの巨大な dt を抑える（最大100ms）
    const dt = Math.min(now - last, 100)
    last = now
    onFrame(dt, now)
    rafId = requestAnimationFrame(tick)
  }

  return {
    start() {
      if (alive) return
      alive = true
      last = performance.now()
      rafId = requestAnimationFrame(tick)
    },
    stop() {
      alive = false
      cancelAnimationFrame(rafId)
    },
  }
}
