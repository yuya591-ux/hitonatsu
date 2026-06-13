// 夏の記録。採った虫（や会った人・見た風景）をためておく。
// 1日目は1セッション完結なので、いまはメモリ上で保持する（保存は後付け可能）。

const caught = new Set()
const entries = [] // { id, name, kind }

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
