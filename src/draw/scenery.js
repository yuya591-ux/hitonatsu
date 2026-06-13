// 各場面の風景パーツ（コード描画版）。
// 空はシグネチャ(drawSky)を全場面で共通利用し、ここでは遠景・地面・場面ごとの前景を描く。
// すべて将来 image 差し替え可能なように、場面ファクトリ側で createLayer に渡す。

import { rgbToCss, lerpColor } from '../util/color.js'
import { forestRidge, bloom, grassBlade, rng } from './watercolor.js'

// より“上から覗き込む”高い画角。地平線をさらに上げ、地面（歩く場所）を広く見せる。
export const HORIZON = 0.37 // 地平線の高さ（画面の上から37%）

// 立体的な箱（前面＋屋根の上面＋中央側の側面）を消失点 vp に向かって描く＝疑似3D。
// frontRgb は {r,g,b}。side<0 で左の建物（右側面が見える）、side>0 で右の建物。
function box3d(ctx, x, baseY, bw, bh, side, frontRgb, vp, depth = 0.12) {
  const back = (px, py) => [px + (vp.x - px) * depth, py + (vp.y - py) * depth]
  const tlx = x - bw / 2
  const trx = x + bw / 2
  const topY = baseY - bh
  // 屋根（上面・明るめ）
  const [btlx, btly] = back(tlx, topY)
  const [btrx, btry] = back(trx, topY)
  ctx.fillStyle = rgbToCss(lerpColor(frontRgb, { r: 255, g: 255, b: 255 }, 0.18))
  ctx.beginPath()
  ctx.moveTo(tlx, topY)
  ctx.lineTo(trx, topY)
  ctx.lineTo(btrx, btry)
  ctx.lineTo(btlx, btly)
  ctx.closePath()
  ctx.fill()
  // 側面（中央側・暗め）
  const inX = side < 0 ? trx : tlx
  const [bInxT, bInyT] = back(inX, topY)
  const [bInxB, bInyB] = back(inX, baseY)
  ctx.fillStyle = rgbToCss(lerpColor(frontRgb, { r: 0, g: 0, b: 0 }, 0.28))
  ctx.beginPath()
  ctx.moveTo(inX, topY)
  ctx.lineTo(inX, baseY)
  ctx.lineTo(bInxB, bInyB)
  ctx.lineTo(bInxT, bInyT)
  ctx.closePath()
  ctx.fill()
  // 前面
  ctx.fillStyle = rgbToCss(frontRgb)
  ctx.fillRect(tlx, topY, bw, bh)
}

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

  // 奥へ収束する遠近の筋（見下ろした床が奥へ受けていく感じ＝立体感）
  ctx.save()
  ctx.strokeStyle = rgbToCss(shade, 0.2)
  ctx.lineWidth = Math.max(1, h * 0.0025)
  const vpx = w * 0.5 // 消失点（地平線の中央）
  for (let i = -9; i <= 9; i++) {
    if (i === 0) continue
    const bottomX = w * 0.5 + i * w * 0.11 // 手前ほど広がる
    ctx.beginPath()
    ctx.moveTo(vpx, y)
    ctx.lineTo(bottomX, h)
    ctx.stroke()
  }
  // 横の畝（手前ほど間隔が広い＝遠近）
  ctx.strokeStyle = rgbToCss(shade, 0.13)
  for (let r2 = 1; r2 <= 7; r2++) {
    const f = r2 / 6
    const yy = y + (h - y) * f * f
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
  }

  // 絵具のムラ（明暗のにじみを点々と）＝のっぺり防止
  const r = rng(71)
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

