// 住人（オリジナルの素朴な田舎の人々）。近づいて「はなしかける」と短い会話が起きる。
// 主人公と同じく平面のコード描画。種類ごとに少し見た目を変える。

import { rgbToCss } from '../util/color.js'

// 種類ごとの色など
const KINDS = {
  grandma: { skin: '#E7BD93', cloth: '#C8917F', clothShade: '#A9705F', hair: '#E8E4DC' },
  grandpa: { skin: '#E2B68C', cloth: '#9FA68C', clothShade: '#7E8570', hair: '#EDEAE2' },
  girl: { skin: '#EFC59C', cloth: '#E3A6B0', clothShade: '#C5808C', hair: '#3A2E26' },
  boy: { skin: '#E8B98C', cloth: '#88B0C0', clothShade: '#6A93A4', hair: '#2E2620' },
}

// 主人公と同じ奥行きスケール（player.BAND/depthScaleに合わせる）
function depthScale(y) {
  const f = Math.min(Math.max((y - 0.46) / (0.95 - 0.46), 0), 1)
  return 0.4 + 0.95 * f * f
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

export function drawNpc(npc, ctx, view) {
  const { w, h } = view
  const k = KINDS[npc.kind] || KINDS.grandpa
  const scale = depthScale(npc.y)
  const H = h * 0.19 * scale
  const px = npc.x * w
  const py = npc.y * h

  // 影
  ctx.fillStyle = 'rgba(40,35,28,0.16)'
  ctx.beginPath()
  ctx.ellipse(px, py, H * 0.18, H * 0.045, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.translate(px, py)
  ctx.scale(npc.face === 'left' ? -1 : 1, 1)

  // 脚
  ctx.strokeStyle = k.skin
  ctx.lineWidth = H * 0.06
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-H * 0.05, -H * 0.32)
  ctx.lineTo(-H * 0.05, 0)
  ctx.moveTo(H * 0.05, -H * 0.32)
  ctx.lineTo(H * 0.05, 0)
  ctx.stroke()

  // 体（着物・服）
  ctx.fillStyle = rgbToCss(hexToRgb(k.cloth))
  roundRect(ctx, -H * 0.16, -H * 0.64, H * 0.32, H * 0.36, H * 0.06)
  ctx.fill()
  ctx.fillStyle = rgbToCss(hexToRgb(k.clothShade))
  roundRect(ctx, H * 0.03, -H * 0.64, H * 0.13, H * 0.36, H * 0.06)
  ctx.fill()

  // 頭
  ctx.fillStyle = k.skin
  ctx.beginPath()
  ctx.arc(0, -H * 0.76, H * 0.12, 0, Math.PI * 2)
  ctx.fill()

  // 髪／頭部の特徴
  ctx.fillStyle = k.hair
  if (npc.kind === 'girl') {
    ctx.beginPath()
    ctx.arc(0, -H * 0.82, H * 0.125, Math.PI, 0)
    ctx.fill()
    ctx.beginPath() // ポニーテール
    ctx.ellipse(-H * 0.14, -H * 0.74, H * 0.05, H * 0.1, 0.3, 0, Math.PI * 2)
    ctx.fill()
  } else if (npc.kind === 'boy') {
    ctx.beginPath()
    ctx.arc(0, -H * 0.82, H * 0.125, Math.PI, 0)
    ctx.fill()
  } else {
    // 年配：白髪をふんわり
    ctx.beginPath()
    ctx.arc(0, -H * 0.84, H * 0.1, Math.PI, 0)
    ctx.fill()
    if (npc.kind === 'grandma') {
      ctx.beginPath() // お団子
      ctx.arc(0, -H * 0.9, H * 0.05, 0, Math.PI * 2)
      ctx.fill()
    }
    // 首にかけた手ぬぐい
    ctx.fillStyle = 'rgba(245,245,238,0.9)'
    roundRect(ctx, -H * 0.1, -H * 0.66, H * 0.2, H * 0.05, H * 0.02)
    ctx.fill()
  }

  ctx.restore()
}

function hexToRgb(hex) {
  const c = hex.replace('#', '')
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) }
}
