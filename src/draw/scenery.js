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

  // 奥へ収束する遠近の筋（見下ろした床が奥へ受けていく感じ＝立体感）
  ctx.save()
  ctx.strokeStyle = rgbToCss(shade, 0.16)
  ctx.lineWidth = Math.max(1, h * 0.0025)
  const vpx = w * 0.5 // 消失点（地平線の中央）
  for (let i = -7; i <= 7; i++) {
    if (i === 0) continue
    const bottomX = w * 0.5 + i * w * 0.13 // 手前ほど広がる
    ctx.beginPath()
    ctx.moveTo(vpx, y)
    ctx.lineTo(bottomX, h)
    ctx.stroke()
  }
  // 横の畝（手前ほど間隔が広い＝遠近）
  ctx.strokeStyle = rgbToCss(shade, 0.1)
  for (let r2 = 1; r2 <= 6; r2++) {
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

  // 庭の草
  grassField(ctx, view, frame, y, top, 211, 0.7)
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

  // すいか（縁側にぽつんと・夏の縁側らしさ）
  const sx = w * 0.2
  const sy = h * 0.86
  const sr = h * 0.05
  ctx.fillStyle = '#3E7A3A'
  ctx.beginPath()
  ctx.ellipse(sx, sy, sr * 1.15, sr, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(30,60,30,0.7)' // しま模様
  ctx.lineWidth = sr * 0.12
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.ellipse(sx + i * sr * 0.4, sy, sr * 0.18 + Math.abs(i) * sr * 0.12, sr, 0, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(sx + i * sr * 0.4, sy, sr * 0.18 + Math.abs(i) * sr * 0.12, sr, 0, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(255,255,250,0.4)' // つや
  ctx.beginPath()
  ctx.ellipse(sx - sr * 0.4, sy - sr * 0.5, sr * 0.25, sr * 0.12, -0.5, 0, Math.PI * 2)
  ctx.fill()

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

export function foreHarappa(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  // 奥に木立（霞ませて）
  drawTree(ctx, view, frame, w * 0.16, y + h * 0.04, 0.12)
  drawTree(ctx, view, frame, w * 0.84, y + h * 0.05, 0.16)
  // 一面の草と野花
  grassField(ctx, view, frame, y, h, 305, 1.1)
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

  // 下草（石段のまわり）
  grassField(ctx, view, frame, y, h, 412, 0.7)

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

  // 道ばたの草
  grassField(ctx, view, frame, h * 0.8, h, 530, 0.5)
}

// 川辺：澄んだ川のせせらぎ、対岸の木立、葦と石。水の照り返しがきらめく。
export function foreKawabe(ctx, view, frame) {
  const { w, h } = view
  const y = h * HORIZON
  const top = h * 0.56
  const bottom = h * 0.9

  // 対岸の土手（草地）
  ctx.fillStyle = rgbToCss(frame.palette.groundShade)
  ctx.fillRect(0, y + (top - y) * 0.4, w, top - (y + (top - y) * 0.4))
  grassField(ctx, view, frame, y + (top - y) * 0.4, top, 619, 0.5)
  // 対岸の木立
  drawTree(ctx, view, frame, w * 0.72, top - h * 0.0, 0.13)
  drawTree(ctx, view, frame, w * 0.88, top + h * 0.005, 0.1)

  // 水面（空と対岸の色を映す）
  const water = ctx.createLinearGradient(0, top, 0, bottom)
  water.addColorStop(0, rgbToCss(lerpColor(frame.palette.skyMid, frame.palette.groundShade, 0.3), 0.85))
  water.addColorStop(0.5, rgbToCss(frame.palette.skyMid, 0.7))
  water.addColorStop(1, rgbToCss(frame.palette.skyBottom, 0.9))
  ctx.fillStyle = water
  ctx.fillRect(0, top, w, bottom - top)

  // 照り返し（ゆっくり揺れる横の光の筋・手前ほど太く）
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 9; i++) {
    const f = i / 8
    const yy = top + (bottom - top) * f
    const phase = frame.now / 1400 + i
    ctx.strokeStyle = rgbToCss(frame.palette.light, 0.12 + f * 0.22)
    ctx.lineWidth = Math.max(1, h * 0.0025 * (0.5 + f))
    ctx.beginPath()
    for (let x = 0; x <= w; x += w / 24) {
      const off = Math.sin(phase + (x / w) * 8) * h * 0.005 * (0.4 + f)
      if (x === 0) ctx.moveTo(x, yy + off)
      else ctx.lineTo(x, yy + off)
    }
    ctx.stroke()
  }
  ctx.restore()

  // 川の石（水際にいくつか）
  const r = rng(840)
  for (let i = 0; i < 7; i++) {
    const sx = r() * w
    const sy = top + (0.1 + r() * 0.7) * (bottom - top)
    const sr = (0.01 + r() * 0.015) * h
    ctx.fillStyle = rgbToCss(lerpColor(frame.palette.far, { r: 120, g: 115, b: 105 }, 0.5), 0.9)
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
