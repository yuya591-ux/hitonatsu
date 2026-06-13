// 各場面の風景パーツ（コード描画版）。
// 空はシグネチャ(drawSky)を全場面で共通利用し、ここでは遠景・地面・場面ごとの前景を描く。
// すべて将来 image 差し替え可能なように、場面ファクトリ側で createLayer に渡す。

import { rgbToCss, lerpColor } from '../util/color.js'
import { forestRidge, bloom, grassBlade, rng } from './watercolor.js'

// より“上から覗き込む”高い画角。地平線をさらに上げ、地面（歩く場所）を広く見せる。
export const HORIZON = 0.37 // 地平線の高さ（画面の上から37%）

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

  // 鳥居（朱・奥の地平線あたり）
  const tw = w * 0.15
  const th = h * 0.17
  const top = y - th
  const torii = 'rgba(150,58,44,0.92)'
  const toriiShade = 'rgba(110,40,32,0.92)'
  ctx.fillStyle = torii
  ctx.fillRect(cx - tw / 2, top, w * 0.014, th) // 左柱
  ctx.fillRect(cx + tw / 2 - w * 0.014, top, w * 0.014, th) // 右柱
  ctx.fillStyle = toriiShade
  ctx.fillRect(cx - tw / 2 - w * 0.022, top - h * 0.004, tw + w * 0.044, h * 0.02) // 笠木
  ctx.fillStyle = torii
  ctx.fillRect(cx - tw / 2, top + h * 0.052, tw, h * 0.013) // 貫

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

  // 道（アスファルト・手前へ広がる）
  const road = ctx.createLinearGradient(0, y, 0, h)
  road.addColorStop(0, grey(150))
  road.addColorStop(1, grey(118))
  ctx.fillStyle = road
  ctx.beginPath()
  ctx.moveTo(w * 0.42, y)
  ctx.lineTo(w * 0.58, y)
  ctx.lineTo(w * 0.96, h)
  ctx.lineTo(w * 0.04, h)
  ctx.closePath()
  ctx.fill()

  const awnings = ['#C0492F', '#3E7A5A', '#3A6A9A', '#C99A3A', '#8A5A8A', '#B5614A']
  // 両脇の店（奥→手前）：壁・店先・暖簾・看板・袖看板・のぼり・八百屋の品
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const f = i / 5
      const baseY = y + (h - y) * (f * f)
      const sc = 0.42 + f * 1.12
      const bw = w * 0.16 * sc
      const bh = h * 0.2 * sc
      const roadEdge = 0.5 + side * (0.07 + f * 0.43)
      const bx = roadEdge * w + side * bw * 0.5
      const col = awnings[(i + (side > 0 ? 3 : 0)) % awnings.length]
      // 壁
      ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 228, g: 214, b: 190 }, 0.72))
      ctx.fillRect(bx - bw / 2, baseY - bh, bw, bh)
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      ctx.fillRect(bx + side * bw * 0.22, baseY - bh, bw * 0.28, bh)
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
  for (const [gx2, gy2, col] of [[0.4, 0.66, '#7A6A5A'], [0.58, 0.62, '#6A7A8A'], [0.46, 0.71, '#8A6A6A']]) {
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
}

// 住宅街（昭和後期〜平成初期）。細い道、ブロック塀と瓦屋根の家、電柱。
export function foreJuutakugai(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const grey = (v) => `rgb(${v | 0},${v | 0},${(v + 3) | 0})`

  // 道（細め・受けていく）
  const road = ctx.createLinearGradient(0, y, 0, h)
  road.addColorStop(0, grey(150))
  road.addColorStop(1, grey(126))
  ctx.fillStyle = road
  ctx.beginPath()
  ctx.moveTo(w * 0.46, y)
  ctx.lineTo(w * 0.54, y)
  ctx.lineTo(w * 0.82, h)
  ctx.lineTo(w * 0.18, h)
  ctx.closePath()
  ctx.fill()

  // 両脇に 瓦屋根の家＋ブロック塀（奥→手前）
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const f = i / 4
      const baseY = y + (h - y) * (f * f)
      const sc = 0.5 + f * 1.05
      const ww = w * 0.2 * sc
      const wallH = h * 0.05 * sc
      const houseH = h * 0.1 * sc
      const edge = 0.5 + side * (0.06 + f * 0.4)
      const wx = edge * w + side * ww * 0.5
      const eaveY = baseY - wallH - houseH * 0.4
      // 家の壁
      ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 236, g: 228, b: 210 }, 0.7))
      ctx.fillRect(wx - ww * 0.42, eaveY, ww * 0.84, baseY - wallH - eaveY)
      // 瓦屋根
      ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 110, g: 86, b: 78 }, 0.45))
      ctx.beginPath()
      ctx.moveTo(wx - ww * 0.5, eaveY)
      ctx.lineTo(wx - ww * 0.34, eaveY - houseH * 0.5)
      ctx.lineTo(wx + ww * 0.34, eaveY - houseH * 0.5)
      ctx.lineTo(wx + ww * 0.5, eaveY)
      ctx.closePath()
      ctx.fill()
      // 窓
      ctx.fillStyle = 'rgba(120,140,150,0.6)'
      ctx.fillRect(wx - ww * 0.2, eaveY + houseH * 0.1, ww * 0.4, houseH * 0.25)
      // ブロック塀
      ctx.fillStyle = grey(172)
      ctx.fillRect(wx - ww * 0.5, baseY - wallH, ww, wallH)
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'
      ctx.lineWidth = 1
      for (let bx = wx - ww * 0.5; bx < wx + ww * 0.5; bx += ww * 0.13) {
        ctx.beginPath()
        ctx.moveTo(bx, baseY - wallH)
        ctx.lineTo(bx, baseY)
        ctx.stroke()
      }
    }
  }

  // 電柱と電線（道沿い）
  ctx.strokeStyle = rgbToCss(frame.palette.woodShade, 0.85)
  const pts = []
  for (let i = 0; i < 3; i++) {
    const f = i / 2
    const px = (0.62 + f * 0.12) * w
    const pTop = y - h * (0.06 + f * 0.16)
    ctx.lineWidth = Math.max(1, h * 0.006 * (f + 0.5))
    ctx.beginPath()
    ctx.moveTo(px, pTop)
    ctx.lineTo(px, y + (h - y) * (f * f) * 0.6)
    ctx.stroke()
    pts.push({ x: px, y: pTop + h * 0.01 })
  }
  ctx.strokeStyle = 'rgba(40,40,40,0.5)'
  ctx.lineWidth = 1
  for (let i = 0; i < pts.length - 1; i++) {
    ctx.beginPath()
    ctx.moveTo(pts[i].x, pts[i].y)
    ctx.quadraticCurveTo((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2 + h * 0.02, pts[i + 1].x, pts[i + 1].y)
    ctx.stroke()
  }
}

