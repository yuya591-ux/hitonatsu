// うろつく猫（茶トラ・オリジナル）。家のまわり（縁側・原っぱ・神社・室内）を気ままに歩き、
// たまに別のエリアへ移る。近づくと撫でられる。

import { clamp01 } from '../util/color.js'

export const CAT_HOME = ['engawa', 'harappa', 'jinja', 'ie']
// 場面ごとの“お気に入りの場所”（室内の座布団＝定位置）
const SPOT = { ie: [0.31, 0.87] }

export function createCat() {
  return {
    scene: 'engawa',
    x: 0.62,
    y: 0.82,
    tx: 0.62,
    ty: 0.82,
    facing: 1,
    moving: false,
    phase: 0,
    rest: 2000,
    hopTimer: 9000,
  }
}

export function updateCat(cat, dt) {
  // たまに別の家エリアへ移動（いない場所＝見えない＝うろつき感）
  cat.hopTimer -= dt
  if (cat.hopTimer <= 0) {
    cat.hopTimer = 9000 + Math.random() * 12000
    if (Math.random() < 0.6) {
      // 半分は室内の定位置（座布団）へ帰る
      const others = CAT_HOME.filter((s) => s !== cat.scene)
      cat.scene = Math.random() < 0.45 ? 'ie' : others[Math.floor(Math.random() * others.length)]
      const sp = SPOT[cat.scene]
      cat.x = sp ? sp[0] : 0.3 + Math.random() * 0.4
      cat.y = sp ? sp[1] : 0.7 + Math.random() * 0.2
      cat.tx = cat.x
      cat.ty = cat.y
      cat.rest = sp ? 6000 : 1500 // 定位置では長く休む
    }
  }
  if (cat.rest > 0) {
    cat.rest -= dt
    cat.moving = false
    return
  }
  const dx = cat.tx - cat.x
  const dy = cat.ty - cat.y
  const d = Math.hypot(dx, dy)
  if (d < 0.012) {
    const spot = SPOT[cat.scene]
    if (spot && Math.random() < 0.6) {
      cat.tx = spot[0] // 定位置へ戻る
      cat.ty = spot[1]
    } else if (Math.random() < 0.5) {
      cat.rest = 1500 + Math.random() * 3500 // ひとやすみ
      cat.moving = false
    } else {
      cat.tx = 0.15 + Math.random() * 0.7
      cat.ty = 0.66 + Math.random() * 0.28
    }
  } else {
    const sp = (0.06 * dt) / 1000
    cat.x += (dx / d) * sp
    cat.y += (dy / d) * sp
    cat.facing = dx >= 0 ? 1 : -1
    cat.moving = true
    cat.phase += dt / 1000
  }
}

export function drawCat(cat, ctx, view) {
  const { w, h } = view
  const f = clamp01((cat.y - 0.42) / (0.95 - 0.42))
  const s = h * (0.05 + 0.06 * f)
  const px = cat.x * w
  const py = cat.y * h
  const body = '#D98A4A'
  const dark = '#A86A34'

  ctx.fillStyle = 'rgba(40,35,28,0.16)'
  ctx.beginPath()
  ctx.ellipse(px, py, s * 0.5, s * 0.12, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(px, py)
  ctx.scale(cat.facing, 1)
  const bob = cat.moving ? Math.abs(Math.sin(cat.phase * 8)) * s * 0.05 : 0
  ctx.translate(0, -bob)

  // 体
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(-s * 0.1, -s * 0.25, s * 0.45, s * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()
  // 尾
  ctx.strokeStyle = body
  ctx.lineWidth = s * 0.12
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-s * 0.5, -s * 0.25)
  ctx.quadraticCurveTo(-s * 0.82, -s * 0.5, -s * 0.72, -s * 0.72)
  ctx.stroke()
  // 脚
  const sw = cat.moving ? Math.sin(cat.phase * 8) * s * 0.12 : 0
  ctx.lineWidth = s * 0.1
  ctx.beginPath()
  ctx.moveTo(s * 0.2, -s * 0.08)
  ctx.lineTo(s * 0.2 + sw, 0)
  ctx.moveTo(-s * 0.3, -s * 0.08)
  ctx.lineTo(-s * 0.3 - sw, 0)
  ctx.stroke()
  // 頭
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.arc(s * 0.34, -s * 0.4, s * 0.2, 0, Math.PI * 2)
  ctx.fill()
  // 耳
  ctx.beginPath()
  ctx.moveTo(s * 0.2, -s * 0.52)
  ctx.lineTo(s * 0.26, -s * 0.72)
  ctx.lineTo(s * 0.36, -s * 0.54)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(s * 0.38, -s * 0.54)
  ctx.lineTo(s * 0.46, -s * 0.72)
  ctx.lineTo(s * 0.5, -s * 0.52)
  ctx.closePath()
  ctx.fill()
  // 縞
  ctx.strokeStyle = dark
  ctx.lineWidth = s * 0.045
  ctx.beginPath()
  ctx.moveTo(-s * 0.2, -s * 0.42)
  ctx.lineTo(-s * 0.2, -s * 0.1)
  ctx.moveTo(0, -s * 0.46)
  ctx.lineTo(0, -s * 0.08)
  ctx.stroke()
  // 目
  ctx.fillStyle = '#2A2018'
  ctx.beginPath()
  ctx.arc(s * 0.42, -s * 0.42, s * 0.03, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
