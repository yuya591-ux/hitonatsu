// 自動デバッグ巡回（2026-07-05・ユーザー要望「一通り操作してデバッグ」）。
// ねらい＝毎デプロイ前に私(Claude)がゲームを"ひととおり回して"から報告するための常設ツール。
//   ① 構造監査：道の上の建物 / 道の上の小物 / 到達不能でないか（フック _buildingsOnRoad・_propsOnRoad）
//   ② 目視巡回：主要ホットスポット × 時刻を自動撮影し、各絵の「黒つぶれ率/白飛び率」を測って“怪しい絵”に印を付ける
//      → 私は印(⚠)の付いた絵だけを重点的に目視すればよい＝レビューが速い
// headlessの制約（音は聞けない・色/ブルームは実機とズレる・粒子やすりガラスは映らない・RAF~3fpsで動きは測れない）
//   ＝これは「機械的/構造的/静止画」のバグ潰し専用。音・操作感・情緒・実機発熱は裕也さんの実機が正。
// 画素解析は "live canvas の drawImage は A4以降まっ黒" のため、page.screenshot(PNG)→そのPNG画像をImageで復号して測る。
//
// 使い方:  node scripts/patrol.mjs            （全体巡回）
//          node scripts/patrol.mjs yato       （yatoのホットスポットだけ）
//   ※ 先に  npx vite build  すること（npm run patrol はビルド込み）。出力は .verify/patrol/（gitignore）。
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { resolveBrowser } from './browser-path.mjs' // ブラウザ解決は共有ヘルパー1箇所（分岐禁止・CI事故対策）

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist'); const BASE = '/hitonatsu/'; const EDGE = resolveBrowser(ROOT)
const OUT = join(ROOT, '.verify', 'patrol'); mkdirSync(OUT, { recursive: true })
const ONLY = process.argv[2] || '' // 例: yato で絞り込み
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length - 1); if (p === '/' || p === '') p = '/index.html'; const body = await readFile(join(DIST, p)); res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, p))] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end('x') } })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}${BASE}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 撮影＋画素解析（黒つぶれ/白飛び）。PNGを一旦保存しつつ、そのPNGをImageで復号して輝度ヒストグラムを取る
async function capture(page, name) {
  const file = join(OUT, name + '.png')
  const buf = await page.screenshot({ path: file })
  const b64 = Buffer.from(buf).toString('base64')
  const m = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data
    let dark = 0, bright = 0, tot = 0, sum = 0
    for (let i = 0; i < d.length; i += 16) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; tot++; sum += l; if (l < 24) dark++; else if (l > 250) bright++ }
    return { dark: +(dark / tot).toFixed(3), bright: +(bright / tot).toFixed(3), mean: Math.round(sum / tot) }
  }, b64)
  return { name, file, ...m }
}

