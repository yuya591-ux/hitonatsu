import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist'); const BASE = '/hitonatsu/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json' }
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length - 1); if (p === '/' || p === '') p = '/index.html'; const b = await readFile(join(DIST, p)); res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b) } catch { res.writeHead(404); res.end('x') } })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
await page.goto(`http://127.0.0.1:${port}${BASE}proto3d.html`, { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 2000))
await page.evaluate(() => { document.getElementById('title')?.classList.add('hidden'); const H = window.__proto3d; H.setDay(0.5); H.goArea('town') })
// 頂上のベンチに座って街を一望
await page.evaluate(() => window.__proto3d.sitDown('mtview'))
await new Promise((r) => setTimeout(r, 1500))
await page.screenshot({ path: join(ROOT, '.verify', 'proto3d-overlook.png') })
console.log('done')
await browser.close(); server.close()