// 縁側：庭（草・飛び石・植え込み）＋手前の木の縁側＋軒の額縁。家の拠点らしい安らぎ。
export function foreEngawa(ctx, view, frame) {
  const { w, h } = view
  const wood = frame.palette.wood
  const woodShade = frame.palette.woodShade
  const y = h * HORIZON
  const top = h * 0.76 // 縁側の床の上端

  // 庭の草＋散らした小物
  grassField(ctx, view, frame, y, top, 211, 0.7)
  scatterProps(ctx, view, frame, y + h * 0.03, top, 277, 12)
  // 植え込み（庭木の茂み・左右）
  drawTree(ctx, view, frame, w * 0.1, y + h * 0.06, 0.1)
  bloom(ctx, w * 0.9, top - h * 0.04, h * 0.07, frame.palette.groundShade, 0.55)
  bloom(ctx, w * 0.83, top - h * 0.02, h * 0.05, frame.palette.groundShade, 0.5)

  // 飛び石（庭を横切る）
  const r = rng(150)
  for (let i = 0; i < 5; i++) {
    const sx = (0.2 + i * 0.13) * w + (r() - 0.5) * w * 0.03
    const sy = y + (0.4 + i * 0.1) * (top - y)
    const sr = (0.012 + i * 0.003) * h
    ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 130, g: 125, b: 115 }, 0.5), 0.9)
    ctx.beginPath()
    ctx.ellipse(sx, sy, sr * 1.5, sr, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 縁側の床（庇の陰 → 板 → 板の継ぎ目）
  const shadeGrad = ctx.createLinearGradient(0, top - h * 0.06, 0, top)
  shadeGrad.addColorStop(0, rgbToCss(woodShade, 0))
  shadeGrad.addColorStop(1, rgbToCss(woodShade, 0.25))
  ctx.fillStyle = shadeGrad
  ctx.fillRect(0, top - h * 0.06, w, h * 0.06)

  const floor = ctx.createLinearGradient(0, top, 0, h)
  floor.addColorStop(0, rgbToCss(wood))
  floor.addColorStop(1, rgbToCss(woodShade))
  ctx.fillStyle = floor
  ctx.fillRect(0, top, w, h - top)
  // 木目のムラ（水彩）
  bloom(ctx, w * 0.3, h * 0.92, w * 0.18, woodShade, 0.16)
  bloom(ctx, w * 0.75, h * 0.88, w * 0.16, wood, 0.16)

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

  // すいか（縁側に・夏らしさ）。丸ごと＋切った一切れで「すいか」と一目で分かるように。
  const mx = w * 0.17
  const my = h * 0.9
  const mr = h * 0.06
  // 丸ごとすいか（緑の玉＋濃い縦じま）
  ctx.fillStyle = '#3E8B3A'
  ctx.beginPath()
  ctx.arc(mx, my, mr, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#1E5A24'
  ctx.lineWidth = mr * 0.13
  ctx.lineCap = 'round'
  for (let i = -2; i <= 2; i++) {
    const rx = mr * (0.22 + Math.abs(i) * 0.22)
    ctx.beginPath()
    ctx.ellipse(mx, my, rx, mr * 0.98, 0, Math.PI * 1.12, Math.PI * 1.88)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(mx, my, rx, mr * 0.98, 0, Math.PI * 0.12, Math.PI * 0.88)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)' // つや
  ctx.beginPath()
  ctx.ellipse(mx - mr * 0.35, my - mr * 0.4, mr * 0.22, mr * 0.12, -0.5, 0, Math.PI * 2)
  ctx.fill()

  // 切った一切れ（赤い果肉＋白い部分＋緑の皮＋種）
  ctx.save()
  ctx.translate(mx + mr * 1.5, my + mr * 0.28)
  ctx.rotate(-0.35)
  const ws = mr * 0.92
  ctx.fillStyle = '#3E8B3A' // 緑の皮
  ctx.beginPath(); ctx.arc(0, 0, ws, Math.PI, 0); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#EAF3DE' // 白い部分
  ctx.beginPath(); ctx.arc(0, 0, ws * 0.85, Math.PI, 0); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#E25750' // 赤い果肉
  ctx.beginPath(); ctx.arc(0, 0, ws * 0.74, Math.PI, 0); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#2A1A12' // 種
  for (const [sxx, syy] of [[-0.42, -0.28], [0.05, -0.42], [0.42, -0.22], [-0.12, -0.52], [0.28, -0.12], [-0.58, -0.08]]) {
    ctx.beginPath()
    ctx.ellipse(sxx * ws, syy * ws, ws * 0.05, ws * 0.085, 0.3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 手桶（縁側に・水が入っている）
  const bx = w * 0.44
  const by = h * 0.93
  const bs = h * 0.05
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.beginPath()
  ctx.moveTo(bx - bs * 0.7, by - bs)
  ctx.lineTo(bx + bs * 0.7, by - bs)
  ctx.lineTo(bx + bs * 0.5, by)
  ctx.lineTo(bx - bs * 0.5, by)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.skyMid, { r: 90, g: 140, b: 150 }, 0.4), 0.7) // 水
  ctx.beginPath()
  ctx.ellipse(bx, by - bs, bs * 0.68, bs * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = rgbToCss(frame.palette.wood) // 取っ手
  ctx.lineWidth = bs * 0.1
  ctx.beginPath()
  ctx.arc(bx, by - bs, bs * 0.58, Math.PI, 0)
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

// 一面の草を水彩の一筆で敷き詰める（奥→手前で密度・大きさ・濃さを上げる）。
// yTop〜yBot（px）の帯に描く。density で量を調整。
function grassField(ctx, view, frame, yTop, yBot, seed, density = 1) {
  const { w } = view
  const ground = frame.palette.ground
  const shade = frame.palette.groundShade
  const dark = lerpColor(shade, { r: 0, g: 0, b: 0 }, 0.15)
  const r = rng(seed)
  const rows = 10
  for (let row = 0; row < rows; row++) {
    const f = row / (rows - 1)
    const yy = yTop + (yBot - yTop) * (0.05 + f * 0.95)
    const count = Math.round((16 + f * 36) * density)
    const len = (0.012 + f * 0.045) * view.h
    for (let i = 0; i < count; i++) {
      const x = (i / count + (r() - 0.5) / count) * w
      const lean = (r() - 0.5) * len * 0.8
      // そよ風で穂先がゆっくり揺れる（場所ごとに少しずらす）
      const wind = Math.sin(frame.now / 900 + x * 0.012 + row) * len * 0.35
      const col = lerpColor(f > 0.5 ? dark : shade, ground, r() * 0.5)
      grassBlade(ctx, x, yy + r() * len * 0.3, len * (0.7 + r() * 0.6), lean + wind, col, 0.7)
    }
  }
}

// 小さな野の花を散らす
function scatterFlowers(ctx, view, yTop, yBot, seed, n) {
  const { w, h } = view
  const r = rng(seed)
  for (let i = 0; i < n; i++) {
    const fx = r() * w
    const fy = yTop + (0.2 + r() * 0.78) * (yBot - yTop)
    const fr = (0.004 + r() * 0.004) * h
    ctx.fillStyle = r() > 0.5 ? 'rgba(250,248,240,0.85)' : 'rgba(248,232,150,0.85)'
    ctx.beginPath()
    ctx.arc(fx, fy, fr, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ひまわり（夏の象徴）
function drawSunflower(ctx, view, x, baseY, s, sway) {
  const { h } = view
  const stem = '#5E7E3E'
  // 茎
  ctx.strokeStyle = stem
  ctx.lineWidth = s * 0.08
  ctx.lineCap = 'round'
  const headX = x + sway
  const headY = baseY - s
  ctx.beginPath()
  ctx.moveTo(x, baseY)
  ctx.quadraticCurveTo(x + sway * 0.5, baseY - s * 0.5, headX, headY)
  ctx.stroke()
  // 葉
  ctx.fillStyle = stem
  ctx.beginPath()
  ctx.ellipse(x + s * 0.18, baseY - s * 0.4, s * 0.22, s * 0.1, -0.5, 0, Math.PI * 2)
  ctx.fill()
  // 花びら
  ctx.fillStyle = '#F2C23E'
  const petals = 12
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2
    ctx.save()
    ctx.translate(headX, headY)
    ctx.rotate(a)
    ctx.beginPath()
    ctx.ellipse(s * 0.32, 0, s * 0.18, s * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  // 花の中心
  ctx.fillStyle = '#6E4A2A'
  ctx.beginPath()
  ctx.arc(headX, headY, s * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(40,28,16,0.5)'
  ctx.beginPath()
  ctx.arc(headX + s * 0.05, headY + s * 0.05, s * 0.12, 0, Math.PI * 2)
  ctx.fill()
}

// 奥行きで拡縮する小物（茂み・石・小花）を地面に散らす。
// 物量を増やしつつ、手前ほど大きく＝見下ろした床の奥行きを強める。
function scatterProps(ctx, view, frame, yTop, yBot, seed, count) {
  const { w, h } = view
  const r = rng(seed)
  const items = []
  for (let i = 0; i < count; i++) items.push({ x: r(), yf: r(), kind: r(), tint: r() })
  items.sort((a, b) => a.yf - b.yf) // 奥→手前
  for (const it of items) {
    const y = yTop + it.yf * (yBot - yTop)
    const depth = (y - yTop) / (yBot - yTop)
    const s = h * (0.012 + depth * 0.03)
    const x = it.x * w
    if (it.kind < 0.4) {
      // 小さな茂み（軽い塗り）
      ctx.fillStyle = rgbToCss(lerpColor(frame.palette.groundShade, { r: 0, g: 0, b: 0 }, 0.2), 0.85)
      ctx.beginPath()
      ctx.ellipse(x, y, s * 1.05, s * 0.65, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = rgbToCss(frame.palette.groundShade, 0.9)
      ctx.beginPath()
      ctx.ellipse(x, y - s * 0.2, s * 0.8, s * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
    } else if (it.kind < 0.7) {
      // 石
      ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 130, g: 124, b: 112 }, 0.5), 0.9)
      ctx.beginPath()
      ctx.ellipse(x, y, s * 0.8, s * 0.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,250,0.15)'
      ctx.beginPath()
      ctx.ellipse(x - s * 0.2, y - s * 0.15, s * 0.35, s * 0.2, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // 小花（白/淡黄）
      ctx.fillStyle = it.tint > 0.5 ? 'rgba(250,248,240,0.9)' : 'rgba(248,228,140,0.9)'
      ctx.beginPath()
      ctx.arc(x, y, s * 0.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export function foreHarappa(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  // 奥に木立（霞ませて）
  drawTree(ctx, view, frame, w * 0.12, y + h * 0.03, 0.1)
  drawTree(ctx, view, frame, w * 0.16, y + h * 0.05, 0.13)
  drawTree(ctx, view, frame, w * 0.84, y + h * 0.05, 0.16)
  // 一面の草と野花、散らした小物
  grassField(ctx, view, frame, y, h, 305, 1.1)
  scatterProps(ctx, view, frame, y + h * 0.05, h, 461, 22)
  scatterFlowers(ctx, view, y, h, 91, 16)
  // ひまわり（右手前に数本・そよ風で揺れる）
  const sway = Math.sin(frame.now / 1500) * h * 0.01
  drawSunflower(ctx, view, w * 0.9, h * 0.78, h * 0.13, sway)
  drawSunflower(ctx, view, w * 0.96, h * 0.86, h * 0.16, sway * 1.2)
  drawSunflower(ctx, view, w * 0.83, h * 0.9, h * 0.18, sway * 0.8)
}

// 神社：木陰の石段、鳥居、石灯籠。木漏れ日の静けさ。
export function foreJinja(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const cx = w / 2

  // 下草（石段のまわり）＋散らした小物
  grassField(ctx, view, frame, y, h, 412, 0.7)
  scatterProps(ctx, view, frame, y + h * 0.05, h, 533, 16)

  // 鳥居（朱・奥の地平線あたり・立体）
  const tw = w * 0.17
  const th = h * 0.2
  const top = y - th
  const pw = w * 0.018 // 柱の太さ
  const dx = w * 0.012 // 奥行き（右へ）
  const dy = -h * 0.008
  const torii = 'rgba(168,64,48,0.95)'
  const toriiSide = 'rgba(116,42,32,0.95)'
  const toriiTop = 'rgba(196,82,62,0.95)'
  // 柱（前面＋右側面で丸み＝立体）
  for (const px of [cx - tw / 2, cx + tw / 2 - pw]) {
    ctx.fillStyle = toriiSide
    ctx.beginPath()
    ctx.moveTo(px + pw, top)
    ctx.lineTo(px + pw + dx, top + dy)
    ctx.lineTo(px + pw + dx, y + dy)
    ctx.lineTo(px + pw, y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = torii
    ctx.fillRect(px, top, pw, th)
  }
  // 貫（柱を貫く横木）
  ctx.fillStyle = toriiSide
  ctx.fillRect(cx - tw / 2 + dx, top + h * 0.06 + dy, tw, h * 0.014)
  ctx.fillStyle = torii
  ctx.fillRect(cx - tw / 2, top + h * 0.06, tw, h * 0.014)
  // 島木（笠木の下の太い横木・立体）
  const beamW = tw + w * 0.05
  const bx0 = cx - beamW / 2
  ctx.fillStyle = toriiSide
  ctx.fillRect(bx0 + dx, top + h * 0.018 + dy, beamW, h * 0.016)
  ctx.fillStyle = torii
  ctx.fillRect(bx0, top + h * 0.018, beamW, h * 0.016)
  // 笠木（一番上・反り・上面で立体）
  const capY = top - h * 0.006
  ctx.fillStyle = toriiTop
  ctx.beginPath()
  ctx.moveTo(bx0, capY)
  ctx.lineTo(bx0 + beamW, capY)
  ctx.lineTo(bx0 + beamW + dx, capY + dy)
  ctx.lineTo(bx0 + dx, capY + dy)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = toriiSide
  ctx.fillRect(bx0 + dx, capY + dy, beamW, h * 0.02)
  ctx.fillStyle = torii
  ctx.fillRect(bx0, capY, beamW, h * 0.02)
  // 額束（中央の短い柱）
  ctx.fillStyle = torii
  ctx.fillRect(cx - pw * 0.4, top + h * 0.034, pw * 0.8, h * 0.026)

  // 中央へ続く石段（手前ほど広い台形・水彩のムラ）
  const steps = 8
  for (let i = 0; i < steps; i++) {
    const f = i / steps
    const sw = (0.1 + f * 0.32) * w
    const sy = y + (h - y) * (f * f)
    const sh = (h - y) * 0.055
    const tone = lerpColor(frame.palette.far, i % 2 ? frame.palette.groundShade : { r: 255, g: 255, b: 255 }, 0.18)
    ctx.fillStyle = rgbToCss(tone, 0.95)
    ctx.fillRect(cx - sw / 2, sy, sw, sh)
    // 段の影
    ctx.fillStyle = 'rgba(30,40,30,0.18)'
    ctx.fillRect(cx - sw / 2, sy + sh - h * 0.008, sw, h * 0.008)
  }

  // 石灯籠（左手前）
  const lx = w * 0.2
  const ly = h * 0.78
  const ls = h * 0.05
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 80, g: 80, b: 70 }, 0.4))
  ctx.fillRect(lx - ls * 0.18, ly, ls * 0.36, ls * 0.6) // 竿
  ctx.fillRect(lx - ls * 0.4, ly - ls * 0.5, ls * 0.8, ls * 0.5) // 火袋
  ctx.beginPath() // 笠
  ctx.moveTo(lx - ls * 0.55, ly - ls * 0.5)
  ctx.lineTo(lx + ls * 0.55, ly - ls * 0.5)
  ctx.lineTo(lx, ly - ls * 0.85)
  ctx.closePath()
  ctx.fill()

  // 狛犬（石段の下・左右に一対）
  const komaColor = rgbToCss(lerpColor(frame.palette.far, { r: 110, g: 105, b: 95 }, 0.5))
  for (const side of [-1, 1]) {
    const kx = cx + side * w * 0.16
    const ky = h * 0.82
    const ks = h * 0.05
    ctx.fillStyle = komaColor
    ctx.fillRect(kx - ks * 0.5, ky, ks, ks * 0.5) // 台座
    ctx.beginPath() // 体
    ctx.ellipse(kx, ky - ks * 0.2, ks * 0.4, ks * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath() // 頭
    ctx.arc(kx + side * ks * 0.15, ky - ks * 0.7, ks * 0.3, 0, Math.PI * 2)
    ctx.fill()
  }

  // 賽銭箱（鳥居の下）
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(cx - w * 0.04, y - h * 0.01, w * 0.08, h * 0.035)
  ctx.fillStyle = rgbToCss(frame.palette.wood, 0.5)
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(cx - w * 0.04 + i * w * 0.016, y - h * 0.01, w * 0.004, h * 0.035) // 格子
  }

  // 木陰：上の左右から大きな葉が覆いかぶさる（額縁＋涼しさ）
  const leaf = frame.palette.groundShade
  const leafDark = lerpColor(leaf, { r: 0, g: 0, b: 0 }, 0.35)
  for (const [bx, by, br] of [[0.0, -0.02, 0.34], [0.16, 0.05, 0.26], [1.0, -0.02, 0.36], [0.86, 0.06, 0.26]]) {
    bloom(ctx, bx * w, by * h, br * h, leafDark, 0.55)
    bloom(ctx, bx * w, by * h, br * h * 0.85, leaf, 0.5)
  }

  // 木漏れ日（石段に落ちる淡い光の点）
  const r = rng(77)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 8; i++) {
    bloom(ctx, (0.4 + r() * 0.2) * w, (0.5 + r() * 0.4) * h, h * 0.03, frame.palette.light, 0.12)
  }
  ctx.restore()

  // 村のおまつり（3日目以降）：両脇に屋台、参道に提灯
  if (frame.festival) {
    const night = frame.time >= 0.78 ? Math.min((frame.time - 0.78) / 0.12, 1) : 0
    // 屋台（赤白の庇の小屋）
    for (const sxf of [0.12, 0.88]) {
      const stx = sxf * w
      const sty = h * 0.6
      const sw = w * 0.13
      const shh = h * 0.12
      ctx.fillStyle = rgbToCss(frame.palette.woodShade)
      ctx.fillRect(stx - sw / 2, sty, sw, shh)
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#D24A3A' : '#F2EDE0'
        ctx.fillRect(stx - sw / 2 + (i * sw) / 6, sty - h * 0.022, sw / 6, h * 0.022)
      }
      if (night > 0) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        bloom(ctx, stx, sty + shh * 0.3, sw * 0.7, { r: 255, g: 220, b: 150 }, 0.25 * night)
        ctx.restore()
      }
    }
    // 祭りに来た人たち（浴衣のシルエット）
    const goers = [
      [0.34, 0.72, '#9A6A8A'], [0.43, 0.76, '#6A8A9A'],
      [0.58, 0.74, '#8A7A5A'], [0.67, 0.78, '#7A9A6A'],
    ]
    for (const [gx, gy, col] of goers) {
      const fx = gx * w
      const fy = gy * h
      const fs = h * 0.07
      ctx.fillStyle = 'rgba(30,30,40,0.18)' // 影
      ctx.beginPath()
      ctx.ellipse(fx, fy, fs * 0.22, fs * 0.05, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = col // 浴衣
      ctx.beginPath()
      ctx.moveTo(fx - fs * 0.18, fy)
      ctx.lineTo(fx - fs * 0.15, fy - fs * 0.5)
      ctx.lineTo(fx + fs * 0.15, fy - fs * 0.5)
      ctx.lineTo(fx + fs * 0.18, fy)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#E6BD92' // 首
      ctx.fillRect(fx - fs * 0.04, fy - fs * 0.56, fs * 0.08, fs * 0.08)
      ctx.fillStyle = '#2A2018' // 頭
      ctx.beginPath()
      ctx.arc(fx, fy - fs * 0.62, fs * 0.12, 0, Math.PI * 2)
      ctx.fill()
    }

    // 提灯の連なり（参道の上にたわませて）
    const n = 8
    const lyBase = y - h * 0.05
    ctx.strokeStyle = 'rgba(60,50,40,0.6)'
    ctx.lineWidth = Math.max(1, h * 0.002)
    ctx.beginPath()
    ctx.moveTo(w * 0.14, lyBase - h * 0.02)
    ctx.quadraticCurveTo(w * 0.5, lyBase + h * 0.02, w * 0.86, lyBase - h * 0.02)
    ctx.stroke()
    for (let i = 0; i < n; i++) {
      const t2 = i / (n - 1)
      const lx = (0.14 + t2 * 0.72) * w
      const sag = Math.sin(t2 * Math.PI) * h * 0.03
      const lly = lyBase - h * 0.02 + sag + Math.sin(frame.now / 1500 + i) * h * 0.003
      const lr = h * 0.018
      if (night > 0) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        bloom(ctx, lx, lly, lr * 3.2, { r: 255, g: 180, b: 110 }, 0.32 * night)
        ctx.restore()
      }
      ctx.fillStyle = '#D2503C' // 提灯（赤）
      ctx.beginPath()
      ctx.ellipse(lx, lly, lr * 0.8, lr, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#E8DCC0' // 上下の口
      ctx.fillRect(lx - lr * 0.5, lly - lr, lr, lr * 0.18)
      ctx.fillRect(lx - lr * 0.5, lly + lr * 0.82, lr, lr * 0.18)
    }
  }
}

// 田んぼ道：奥へ続く一本道、青い稲田、電柱と電線。夕暮れが映える郷愁の道。
export function foreTanbomichi(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const ground = frame.palette.ground
  const shade = frame.palette.groundShade

  // 稲田（手前へ広がる緑。水面が空を映す）
  const paddy = ctx.createLinearGradient(0, y, 0, h)
  paddy.addColorStop(0, rgbToCss(lerpColor(frame.palette.skyBottom, ground, 0.4)))
  paddy.addColorStop(0.4, rgbToCss(ground))
  paddy.addColorStop(1, rgbToCss(shade))
  ctx.fillStyle = paddy
  ctx.fillRect(0, y, w, h - y)

  // 稲の畝（奥へ収束する縦の筋）と、あぜの横線
  ctx.strokeStyle = rgbToCss(shade, 0.5)
  ctx.lineWidth = Math.max(1, h * 0.003)
  for (let i = -6; i <= 6; i++) {
    const fx = 0.5 + i * 0.08
    ctx.beginPath()
    ctx.moveTo(w * (0.5 + i * 0.012), y)
    ctx.lineTo(w * fx, h)
    ctx.stroke()
  }
  ctx.strokeStyle = rgbToCss(lerpColor(shade, { r: 255, g: 255, b: 240 }, 0.2), 0.4)
  for (let r2 = 1; r2 <= 5; r2++) {
    const f = r2 / 5
    const yy = y + (h - y) * (f * f)
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
  }

  // 遠くの農家（地平線にぽつんと）
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, frame.palette.woodShade, 0.5), 0.85)
  ctx.fillRect(w * 0.12, y - h * 0.045, w * 0.07, h * 0.045)
  ctx.beginPath()
  ctx.moveTo(w * 0.11, y - h * 0.045)
  ctx.lineTo(w * 0.195, y - h * 0.045)
  ctx.lineTo(w * 0.155, y - h * 0.075)
  ctx.closePath()
  ctx.fill()

  // あぜ道（中央から手前へ広がる土の道・水彩のムラ）
  ctx.fillStyle = rgbToCss(frame.palette.wood)
  ctx.beginPath()
  ctx.moveTo(w * 0.475, y)
  ctx.lineTo(w * 0.525, y)
  ctx.lineTo(w * 0.74, h)
  ctx.lineTo(w * 0.26, h)
  ctx.closePath()
  ctx.fill()
  bloom(ctx, w * 0.5, h * 0.85, w * 0.12, frame.palette.woodShade, 0.18)

  // 電柱が道沿いに奥へ並び、電線でつながる（郷愁の決め手）
  const poles = [
    { x: 0.6, top: 0.34, ph: 0.1 },
    { x: 0.645, top: 0.26, ph: 0.16 },
    { x: 0.71, top: 0.16, ph: 0.24 },
  ]
  ctx.strokeStyle = rgbToCss(frame.palette.woodShade, 0.85)
  const polePts = []
  for (const p of poles) {
    const px = p.x * w
    const pTop = (y - h * p.ph)
    ctx.lineWidth = Math.max(1, h * 0.006 * (p.ph + 0.4))
    ctx.beginPath()
    ctx.moveTo(px, pTop)
    ctx.lineTo(px, y + (h - y) * 0.1)
    ctx.stroke()
    // 腕木
    ctx.lineWidth = Math.max(1, h * 0.004)
    ctx.beginPath()
    ctx.moveTo(px - h * 0.018, pTop + h * 0.012)
    ctx.lineTo(px + h * 0.018, pTop + h * 0.012)
    ctx.stroke()
    polePts.push({ x: px, y: pTop + h * 0.012 })
  }
  // 電線（たわませてつなぐ）
  ctx.strokeStyle = 'rgba(40,40,40,0.5)'
  ctx.lineWidth = 1
  for (let i = 0; i < polePts.length - 1; i++) {
    const a = polePts[i]
    const b = polePts[i + 1]
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + h * 0.02, b.x, b.y)
    ctx.stroke()
  }

  // かかし（田んぼに ぽつんと）
  const kx = w * 0.78
  const ky = h * 0.58
  const ks = h * 0.16
  ctx.strokeStyle = rgbToCss(frame.palette.woodShade)
  ctx.lineWidth = Math.max(1, ks * 0.05)
  ctx.beginPath() // 支柱
  ctx.moveTo(kx, ky)
  ctx.lineTo(kx, ky + ks)
  ctx.moveTo(kx - ks * 0.4, ky + ks * 0.25) // 腕
  ctx.lineTo(kx + ks * 0.4, ky + ks * 0.25)
  ctx.stroke()
  ctx.fillStyle = 'rgba(180,150,110,0.9)' // 服
  ctx.beginPath()
  ctx.moveTo(kx - ks * 0.28, ky + ks * 0.25)
  ctx.lineTo(kx + ks * 0.28, ky + ks * 0.25)
  ctx.lineTo(kx + ks * 0.18, ky + ks * 0.7)
  ctx.lineTo(kx - ks * 0.18, ky + ks * 0.7)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(230,225,210,0.95)' // 頭
  ctx.beginPath()
  ctx.arc(kx, ky + ks * 0.1, ks * 0.13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rgbToCss(frame.palette.wood) // 麦わら帽子
  ctx.beginPath()
  ctx.ellipse(kx, ky + ks * 0.02, ks * 0.2, ks * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()

  // 道ばたのお地蔵さん（赤い前掛け）
  const jx = w * 0.28
  const jy = h * 0.82
  const js = h * 0.07
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 142, g: 136, b: 124 }, 0.5))
  ctx.beginPath()
  ctx.moveTo(jx - js * 0.4, jy)
  ctx.lineTo(jx - js * 0.4, jy - js * 0.7)
  ctx.quadraticCurveTo(jx, jy - js * 1.35, jx + js * 0.4, jy - js * 0.7)
  ctx.lineTo(jx + js * 0.4, jy)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(200,70,60,0.92)' // 前掛け
  ctx.beginPath()
  ctx.moveTo(jx - js * 0.32, jy - js * 0.5)
  ctx.lineTo(jx + js * 0.32, jy - js * 0.5)
  ctx.lineTo(jx, jy - js * 0.05)
  ctx.closePath()
  ctx.fill()

  // 道ばたの草
  grassField(ctx, view, frame, h * 0.8, h, 530, 0.5)
}

// 川辺：澄んだ川のせせらぎ、対岸の木立、葦と石。水の照り返しがきらめく。
export function foreKawabe(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const top = h * 0.56
  const bottom = h * 0.9

  // 対岸の土手（草地）。水際まで少し下げて、川との境に隙間が出ないように。
  const bankTop = y + (top - y) * 0.4
  ctx.fillStyle = rgbToCss(frame.palette.groundShade)
  ctx.fillRect(0, bankTop, w, top + h * 0.025 - bankTop)
  grassField(ctx, view, frame, bankTop, top, 619, 0.5)
  // 対岸の木立
  drawTree(ctx, view, frame, w * 0.72, top - h * 0.0, 0.13)
  drawTree(ctx, view, frame, w * 0.88, top + h * 0.005, 0.1)

  // ── 川の水（青緑・うねる水際・流れる曲がったさざ波）──
  const riverBase = lerpColor({ r: 70, g: 124, b: 142 }, frame.palette.skyMid, 0.3)
  const riverDeep = lerpColor(riverBase, { r: 24, g: 56, b: 66 }, 0.55)
  const waveTop = (x) => top + (0.5 + 0.5 * Math.sin((x / w) * 9)) * h * 0.02
  const waveBot = (x) => bottom + Math.sin((x / w) * 7 + 1.5) * h * 0.012

  const grad = ctx.createLinearGradient(0, top, 0, bottom)
  grad.addColorStop(0, rgbToCss(lerpColor(riverBase, frame.palette.skyMid, 0.25)))
  grad.addColorStop(0.5, rgbToCss(riverBase))
  grad.addColorStop(1, rgbToCss(riverDeep))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(0, waveTop(0))
  for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, waveTop(x))
  for (let x = w; x >= 0; x -= w / 24) ctx.lineTo(x, waveBot(x))
  ctx.closePath()
  ctx.fill()

  // 流れるさざ波（下流へ流れる、曲がった短い波筋）
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const rw = rng(917)
  for (let i = 0; i < 24; i++) {
    const f = rw()
    const yy = top + (bottom - top) * (0.08 + f * 0.88)
    const depth = (yy - top) / (bottom - top)
    const drift = (frame.now / 1000) * (0.02 + depth * 0.05)
    const baseX = (((rw() + drift) % 1.1) - 0.05) * w
    const wlen = (0.04 + rw() * 0.07) * w * (0.6 + depth)
    ctx.strokeStyle = rgbToCss(frame.palette.light, 0.1 + depth * 0.22)
    ctx.lineWidth = Math.max(1, h * 0.0022 * (0.5 + depth))
    ctx.beginPath()
    ctx.moveTo(baseX - wlen / 2, yy)
    ctx.quadraticCurveTo(baseX, yy + h * 0.006 * (0.5 + depth), baseX + wlen / 2, yy)
    ctx.stroke()
  }
  ctx.restore()

  // 川の石（水際にいくつか）
  const r = rng(840)
  for (let i = 0; i < 7; i++) {
    const sx = r() * w
    const sy = top + (0.1 + r() * 0.7) * (bottom - top)
    const sr = (0.01 + r() * 0.015) * h
    // 石まわりの波紋（水に当たって広がる輪）
    const ripple = (frame.now / 1000 + i) % 2
    ctx.strokeStyle = `rgba(235,245,245,${Math.max(0, 0.25 - ripple * 0.12)})`
    ctx.lineWidth = Math.max(1, h * 0.0015)
    ctx.beginPath()
    ctx.ellipse(sx, sy + sr * 0.6, sr * (1.6 + ripple * 1.5), sr * (0.6 + ripple * 0.5), 0, 0, Math.PI * 2)
    ctx.stroke()
    // 石
    ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 120, g: 115, b: 105 }, 0.5), 0.95)
    ctx.beginPath()
    ctx.ellipse(sx, sy, sr * 1.4, sr, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,250,0.18)'
    ctx.beginPath()
    ctx.ellipse(sx - sr * 0.3, sy - sr * 0.3, sr * 0.6, sr * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 小魚（水面下を すいすい泳ぐ影）
  for (let i = 0; i < 5; i++) {
    const speed = 0.04 + (i % 3) * 0.02
    const fx = ((0.1 + i * 0.2 + (frame.now / 1000) * speed) % 1.1) * w
    const fy = top + (0.3 + ((i * 37) % 50) / 100 * 0.6) * (bottom - top)
    ctx.fillStyle = 'rgba(40,50,55,0.4)'
    ctx.beginPath()
    ctx.ellipse(fx, fy, h * 0.012, h * 0.004, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath() // 尾
    ctx.moveTo(fx - h * 0.012, fy)
    ctx.lineTo(fx - h * 0.022, fy - h * 0.004)
    ctx.lineTo(fx - h * 0.022, fy + h * 0.004)
    ctx.closePath()
    ctx.fill()
  }

  // 手前の岸と葦
  ctx.fillStyle = rgbToCss(frame.palette.groundShade)
  ctx.fillRect(0, bottom, w, h - bottom)
  grassField(ctx, view, frame, bottom, h, 711, 0.8)
  // 葦（細長い草）を水際に
  const leaf = frame.palette.groundShade
  for (let i = 0; i < 16; i++) {
    const rx = r() * w
    grassBlade(ctx, rx, bottom + r() * h * 0.02, h * (0.06 + r() * 0.06), (r() - 0.5) * h * 0.03, lerpColor(leaf, { r: 0, g: 0, b: 0 }, 0.2), 0.7)
  }
}

// 商店街（昭和後期〜平成初期）。アーケード・暖簾・袖看板・のぼり・八百屋の店先・丸ポスト。
// ※特定の店名やブランドは使わず、一般的な“あの頃の商店街”をオリジナルで再現。
export function foreShoutengai(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const grey = (v) => `rgb(${v | 0},${v | 0},${(v + 4) | 0})`

  // 歩道（タイル舗装・中央線なし＝大通りに見せない。手前ほど少し広い狭い小路）
  const vp = { x: w * 0.5, y }
  const fl = 0.46
  const fr = 0.54
  const bl = 0.2
  const br = 0.8
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 198, g: 190, b: 172 }, 0.55))
  ctx.beginPath()
  ctx.moveTo(fl * w, y)
  ctx.lineTo(fr * w, y)
  ctx.lineTo(br * w, h)
  ctx.lineTo(bl * w, h)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,112,96,0.22)'
  ctx.lineWidth = 1
  for (let r2 = 1; r2 <= 7; r2++) {
    const f = (r2 / 7) ** 2
    const yy = y + (h - y) * f
    ctx.beginPath()
    ctx.moveTo((fl + (bl - fl) * f) * w, yy)
    ctx.lineTo((fr + (br - fr) * f) * w, yy)
    ctx.stroke()
  }
  for (let c = 1; c <= 4; c++) {
    const tt = c / 5
    ctx.beginPath()
    ctx.moveTo((fl + (fr - fl) * tt) * w, y)
    ctx.lineTo((bl + (br - bl) * tt) * w, h)
    ctx.stroke()
  }

  const awnings = ['#C0492F', '#3E7A5A', '#3A6A9A', '#C99A3A', '#8A5A8A', '#B5614A']
  // 両脇の店（奥→手前）：壁・店先・暖簾・看板・袖看板・のぼり・八百屋の品
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const f = i / 5
      const baseY = y + (h - y) * (f * f)
      const sc = 0.5 + f * 1.2
      const bw = w * 0.2 * sc
      const bh = h * 0.26 * sc
      const innerEdge = (0.5 + side * (0.04 + f * 0.26)) * w
      const bx = innerEdge + side * bw * 0.5
      const col = awnings[(i + (side > 0 ? 3 : 0)) % awnings.length]
      // 立体の箱（前面＋屋根＋側面）
      box3d(ctx, bx, baseY, bw, bh, side, lerpColor(frame.palette.far, { r: 230, g: 216, b: 192 }, 0.72), vp, 0.1)
      // 店先（暗い間口）
      ctx.fillStyle = 'rgba(46,40,34,0.85)'
      ctx.fillRect(bx - bw * 0.36, baseY - bh * 0.55, bw * 0.72, bh * 0.55)
      // 暖簾（のれん・切れ目つき）
      ctx.fillStyle = col
      ctx.fillRect(bx - bw * 0.4, baseY - bh * 0.62, bw * 0.8, bh * 0.13)
      ctx.fillStyle = 'rgba(0,0,0,0.14)'
      for (let s = -2; s <= 2; s++) ctx.fillRect(bx + s * bw * 0.16, baseY - bh * 0.55, bw * 0.012, bh * 0.06)
      // 壁上の看板（無地の色板＝ホーロー看板風）
      ctx.fillStyle = rgbToCss(lerpColor(col, { r: 255, g: 255, b: 255 }, 0.42))
      ctx.fillRect(bx - bw * 0.34, baseY - bh * 0.92, bw * 0.68, bh * 0.14)
      ctx.fillStyle = 'rgba(70,55,40,0.5)'
      for (let k = 0; k < 3; k++) ctx.fillRect(bx - bw * 0.24 + k * bw * 0.2, baseY - bh * 0.88, bw * 0.1, bh * 0.06)
      // 袖看板（道側へ突き出す縦看板）
      ctx.fillStyle = awnings[(i + 1) % awnings.length]
      const ssx = bx - side * bw * 0.5 - (side < 0 ? bw * 0.06 : 0)
      ctx.fillRect(ssx, baseY - bh * 0.86, bw * 0.06, bh * 0.42)
      // のぼり（店先の旗・そよぐ）
      if (f > 0.35) {
        ctx.fillStyle = ['#D24A3A', '#E8E0C8', '#3E7A5A'][i % 3]
        const fx = bx - side * bw * 0.44
        const wav = Math.sin(frame.now / 600 + i) * bw * 0.04
        ctx.beginPath()
        ctx.moveTo(fx, baseY - bh * 0.5)
        ctx.lineTo(fx, baseY - bh * 0.08)
        ctx.lineTo(fx - side * bw * 0.14 + wav, baseY - bh * 0.1)
        ctx.lineTo(fx - side * bw * 0.14 + wav, baseY - bh * 0.48)
        ctx.closePath()
        ctx.fill()
      }
      // 縞のテント（日よけ・商店街の定番）— 八百屋でない店に
      if (i % 2 === 1) {
        const tentCol = awnings[(i + 2) % awnings.length]
        const tx0 = bx - bw * 0.42
        const tw3 = bw * 0.84
        const tyTop = baseY - bh * 0.48
        const tDrop = bh * 0.12
        const tOut = side * bw * 0.05
        ctx.fillStyle = tentCol
        ctx.beginPath()
        ctx.moveTo(tx0, tyTop)
        ctx.lineTo(tx0 + tw3, tyTop)
        ctx.lineTo(tx0 + tw3 + tOut, tyTop + tDrop)
        ctx.lineTo(tx0 + tOut, tyTop + tDrop)
        ctx.closePath()
        ctx.fill()
        // 白い縞
        ctx.fillStyle = 'rgba(245,242,232,0.85)'
        const stripes = Math.max(3, Math.round(tw3 / (bw * 0.12)))
        for (let s = 0; s < stripes; s += 2) {
          const sx = tx0 + (s * tw3) / stripes
          ctx.beginPath()
          ctx.moveTo(sx, tyTop)
          ctx.lineTo(sx + tw3 / stripes, tyTop)
          ctx.lineTo(sx + tw3 / stripes + tOut, tyTop + tDrop)
          ctx.lineTo(sx + tOut, tyTop + tDrop)
          ctx.closePath()
          ctx.fill()
        }
        // すそのギザギザ
        ctx.fillStyle = tentCol
        for (let s = 0; s < stripes; s++) {
          const sx = tx0 + tOut + (s * tw3) / stripes
          ctx.beginPath()
          ctx.moveTo(sx, tyTop + tDrop)
          ctx.lineTo(sx + tw3 / stripes, tyTop + tDrop)
          ctx.lineTo(sx + tw3 / (stripes * 2), tyTop + tDrop + bh * 0.03)
          ctx.closePath()
          ctx.fill()
        }
      }
      // 八百屋の店先（木箱＋果物野菜）
      if (f > 0.45 && i % 2 === 0) {
        ctx.fillStyle = rgbToCss(frame.palette.wood)
        ctx.fillRect(bx - bw * 0.3, baseY - bh * 0.12, bw * 0.6, bh * 0.12)
        for (let c = 0; c < 4; c++) {
          ctx.fillStyle = ['#D2542A', '#E0A030', '#5A8A3A', '#C03030'][c]
          ctx.beginPath()
          ctx.arc(bx - bw * 0.2 + c * bw * 0.14, baseY - bh * 0.1, bw * 0.04, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
  }

  // 通行人（賑わいのシルエット）
  for (const [gx2, gy2, col] of [[0.4, 0.66, '#7A6A5A'], [0.58, 0.62, '#6A7A8A'], [0.46, 0.71, '#8A6A6A'], [0.52, 0.56, '#6A8A6A'], [0.43, 0.59, '#9A7A5A'], [0.62, 0.69, '#7A6A8A']]) {
    const fx = gx2 * w
    const fy = gy2 * h
    const fs = h * 0.06
    ctx.fillStyle = 'rgba(30,30,40,0.16)'
    ctx.beginPath()
    ctx.ellipse(fx, fy, fs * 0.2, fs * 0.05, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = col
    ctx.fillRect(fx - fs * 0.14, fy - fs * 0.5, fs * 0.28, fs * 0.5)
    ctx.fillStyle = '#E6BD92'
    ctx.fillRect(fx - fs * 0.04, fy - fs * 0.56, fs * 0.08, fs * 0.08)
    ctx.fillStyle = '#2A2018'
    ctx.beginPath()
    ctx.arc(fx, fy - fs * 0.62, fs * 0.12, 0, Math.PI * 2)
    ctx.fill()
  }

  // アーケードのアーチ（通りの上に連なる・奥へ小さく）
  for (const d of [0.18, 0.42, 0.68]) {
    const hw = (0.08 + (0.72 - d) * 0.5) * w
    const cxA = w * 0.5
    const baseYA = (0.2 - d * 0.05) * h
    ctx.strokeStyle = rgbToCss(lerpColor(frame.palette.far, { r: 184, g: 174, b: 162 }, 0.4))
    ctx.lineWidth = Math.max(1, h * 0.007 * (1 - d * 0.5))
    ctx.beginPath()
    ctx.moveTo(cxA - hw, baseYA)
    ctx.quadraticCurveTo(cxA, baseYA - hw * 0.5, cxA + hw, baseYA)
    ctx.stroke()
    // アーチ下の細い帯
    ctx.strokeStyle = 'rgba(190,80,60,0.5)'
    ctx.lineWidth = Math.max(1, h * 0.004 * (1 - d * 0.5))
    ctx.beginPath()
    ctx.moveTo(cxA - hw, baseYA + h * 0.008)
    ctx.quadraticCurveTo(cxA, baseYA - hw * 0.5 + h * 0.008, cxA + hw, baseYA + h * 0.008)
    ctx.stroke()
  }

  // アドバルーン（空高くに浮く祝賀バルーン＋垂れ幕）＝盛り上がり感
  const balloons = [
    [0.28, 0.1, { r: 210, g: 74, b: 58 }],
    [0.54, 0.06, { r: 62, g: 122, b: 154 }],
    [0.74, 0.11, { r: 201, g: 154, b: 58 }],
  ]
  for (const [bxf, byf, col] of balloons) {
    const bx = bxf * w
    const by = byf * h + Math.sin(frame.now / 2200 + bxf * 10) * h * 0.01
    const br = h * 0.045
    ctx.strokeStyle = 'rgba(60,60,60,0.4)' // 紐
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(bx, by + br)
    ctx.lineTo(bx, by + br + h * 0.14)
    ctx.stroke()
    ctx.fillStyle = 'rgba(246,240,224,0.94)' // 垂れ幕
    ctx.fillRect(bx - br * 0.42, by + br, br * 0.84, h * 0.14)
    ctx.fillStyle = rgbToCss(col)
    ctx.fillRect(bx - br * 0.42, by + br, br * 0.84, h * 0.022)
    ctx.fillRect(bx - br * 0.42, by + br + h * 0.06, br * 0.84, h * 0.012)
    ctx.fillStyle = rgbToCss(col) // バルーン
    ctx.beginPath()
    ctx.ellipse(bx, by, br * 0.92, br, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.beginPath()
    ctx.ellipse(bx - br * 0.3, by - br * 0.3, br * 0.3, br * 0.42, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 商店街の入口ゲート（飾りアーチ・奥の地平線に）
  const gw = w * 0.22
  const gx = w * 0.5
  const gtop = y - h * 0.15
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 120, g: 110, b: 100 }, 0.4))
  ctx.fillRect(gx - gw / 2, gtop, w * 0.012, y - gtop)
  ctx.fillRect(gx + gw / 2 - w * 0.012, gtop, w * 0.012, y - gtop)
  ctx.fillStyle = '#B83A2C' // アーチの飾り帯
  ctx.beginPath()
  ctx.moveTo(gx - gw / 2 - w * 0.02, gtop + h * 0.03)
  ctx.quadraticCurveTo(gx, gtop - h * 0.05, gx + gw / 2 + w * 0.02, gtop + h * 0.03)
  ctx.lineTo(gx + gw / 2 + w * 0.02, gtop + h * 0.06)
  ctx.quadraticCurveTo(gx, gtop - h * 0.01, gx - gw / 2 - w * 0.02, gtop + h * 0.06)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(250,228,150,0.95)' // 飾り電球
  for (let k = 0; k <= 7; k++) {
    const t2 = k / 7
    const ex = gx - gw / 2 + t2 * gw
    const ey = gtop + h * 0.035 - Math.sin(t2 * Math.PI) * h * 0.04
    ctx.beginPath()
    ctx.arc(ex, ey, h * 0.005, 0, Math.PI * 2)
    ctx.fill()
  }

  // 縦横に走る電線（平成初期らしさ）
  ctx.strokeStyle = 'rgba(40,40,45,0.4)'
  ctx.lineWidth = 1
  const wires = [
    [0.08, 0.18, 0.92, 0.14], [0.04, 0.24, 0.78, 0.17],
    [0.96, 0.2, 0.28, 0.19], [0.18, 0.28, 0.7, 0.13], [0.5, 0.15, 0.06, 0.22],
  ]
  for (const [x1, y1, x2, y2] of wires) {
    ctx.beginPath()
    ctx.moveTo(x1 * w, y1 * h)
    ctx.quadraticCurveTo(((x1 + x2) / 2) * w, ((y1 + y2) / 2) * h + h * 0.025, x2 * w, y2 * h)
    ctx.stroke()
  }

  // 吊り旗（ゲートの手前に連なる三角フラッグ）
  const flagCols = ['#D24A3A', '#E8C84A', '#3E7A9A', '#5A9A4A']
  for (let k = 0; k < 9; k++) {
    const t2 = k / 8
    const fx = (0.12 + t2 * 0.76) * w
    const fy = y - h * 0.11 + Math.sin(t2 * Math.PI) * h * 0.02
    ctx.fillStyle = flagCols[k % flagCols.length]
    ctx.beginPath()
    ctx.moveTo(fx - w * 0.012, fy)
    ctx.lineTo(fx + w * 0.012, fy)
    ctx.lineTo(fx, fy + h * 0.022)
    ctx.closePath()
    ctx.fill()
  }

  // 手前：丸ポスト（赤）
  const mx = w * 0.12
  const my = h * 0.96
  const mr = w * 0.028
  ctx.fillStyle = '#B83A2C'
  ctx.fillRect(mx - mr, my - mr * 4, mr * 2, mr * 4)
  ctx.beginPath()
  ctx.arc(mx, my - mr * 4, mr, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = 'rgba(20,10,10,0.5)' // 投函口
  ctx.fillRect(mx - mr * 0.6, my - mr * 3.9, mr * 1.2, mr * 0.3)
  ctx.fillStyle = 'rgba(255,255,255,0.18)' // つや
  ctx.fillRect(mx - mr * 0.8, my - mr * 3.6, mr * 0.3, mr * 3)

  // 手前：自転車（簡単なシルエット）
  const cx = w * 0.86
  const cy = h * 0.92
  const cr = h * 0.05
  ctx.strokeStyle = 'rgba(40,40,45,0.8)'
  ctx.lineWidth = Math.max(1, h * 0.006)
  ctx.beginPath()
  ctx.arc(cx - cr, cy, cr, 0, Math.PI * 2)
  ctx.arc(cx + cr, cy, cr, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(cx - cr, cy)
  ctx.lineTo(cx, cy - cr * 0.8)
  ctx.lineTo(cx + cr, cy)
  ctx.lineTo(cx, cy - cr * 0.2)
  ctx.lineTo(cx - cr, cy)
  ctx.moveTo(cx, cy - cr * 0.8)
  ctx.lineTo(cx + cr * 0.3, cy - cr * 1.1) // ハンドル
  ctx.stroke()

  // 手前の大きなゲート（額縁＝この下をくぐる入口）
  const fgTop = h * 0.05
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 150, g: 60, b: 50 }, 0.45))
  ctx.fillRect(w * 0.04, fgTop, w * 0.032, h) // 左柱
  ctx.fillRect(w * 0.928, fgTop, w * 0.032, h) // 右柱
  // アーチの飾り帯
  ctx.fillStyle = '#B83A2C'
  ctx.beginPath()
  ctx.moveTo(w * 0.03, fgTop + h * 0.02)
  ctx.quadraticCurveTo(w * 0.5, fgTop - h * 0.06, w * 0.97, fgTop + h * 0.02)
  ctx.lineTo(w * 0.97, fgTop + h * 0.085)
  ctx.quadraticCurveTo(w * 0.5, fgTop + h * 0.005, w * 0.03, fgTop + h * 0.085)
  ctx.closePath()
  ctx.fill()
  // 飾りの帯（白ライン）
  ctx.fillStyle = 'rgba(245,235,210,0.85)'
  ctx.fillRect(w * 0.04, fgTop + h * 0.05, w * 0.92, h * 0.012)
  // 飾り電球
  ctx.fillStyle = 'rgba(252,228,150,0.95)'
  for (let k = 0; k <= 13; k++) {
    const t2 = k / 13
    const ex = (0.05 + t2 * 0.9) * w
    const ey = fgTop + h * 0.055 - Math.sin(t2 * Math.PI) * h * 0.055
    ctx.beginPath()
    ctx.arc(ex, ey, h * 0.006, 0, Math.PI * 2)
    ctx.fill()
  }
}

// 住宅街（昭和後期〜平成初期）。細い道、ブロック塀と瓦屋根の家、電柱。
export function foreJuutakugai(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const vp = { x: w * 0.5, y }
  const grey = (v) => `rgb(${v | 0},${v | 0},${(v + 3) | 0})`

  // 地面：コンクリ（手前へ）
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 178, g: 174, b: 164 }, 0.5))
  ctx.fillRect(0, y, w, h - y)
  // 道（アスファルト・中央）
  const road = ctx.createLinearGradient(0, y, 0, h)
  road.addColorStop(0, grey(140))
  road.addColorStop(1, grey(120))
  ctx.fillStyle = road
  ctx.beginPath()
  ctx.moveTo(w * 0.46, y)
  ctx.lineTo(w * 0.54, y)
  ctx.lineTo(w * 0.78, h)
  ctx.lineTo(w * 0.22, h)
  ctx.closePath()
  ctx.fill()

  // 両脇に沿って連続するブロック塀＋生け垣（奥→手前の“通り”をつなげて、隙間の寂しさを消す）
  const hedge = lerpColor(frame.palette.groundShade, { r: 96, g: 134, b: 72 }, 0.5)
  for (const side of [-1, 1]) {
    const segs = 10
    let prevX = null
    let prevY = null
    let prevTop = null
    for (let s = 0; s <= segs; s++) {
      const f = s / segs
      const baseY = y + (h - y) * Math.pow(f, 1.5)
      const edge = (0.5 + side * (0.045 + f * 0.46)) * w
      const wallH = h * (0.02 + f * 0.06)
      if (prevX !== null) {
        // ブロック塀（帯）
        ctx.fillStyle = grey(168 - f * 8)
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(edge, baseY)
        ctx.lineTo(edge, baseY - wallH)
        ctx.lineTo(prevX, prevTop)
        ctx.closePath()
        ctx.fill()
        // 生け垣（塀の内側にこんもり）
        ctx.fillStyle = rgbToCss(hedge)
        ctx.beginPath()
        ctx.moveTo(prevX, prevTop)
        ctx.lineTo(edge, baseY - wallH)
        ctx.lineTo(edge, baseY - wallH * 1.9)
        ctx.lineTo(prevX, prevTop - wallH * 0.9)
        ctx.closePath()
        ctx.fill()
      }
      prevX = edge
      prevY = baseY
      prevTop = baseY - wallH
    }
  }

  // 両脇に 家とマンションを交互に（3Dの箱・密に・奥→手前）
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const f = i / 7
      const baseY = y + (h - y) * Math.pow(f, 1.55)
      const sc = 0.42 + f * 1.05
      const innerEdge = (0.5 + side * (0.07 + f * 0.46)) * w
      const isMansion = (i + (side > 0 ? 1 : 0)) % 2 === 0
      if (isMansion) {
        // マンション（3〜5階・3Dの箱・窓とベランダ）
        const floors = 3 + (i % 3)
        const bw = w * 0.18 * sc
        const bh = h * (0.12 + floors * 0.035) * sc
        const bx = innerEdge + side * bw * 0.5
        box3d(ctx, bx, baseY, bw, bh, side, lerpColor(frame.palette.far, { r: 214, g: 208, b: 196 }, 0.6), vp, 0.08)
        const top = baseY - bh
        const cols = Math.max(2, Math.round(bw / (w * 0.04)))
        const rowH = bh / floors
        for (let fl = 0; fl < floors; fl++) {
          const ry = top + fl * rowH
          ctx.fillStyle = 'rgba(90,90,90,0.2)'
          ctx.fillRect(bx - bw / 2, ry + rowH * 0.58, bw, rowH * 0.14)
          for (let c = 0; c < cols; c++) {
            const cx = bx - bw / 2 + ((c + 0.5) * bw) / cols
            const lit = Math.sin(c * 11.3 + fl * 6.1 + i * 4) > 0.5
            ctx.fillStyle = lit ? 'rgba(250,228,165,0.7)' : 'rgba(70,80,92,0.55)'
            ctx.fillRect(cx - (bw / cols) * 0.3, ry + rowH * 0.16, (bw / cols) * 0.6, rowH * 0.34)
          }
        }
      } else {
        // 一戸建て（瓦屋根＋3Dの壁＋窓）
        const bw = w * 0.155 * sc
        const bh = h * 0.13 * sc
        const bx = innerEdge + side * bw * 0.5
        box3d(ctx, bx, baseY, bw, bh, side, lerpColor(frame.palette.far, { r: 236, g: 228, b: 210 }, 0.7), vp, 0.08)
        ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 120, g: 88, b: 76 }, 0.5))
        ctx.beginPath()
        ctx.moveTo(bx - bw * 0.56, baseY - bh)
        ctx.lineTo(bx - bw * 0.34, baseY - bh - bh * 0.45)
        ctx.lineTo(bx + bw * 0.34, baseY - bh - bh * 0.45)
        ctx.lineTo(bx + bw * 0.56, baseY - bh)
        ctx.closePath()
        ctx.fill()
        // 窓（あかり）
        ctx.fillStyle = i % 3 === 0 ? 'rgba(250,228,165,0.6)' : 'rgba(120,140,150,0.55)'
        ctx.fillRect(bx - bw * 0.22, baseY - bh * 0.66, bw * 0.44, bh * 0.3)
      }
    }
  }

  // 所々の緑（街路樹）
  drawTree(ctx, view, frame, w * 0.085, y + h * 0.04, 0.08)
  drawTree(ctx, view, frame, w * 0.915, y + h * 0.08, 0.11)
  drawTree(ctx, view, frame, w * 0.2, y + h * 0.005, 0.05)

  // 手前の暮らしの気配 ──────────────────
  // 物干し台＋洗濯もの（右手前・暮らしの温度）
  const dlx = w * 0.8
  const dly = h * 0.78
  ctx.strokeStyle = grey(150)
  ctx.lineWidth = Math.max(2, h * 0.006)
  ctx.beginPath()
  ctx.moveTo(dlx, h * 0.96)
  ctx.lineTo(dlx, dly)
  ctx.moveTo(dlx + w * 0.13, h * 0.95)
  ctx.lineTo(dlx + w * 0.13, dly - h * 0.01)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(60,60,60,0.5)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(dlx, dly + h * 0.005)
  ctx.quadraticCurveTo(dlx + w * 0.065, dly + h * 0.03, dlx + w * 0.13, dly)
  ctx.stroke()
  const wash = ['#EAEAE6', '#9FC6E0', '#EAEAE6', '#E8B7A0']
  for (let i = 0; i < wash.length; i++) {
    const lx = dlx + w * 0.018 + i * w * 0.028
    ctx.fillStyle = wash[i]
    ctx.fillRect(lx, dly + h * 0.012, w * 0.022, h * 0.05)
  }

  // 自転車（左手前・ママチャリのシルエット）
  const bkx = w * 0.16
  const bky = h * 0.9
  const br = h * 0.045
  ctx.strokeStyle = 'rgba(50,55,60,0.75)'
  ctx.lineWidth = Math.max(2, h * 0.006)
  for (const wx of [bkx - br, bkx + br]) {
    ctx.beginPath()
    ctx.arc(wx, bky, br, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.lineWidth = Math.max(1.5, h * 0.005)
  ctx.beginPath()
  ctx.moveTo(bkx - br, bky)
  ctx.lineTo(bkx, bky - br * 0.9)
  ctx.lineTo(bkx + br, bky)
  ctx.moveTo(bkx, bky - br * 0.9)
  ctx.lineTo(bkx + br * 0.4, bky - br * 1.5) // ハンドル支柱
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bkx - br * 0.3, bky - br * 1.4) // サドル
  ctx.lineTo(bkx + br * 0.2, bky - br * 1.45)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(200,210,215,0.8)' // 前カゴ
  ctx.beginPath()
  ctx.moveTo(bkx + br * 0.3, bky - br * 1.5)
  ctx.lineTo(bkx + br * 0.9, bky - br * 1.4)
  ctx.lineTo(bkx + br * 0.8, bky - br * 0.9)
  ctx.lineTo(bkx + br * 0.3, bky - br)
  ctx.stroke()

  // 赤い丸ポスト（左奥の角）
  const mpx = w * 0.07
  const mpy = h * 0.7
  ctx.fillStyle = '#C0392B'
  ctx.fillRect(mpx - w * 0.012, mpy, w * 0.024, h * 0.075)
  ctx.beginPath()
  ctx.arc(mpx, mpy, w * 0.014, 0, Math.PI * 2)
  ctx.fill()

  // プランター列（右の塀ぎわ・朝顔）
  for (let i = 0; i < 3; i++) {
    const px = w * (0.84 + i * 0.04)
    const py = h * (0.7 + i * 0.02)
    ctx.fillStyle = '#9C6B4A'
    ctx.fillRect(px, py, w * 0.02, h * 0.022)
    ctx.fillStyle = rgbToCss(lerpColor(frame.palette.groundShade, { r: 90, g: 130, b: 70 }, 0.5))
    ctx.beginPath()
    ctx.arc(px + w * 0.01, py, w * 0.016, 0, Math.PI * 2)
    ctx.fill()
    // 朝顔のひとつ
    ctx.fillStyle = '#6E5AA8'
    ctx.beginPath()
    ctx.arc(px + w * 0.004, py - h * 0.006, w * 0.005, 0, Math.PI * 2)
    ctx.fill()
  }
  // 植木鉢（左手前）
  ctx.fillStyle = '#B07050'
  ctx.fillRect(w * 0.28, h * 0.95, w * 0.025, h * 0.03)
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.groundShade, { r: 90, g: 130, b: 70 }, 0.35))
  ctx.beginPath()
  ctx.arc(w * 0.2925, h * 0.94, w * 0.022, 0, Math.PI * 2)
  ctx.fill()

  // 電柱と電線（道沿い・縦横）
  ctx.strokeStyle = rgbToCss(frame.palette.woodShade, 0.85)
  const pts = []
  for (let i = 0; i < 3; i++) {
    const f = i / 2
    const px = (0.6 + f * 0.14) * w
    const pTop = y - h * (0.08 + f * 0.18)
    ctx.lineWidth = Math.max(1, h * 0.006 * (f + 0.5))
    ctx.beginPath()
    ctx.moveTo(px, pTop)
    ctx.lineTo(px, y + (h - y) * (f * f) * 0.6)
    ctx.stroke()
    pts.push({ x: px, y: pTop + h * 0.01 })
  }
  ctx.strokeStyle = 'rgba(40,40,40,0.45)'
  ctx.lineWidth = 1
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.beginPath()
    ctx.moveTo(pts[i].x, pts[i].y)
    ctx.quadraticCurveTo((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2 + h * 0.02, pts[i + 1].x, pts[i + 1].y)
    ctx.stroke()
  }
  // 反対側にも電線（横切り）
  ctx.beginPath()
  ctx.moveTo(w * 0.1, y - h * 0.1)
  ctx.quadraticCurveTo(w * 0.5, y - h * 0.04, w * 0.9, y - h * 0.12)
  ctx.stroke()
}