// 団地・マンション（昭和後期〜平成初期）。コンクリの棟と、手前に公園。
export function foreDanchi(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  // 地面（コンクリ／土）
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 170, g: 165, b: 150 }, 0.55))
  ctx.fillRect(0, y, w, h - y)

  // 団地の棟（3棟）
  for (const [bxf, bwf, floors] of [[0.2, 0.22, 4], [0.52, 0.26, 5], [0.82, 0.2, 4]]) {
    const bx = bxf * w
    const bw = bwf * w
    const bh = h * (0.16 + floors * 0.035)
    const top = y - bh
    ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 216, g: 208, b: 192 }, 0.6))
    ctx.fillRect(bx - bw / 2, top, bw, bh)
    ctx.fillStyle = 'rgba(0,0,0,0.07)'
    ctx.fillRect(bx + bw * 0.22, top, bw * 0.28, bh)
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

  // 手前の公園：すべり台・ブランコ・砂場・ベンチ
  // すべり台
  const slx = w * 0.22
  const sly = h * 0.92
  const sls = h * 0.16
  ctx.strokeStyle = '#C0654A'
  ctx.lineWidth = Math.max(2, sls * 0.06)
  ctx.beginPath() // はしご
  ctx.moveTo(slx, sly)
  ctx.lineTo(slx, sly - sls)
  ctx.stroke()
  ctx.fillStyle = '#5A9AC0' // すべり面
  ctx.beginPath()
  ctx.moveTo(slx, sly - sls)
  ctx.lineTo(slx + sls * 0.9, sly)
  ctx.lineTo(slx + sls * 1.0, sly)
  ctx.lineTo(slx + sls * 0.1, sly - sls)
  ctx.closePath()
  ctx.fill()
  // ブランコ
  const swx = w * 0.74
  const swy = h * 0.78
  const sws = h * 0.18
  ctx.strokeStyle = '#9A9A8A'
  ctx.lineWidth = Math.max(2, sws * 0.04)
  ctx.beginPath() // 枠
  ctx.moveTo(swx - sws * 0.5, swy + sws)
  ctx.lineTo(swx - sws * 0.3, swy)
  ctx.lineTo(swx + sws * 0.3, swy)
  ctx.lineTo(swx + sws * 0.5, swy + sws)
  ctx.moveTo(swx - sws * 0.3, swy)
  ctx.lineTo(swx + sws * 0.3, swy)
  ctx.stroke()
  ctx.lineWidth = Math.max(1, sws * 0.02)
  const sway = Math.sin(frame.now / 1400) * sws * 0.12
  for (const sgx of [-0.12, 0.12]) {
    ctx.beginPath()
    ctx.moveTo(swx + sgx * sws, swy)
    ctx.lineTo(swx + sgx * sws + sway, swy + sws * 0.7)
    ctx.stroke()
  }
  ctx.fillStyle = '#6A4A2A' // 座板
  ctx.fillRect(swx - sws * 0.16 + sway, swy + sws * 0.66, sws * 0.32, sws * 0.06)
  // 砂場
  ctx.fillStyle = rgbToCss(lerpColor(frame.palette.wood, { r: 220, g: 200, b: 150 }, 0.5), 0.9)
  ctx.beginPath()
  ctx.ellipse(w * 0.48, h * 0.95, w * 0.1, h * 0.03, 0, 0, Math.PI * 2)
  ctx.fill()
  // ベンチ
  ctx.fillStyle = rgbToCss(frame.palette.woodShade)
  ctx.fillRect(w * 0.5, h * 0.8, w * 0.09, h * 0.012)
  ctx.fillRect(w * 0.5, h * 0.81, w * 0.012, h * 0.03)
  ctx.fillRect(w * 0.578, h * 0.81, w * 0.012, h * 0.03)
}
