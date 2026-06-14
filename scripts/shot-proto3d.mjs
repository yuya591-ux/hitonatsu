// 3D試作(proto3d.html)の確認用スクリーンショット。
// 使い方: npm run build のあと  node scripts/shot-proto3d.mjs
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const BASE = '/hitonatsu/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outDir = join(ROOT, '.verify')
mkdirSync(outDir, { recursive: true })
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.json': 'application/json', '.ico': 'image/x-icon' }

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0])
    if (path.startsWith(BASE)) path = path.slice(BASE.length - 1)
    if (path === '/' || path === '') path = '/index.html'
    const body = await readFile(join(DIST, path))
    res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, path))] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('not found') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const baseUrl = `http://127.0.0.1:${port}${BASE}`

const errors = []
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('status of 404')) errors.push(`console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'networkidle0', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2500))
  const gl = await page.evaluate(() => !!window.__proto3d)
  console.log(`3D初期化: ${gl ? 'OK' : 'NG'}`)
  for (const [t, tag] of [[0.22, 'asa'], [0.5, 'hiru'], [0.74, 'yu'], [0.97, 'yoru']]) {
    await page.evaluate((tt) => window.__proto3d.setDay(tt), t)
    await new Promise((r) => setTimeout(r, 700))
    await page.screenshot({ path: join(outDir, `proto3d-${tag}.png`) })
    console.log(`撮影: proto3d-${tag}.png`)
  }
  // 座って景色を見回す（昼）
  await page.evaluate(() => { window.__proto3d.setDay(0.4); window.__proto3d.sitDown() })
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: join(outDir, 'proto3d-sit.png') })
  console.log('撮影: proto3d-sit.png')
  await page.close()
} finally {
  await browser.close()
  server.close()
}
if (errors.length) { console.log('\n❌ エラー:'); for (const e of errors) console.log('  - ' + e); process.exitCode = 1 }
else console.log('\n✅ コンソールエラーなし')
