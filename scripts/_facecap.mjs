// 一時検証: 主人公とNPCの顔をドアップで撮る（髪・目の点検用）。__freezeCam/__poseFreeze で固定。
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
  await page.setViewport({ width: 480, height: 480, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'networkidle0', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2600))
  page.on('console', (m) => console.log('PAGE:', m.text()))
  const targets = ['villager', 'townLady', 'townKid', 'boy']
  for (const name of targets) {
    const diag = await page.evaluate((nm) => {
      const H = window.__proto3d, THREE = H.THREE
      H.standUp && H.standUp(); H.setDay(0.5)
      document.getElementById('title')?.classList.add('hidden')
      document.querySelectorAll('body *').forEach((e) => { if (e.tagName !== 'CANVAS') e.style.visibility = 'hidden' })
      const obj = nm === 'boy' ? H.boy : H[nm]
      const px = obj.position.x, pz = obj.position.z, thFixed = (nm === 'boy') ? obj.rotation.y : 0
      if (window.__pinLoop) cancelAnimationFrame(window.__pinLoop)
      window.__freezeCam = true
      window.__poseFreeze = true // NPCの徘徊・頭の見回しを止めて正面で固定
      function pin() {
        obj.position.x = px; obj.position.z = pz; obj.rotation.y = thFixed
        if (obj.userData && obj.userData.head) obj.userData.head.rotation.set(0, 0, 0)
        obj.updateMatrixWorld(true)
        const head = (obj.userData && obj.userData.head) ? obj.userData.head : obj
        const hp = new THREE.Vector3(); head.getWorldPosition(hp)
        const dir = new THREE.Vector3(Math.sin(thFixed), 0, Math.cos(thFixed))
        H.camera.position.copy(hp).addScaledVector(dir, 0.56).add(new THREE.Vector3(0, -0.04, 0))
        H.camera.lookAt(hp.x, hp.y - 0.08, hp.z)
        window.__pinLoop = requestAnimationFrame(pin)
      }
      pin()
      return { nm, p: [px.toFixed(1), pz.toFixed(1)], thy: thFixed.toFixed(2) }
    }, name)
    console.log('DIAG', JSON.stringify(diag))
    await new Promise((r) => setTimeout(r, 450))
    await page.screenshot({ path: join(ROOT, '.verify', `face-${name}.png`), clip: { x: 120, y: 120, width: 240, height: 240 } })
    await page.evaluate(() => { if (window.__pinLoop) cancelAnimationFrame(window.__pinLoop); window.__pinLoop = 0; window.__poseFreeze = false; window.__freezeCam = false })
  }
  await page.close()
  console.log('face撮影完了')
} finally { await browser.close(); server.close() }
