// 自己検証スクリプト（CLAUDE.md の「実装後の自己検証必須」用）。
// dist/ を自前の静的サーバ(127.0.0.1)で配信し、Edge を headless で起動して
//   ・コンソールエラー / ページ例外が出ないこと（favicon の 404 は除外）
//   ・各時間帯のスクリーンショット（空の色の確認用）
// をチェックする。vite preview を介さないので環境依存の不一致が起きにくい。
//
// 使い方:  npm run build したあとに  node scripts/verify.mjs

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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
}

// dist/ を BASE 配下で配信する素朴な静的サーバ
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0])
    if (path.startsWith(BASE)) path = path.slice(BASE.length - 1)
    if (path === '/' || path === '') path = '/index.html'
    const file = join(DIST, path)
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const baseUrl = `http://127.0.0.1:${port}${BASE}`
console.log(`静的サーバ: ${baseUrl}`)

// 観察する時刻（朝・昼・夕方・夜）と画面サイズ（PC横・スマホ横）
const TIMES = [
  { name: 'morning', t: 0.0 },
  { name: 'noon', t: 0.3 },
  { name: 'evening', t: 0.62 },
  { name: 'night', t: 0.9 },
]
const VIEWPORTS = [
  { name: 'pc', width: 1280, height: 720 },
  { name: 'phone', width: 740, height: 360 },
]

const errors = []
let checkedCanvas = false

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox'],
})

try {
  for (const vp of VIEWPORTS) {
    for (const time of TIMES) {
      const page = await browser.newPage()
      await page.setViewport({ width: vp.width, height: vp.height })

      page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().includes('favicon')) {
          errors.push(`[${vp.name}/${time.name}] console: ${msg.text()}`)
        }
      })
      page.on('pageerror', (err) => {
        errors.push(`[${vp.name}/${time.name}] pageerror: ${err.message}`)
      })
      page.on('response', (res) => {
        if (res.status() >= 400 && !res.url().includes('favicon')) {
          errors.push(`[${vp.name}/${time.name}] ${res.status()}: ${res.url()}`)
        }
      })

      await page.goto(`${baseUrl}?t=${time.t}&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
      await new Promise((r) => setTimeout(r, 600))

      // 1度だけ、CSSとCanvasが効いているかを実測（描画が崩れていないかの裏取り）
      if (!checkedCanvas) {
        checkedCanvas = true
        const info = await page.evaluate(() => {
          const c = document.querySelector('#scene')
          const btn = document.querySelector('#start-button')
          return {
            canvasW: c ? c.width : -1,
            btnRadius: btn ? getComputedStyle(btn).borderRadius : '(none)',
            bodyOverflow: getComputedStyle(document.body).overflow,
          }
        })
        console.log('描画チェック:', JSON.stringify(info))
        if (info.canvasW < 400) errors.push('Canvasが実サイズに広がっていない（JS未実行の疑い）')
        if (info.btnRadius === '0px') errors.push('CSSが適用されていない（スタイル未読込の疑い）')
      }

      const file = join(outDir, `${vp.name}-${time.name}.png`)
      await page.screenshot({ path: file })
      console.log(`撮影: ${file}`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}

if (errors.length) {
  console.error('\n❌ エラーを検出しました:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
} else {
  console.log('\n✅ コンソールエラー / ページ例外なし・描画チェックOK')
}
