// 各場面の風景パーツ（コード描画版）。
// 空はシグネチャ(drawSky)を全場面で共通利用し、ここでは遠景・地面・場面ごとの前景を描く。
// すべて将来 image 差し替え可能なように、場面ファクトリ側で createLayer に渡す。

import { rgbToCss, lerpColor } from '../util/color.js'
import { forestRidge, bloom, grassBlade, rng } from './watercolor.js'

// 「僕の夏休み」的な“上から覗き込む”高い画角。地平線を上げ、地面（歩く場所）を広く見せる。
export const HORIZON = 0.42 // 地平線の高さ（画面の上から42%）

// 遠景：緑深い森の山を幾重にも重ね、奥ほど空色に霞ませて深い奥行きを出す（全場面で共通利用）
export function drawFarHills(ctx, view, frame) {
  const { h } = view
  const far = frame.palette.far
  const sky = frame.palette.skyBottom
  const green = frame.palette.groundShade
  // 山の緑のもと（遠景用にやや暗めの森色）
  const forest = lerpColor(green, far, 0.35)

  // 奥(霞んで空色に近い)→手前(濃い緑) の順に重ねる。crest=稜線の高さ割合。
  const layers = [
    { crest: 0.28, amp: 0.028, bumps: 8, mix: 0.66 },
    { crest: 0.32, amp: 0.034, bumps: 11, mix: 0.5 },
    { crest: 0.36, amp: 0.04, bumps: 15, mix: 0.34 },
    { crest: 0.4, amp: 0.046, bumps: 20, mix: 0.18 },
  ]
  let i = 0
  for (const L of layers) {
    const rgb = lerpColor(forest, sky, L.mix) // 遠いほど空色へ＝霞
    forestRidge(ctx, view, h * L.crest, h * L.amp, L.bumps, rgb, 1, 13 + i * 9)
    i++
  }
}

// 地面：地平線から下を草地のグラデーションで塗り、水彩のムラ（にじみ）を重ねる
export function drawGround(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const ground = frame.palette.ground
  const shade = frame.palette.groundShade
  const g = ctx.createLinearGradient(0, y, 0, h)
  g.addColorStop(0, rgbToCss(lerpColor(ground, shade, 0.2)))
  g.addColorStop(0.5, rgbToCss(ground))
  g.addColorStop(1, rgbToCss(shade))
  ctx.fillStyle = g
  ctx.fillRect(0, y, w, h - y)

  // 絵具のムラ（明暗のにじみを点々と）＝のっぺり防止
  const r = rng(71)
  ctx.save()
  for (let i = 0; i < 10; i++) {
    const bx = r() * w
    const by = y + r() * (h - y)
    const rad = (0.1 + r() * 0.18) * w
    const tint = lerpColor(ground, r() > 0.5 ? shade : { r: 255, g: 255, b: 240 }, 0.4)
    bloom(ctx, bx, by, rad, tint, 0.12)
  }
  ctx.restore()
}

// 木陰のやわらかい影を画面の片側に落とす（神社など）
export function drawShade(ctx, view, frame, side = 'left') {
  const { w, h } = view
  const x0 = side === 'left' ? 0 : w
  const x1 = side === 'left' ? w * 0.5 : w * 0.5
  const g = ctx.createLinearGradient(x0, 0, x1, 0)
  g.addColorStop(0, 'rgba(20,30,20,0.22)')
  g.addColorStop(1, 'rgba(20,30,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

// 小さな草のかたまりを1つ描く
function grassTuft(ctx, x, baseY, size, css) {
  ctx.strokeStyle = css
  ctx.lineWidth = Math.max(1, size * 0.12)
  ctx.lineCap = 'round'
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(x + i * size * 0.18, baseY)
    ctx.quadraticCurveTo(x + i * size * 0.3, baseY - size * 0.8, x + i * size * 0.5, baseY - size)
    ctx.stroke()
  }
}

// ── 前景：場面ごと ──

// 縁側の庇（ひさし）と吊り風鈴を、手前の額縁として上部に描く。
// 「軒下から外を眺める」構図になり、奥行きと“その場所”の感じが出る。
function drawEaves(ctx, view, frame) {
  const { w, h } = view
  const eaveColor = rgbToCss(frame.palette.woodShade)
  // 上辺から垂れる庇（ゆるい曲線で軒先を表現）
  ctx.fillStyle = eaveColor
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h * 0.1)
  ctx.quadraticCurveTo(w * 0.5, h * 0.155, 0, h * 0.1)
  ctx.closePath()
  ctx.fill()
  // 軒先の細い影
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.moveTo(0, h * 0.1)
  ctx.quadraticCurveTo(w * 0.5, h * 0.155, w, h * 0.1)
  ctx.lineTo(w, h * 0.118)
  ctx.quadraticCurveTo(w * 0.5, h * 0.173, 0, h * 0.118)
  ctx.closePath()
  ctx.fill()

  // 右寄りに吊り風鈴のシルエット（そよ風でわずかに揺れる）
  const sway = Math.sin(frame.now / 1100) * w * 0.004
  const cx = w * 0.82 + sway
  const top = h * 0.12
  ctx.strokeStyle = eaveColor
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(w * 0.82, h * 0.1)
  ctx.lineTo(cx, top)
  ctx.stroke()
  // 釣鐘（ベル）
  ctx.fillStyle = eaveColor
  ctx.beginPath()
  ctx.arc(cx, top + h * 0.03, h * 0.03, Math.PI, 0)
  ctx.lineTo(cx + h * 0.03, top + h * 0.035)
  ctx.quadraticCurveTo(cx, top + h * 0.05, cx - h * 0.03, top + h * 0.035)
  ctx.closePath()
  ctx.fill()
  // 短冊
  ctx.fillRect(cx - h * 0.006, top + h * 0.05, h * 0.012, h * 0.06)
}

