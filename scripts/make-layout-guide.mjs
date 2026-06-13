// 画像生成用の「下敷き（レイアウト指針）」を作る。
// 16:9 のどこに地平線を置き、どこをキャラの歩く地面として空けるかを図示する。

import puppeteer from 'puppeteer-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', '.verify', 'layout-guide.png')

const draw = `() => {
  const W=1280,H=720
  const c=document.createElement('canvas'); c.width=W; c.height=H
  const x=c.getContext('2d')
  // 空（上から覗き込む高い画角なので空は上の細い帯）
  let g=x.createLinearGradient(0,0,0,H*0.42); g.addColorStop(0,'#A9CFE0'); g.addColorStop(1,'#CFE0DA')
  x.fillStyle=g; x.fillRect(0,0,W,H*0.42)
  // 地平線（高め）＝地面を広く
  const hy=H*0.42
  let gg=x.createLinearGradient(0,hy,0,H); gg.addColorStop(0,'#9FB873'); gg.addColorStop(1,'#7C9A5E')
  x.fillStyle=gg; x.fillRect(0,hy,W,H-hy)
  x.strokeStyle='#d33'; x.lineWidth=2; x.setLineDash([10,8])
  x.beginPath(); x.moveTo(0,hy); x.lineTo(W,hy); x.stroke()
  x.setLineDash([])
  // 歩ける地面ゾーン（地面の大部分）
  const wy0=H*0.46, wy1=H*0.95
  x.fillStyle='rgba(255,80,80,0.12)'; x.fillRect(0,wy0,W,wy1-wy0)
  x.strokeStyle='rgba(200,40,40,0.7)'; x.lineWidth=2; x.setLineDash([12,8])
  x.strokeRect(W*0.04,wy0,W*0.92,wy1-wy0); x.setLineDash([])
  // サンプルのキャラ（奥=小、手前=大）でスケール感
  function boy(px,py,h){ x.fillStyle='rgba(60,50,40,0.5)';
    x.beginPath(); x.ellipse(px,py,h*0.18,h*0.05,0,0,7); x.fill()
    x.fillStyle='#3F5A77'; x.fillRect(px-h*0.13,py-h*0.46,h*0.26,h*0.16)
    x.fillStyle='#F3F0E7'; x.fillRect(px-h*0.14,py-h*0.66,h*0.28,h*0.24)
    x.fillStyle='#E7B98E'; x.beginPath(); x.arc(px,py-h*0.8,h*0.12,0,7); x.fill()
    x.fillStyle='#DCB76C'; x.beginPath(); x.ellipse(px,py-h*0.86,h*0.2,h*0.06,0,0,7); x.fill() }
  boy(W*0.55, H*0.52, H*0.10) // 奥（小さい）
  boy(W*0.32, H*0.9, H*0.2) // 手前（大きい）
  // ラベル
  x.fillStyle='#b02020'; x.font='bold 26px sans-serif'
  x.fillText('地平線（画面の上から約42%）＝高い画角', 16, hy-12)
  x.fillText('← 地面を広く空ける（キャラが歩く） →', W*0.22, wy0+34)
  x.fillStyle='#2a3a6a'; x.font='bold 28px sans-serif'
  x.fillText('空は上の細い帯（雲・遠くの山はOK／人物・文字は不可）', 16, 40)
  x.fillStyle='#3a3024'; x.font='22px sans-serif'
  x.fillText('※少し見下ろす画角。キャラはゲーム側で重ねるので背景に人物は描かない。', 16, H-18)
  return c.toDataURL('image/png')
}`

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')
const dataUrl = await page.evaluate(`(${draw})()`)
writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'))
console.log('生成: ' + out)
await browser.close()
