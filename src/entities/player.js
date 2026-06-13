// 操作する主人公（麦わら帽子の少年・オリジナル）。
// 固定カメラの一枚絵の中を自由に歩き回る。奥(地平線側)へ行くほど小さく、手前ほど大きく描いて
// 「僕の夏休み」的な立体感（2D背景＋その上を動くキャラ）を出す。
//
// 座標は画面に対する割合(0..1)で持つ。歩ける範囲(BAND)は地面の帯。

import { clamp01 } from '../util/color.js'

// 歩ける地面の範囲（画面割合）。横はほぼ全幅、縦は地平線〜手前。
// 高い画角で地面が広いので、縦の歩行範囲も広くとる（奥行きが効く）。
export const BAND = { top: 0.46, bottom: 0.95, left: 0.05, right: 0.95 }

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
    swing: 0, // 採取時の網振り（ミリ秒・残り）
  }
}

const SWING_MS = 320

// 太陽の方向から、影の向き(dx)と長さ(length)を出す。朝夕は低い太陽で影が長く伸びる。
export function sunShadow(time) {
  if (time >= 0.82) return { dx: 0, length: 0.15 } // 夜は短く方向なし
  const u = Math.min(time, 0.84) / 0.84
  const height = Math.sin(u * Math.PI) // 0(地平線)〜1(天頂)
  const sunX = 0.14 + 0.72 * u // 太陽の横位置（朝=左, 夕=右）
  return { dx: -(sunX - 0.5) * 2, length: 1 - height }
}

// 奥行きに応じた拡大率（手前ほど大きい・奥ほど小さい）。
// 見下ろし感を強めるため、奥と手前で大きく差をつける（遠近を効かせる）。
function depthScale(y) {
  const f = clamp01((y - BAND.top) / (BAND.bottom - BAND.top))
  return 0.4 + 0.95 * f * f // 手前で急に大きくなる＝俯瞰の床に立っている感じ
}