// 縁側：手前の木の縁側
export function foreEngawa(ctx, view, frame) {
  const { w, h } = view
  const wood = frame.palette.wood
  const woodShade = frame.palette.woodShade
  const top = h * 0.74

  const shadeGrad = ctx.createLinearGradient(0, top - h * 0.08, 0, top)
  shadeGrad.addColorStop(0, rgbToCss(woodShade, 0))
  shadeGrad.addColorStop(1, rgbToCss(woodShade, 0.25))
  ctx.fillStyle = shadeGrad
  ctx.fillRect(0, top - h * 0.08, w, h * 0.08)

  const floor = ctx.createLinearGradient(0, top, 0, h)
  floor.addColorStop(0, rgbToCss(wood))
  floor.addColorStop(1, rgbToCss(woodShade))
  ctx.fillStyle = floor
  ctx.fillRect(0, top, w, h - top)

  ctx.strokeStyle = rgbToCss(woodShade, 0.5)
  ctx.lineWidth = Math.max(1, h * 0.003)
  const planks = 6
  for (let i = 1; i < planks; i++) {
    const f = i / planks
    const yy = top + (h - top) * f * f
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
  }
  ctx.strokeStyle = rgbToCss(wood, 0.9)
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(0, top + 1)
  ctx.lineTo(w, top + 1)
  ctx.stroke()

  // 軒下から眺める額縁（庇＋吊り風鈴）を最前面に
  drawEaves(ctx, view, frame)
}

// 原っぱ：草の生い茂る野原と、片隅の木
// 木（幹＋こんもりした水彩の葉）。原っぱ・神社などで使う。
function drawTree(ctx, view, frame, tx, baseY, scale) {
  const { w, h } = view
  const leaf = frame.palette.groundShade
  const leafDark = lerpColor(leaf, { r: 0, g: 0, b: 0 }, 0.3)
  const leafLight = lerpColor(leaf, { r: 255, g: 255, b: 220 }, 0.3)
  const s = Math.min(w, h) * scale
  // 幹
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(tx - s * 0.06, baseY - s * 0.9, s * 0.12, s * 1.0)
  // 葉（陰→本体→ハイライトの順に水彩で重ねる）
  const blobs = [
    [-0.5, -1.0, 0.55], [0.5, -1.0, 0.55], [0, -1.3, 0.7],
    [-0.35, -1.45, 0.5], [0.4, -1.4, 0.5], [0, -1.05, 0.6],
  ]
  for (const [dx, dy, r] of blobs) bloom(ctx, tx + dx * s, baseY + dy * s, r * s, leafDark, 0.5)
  for (const [dx, dy, r] of blobs) bloom(ctx, tx + dx * s, baseY + dy * s, r * s * 0.9, leaf, 0.6)
  bloom(ctx, tx - s * 0.3, baseY - s * 1.5, s * 0.5, leafLight, 0.4)
}

