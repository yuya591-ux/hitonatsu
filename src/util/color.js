// 色のユーティリティ。時間帯ごとの色をなめらかに混ぜる（補間する）ために使う。

// "#RRGGBB" を {r,g,b} に変換
export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

// {r,g,b}(+不透明度) を Canvas で使える文字列にする
export function rgbToCss(c, a = 1) {
  const r = c.r | 0
  const g = c.g | 0
  const b = c.b | 0
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`
}

// 数値の線形補間（a と b の間を t=0..1 で混ぜる）
export function lerp(a, b, t) {
  return a + (b - a) * t
}

// 色 c1→c2 を t=0..1 で混ぜて {r,g,b} を返す（hex でも {r,g,b} でも受ける）
export function lerpColor(c1, c2, t) {
  const a = typeof c1 === 'string' ? hexToRgb(c1) : c1
  const b = typeof c2 === 'string' ? hexToRgb(c2) : c2
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  }
}

// 0..1 に丸める
export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

// なめらかな立ち上がり（端をやわらげる補間）。急な切り替わりを避けたいときに使う
export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
