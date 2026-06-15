import puppeteer from 'puppeteer-core'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist'); const BASE = '/hitonatsu/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' }
const { createServer } = await import('node:http')
const server = createServer(async (req, res) => {
  try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length - 1); if (p === '/' || p === '') p = '/index.html'
    const body = await readFile(join(DIST, p)); res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, p))] || 'application/octet-stream' }); res.end(body)
  } catch { res.writeHead(404); res.end('not found') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}${BASE}`
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 520, height: 720, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'networkidle0', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2600))
  // 主人公を正面・近めに：カメラを手前に置いて全身を映す
  await page.evaluate(() => {
    document.getElementById('title')?.classList.add('hidden')
    const H = window.__proto3d; H.standUp(); H.setDay(0.42); H.placeBoy(0, 6)
    for (let i = 0; i < 10; i++) document.getElementById('zin')?.click() // ゲーム本来のズームで寄る
  })
  await new Promise((r) => setTimeout(r, 1400))
  await page.screenshot({ path: join(ROOT, 'char.png') })
  await page.close()
  console.log('char.png 撮影完了')
} finally { await browser.close(); server.close() }
