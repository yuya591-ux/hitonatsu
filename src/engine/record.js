// 夏の記録。採った虫（や会った人・見た風景）をためておく。
// 1日目は1セッション完結なので、いまはメモリ上で保持する（保存は後付け可能）。

const caught = new Set()
const entries = [] // { id, name, kind }
const met = new Set()
const metList = [] // { id, name }
const visited = new Set()
const visitedList = [] // 場所名

export function isCaught(id) {
  return caught.has(id)
}

// 採取を記録する。初めてなら true。
export function catchCreature(c) {
  if (caught.has(c.id)) return false
  caught.add(c.id)
  entries.push({ id: c.id, name: c.name, kind: c.kind })
  return true
}

export function caughtEntries() {
  return entries.slice()
}

export function caughtCount() {
  return entries.length
}

// 人に会ったことを記録（会話したら）
export function meetPerson(npc) {
  if (met.has(npc.id)) return false
  met.add(npc.id)
  metList.push({ id: npc.id, name: npc.name })
  return true
}

export function metEntries() {
  return metList.slice()
}

// 訪れた場所を記録
export function visitScene(scene) {
  if (visited.has(scene.id)) return
  visited.add(scene.id)
  visitedList.push(scene.name)
}

export function visitedScenes() {
  return visitedList.slice()
}

// 翌日へ：その日ぶんの「歩いた場所」をリセット（虫・人は通算で残す）
export function newDay() {
  visited.clear()
  visitedList.length = 0
}
