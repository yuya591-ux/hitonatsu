// 顔黒の再発防止ゲート（2026-07-04）：帽子/髪型の代表8体を並べ、「体の正面に立った視点→目」への視線が
// 髪・帽子に遮られないかをレイキャストで機械判定する（照明・グレード・swiftshaderの明度差に依存しない構造検査）。
// 頭ヨー±0.9rad（会釈・見回し・こちらを向く演出の実働域）も検査＝「頭が回ると髪が顔にかぶる」系の回帰を目視前に止める。
// 失敗時は exit 1。参考スクショを .verify/facegate.png に保存。
import puppeteer from 'puppeteer-core'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { readdirSync, existsSync, mkdirSync } from 'node:fs'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist'); const BASE = '/hitonatsu/'
// ブラウザの実行ファイル：CI等は環境変数で明示（PUPPETEER_EXECUTABLE_PATH / CHROME_PATH）。無ければローカル同梱chrome→Windows Edgeの順。※verify-proto3d.mjsと必ず同じ解決にすること（顔ゲートだけ環境変数を読まずCIのdeployが全て失敗した・2026-07-05）
const EDGE = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || (() => { const c = join(ROOT, 'chrome'); if (existsSync(c)) for (const d of readdirSync(c)) { const p = join(c, d, 'chrome-win64', 'chrome.exe'); if (existsSync(p)) return p } return 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })()
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.woff2': 'font/woff2' }
const { createServer } = await import('node:http')
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length - 1); if (p === '/' || p === '') p = '/index.html'; const body = await readFile(join(DIST, p)); res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, p))] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end('x') } })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}${BASE}`
if (!existsSync(join(ROOT, '.verify'))) mkdirSync(join(ROOT, '.verify'))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', userDataDir: join(ROOT, '.verify', `_edge-face-${process.pid}`), args: ['--no-sandbox', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 1.2 })
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  for (let i = 0; i < 80 && !(await page.evaluate(() => !!(window.__proto3d && window.__proto3d.boy))); i++) await sleep(250)
  await sleep(800)
  await page.evaluate(() => { const t = document.getElementById('t-start'); if (t) t.click(); const g = document.getElementById('guide-ok'); if (g) g.click(); const H = window.__proto3d; H.goArea('yato'); H.setDay(0.45) })
  await sleep(800)
  const res = await page.evaluate(() => window.__proto3d._faceCheck())
  console.log(`顔ゲート: ${res.checked}視線を検査`)
  if (res.fails.length) {
    failed = true
    for (const f of res.fails) console.log(`  ❌ ${f.tag} ヨー${f.yaw} ${f.eye}目 → 最初に${f.hit}が視線を遮っている`)
  } else console.log('  ✅ 全員の目まで視線が通る（髪・帽子の遮蔽なし）')
  // 参考スクショ（人間の目用）：リグの列を正面から（高さは地面基準＝placeBoyで得る）
  await page.evaluate(({ x, z }) => { const H = window.__proto3d; H.placeBoy(x + 7, z + 12); const gy = H.boy.position.y; window.__freezeCam = true
    for (const id of ['hint', 'badge', 'act', 'look', 'toast', 'dialogue', 'dock', 'hud']) { const e = document.getElementById(id); if (e) e.style.display = 'none' }
    H._lookAt(x + 7, gy + 1.5, z + 5.4, x + 7, gy + 1.05, z, 'yato')
  }, res.rigAt); await sleep(700)
  const canvas = await page.$('canvas'); await canvas.screenshot({ path: join(ROOT, '.verify', 'facegate.png') })
  if (errs.length) { failed = true; console.log('ページ例外:', errs.slice(0, 3)) }
} finally { await browser.close(); server.close() }
if (failed) { console.log('❌ 顔ゲート不合格'); process.exit(1) }
console.log('✅ 顔ゲート合格')
