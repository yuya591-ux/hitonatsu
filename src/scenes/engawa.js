// 場面：家の縁側（拠点。ここで一日が始まり、終わる）。
// P1 では「空のシグネチャ＋縁側の最小の風景」を作る。住人・会話・虫などは後のフェーズで足す。
//
// 各レイヤーは createLayer 経由で作るので、将来 image を指定すれば
// そのまま画像（Gemini製の水彩画など）に差し替えできる。

import { createLayer } from '../draw/layer.js'
import { drawSky } from '../draw/sky.js'
import { rgbToCss } from '../util/color.js'

const HORIZON = 0.56 // 地平線の高さ（画面の上から56%）

// 遠景：なだらかな山並みを2枚重ねて奥行きを出す
function drawFar(ctx, view, frame) {
  const { w, h } = view
  const far = frame.palette.far
  const y = h * HORIZON

  // 奥の山（淡い）
  ctx.fillStyle = rgbToCss(far, 0.55)
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.quadraticCurveTo(w * 0.25, y - h * 0.12, w * 0.5, y - h * 0.04)
  ctx.quadraticCurveTo(w * 0.78, y - h * 0.16, w, y - h * 0.05)
  ctx.lineTo(w, y)
  ctx.closePath()
  ctx.fill()

  // 手前の山（濃いめ）
  ctx.fillStyle = rgbToCss(far, 0.85)
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.quadraticCurveTo(w * 0.35, y - h * 0.07, w * 0.62, y - h * 0.02)
  ctx.quadraticCurveTo(w * 0.85, y - h * 0.08, w, y - h * 0.01)
  ctx.lineTo(w, y)
  ctx.closePath()
  ctx.fill()
}

// 地面：地平線から下を草地のグラデーションで塗る
function drawGround(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const g = ctx.createLinearGradient(0, y, 0, h)
  g.addColorStop(0, rgbToCss(frame.palette.ground))
  g.addColorStop(1, rgbToCss(frame.palette.groundShade))
  ctx.fillStyle = g
  ctx.fillRect(0, y, w, h - y)
}

// 縁側：手前にある木の縁側（前景）。屋根の庇の陰と、板の継ぎ目を入れる。
function drawEngawa(ctx, view, frame) {
  const { w, h } = view
  const wood = frame.palette.wood
  const woodShade = frame.palette.woodShade
  const top = h * 0.74 // 縁側の床の上端

  // 庇（ひさし）の陰を上にうっすら落とす
  const shadeGrad = ctx.createLinearGradient(0, top - h * 0.08, 0, top)
  shadeGrad.addColorStop(0, rgbToCss(woodShade, 0))
  shadeGrad.addColorStop(1, rgbToCss(woodShade, 0.25))
  ctx.fillStyle = shadeGrad
  ctx.fillRect(0, top - h * 0.08, w, h * 0.08)

  // 床板
  const floor = ctx.createLinearGradient(0, top, 0, h)
  floor.addColorStop(0, rgbToCss(wood))
  floor.addColorStop(1, rgbToCss(woodShade))
  ctx.fillStyle = floor
  ctx.fillRect(0, top, w, h - top)

  // 板の継ぎ目（奥行きが出るよう手前ほど広い間隔で）
  ctx.strokeStyle = rgbToCss(woodShade, 0.5)
  ctx.lineWidth = Math.max(1, h * 0.003)
  const planks = 6
  for (let i = 1; i < planks; i++) {
    const f = i / planks
    const yy = top + (h - top) * f * f // 手前ほど間隔を広げる
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
  }

  // 縁側の縁（前端）に一本明るい線
  ctx.strokeStyle = rgbToCss(wood, 0.9)
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(0, top + 1)
  ctx.lineTo(w, top + 1)
  ctx.stroke()
}

// 縁側の場面を組み立てる。レイヤーを奥→手前の順に並べる。
export function createEngawaScene() {
  return {
    id: 'engawa',
    name: '縁側',
    // 隣接する場面（P2で移動を実装する。今は定義だけ持っておく）
    neighbors: { left: 'harappa', right: 'tanbomichi', up: 'jinja' },
    layers: [
      // 空（シグネチャ・全場面共通）。画像差し替えは想定せずコード描画固定。
      createLayer({ id: 'sky', drawCode: drawSky }),
      // 以下は将来 image を渡せば画像に差し替え可能（例: 'assets/scenes/engawa/far.png'）
      createLayer({ id: 'far', drawCode: drawFar }),
      createLayer({ id: 'ground', drawCode: drawGround }),
      createLayer({ id: 'engawa', drawCode: drawEngawa }),
    ],
  }
}
