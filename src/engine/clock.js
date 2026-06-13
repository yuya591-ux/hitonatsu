// ゲーム内の時刻を管理する役。時刻は 0.0(一日の始まり=朝)〜1.0(翌朝) の数値で持つ。
// 実時間ではなくゲーム内時間が自動で進む。速度や開始時刻は外から指定できる（検証・調整用）。

import { DAY_LENGTH_SEC } from '../data/phases.js'

export function createClock({ startTime = 0, speed = 1, paused = false } = {}) {
  let t = ((startTime % 1) + 1) % 1
  let running = !paused

  return {
    get time() {
      return t
    },
    setTime(v) {
      t = ((v % 1) + 1) % 1
    },
    get running() {
      return running
    },
    start() {
      running = true
    },
    pause() {
      running = false
    },
    // 経過ミリ秒ぶんだけ時刻を進める
    update(dtMs) {
      if (!running) return
      t = (t + (dtMs / 1000 / DAY_LENGTH_SEC) * speed) % 1
    },
  }
}
