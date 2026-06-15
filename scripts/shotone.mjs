import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist'); const BASE = '/hitonatsu/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outDir = join(ROOT, '.verify'); mkdirSync(outDir, { recursive: true })
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' }
const server = createServer(async (req, res) => {
  try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length - 1); if (p === '/' || p === '') p = '/index.html'
    const body = await readFile(join(DIST, p)); res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, p))] || 'application/octet-stream' }); res.end(body)
  } catch { res.writeHead(404); res.end('not found') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}${BASE}`
const errors = []
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setViewport({ width: 1000, height: 600, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'networkidle0', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2400))
  await page.evaluate(() => { document.getElementById('title')?.classList.add('hidden'); const H = window.__proto3d; H.standUp(); H.goArea('town'); H.setDay(0.45); H.placeBoy(960, 12) })
  await new Promise((r) => setTimeout(r, 1100))
  await page.evaluate(() => { const H = window.__proto3d; window.__freezeCam = true; const c = H.camera; c.fov = 60; c.updateProjectionMatrix(); c.position.set(965, 12, 35); c.lookAt(975, 4, 10) })
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: join(outDir, 'town-fill.png') }); console.log('撮影: town-fill.png')
  // 夜の町（団地/パチンコの灯り）
  await page.evaluate(() => { window.__freezeCam = false; window.__proto3d.setDay(0.96) })
  await new Promise((r) => setTimeout(r, 1000))
  await page.evaluate(() => { const H = window.__proto3d; window.__freezeCam = true; const c = H.camera; c.fov = 60; c.updateProjectionMatrix(); c.position.set(965, 12, 35); c.lookAt(975, 4, 10) })
  await new Promise((r) => setTimeout(r, 500))
  await page.screenshot({ path: join(outDir, 'town-fill-night.png') }); console.log('撮影: town-fill-night.png')
  await page.close()
} finally { await browser.close(); server.close() }
if (errors.length) { console.log('❌ エラー:'); errors.forEach((e) => console.log('  - ' + e)); process.exitCode = 1 } else console.log('✅ コンソールエラーなし')
