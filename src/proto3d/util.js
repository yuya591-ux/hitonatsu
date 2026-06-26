// 純粋ユーティリティ（副作用なし・モジュール状態に依存しない＝どこからでも安全に使える）。
// C3「段階的リファクタ（安全な範囲で）」の第一歩＝9350行の単一ファイルから、回帰リスクのない
// 純粋関数だけを切り出してモジュール化する。今後の安全な抽出はここに足していく。
// ※密結合な部分（シーン/マテリアル/コライダー/音の共有状態に触る関数）は、動いているゲームに
//   回帰を持ち込まないよう意図的に据え置く（big-bangリライトはしない）。

// 0..1 のなめらかな補間（Hermite）。境界をクランプしてから 3t²-2t³。
export const smoothstep01 = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }

// 点(x,z)が多角形poly（[[x,z],...]）の内側か（even-odd / ray casting）。
export const pip = (x, z, poly) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1]
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c
  }
  return c
}