// 毎フレーム更新。onEdge(dir) は端に達したとき呼ばれ、隣の場面へ移れたら true を返す。
export function updatePlayer(p, dt, onEdge) {
  if (p.swing > 0) p.swing -= dt // 網振りは凍結中でも進める
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

// 主人公を描く（麦わら帽子・半袖シャツ・半ズボン・虫取り網を肩にかけた少年）
export function drawPlayer(p, ctx, view, frame) {
  const { w, h } = view
  const scale = depthScale(p.y)
  const H = h * 0.2 * scale // 全身の高さ
  const px = p.x * w
  const py = p.y * h // 足元

  const gait = p.moving ? Math.sin(p.phase * 10) : 0
  const now = frame ? frame.now : 0
  // 歩行中はぴょこぴょこ、立ち止まり中はゆっくり呼吸でわずかに上下
  const bob = p.moving
    ? Math.abs(Math.sin(p.phase * 10)) * H * 0.025
    : Math.sin(now / 1100) * H * 0.008

  // 足元の影（太陽の方向へ伸びる。朝夕は長い影）
  const sh = sunShadow(frame ? frame.time : 0.3)
  const offX = sh.dx * H * (0.2 + sh.length * 1.7)
  ctx.fillStyle = 'rgba(40,35,28,0.16)'
  ctx.beginPath()
  ctx.ellipse(px + offX * 0.5, py, H * 0.16 + Math.abs(offX) * 0.5, H * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(px, py - bob)
  ctx.scale(p.facing, 1)

  const skin = '#E9BB8E'
  const skinShade = '#CE9A6E'
  const shirt = '#F4F1E8'
  const shirtShade = '#D5CFBF'
  const trim = '#7FA6C8'
  const pants = '#3F5A77'
  const pantsShade = '#314962'
  const hat = '#E0BC72'
  const hatShade = '#B68F4C'
  const pole = '#9A7B4A'

  // ── 虫取り網（ふだんは肩にかつぎ、採取時は前へ振る） ──
  const swing = p.swing > 0 ? Math.sin((1 - p.swing / SWING_MS) * Math.PI) : 0
  ctx.save()
  ctx.translate(H * 0.06, -H * 0.5) // 手のあたりを支点に
  ctx.rotate(swing * 2.4) // 採取時に前へ振り抜く
  const ox = -H * 0.42
  const oy = -H * 0.52
  ctx.strokeStyle = pole
  ctx.lineWidth = H * 0.022
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(ox, oy)
  ctx.stroke()
  ctx.strokeStyle = '#8A6B3A'
  ctx.lineWidth = H * 0.018
  ctx.beginPath()
  ctx.arc(ox, oy, H * 0.15, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(245,245,238,0.35)'
  ctx.beginPath()
  ctx.arc(ox, oy, H * 0.14, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // ── 脚（前後に振る） ──
  ctx.lineCap = 'round'
  ctx.strokeStyle = skin
  ctx.lineWidth = H * 0.062
  const hipY = -H * 0.32
  ctx.beginPath()
  ctx.moveTo(-H * 0.05, hipY)
  ctx.lineTo(-H * 0.05 + gait * H * 0.11, 0)
  ctx.stroke()
  ctx.strokeStyle = skinShade
  ctx.beginPath()
  ctx.moveTo(H * 0.05, hipY)
  ctx.lineTo(H * 0.05 - gait * H * 0.11, 0)
  ctx.stroke()

  // ── 半ズボン ──
  ctx.fillStyle = pants
  roundRect(ctx, -H * 0.135, -H * 0.46, H * 0.27, H * 0.17, H * 0.03)
  ctx.fill()
  ctx.fillStyle = pantsShade // 陰（後ろ側）
  roundRect(ctx, H * 0.0, -H * 0.46, H * 0.135, H * 0.17, H * 0.03)
  ctx.fill()

  // ── 胴（半袖シャツ） ──
  ctx.fillStyle = shirt
  roundRect(ctx, -H * 0.145, -H * 0.66, H * 0.29, H * 0.24, H * 0.06)
  ctx.fill()
  ctx.fillStyle = shirtShade
  roundRect(ctx, H * 0.03, -H * 0.66, H * 0.115, H * 0.24, H * 0.06)
  ctx.fill()
  // 襟もとの色
  ctx.fillStyle = trim
  roundRect(ctx, -H * 0.145, -H * 0.66, H * 0.29, H * 0.04, H * 0.02)
  ctx.fill()

  // ── 腕（前・歩行で振る／網を握る手） ──
  ctx.strokeStyle = skin
  ctx.lineWidth = H * 0.052
  ctx.beginPath()
  ctx.moveTo(H * 0.06, -H * 0.62)
  ctx.lineTo(H * 0.06, -H * 0.5) // 網の柄へ
  ctx.stroke()

  // ── 首・頭 ──
  ctx.strokeStyle = skinShade
  ctx.lineWidth = H * 0.07
  ctx.beginPath()
  ctx.moveTo(0, -H * 0.65)
  ctx.lineTo(0, -H * 0.71)
  ctx.stroke()

  ctx.fillStyle = skin
  ctx.beginPath()
  ctx.arc(0, -H * 0.81, H * 0.125, 0, Math.PI * 2)
  ctx.fill()
  // 頬の陰
  ctx.fillStyle = skinShade
  ctx.beginPath()
  ctx.arc(H * 0.06, -H * 0.79, H * 0.06, 0, Math.PI * 2)
  ctx.fill()
  // 目（進行方向側に小さく）
  ctx.fillStyle = '#3A2E22'
  ctx.beginPath()
  ctx.arc(-H * 0.045, -H * 0.81, H * 0.016, 0, Math.PI * 2)
  ctx.fill()

  // ── 麦わら帽子 ──
  ctx.fillStyle = hat
  ctx.beginPath()
  ctx.ellipse(0, -H * 0.88, H * 0.21, H * 0.06, 0, 0, Math.PI * 2) // つば
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, -H * 0.92, H * 0.11, H * 0.085, 0, Math.PI, Math.PI * 2) // 山
  ctx.fill()
  ctx.fillStyle = hatShade // 帽子のリボン
  roundRect(ctx, -H * 0.11, -H * 0.9, H * 0.22, H * 0.022, H * 0.01)
  ctx.fill()
  ctx.strokeStyle = hatShade
  ctx.lineWidth = H * 0.012
  ctx.beginPath()
  ctx.ellipse(0, -H * 0.88, H * 0.21, H * 0.06, 0, 0, Math.PI * 2)
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
