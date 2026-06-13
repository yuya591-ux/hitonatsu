// 操作する主人公（麦わら帽子の少年・オリジナル）。
// 固定カメラの一枚絵の中を自由に歩き回る。奥(地平線側)へ行くほど小さく、手前ほど大きく描いて
// 「僕の夏休み」的な立体感（2D背景＋その上を動くキャラ）を出す。
//
// 座標は画面に対する割合(0..1)で持つ。歩ける範囲(BAND)は地面の帯。

import { clamp01 } from '../util/color.js'

// 歩ける地面の範囲（画面割合）。横はほぼ全幅、縦は地平線〜手前。
export const BAND = { top: 0.62, bottom: 0.93, left: 0.05, right: 0.95 }

export function createPlayer() {
  return {
    x: 0.5,
    y: 0.86,
    facing: 1, // 1=右向き, -1=左向き
    moving: false,
    phase: 0, // 歩行アニメ用
    target: null, // タップ移動の目標 {x,y}
    dirX: 0, // キー入力
    dirY: 0,
    frozen: false, // 場面遷移中など操作を止める
  }
}

// 奥行きに応じた拡大率（手前ほど大きい）
function depthScale(y) {
  const f = clamp01((y - BAND.top) / (BAND.bottom - BAND.top))
  return 0.6 + 0.55 * f
}

// 毎フレーム更新。onEdge(dir) は端に達したとき呼ばれ、隣の場面へ移れたら true を返す。
export function updatePlayer(p, dt, onEdge) {
  if (p.frozen) {
    p.moving = false
    return
  }
  const sp = 0.26 // 横移動の速さ（毎秒・画面割合）
  let mvx = 0
  let mvy = 0

  if (p.target) {
    const dx = p.target.x - p.x
    const dy = p.target.y - p.y
    const d = Math.hypot(dx, dy)
    if (d < 0.008) {
      p.target = null
    } else {
      mvx = dx / d
      mvy = dy / d
    }
  } else {
    mvx = p.dirX
    mvy = p.dirY
    const m = Math.hypot(mvx, mvy) || 1
    mvx /= m
    mvy /= m
  }

  const isMoving = Math.abs(mvx) + Math.abs(mvy) > 0.01
  if (mvx > 0.02) p.facing = 1
  else if (mvx < -0.02) p.facing = -1

  const step = (sp * dt) / 1000
  let nx = p.x + mvx * step
  let ny = p.y + mvy * step * 0.7 // 奥行き方向はゆっくり

  // 端に達したら隣の場面へ。移れたら以降の処理を打ち切る。
  if (nx < BAND.left && onEdge('left')) return
  if (nx > BAND.right && onEdge('right')) return
  if (ny < BAND.top && onEdge('up')) return
  if (ny > BAND.bottom && onEdge('down')) return

  p.x = Math.min(Math.max(nx, BAND.left), BAND.right)
  p.y = Math.min(Math.max(ny, BAND.top), BAND.bottom)
  p.moving = isMoving
  if (isMoving) p.phase += dt / 1000
}

// 場面が変わったときに、入ってきた向きの反対側へ立たせる
export function placeAfterMove(p, dir) {
  if (dir === 'left') p.x = BAND.right - 0.03
  else if (dir === 'right') p.x = BAND.left + 0.03
  else if (dir === 'up') p.y = BAND.bottom - 0.02
  else if (dir === 'down') p.y = BAND.top + 0.02
  p.target = null
}

// 主人公を描く
export function drawPlayer(p, ctx, view) {
  const { w, h } = view
  const scale = depthScale(p.y)
  const H = h * 0.2 * scale // 全身の高さ
  const px = p.x * w
  const py = p.y * h // 足元

  const swing = p.moving ? Math.sin(p.phase * 11) : 0
  const bob = p.moving ? Math.abs(Math.sin(p.phase * 11)) * H * 0.03 : 0

  // 足元の影
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(px, py, H * 0.2, H * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(px, py - bob)
  ctx.scale(p.facing, 1)

  const skin = '#E7B98E'
  const shirt = '#F3F0E7'
  const shirtShade = '#D8D3C4'
  const pants = '#3F5A77'
  const hat = '#DCB76C'
  const hatShade = '#B68F4C'

  // 脚（2本・歩行で前後に振る）
  ctx.strokeStyle = skin
  ctx.lineWidth = H * 0.06
  ctx.lineCap = 'round'
  const hipY = -H * 0.34
  ctx.beginPath()
  ctx.moveTo(-H * 0.05, hipY)
  ctx.lineTo(-H * 0.05 + swing * H * 0.1, 0)
  ctx.moveTo(H * 0.05, hipY)
  ctx.lineTo(H * 0.05 - swing * H * 0.1, 0)
  ctx.stroke()

  // 半ズボン
  ctx.fillStyle = pants
  roundRect(ctx, -H * 0.13, -H * 0.46, H * 0.26, H * 0.16, H * 0.03)
  ctx.fill()

  // 胴（シャツ）
  ctx.fillStyle = shirt
  roundRect(ctx, -H * 0.14, -H * 0.66, H * 0.28, H * 0.24, H * 0.05)
  ctx.fill()
  // シャツの陰
  ctx.fillStyle = shirtShade
  roundRect(ctx, H * 0.02, -H * 0.66, H * 0.12, H * 0.24, H * 0.05)
  ctx.fill()

  // 腕（前側・歩行で振る）
  ctx.strokeStyle = skin
  ctx.lineWidth = H * 0.055
  ctx.beginPath()
  ctx.moveTo(H * 0.08, -H * 0.6)
  ctx.lineTo(H * 0.12 - swing * H * 0.08, -H * 0.4)
  ctx.stroke()

  // 首
  ctx.strokeStyle = skin
  ctx.lineWidth = H * 0.06
  ctx.beginPath()
  ctx.moveTo(0, -H * 0.66)
  ctx.lineTo(0, -H * 0.72)
  ctx.stroke()

  // 頭
  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(0, -H * 0.8, H * 0.12, 0, Math.PI * 2)
  ctx.fill()

  // 麦わら帽子
  ctx.fillStyle = hat
  ctx.beginPath()
  ctx.ellipse(0, -H * 0.86, H * 0.2, H * 0.06, 0, 0, Math.PI * 2) // つば
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, -H * 0.9, H * 0.1, H * 0.08, 0, Math.PI, Math.PI * 2) // 山
  ctx.fill()
  ctx.strokeStyle = hatShade
  ctx.lineWidth = H * 0.015
  ctx.beginPath()
  ctx.ellipse(0, -H * 0.86, H * 0.2, H * 0.06, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.restore()
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