export function foreHarappa(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const ground = frame.palette.ground
  const shade = frame.palette.groundShade
  const bladeDark = lerpColor(shade, { r: 0, g: 0, b: 0 }, 0.15)

  // 奥に木立（霞ませて）
  drawTree(ctx, view, frame, w * 0.16, y + h * 0.04, 0.12)
  drawTree(ctx, view, frame, w * 0.84, y + h * 0.05, 0.16)

  // 一面の草（奥→手前で密度・大きさを上げ、色も変えて水彩らしく）
  const r = rng(305)
  const rows = 11
  for (let row = 0; row < rows; row++) {
    const f = row / (rows - 1)
    const yy = y + (h - y) * (0.05 + f * 0.95)
    const count = Math.round(18 + f * 40)
    const len = (0.015 + f * 0.05) * h
    for (let i = 0; i < count; i++) {
      const x = (i / count + (r() - 0.5) / count) * w
      const lean = (r() - 0.5) * len * 0.8
      const col = lerpColor(f > 0.5 ? bladeDark : shade, ground, r() * 0.5)
      grassBlade(ctx, x, yy + r() * len * 0.3, len * (0.7 + r() * 0.6), lean, col, 0.7)
    }
  }

  // 野の花を点々と（白・淡黄）
  for (let i = 0; i < 14; i++) {
    const fx = r() * w
    const fy = y + (0.3 + r() * 0.65) * (h - y)
    const fr = (0.004 + r() * 0.004) * h
    ctx.fillStyle = r() > 0.5 ? 'rgba(250,248,240,0.85)' : 'rgba(248,232,150,0.85)'
    ctx.beginPath()
    ctx.arc(fx, fy, fr, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 神社：石段と鳥居のシルエット、木陰
export function foreJinja(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const stone = rgbToCss(frame.palette.far, 0.9)
  const stoneShade = rgbToCss(frame.palette.groundShade)

  // 中央へ続く石段（手前ほど広い台形）
  const steps = 6
  for (let i = 0; i < steps; i++) {
    const f = i / steps
    const sw = (0.12 + f * 0.28) * w
    const sy = y + (h - y) * (f * f)
    const sh = (h - y) * 0.06
    ctx.fillStyle = i % 2 === 0 ? stone : stoneShade
    ctx.fillRect(w / 2 - sw / 2, sy, sw, sh)
  }

  // 鳥居のシルエット（奥・地平線あたり）
  const tw = w * 0.16
  const th = h * 0.16
  const cx = w / 2
  const top = y - th
  ctx.fillStyle = 'rgba(120,40,30,0.55)'
  // 二本の柱
  ctx.fillRect(cx - tw / 2, top, w * 0.012, th)
  ctx.fillRect(cx + tw / 2 - w * 0.012, top, w * 0.012, th)
  // 笠木と貫
  ctx.fillRect(cx - tw / 2 - w * 0.02, top, tw + w * 0.04, h * 0.018)
  ctx.fillRect(cx - tw / 2, top + h * 0.05, tw, h * 0.012)

  // 左から木陰
  drawShade(ctx, view, frame, 'left')
}

// 田んぼ道：奥へ続く一本道と、両脇の田んぼ（空を映す水面）
export function foreTanbomichi(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON

  // 田んぼ（地平線近くは空の色をうっすら映す水面）
  const water = ctx.createLinearGradient(0, y, 0, h)
  water.addColorStop(0, rgbToCss(frame.palette.skyBottom, 0.5))
  water.addColorStop(0.5, rgbToCss(frame.palette.ground, 0.2))
  water.addColorStop(1, rgbToCss(frame.palette.groundShade, 0))
  ctx.fillStyle = water
  ctx.fillRect(0, y, w, (h - y) * 0.7)

  // あぜ道（中央から手前へ広がる土の道）
  ctx.fillStyle = rgbToCss(frame.palette.wood)
  ctx.beginPath()
  ctx.moveTo(w * 0.47, y)
  ctx.lineTo(w * 0.53, y)
  ctx.lineTo(w * 0.72, h)
  ctx.lineTo(w * 0.28, h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = rgbToCss(frame.palette.woodShade, 0.6)
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.stroke()
}

// 川辺：横に流れる川と、せせらぎの照り返し
export function foreKawabe(ctx, view, frame) {
  const { w, h } = view
  const top = h * 0.6
  const bottom = h * 0.92

  // 水面（空の色を映す）
  const water = ctx.createLinearGradient(0, top, 0, bottom)
  water.addColorStop(0, rgbToCss(frame.palette.skyMid, 0.7))
  water.addColorStop(1, rgbToCss(frame.palette.skyBottom, 0.85))
  ctx.fillStyle = water
  ctx.fillRect(0, top, w, bottom - top)

  // 照り返し（ゆっくり揺れる横線）
  ctx.strokeStyle = rgbToCss(frame.palette.light, 0.35)
  ctx.lineWidth = Math.max(1, h * 0.004)
  for (let i = 0; i < 6; i++) {
    const yy = top + ((bottom - top) * (i + 0.5)) / 6
    const phase = frame.now / 1400 + i
    ctx.beginPath()
    for (let x = 0; x <= w; x += w / 16) {
      const off = Math.sin(phase + x / w * 6) * h * 0.004
      if (x === 0) ctx.moveTo(x, yy + off)
      else ctx.lineTo(x, yy + off)
    }
    ctx.stroke()
  }

  // 手前の岸（草地）
  ctx.fillStyle = rgbToCss(frame.palette.groundShade)
  ctx.fillRect(0, bottom, w, h - bottom)
}
