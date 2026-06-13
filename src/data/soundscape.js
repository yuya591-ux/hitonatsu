// 「いまどの音が鳴るべきか」を時間帯と場面から決める（音のフェーズ駆動）。
// 空の色と同じ発想で、設定をデータで持つ。

import { getCurrentPhase } from './phases.js'

// 時間帯ごとの土台の音
const TIME_BED = {
  morning: 'morning',
  noon: 'cicada',
  evening: 'higurashi',
  night: 'night',
}

// 場面ごとに重ねる音（土台に足す）
const SCENE_ACCENT = {
  engawa: ['windchime'],
  kawabe: ['river'],
  // 原っぱ・神社・田んぼ道は土台の音のみ
}

// いまアクティブにすべき音IDの配列を返す
export function activeSounds(time, sceneId) {
  const phase = getCurrentPhase(time)
  const ids = []
  if (TIME_BED[phase.key]) ids.push(TIME_BED[phase.key])
  for (const a of SCENE_ACCENT[sceneId] || []) ids.push(a)
  return ids
}
