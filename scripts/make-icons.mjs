// PWA用アイコン（ホーム画面追加時のアイコン）を生成する。
// 夏空＋太陽＋丘の素朴なモチーフを Edge headless で描いて PNG 化する。

import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const draw = `(size, round) => {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const x = c.getContext('2d')
  if (round) { x.beginPath(); x.arc(size/2,size/2,size/2,0,7); x.clip() }
  // 空
  const g = x.createLinearGradient(0,0,0,size)
  g.addColorStop(0,'#BFE3F0'); g.addColorStop(0.55,'#DCEBE4'); g.addColorStop(1,'#FCEFD2')
  x.fillStyle=g; x.fillRect(0,0,size,size)
  // 太陽
  x.fillStyle='#FFE9A8'; x.beginPath(); x.arc(size*0.68,size*0.34,size*0.16,0,7); x.fill()
  // 丘
  x.fillStyle='#9FB873'
  x.beginPath(); x.moveTo(0,size*0.72)
  x.quadraticCurveTo(size*0.35,size*0.56,size*0.62,size*0.66)
  x.quadraticCurveTo(size*0.85,size*0.72,size,size*0.6)
  x.lineTo(size,size); x.lineTo(0,size); x.closePath(); x.fill()
  x.fillStyle='#6E8A57'
  x.beginPath(); x.moveTo(0,size*0.82)
  x.quadraticCurveTo(size*0.4,size*0.74,size,size*0.8)
  x.lineTo(size,size); x.lineTo(0,size); x.closePath(); x.fill()
  return c.toDataURL('image/png')
}`

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')
await page.evaluate(`window.__draw = ${draw}`)

const targets = [
  { name: 'icon-192.png', size: 192, round: false },
  { name: 'icon-512.png', size: 512, round: false },
  { name: 'apple-touch-icon.png', size: 180, round: false },
]
for (const t of targets) {
  const dataUrl = await page.evaluate((s, r) => window.__draw(s, r), t.size, t.round)
  const b64 = dataUrl.split(',')[1]
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(outDir, t.name), Buffer.from(b64, 'base64'))
  console.log(`生成: ${t.name}`)
}
await browser.close()
