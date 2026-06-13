// 虫（オリジナル表現）。場面に置かれ、近づいて「つかまえる」と夏の記録に残る。
// 種類ごとに簡単な形で描き、ふわっと小さく揺れる。

// 虫のだいたいの大きさ（画面高さに対する割合）
const SIZE = 0.05

function bob(now, seed, amp) {
  return Math.sin(now / 600 + seed) * amp
}

// カブトムシ（黒い甲虫＋角）
function drawBeetle(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.15))
  ctx.fillStyle = '#3A2A1E'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.5, s * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()
  // 前胸
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.28, s * 0.26, s * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  // 角
  ctx.strokeStyle = '#2A1E14'
  ctx.lineWidth = s * 0.08
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.4)
  ctx.lineTo(0, -s * 0.7)
  ctx.stroke()
  // 背の継ぎ目
  ctx.strokeStyle = '#1E140E'
  ctx.lineWidth = s * 0.04
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.1)
  ctx.lineTo(0, s * 0.3)
  ctx.stroke()
  ctx.restore()
}

// セミ（木にとまる・透明な翅）
function drawCicada(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.08))
  // 翅
  ctx.fillStyle = 'rgba(210,220,210,0.45)'
  ctx.beginPath()
  ctx.ellipse(s * 0.18, 0, s * 0.5, s * 0.2, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(-s * 0.18, 0, s * 0.5, s * 0.2, -0.3, 0, Math.PI * 2)
  ctx.fill()
  // 体
  ctx.fillStyle = '#4A4030'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.16, s * 0.42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// トンボ（細い体＋4枚の翅・空中でホバリング）
function drawDragonfly(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.3))
  // 体
  ctx.strokeStyle = '#6E7E4A'
  ctx.lineWidth = s * 0.08
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-s * 0.1, 0)
  ctx.lineTo(s * 0.6, 0)
  ctx.stroke()
  // 頭
  ctx.fillStyle = '#5A6A3A'
  ctx.beginPath()
  ctx.arc(-s * 0.14, 0, s * 0.1, 0, Math.PI * 2)
  ctx.fill()
  // 翅（小刻みに震える）
  const flap = Math.sin(now / 80 + seed) * s * 0.04
  ctx.fillStyle = 'rgba(220,230,235,0.5)'
  for (const sx of [s * 0.06, s * 0.22]) {
    ctx.beginPath()
    ctx.ellipse(sx, -s * 0.05 - flap, s * 0.28, s * 0.07, -0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(sx, s * 0.05 + flap, s * 0.28, s * 0.07, 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

// チョウ（ひらひら・翅をゆっくり開閉）
function drawButterfly(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.4))
  const open = 0.5 + 0.5 * Math.abs(Math.sin(now / 300 + seed)) // 翅の開き
  ctx.fillStyle = 'rgba(245,170,90,0.92)'
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(dir * s * 0.22 * open, -s * 0.08, s * 0.26 * open, s * 0.22, dir * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(dir * s * 0.2 * open, s * 0.12, s * 0.2 * open, s * 0.16, -dir * 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#4A3A2A'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.05, s * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// バッタ（草にとまる・緑の体）
function drawGrasshopper(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.06))
  ctx.fillStyle = '#7CA24E'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.42, s * 0.16, -0.15, 0, Math.PI * 2)
  ctx.fill()
  // 後脚
  ctx.strokeStyle = '#5E823A'
  ctx.lineWidth = s * 0.08
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-s * 0.1, s * 0.05)
  ctx.lineTo(-s * 0.32, -s * 0.18)
  ctx.lineTo(-s * 0.42, s * 0.22)
  ctx.stroke()
  // 頭
  ctx.fillStyle = '#6E9646'
  ctx.beginPath()
  ctx.arc(s * 0.38, -s * 0.04, s * 0.12, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// 魚（図鑑用の簡単な魚）
function drawFish(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.1))
  ctx.fillStyle = '#7E8A6A'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.5, s * 0.26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath() // 尾
  ctx.moveTo(-s * 0.45, 0)
  ctx.lineTo(-s * 0.72, -s * 0.22)
  ctx.lineTo(-s * 0.72, s * 0.22)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#2A2018' // 目
  ctx.beginPath()
  ctx.arc(s * 0.28, -s * 0.04, s * 0.05, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// てんとう虫
function drawLadybug(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.08))
  ctx.fillStyle = '#C0392B'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.42, s * 0.36, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#2A1A14'
  ctx.lineWidth = s * 0.04
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.36)
  ctx.lineTo(0, s * 0.36)
  ctx.stroke()
  ctx.fillStyle = '#2A1A14'
  for (const [dx, dy] of [[-0.18, -0.1], [0.18, -0.1], [-0.15, 0.16], [0.15, 0.16]]) {
    ctx.beginPath()
    ctx.arc(dx * s, dy * s, s * 0.06, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.arc(0, -s * 0.42, s * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// カマキリ
function drawMantis(ctx, x, y, s, now, seed) {
  ctx.save()
  ctx.translate(x, y + bob(now, seed, s * 0.1))
  ctx.strokeStyle = '#6FA04A'
  ctx.lineWidth = s * 0.09
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(-s * 0.35, s * 0.22)
  ctx.lineTo(s * 0.2, -s * 0.12)
  ctx.stroke()
  ctx.beginPath() // 鎌
  ctx.moveTo(s * 0.2, -s * 0.12)
  ctx.lineTo(s * 0.42, -s * 0.32)
  ctx.lineTo(s * 0.56, -s * 0.16)
  ctx.stroke()
  ctx.fillStyle = '#5E8A3A'
  ctx.beginPath()
  ctx.arc(s * 0.26, -s * 0.18, s * 0.11, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

const DRAWERS = {
  beetle: drawBeetle,
  cicada: drawCicada,
  dragonfly: drawDragonfly,
  butterfly: drawButterfly,
  grasshopper: drawGrasshopper,
  ladybug: drawLadybug,
  mantis: drawMantis,
  fish: drawFish,
}

// 図鑑用の小さな標本画（canvas を返す）
export function creatureThumb(kind, px) {
  const c = document.createElement('canvas')
  c.width = px
  c.height = px
  const x = c.getContext('2d')
  const drawer = DRAWERS[kind] || DRAWERS.beetle
  drawer(x, px / 2, px * 0.55, px * 0.34, 0, 1)
  return c
}

// いまの位置（飛ぶ虫はゆっくり漂う）。描画と「つかまえ判定」で同じ位置を使う。
export function creaturePos(c, now) {
  if (c.kind === 'dragonfly' || c.kind === 'butterfly') {
    const sp = (c.kind === 'butterfly' ? 0.6 : 0.9) * (now / 1000)
    return {
      x: c.x + Math.sin(sp + c.seed) * 0.05,
      y: c.y + Math.cos(sp * 1.3 + c.seed) * 0.025,
    }
  }
  return { x: c.x, y: c.y }
}

// 1匹を描く（c = {kind, x, y, id}）
export function drawCreature(c, ctx, view, frame) {
  const pos = creaturePos(c, frame.now)
  const s = view.h * SIZE
  const drawer = DRAWERS[c.kind]
  if (drawer) drawer(ctx, pos.x * view.w, pos.y * view.h, s, frame.now, c.seed || 0)
}
