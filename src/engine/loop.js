// ゲームループ。onFrame を呼んで画面を描き直す。
// スマホの発熱を抑えるため、描画は上限フレームレート（既定30fps）に制限する。
// この穏やかなゲームでは見た目はほぼ変わらず、描画負荷がほぼ半減する。

export function createLoop(onFrame, fps = 30) {
  const minDt = 1000 / fps - 1 // この間隔より短ければ描画をスキップ
  let last = 0
  let rafId = 0
  let alive = false

  function tick(now) {
    if (!alive) return
    rafId = requestAnimationFrame(tick) // 次フレームは常に予約（中身は時間で間引く）
    const elapsed = now - last
    if (elapsed < minDt) return // まだ早い＝今回は描かない（発熱対策）
    const dt = Math.min(elapsed, 100) // タブ復帰などの巨大dtを抑える
    last = now
    onFrame(dt, now)
  }

  return {
    start() {
      if (alive) return
      alive = true
      last = performance.now() - minDt
      rafId = requestAnimationFrame(tick)
    },
    stop() {
      alive = false
      cancelAnimationFrame(rafId)
    },
  }
}
