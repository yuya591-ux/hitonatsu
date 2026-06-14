// 一枚絵から「男の子だけ」を切り抜く（背景を縁から領域成長で透過に）。使い捨て。
// 使い方: node scripts/cutout.mjs <入力画像パス> <出力PNGパス>
import puppeteer from 'puppeteer-core'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, extname } from 'node:path'

const SRC = process.argv[2]
const OUT = process.argv[3] || './.verify/boy-cut.png'
const TOL = Number(process.argv[4] || 46) // 背景とみなす色の近さ
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const buf = await readFile(SRC)
const ext = extname(SRC).slice(1).toLowerCase()
const dataURL = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  const result = await page.evaluate(async (dataURL, TOL) => {
    const img = new Image(); img.src = dataURL; await img.decode()
    const w = img.naturalWidth, h = img.naturalHeight
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const id = ctx.getImageData(0, 0, w, h), d = id.data
    const visited = new Uint8Array(w * h)
    const stack = []
    const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = y * w + x; if (visited[i]) return; visited[i] = 1; stack.push(i) }
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
    const near = (i, j) => { const a = i * 4, b = j * 4; const dr = d[a] - d[b], dg = d[a + 1] - d[b + 1], db = d[a + 2] - d[b + 2]; return (dr * dr + dg * dg + db * db) < TOL * TOL }
    const fill = new Uint8Array(w * h) // 1=背景（透過にする）
    while (stack.length) {
      const i = stack.pop(); fill[i] = 1
      const x = i % w, y = (i / w) | 0
      const ns = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
      for (const [nx, ny] of ns) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (visited[j]) continue
        if (near(i, j)) { visited[j] = 1; stack.push(j) }
      }
    }
    // 前景の浮いたゴミ（虫・落ちている小物）を消す＝不透明画素の連結成分のうち、
    // 画面中央を含む最大の塊（＝男の子）だけ残す
    const label = new Int32Array(w * h).fill(-1)
    let best = -1, bestSize = 0
    const cxI = (w / 2) | 0, cyI = (h * 0.45) | 0
    let cur = 0
    const q = []
    for (let s = 0; s < w * h; s++) {
      if (fill[s] || label[s] >= 0) continue
      label[s] = cur; q.length = 0; q.push(s); let size = 0; let hasCenter = false
      while (q.length) {
        const i = q.pop(); size++
        const x = i % w, y = (i / w) | 0
        if (Math.abs(x - cxI) < w * 0.12 && Math.abs(y - cyI) < h * 0.3) hasCenter = true
        const ns = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
        for (const [nx, ny] of ns) { if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (!fill[j] && label[j] < 0) { label[j] = cur; q.push(j) } }
      }
      // 中央を含む塊を最優先。なければ最大の塊
      const score = size + (hasCenter ? w * h : 0)
      if (score > bestSize) { bestSize = score; best = cur }
      cur++
    }
    let minX = w, minY = h, maxX = 0, maxY = 0
    for (let i = 0; i < w * h; i++) {
      if (label[i] !== best) { d[i * 4 + 3] = 0 } else {
        const x = i % w, y = (i / w) | 0
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
    ctx.putImageData(id, 0, 0)
    // 余白を切り詰め
    const pad = 6
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad)
    const cw = maxX - minX + 1, ch = maxY - minY + 1
    const out = document.createElement('canvas')
    const scale = Math.min(1, 640 / ch)
    out.width = Math.round(cw * scale); out.height = Math.round(ch * scale)
    out.getContext('2d').drawImage(cv, minX, minY, cw, ch, 0, 0, out.width, out.height)
    return { url: out.toDataURL('image/png'), w: out.width, h: out.height }
  }, dataURL, TOL)
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, Buffer.from(result.url.split(',')[1], 'base64'))
  console.log(`切り抜き完了: ${OUT}  (${result.w}x${result.h})`)
  await page.close()
} finally { await browser.close() }
