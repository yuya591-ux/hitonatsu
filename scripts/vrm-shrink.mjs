// VRM(GLB)のテクスチャをオフラインで縮小して再パックする軽量化ツール（2026-07-07 iPhoneクラッシュ対策）
// - 全画像を最大1024pxへ縮小（縮小はヘッドレスブラウザのcanvasで実施）
// - 法線マップ(_BumpMap)が参照する画像は1x1に置換（トゥーンでは未使用＝実行時もnull化している）
// - ジオメトリ等のbufferViewは無傷でコピー＝GLBを正しく再構築
// 使い方: node scripts/vrm-shrink.mjs public/models/xxx.vrm  （元ファイルは .verify/_orig/ に退避）
import puppeteer from 'puppeteer-core'
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { resolveBrowser } from './browser-path.mjs'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX = 1024
const ONE_PX_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/vrm-shrink.mjs <path.vrm>'); process.exit(1) }
const buf = await readFile(file)
if (buf.readUInt32LE(0) !== 0x46546c67) { console.error('GLBではありません'); process.exit(1) }
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
const binStart = 20 + jsonLen + 8
const binLen = buf.readUInt32LE(20 + jsonLen)
const bin = buf.slice(binStart, binStart + binLen)

// 法線マップが参照する画像index（VRM0のmaterialProperties._BumpMap → textures[].source）
const bumpImages = new Set()
const mps = json.extensions?.VRM?.materialProperties || []
for (const mp of mps) { const ti = mp.textureProperties?._BumpMap
  if (ti != null && json.textures?.[ti]) bumpImages.add(json.textures[ti].source) }
// サムネイル（メタ表示用＝ゲームでは未使用）は256pxまで落とす
const thumbTex = json.extensions?.VRM?.meta?.texture
const thumbImage = (thumbTex != null && json.textures?.[thumbTex]) ? json.textures[thumbTex].source : -1

// ブラウザで縮小（createImageBitmap+canvas）
const browser = await puppeteer.launch({ executablePath: resolveBrowser(ROOT), headless: 'new', userDataDir: join(ROOT, '.verify', `_edge-${process.pid}`), args: ['--no-sandbox', '--no-first-run'] })
const page = await (await browser).newPage()
await page.goto('about:blank')
const shrink = async (bytes, mime, max) => {
  const b64 = bytes.toString('base64')
  const out = await page.evaluate(async ({ b64, mime, max }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const bmp = await createImageBitmap(new Blob([bin], { type: mime }))
    const sc = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const cv = document.createElement('canvas')
    cv.width = Math.max(1, Math.round(bmp.width * sc)); cv.height = Math.max(1, Math.round(bmp.height * sc))
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close()
    // 透明画素が無ければJPEGの方が大幅に小さい（髪や顔パーツの透過はPNGのまま）
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
    let opaque = true
    for (let i = 3; i < d.length; i += 64) if (d[i] < 250) { opaque = false; break }
    const png = cv.toDataURL('image/png')
    const jpg = opaque ? cv.toDataURL('image/jpeg', 0.85) : null
    const best = jpg && jpg.length < png.length ? jpg : png
    return { b64: best.split(',')[1], mime: best.slice(5, best.indexOf(';')) }
  }, { b64, mime, max })
  return { bytes: Buffer.from(out.b64, 'base64'), mime: out.mime }
}

// 画像ごとの新バイト列を決める
const images = json.images || []
const newImageBytes = new Map() // bufferView index -> Buffer
for (let i = 0; i < images.length; i++) {
  const img = images[i]; if (img.bufferView == null) continue
  const bv = json.bufferViews[img.bufferView]
  const bytes = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)
  if (bumpImages.has(i)) { newImageBytes.set(img.bufferView, ONE_PX_PNG); img.mimeType = 'image/png'; console.log(`  nml→1px: ${img.name}`); continue }
  const r = await shrink(bytes, img.mimeType || 'image/png', i === thumbImage ? 256 : MAX)
  if (r.bytes.length < bytes.length) { newImageBytes.set(img.bufferView, r.bytes); img.mimeType = r.mime
    console.log(`  縮小: ${img.name} ${(bytes.length / 1024).toFixed(0)}KB → ${(r.bytes.length / 1024).toFixed(0)}KB (${r.mime})`) }
}
await browser.close()

// BINを再構築（全bufferViewを順にコピー・画像だけ差し替え・4バイト整列）
const parts = []
let off = 0
for (const bv of json.bufferViews) {
  const data = newImageBytes.get(json.bufferViews.indexOf(bv)) ?? bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)
  bv.byteOffset = off; bv.byteLength = data.length
  parts.push(data)
  off += data.length
  const pad = (4 - (off % 4)) % 4
  if (pad) { parts.push(Buffer.alloc(pad)); off += pad }
}
json.buffers[0].byteLength = off
const newBin = Buffer.concat(parts, off)
let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
const jpad = (4 - (jsonBuf.length % 4)) % 4
if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' '.repeat(jpad))])
const total = 12 + 8 + jsonBuf.length + 8 + newBin.length
const head = Buffer.alloc(12 + 8); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8)
head.writeUInt32LE(jsonBuf.length, 12); head.writeUInt32LE(0x4e4f534a, 16)
const binHead = Buffer.alloc(8); binHead.writeUInt32LE(newBin.length, 0); binHead.writeUInt32LE(0x004e4942, 4)
// 元を退避してから上書き
await mkdir(join(ROOT, '.verify', '_orig'), { recursive: true })
await copyFile(file, join(ROOT, '.verify', '_orig', basename(file)))
await writeFile(file, Buffer.concat([head, jsonBuf, binHead, newBin]))
console.log(`${basename(file)}: ${(buf.length / 1048576).toFixed(1)}MB → ${(total / 1048576).toFixed(1)}MB`)