const errors = [], shots = []
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage(); await page.setViewport({ width: 960, height: 600, deviceScaleFactor: 1 })
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  let ok = false; for (let i = 0; i < 120; i++) { if (await page.evaluate(() => !!(window.__proto3d && window.__proto3d.boy))) { ok = true; break } await sleep(200) }
  if (!ok) { errors.push('__proto3d が生えない（致命傷）'); throw new Error('no __proto3d') }
  await page.evaluate(() => { document.getElementById('t-start').click(); window.__proto3d.setTitle && window.__proto3d.setTitle(false); const g = document.getElementById('guide-ok'); if (g) g.click() })
  await sleep(700)
  // UIオーバーレイを隠して世界だけを撮る
  await page.evaluate(() => { for (const e of document.body.children) { if (e.tagName !== 'CANVAS') e.style.visibility = 'hidden' } })

  // ── ① 構造監査（yato）──
  await page.evaluate(() => { window.__proto3d.goArea('yato'); window.__proto3d.setDay(0.44) }); await sleep(500)
  const audit = await page.evaluate(() => { const H = window.__proto3d
    return { onRoadBld: H._buildingsOnRoad ? H._buildingsOnRoad() : null, onRoadProp: H._propsOnRoad ? H._propsOnRoad().length : null } })
  if (audit.onRoadBld) { const n = audit.onRoadBld.n; console.log(`構造:道の上の建物(閾値超)=${n}${n ? '  ← ' + JSON.stringify(audit.onRoadBld.worst.slice(0, 5)) : ' ✓'}`)
    if (n) errors.push('道の上に建物（除外閾値超）: ' + JSON.stringify(audit.onRoadBld.worst.slice(0, 3))) }
  console.log(`構造:道の上の小物=${audit.onRoadProp}${audit.onRoadProp ? '  ← 要修正' : ' ✓'}`)
  if (audit.onRoadProp) errors.push(`道の上に小物 ${audit.onRoadProp}件`)

  // ── ② 目視巡回：ホットスポット × 時刻 ──
  const TIMES = [['ひる', 0.44], ['ゆうがた', 0.6], ['よる', 0.9]]
  // yatoのホットスポット（target[x,z]・水平距離d・目標地面からの高さh・方位ry）
  const SPOTS = [
    { name: 'slide', t: [3726, -786], d: 62, h: 40, ry: 0.2 },   // ローラーすべり台（黒い影の再発監視）
    { name: 'jutaku', t: [3290, -372], d: 44, h: 32, ry: 0.7 },  // 住宅街（道の上の建物の再発監視）
    { name: 'futatsuike', t: [3008, -489], d: 48, h: 15, ry: -0.6 }, // 二ツ池
    { name: 'sunrise', t: [3004, -6], d: 58, h: 42, ry: 2.5 },   // サンライズ（開始地点）
  ]
  if (ONLY === '' || ONLY === 'yato') {
    for (const [tw, td] of TIMES) {
      await page.evaluate((v) => { window.__proto3d.setDay(v) }, td); await sleep(150)
      for (const s of SPOTS) {
        await page.evaluate((s) => { const H = window.__proto3d, gy = H.heightAt(s.t[0], s.t[1]); window.__freezeCam = true
          H._lookAt(s.t[0] + Math.sin(s.ry) * s.d, gy + s.h, s.t[1] + Math.cos(s.ry) * s.d, s.t[0], gy + s.h * 0.28, s.t[1], 'yato') }, s)
        await sleep(360); shots.push(await capture(page, `yato_${s.name}_${tw}`))
      }
    }
    // すべり台の乗車視点（主観・自然滑走を少し進めて1枚）＝地形めり込み/横の暗い影の監視
    await page.evaluate(() => { window.__freezeCam = false; const H = window.__proto3d; H.setDay(0.44); const top = H._slideTop && H._slideTop(); if (top) { H.placeBoy && H.placeBoy(top[0], top[1]); H._rideSlide(); H._slidePov('first') } })
    await sleep(1600); shots.push(await capture(page, 'yato_slide_ride'))
  }
  // ── 他エリアの概観（黒画面/描画崩れの粗チェック）──
  const AREAS = ['field', 'town', 'shrine']
  if (ONLY === '' || AREAS.includes(ONLY)) {
    for (const a of (ONLY ? [ONLY] : AREAS)) {
      if (!AREAS.includes(a)) continue
      await page.evaluate((a) => { window.__freezeCam = false; window.__proto3d.goArea(a); window.__proto3d.setDay(0.44) }, a); await sleep(500)
      shots.push(await capture(page, `area_${a}_ひる`))
    }
  }
  await page.close()
} finally { await browser.close(); server.close() }

// ── 報告：怪しい絵に印。昼夕(dark率が高い=黒つぶれ疑い) / 白飛び / 極端に暗い平均 ──
console.log('\n― 巡回撮影（⚠=要目視。黒=黒つぶれ率 白=白飛び率 平均=平均輝度）―')
const flagged = []
for (const s of shots) {
  const isNight = s.name.includes('よる')
  const warnDark = !isNight && s.dark > 0.13           // 夜以外で黒が多い＝黒い影/黒つぶれの疑い
  const warnBright = s.bright > 0.06                    // 白飛びの疑い
  const warnDim = !isNight && s.mean < 70               // 昼夕なのに全体が暗い
  const warn = warnDark || warnBright || warnDim
  if (warn) flagged.push(s.name)
  console.log(`  ${warn ? '⚠' : ' '} ${s.name.padEnd(22)} 黒${s.dark} 白${s.bright} 平均${s.mean}  ${s.file.replace(ROOT, '.')}`)
}
console.log(`\n撮影 ${shots.length}枚 / 要目視 ${flagged.length}枚${flagged.length ? '：' + flagged.join(', ') : ''}`)
console.log(`スクショ: ${OUT.replace(ROOT, '.')}`)

if (errors.length) { console.error('\n❌ 巡回で問題を検出：'); for (const e of errors) console.error('  - ' + e); process.exit(1) }
console.log('\n✅ 巡回：構造監査OK・致命的エラー無し（⚠印の絵は目視で確認）')