// 団地・マンション（昭和後期〜平成初期）。コンクリの棟と、手前に公園。
export function foreDanchi(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  // 地面（コンクリ／土）
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 170, g: 165, b: 150 }, 0.55))
  ctx.fillRect(0, y, w, h - y)

  const grey3 = (v) => `rgb(${v | 0},${v | 0},${(v + 4) | 0})`
  // 団地の棟（3棟・立体の箱）
  const vp = { x: w * 0.5, y }
  for (const [bxf, bwf, floors] of [[0.18, 0.22, 4], [0.5, 0.26, 5], [0.82, 0.22, 4]]) {
    const bx = bxf * w
    const bw = bwf * w
    const bh = h * (0.16 + floors * 0.035)
    const top = y - bh
    const side = bxf < 0.5 ? -1 : 1
    box3d(ctx, bx, y, bw, bh, side, lerpColor(frame.palette.far, { r: 218, g: 210, b: 194 }, 0.6), vp, 0.06)
    const cols = Math.max(3, Math.round(bw / (w * 0.032)))
    const rowH = bh / floors
    for (let fl = 0; fl < floors; fl++) {
      const ry = top + fl * rowH
      ctx.fillStyle = 'rgba(90,90,90,0.22)' // ベランダ帯
      ctx.fillRect(bx - bw / 2, ry + rowH * 0.55, bw, rowH * 0.16)
      for (let c = 0; c < cols; c++) {
        const cx = bx - bw / 2 + ((c + 0.5) * bw) / cols
        const lit = Math.sin(c * 12.9 + fl * 7.7 + bxf * 30) > 0.55
        ctx.fillStyle = lit ? 'rgba(250,228,165,0.75)' : 'rgba(60,72,86,0.6)'
        ctx.fillRect(cx - (bw / cols) * 0.3, ry + rowH * 0.15, (bw / cols) * 0.6, rowH * 0.32)
      }
    }
  }

  // ── 手前の公園 ──
  const gnd = h * 0.95
  // 棟ぎわの植え込み（緑の帯）— コンクリだけにせず、奥に緑を敷く
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.groundShade, { r: 96, g: 134, b: 72 }, 0.5))
  ctx.beginPath()
  ctx.moveTo(0, y + h * 0.04)
  ctx.lineTo(w, y + h * 0.04)
  ctx.lineTo(w, y + h * 0.1)
  ctx.lineTo(0, y + h * 0.1)
  ctx.closePath()
  ctx.fill()
  // 広場（手前の砂地・台形でやわらかく地面を分ける）
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 206, g: 188, b: 150 }, 0.55))
  ctx.beginPath()
  ctx.moveTo(w * 0.2, y + h * 0.12)
  ctx.lineTo(w * 0.8, y + h * 0.12)
  ctx.lineTo(w * 1.02, h)
  ctx.lineTo(-w * 0.02, h)
  ctx.closePath()
  ctx.fill()
  // 公園の木（棟の前に左右）
  drawTree(ctx, view, frame, w * 0.06, y + h * 0.06, 0.085)
  drawTree(ctx, view, frame, w * 0.94, y + h * 0.06, 0.09)
  drawTree(ctx, view, frame, w * 0.66, y + h * 0.03, 0.055)

  // 花壇（タイヤを半分埋めた花壇・赤と黄）
  for (let i = 0; i < 3; i++) {
    const fx = w * (0.4 + i * 0.07)
    const fy = y + h * 0.13
    ctx.strokeStyle = 'rgba(40,40,44,0.7)'
    ctx.lineWidth = Math.max(2, h * 0.006)
    ctx.beginPath()
    ctx.arc(fx, fy, w * 0.02, Math.PI, Math.PI * 2)
    ctx.stroke()
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k % 2 ? '#E0B040' : '#D85A4A'
      ctx.beginPath()
      ctx.arc(fx - w * 0.012 + k * w * 0.012, fy - h * 0.008, w * 0.005, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 水飲み場（コンクリの台＋蛇口）
  const wfx = w * 0.27
  const wfy = h * 0.8
  ctx.fillStyle = grey3(190)
  ctx.fillRect(wfx - w * 0.018, wfy, w * 0.036, h * 0.1)
  ctx.fillStyle = grey3(168)
  ctx.beginPath()
  ctx.ellipse(wfx, wfy, w * 0.026, h * 0.012, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#8A9098'
  ctx.lineWidth = Math.max(1.5, h * 0.004)
  ctx.beginPath()
  ctx.moveTo(wfx, wfy - h * 0.005)
  ctx.lineTo(wfx, wfy - h * 0.02)
  ctx.lineTo(wfx + w * 0.01, wfy - h * 0.018)
  ctx.stroke()

  // 公園灯（背の高い街灯）
  const plx = w * 0.62
  ctx.strokeStyle = grey3(150)
  ctx.lineWidth = Math.max(2, h * 0.006)
  ctx.beginPath()
  ctx.moveTo(plx, gnd)
  ctx.lineTo(plx, h * 0.62)
  ctx.stroke()
  ctx.fillStyle = frame.time >= 0.78 || frame.time < 0.08 ? 'rgba(255,236,170,0.95)' : 'rgba(220,224,228,0.9)'
  ctx.beginPath()
  ctx.moveTo(plx - w * 0.014, h * 0.62)
  ctx.lineTo(plx + w * 0.014, h * 0.62)
  ctx.lineTo(plx + w * 0.01, h * 0.6)
  ctx.lineTo(plx - w * 0.01, h * 0.6)
  ctx.closePath()
  ctx.fill()

  // すべり台（はしご＋踊り場＋すべり面＋手すり）
  const lx = w * 0.16
  const slH = h * 0.2
  ctx.strokeStyle = '#C0654A'
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2, slH * 0.05)
  ctx.beginPath() // はしごの縦2本
  ctx.moveTo(lx - w * 0.012, gnd)
  ctx.lineTo(lx - w * 0.012, gnd - slH)
  ctx.moveTo(lx + w * 0.012, gnd)
  ctx.lineTo(lx + w * 0.012, gnd - slH)
  ctx.stroke()
  ctx.lineWidth = Math.max(1, slH * 0.03)
  for (let r2 = 0; r2 < 5; r2++) {
    const ry = gnd - (slH * (r2 + 0.5)) / 5
    ctx.beginPath()
    ctx.moveTo(lx - w * 0.012, ry)
    ctx.lineTo(lx + w * 0.012, ry)
    ctx.stroke()
  }
  ctx.fillStyle = '#A8B0B8' // 踊り場
  ctx.fillRect(lx - w * 0.018, gnd - slH - h * 0.012, w * 0.06, h * 0.012)
  ctx.fillStyle = '#5A9AC0' // すべり面
  ctx.beginPath()
  ctx.moveTo(lx + w * 0.03, gnd - slH)
  ctx.lineTo(lx + w * 0.16, gnd)
  ctx.lineTo(lx + w * 0.19, gnd)
  ctx.lineTo(lx + w * 0.05, gnd - slH)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#C0654A' // 手すり
  ctx.lineWidth = Math.max(1, slH * 0.025)
  ctx.beginPath()
  ctx.moveTo(lx + w * 0.03, gnd - slH * 0.9)
  ctx.lineTo(lx + w * 0.16, gnd - h * 0.02)
  ctx.stroke()

  // ブランコ（A型フレーム＋2つの座板・1つ揺れる）
  const swx = w * 0.72
  const swTop = h * 0.74
  const swH = h * 0.2
  ctx.strokeStyle = '#9AA0A0'
  ctx.lineWidth = Math.max(2, swH * 0.035)
  ctx.beginPath() // 上の横棒
  ctx.moveTo(swx - swH * 0.7, swTop)
  ctx.lineTo(swx + swH * 0.7, swTop)
  for (const ax of [-0.7, 0.7]) {
    // A型脚
    ctx.moveTo(swx + ax * swH, swTop)
    ctx.lineTo(swx + ax * swH - swH * 0.25, gnd)
    ctx.moveTo(swx + ax * swH, swTop)
    ctx.lineTo(swx + ax * swH + swH * 0.25, gnd)
  }
  ctx.stroke()
  ctx.lineWidth = Math.max(1, swH * 0.02)
  const sway = Math.sin(frame.now / 1300) * swH * 0.18
  let si = 0
  for (const sgx of [-0.3, 0.3]) {
    const sw2 = si === 0 ? sway : 0 // 片方だけ揺れる
    ctx.strokeStyle = 'rgba(60,60,60,0.7)'
    ctx.beginPath()
    ctx.moveTo(swx + sgx * swH - swH * 0.06, swTop)
    ctx.lineTo(swx + sgx * swH - swH * 0.06 + sw2, swTop + swH * 0.62)
    ctx.moveTo(swx + sgx * swH + swH * 0.06, swTop)
    ctx.lineTo(swx + sgx * swH + swH * 0.06 + sw2, swTop + swH * 0.62)
    ctx.stroke()
    ctx.fillStyle = '#6A4A2A'
    ctx.fillRect(swx + sgx * swH - swH * 0.1 + sw2, swTop + swH * 0.6, swH * 0.2, swH * 0.04)
    si++
  }

  // ジャングルジム（立方体の格子）
  const jx = w * 0.5
  const jy = gnd
  const js = h * 0.13
  ctx.strokeStyle = '#5A8AB0'
  ctx.lineWidth = Math.max(1, js * 0.04)
  for (let gi = 0; gi <= 3; gi++) {
    const gg = (gi / 3) * js
    ctx.beginPath() // 縦
    ctx.moveTo(jx - js / 2 + gg, jy)
    ctx.lineTo(jx - js / 2 + gg, jy - js)
    ctx.moveTo(jx - js / 2 + gg + js * 0.2, jy - js * 0.15)
    ctx.lineTo(jx - js / 2 + gg + js * 0.2, jy - js * 1.15)
    ctx.stroke()
    ctx.beginPath() // 横
    ctx.moveTo(jx - js / 2, jy - gg)
    ctx.lineTo(jx + js / 2, jy - gg)
    ctx.moveTo(jx - js / 2 + js * 0.2, jy - gg - js * 0.15)
    ctx.lineTo(jx + js / 2 + js * 0.2, jy - gg - js * 0.15)
    ctx.stroke()
  }

  // 砂場（木枠＋砂）
  const sbx = w * 0.34
  const sby = h * 0.96
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(sbx - w * 0.08, sby - h * 0.005, w * 0.16, h * 0.018)
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.wood, { r: 224, g: 204, b: 152 }, 0.55), 0.95)
  ctx.beginPath()
  ctx.ellipse(sbx, sby - h * 0.004, w * 0.075, h * 0.014, 0, 0, Math.PI * 2)
  ctx.fill()

  // ベンチ
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(w * 0.86, h * 0.86, w * 0.09, h * 0.012)
  ctx.fillRect(w * 0.86, h * 0.872, w * 0.012, h * 0.03)
  ctx.fillRect(w * 0.938, h * 0.872, w * 0.012, h * 0.03)
}

// おじいちゃんち（昭和の和室）。畳・障子の窓・ちゃぶ台・ブラウン管テレビ・時計・カレンダー。
export function foreIe(ctx, view, frame) {
  const { w, h } = view
  const wallY = h * 0.42 // 壁と畳の境
  const ceilY = h * 0.07 // 天井の梁の下
  const sideW = w * 0.08 // 左右の壁（部屋を囲って狭く見せる）
  const innerL = sideW
  const innerR = w - sideW
  const tw2 = innerR - innerL

  // 天井の梁
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.woodShade, { r: 124, g: 98, b: 70 }, 0.4))
  ctx.fillRect(0, 0, w, ceilY)
  // 左右の壁
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.wood, { r: 216, g: 200, b: 170 }, 0.5))
  ctx.fillRect(0, 0, sideW, h)
  ctx.fillRect(innerR, 0, sideW, h)
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.fillRect(innerL - w * 0.005, 0, w * 0.005, h)
  ctx.fillRect(innerR, 0, w * 0.005, h)
  // 柱
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(innerL - w * 0.012, 0, w * 0.012, wallY)
  ctx.fillRect(innerR, 0, w * 0.012, wallY)

  // 背の壁（漆喰）
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.wood, { r: 234, g: 218, b: 188 }, 0.55))
  ctx.fillRect(innerL, ceilY, tw2, wallY - ceilY)
  // 障子の窓
  const winX = innerL + w * 0.03
  const winW = w * 0.24
  const winY = ceilY + h * 0.02
  const winH = wallY - ceilY - h * 0.04
  ctx.fillStyle = 'rgba(250,246,228,0.92)'
  ctx.fillRect(winX, winY, winW, winH)
  ctx.strokeStyle = rgbToCss(frame.palette.woodShade)
  ctx.lineWidth = Math.max(1, h * 0.004)
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(winX + (i * winW) / 4, winY)
    ctx.lineTo(winX + (i * winW) / 4, winY + winH)
    ctx.stroke()
  }
  for (let j = 1; j < 3; j++) {
    ctx.beginPath()
    ctx.moveTo(winX, winY + (j * winH) / 3)
    ctx.lineTo(winX + winW, winY + (j * winH) / 3)
    ctx.stroke()
  }
  ctx.strokeRect(winX, winY, winW, winH)
  // 壁掛け時計
  ctx.fillStyle = '#3A2E22'
  ctx.beginPath()
  ctx.arc(w * 0.62, ceilY + h * 0.07, h * 0.032, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#EAE2CC'
  ctx.beginPath()
  ctx.arc(w * 0.62, ceilY + h * 0.07, h * 0.025, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#3A2E22'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(w * 0.62, ceilY + h * 0.07)
  ctx.lineTo(w * 0.62, ceilY + h * 0.05)
  ctx.moveTo(w * 0.62, ceilY + h * 0.07)
  ctx.lineTo(w * 0.636, ceilY + h * 0.07)
  ctx.stroke()
  // カレンダー
  ctx.fillStyle = '#F4F0E6'
  ctx.fillRect(w * 0.78, ceilY + h * 0.02, w * 0.1, h * 0.15)
  ctx.fillStyle = '#C0392B'
  ctx.fillRect(w * 0.78, ceilY + h * 0.02, w * 0.1, h * 0.04)

  // 畳（い草の風合い・互い違い・縁つき・手前ほど広い）
  // base：あたたかい黄緑（い草）
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.ground, { r: 198, g: 188, b: 126 }, 0.7))
  ctx.fillRect(innerL, wallY, tw2, h - wallY)
  const rowsY = [0, 0.32, 0.62, 1].map((t) => wallY + (h - wallY) * t)
  // 各畳：互い違いの向きで“織りの艶”を出す（縦向き／横向きで明るさを変える）
  for (let r = 0; r < 3; r++) {
    const offset = r % 2 === 0 ? 0 : 0.5
    const rh = rowsY[r + 1] - rowsY[r]
    for (let c = -1; c < 3; c++) {
      const x0 = innerL + tw2 * Math.max(0, (c + offset) / 3)
      const x1 = innerL + tw2 * Math.min(1, (c + 1 + offset) / 3)
      if (x1 <= x0) continue
      const horiz = (c + r) % 2 === 0 // 互い違いの向き
      // 向きごとの艶（横向きは明るく、縦向きは少し沈ませる）
      ctx.fillStyle = horiz ? 'rgba(228,220,158,0.32)' : 'rgba(150,150,96,0.22)'
      ctx.fillRect(x0, rowsY[r], x1 - x0, rh)
      // い草の織り目（細い線・向きで縦横を変える）
      ctx.strokeStyle = horiz ? 'rgba(150,148,100,0.18)' : 'rgba(120,124,84,0.16)'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (horiz) {
        const n = 7
        for (let k = 1; k < n; k++) {
          const yy = rowsY[r] + (rh * k) / n
          ctx.moveTo(x0, yy)
          ctx.lineTo(x1, yy)
        }
      } else {
        const n = 6
        for (let k = 1; k < n; k++) {
          const xx = x0 + ((x1 - x0) * k) / n
          ctx.moveTo(xx, rowsY[r])
          ctx.lineTo(xx, rowsY[r + 1])
        }
      }
      ctx.stroke()
    }
  }
  // 畳縁（黒に近い焦げ茶の布縁）
  ctx.strokeStyle = '#3B3026'
  ctx.lineWidth = Math.max(2, h * 0.006)
  for (const ry of rowsY) {
    ctx.beginPath()
    ctx.moveTo(innerL, ry)
    ctx.lineTo(innerR, ry)
    ctx.stroke()
  }
  for (let r = 0; r < 3; r++) {
    const offset = r % 2 === 0 ? 0 : 0.5
    for (let c = 0; c <= 3; c++) {
      const xf = (c + offset) / 3
      if (xf < 0 || xf > 1) continue
      const x = innerL + tw2 * xf
      ctx.beginPath()
      ctx.moveTo(x, rowsY[r])
      ctx.lineTo(x, rowsY[r + 1])
      ctx.stroke()
    }
  }

  // ちゃぶ台（低い丸テーブル）＋急須
  const tx = w * 0.46
  const ty = h * 0.84
  const tr = w * 0.12
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(tx - tr * 0.5, ty, tr, tr * 0.3)
  ctx.fillStyle = rgbToCss(frame.palette.wood)
  ctx.beginPath()
  ctx.ellipse(tx, ty, tr, tr * 0.4, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#6A7A5A'
  ctx.beginPath()
  ctx.arc(tx + tr * 0.2, ty - tr * 0.1, tr * 0.16, 0, Math.PI * 2)
  ctx.fill()

  // ブラウン管テレビ（右手前）
  const vx2 = w * 0.82
  const vy2 = h * 0.9
  const vw2 = w * 0.14
  const vh2 = h * 0.14
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.woodShade, { r: 96, g: 84, b: 72 }, 0.4))
  ctx.fillRect(vx2 - vw2 / 2, vy2 - vh2, vw2, vh2)
  ctx.fillStyle = '#3A4A52'
  ctx.fillRect(vx2 - vw2 * 0.4, vy2 - vh2 * 0.88, vw2 * 0.62, vh2 * 0.62)
  ctx.fillStyle = 'rgba(185,205,215,0.3)'
  ctx.fillRect(vx2 - vw2 * 0.36, vy2 - vh2 * 0.82, vw2 * 0.26, vh2 * 0.5)
  ctx.fillStyle = '#2A2018' // つまみ
  ctx.beginPath()
  ctx.arc(vx2 + vw2 * 0.36, vy2 - vh2 * 0.7, vw2 * 0.04, 0, Math.PI * 2)
  ctx.fill()

  // 座布団（ちゃぶ台のまわり）
  for (const [zx, zy] of [[tx - tr * 1.25, ty + tr * 0.12], [tx + tr * 1.15, ty + tr * 0.06]]) {
    ctx.fillStyle = '#9A6A5A'
    ctx.beginPath()
    ctx.ellipse(zx, zy, tr * 0.5, tr * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.beginPath()
    ctx.ellipse(zx, zy + tr * 0.05, tr * 0.5, tr * 0.16, 0, 0, Math.PI)
    ctx.fill()
  }

  // 茶箪笥（背の壁ぎわ）
  const cabx = w * 0.58
  const caby = wallY
  const cabw = w * 0.17
  const cabh = h * 0.15
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.woodShade, { r: 122, g: 92, b: 62 }, 0.4))
  ctx.fillRect(cabx - cabw / 2, caby - cabh, cabw, cabh)
  ctx.fillStyle = 'rgba(0,0,0,0.22)' // ガラス引き戸
  ctx.fillRect(cabx - cabw * 0.42, caby - cabh * 0.62, cabw * 0.84, cabh * 0.42)
  ctx.strokeStyle = rgbToCss(frame.palette.wood)
  ctx.lineWidth = Math.max(1, cabw * 0.02)
  ctx.beginPath()
  ctx.moveTo(cabx, caby - cabh * 0.62)
  ctx.lineTo(cabx, caby - cabh * 0.2)
  ctx.stroke()

  // 扇風機（左手前・羽根が回る）
  const fnx = w * 0.15
  const fny = h * 0.9
  const fns = h * 0.13
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 150, g: 162, b: 152 }, 0.5))
  ctx.fillRect(fnx - fns * 0.04, fny - fns, fns * 0.08, fns)
  ctx.fillRect(fnx - fns * 0.18, fny, fns * 0.36, fns * 0.05)
  ctx.strokeStyle = '#8AA0A0'
  ctx.lineWidth = fns * 0.04
  ctx.beginPath()
  ctx.arc(fnx, fny - fns * 1.05, fns * 0.3, 0, Math.PI * 2)
  ctx.stroke()
  const fa = frame.now / 120
  ctx.fillStyle = 'rgba(222,228,228,0.7)'
  for (let b = 0; b < 3; b++) {
    ctx.save()
    ctx.translate(fnx, fny - fns * 1.05)
    ctx.rotate(fa + (b * Math.PI * 2) / 3)
    ctx.beginPath()
    ctx.ellipse(fns * 0.13, 0, fns * 0.17, fns * 0.07, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // 蚊取り線香（畳に・細い煙）
  const kx = w * 0.34
  const ky = h * 0.94
  ctx.strokeStyle = '#5E8A4A'
  ctx.lineWidth = Math.max(1, h * 0.004)
  ctx.beginPath()
  ctx.arc(kx, ky, h * 0.016, 0, Math.PI * 1.8)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(200,200,200,0.4)'
  ctx.lineWidth = Math.max(1, h * 0.003)
  ctx.beginPath()
  ctx.moveTo(kx, ky - h * 0.016)
  ctx.quadraticCurveTo(kx + Math.sin(frame.now / 700) * w * 0.02, ky - h * 0.1, kx + Math.sin(frame.now / 500) * w * 0.01, ky - h * 0.2)
  ctx.stroke()
}
