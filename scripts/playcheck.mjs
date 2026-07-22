// 実操作巡回（playcheck）＝★恒久ルール（memory: actual-play-patrol-2026-07-21）を道具化。
//   修正のたび最後に「実際にキー操作でキャラを歩かせて」①俯瞰 ②主観 の2視点で巡回し、
//   点の当たり判定だけでは見逃す重大バグ（屋上ワープ・行動ボタンの死にコード等）を捕まえる。
// この版は自宅の入退室動線を“実際に歩いて”検証し、異常は exit 1 で落とす回帰ゲート：
//   巡回A＝マンションに歩いて食い込んでも屋上へ飛ばない（Yが屋上高へ跳ねない）
//   巡回B＝玄関前で「ただいま」が出る→押す→自宅の床(Y≈120)に着く→前進で家の中へ
// headlessのRAFはゆっくり＝キーは長めに押す。俯瞰/主観の実写も .verify に残す。
//   使い方:  node scripts/playcheck.mjs        （先に vite build。npm run playcheck はビルド込み）
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { resolveBrowser } from './browser-path.mjs' // ブラウザ解決は共有ヘルパー1箇所（分岐禁止・CI事故対策）
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const DIST = join(ROOT, 'dist'); const BASE = '/hitonatsu/'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.vrm': 'application/octet-stream' }
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length - 1); if (p === '/' || p === '') p = '/index.html'; const body = await readFile(join(DIST, p)); res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, p))] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end('x') } })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}${BASE}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let bad = 0
const browser = await puppeteer.launch({ executablePath: resolveBrowser(ROOT), headless: 'new', userDataDir: join(ROOT, '.verify', `_edge-play-${process.pid}`), args: ['--no-sandbox', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] })
const st = (page) => page.evaluate(() => { const P = window.__proto3d; return { x: +P.boy.position.x.toFixed(1), y: +P.boy.position.y.toFixed(1), z: +P.boy.position.z.toFixed(1), cy: P.boy.userData._cy == null ? null : +P.boy.userData._cy.toFixed(1), inPoly: P._inSunPoly(P.boy.position.x, P.boy.position.z), act: (document.getElementById('act') || {}).textContent } })
const shot = async (page, name) => { await page.evaluate(() => { for (const el of document.body.children) { if (el.tagName !== 'CANVAS') el.style.visibility = 'hidden' } }); await page.screenshot({ path: join(ROOT, '.verify', name) }); await page.evaluate(() => { for (const el of document.body.children) { if (el.tagName !== 'CANVAS') el.style.visibility = '' } }) }
async function walk(page, key, secs) { await page.keyboard.down(key); const t0 = Date.now(); let last = null; while (Date.now() - t0 < secs * 1000) { await sleep(700); last = await st(page) } await page.keyboard.up(key); return last }
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1000, height: 640, deviceScaleFactor: 1.5 })
  page.on('pageerror', (e) => { console.log('  [pageerror]', String(e.message || e).slice(0, 160)); bad++ })
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__proto3d && window.__proto3d.boy && window.__proto3d._inSunPoly && window.__proto3d._home))); i++) await sleep(100)
  for (let i = 0; i < 200 && !(await page.evaluate(() => { const b = document.getElementById('t-start'); return b && !b.disabled })); i++) await sleep(100)
  await page.evaluate(() => { const t = document.getElementById('t-start'); if (t) t.click(); const g = document.getElementById('guide-ok'); if (g) g.click(); const gd = document.getElementById('guide'); if (gd) gd.style.display = 'none'; window.__proto3d.setDay(0.5) })
  await sleep(1500); await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.focus() })

  console.log('\n=== 巡回A：マンションに歩いて食い込む→屋上へ飛ばないか ===')
  const tops = await page.evaluate(() => window.__proto3d._roofTops())
  await page.evaluate(() => { const P = window.__proto3d; P.boy.position.set(3006, 46, 20); P.boy.userData._cy = null; P._setYaw(0); P.boy.rotation.y = 0 })
  await sleep(1200)
  const a = await walk(page, 'ArrowUp', 9)
  const okA = a && a.y < tops.sun - 8
  console.log(` 屋上top=${tops.sun} 歩行後=${JSON.stringify(a)} → ${okA ? '✅ 地上に留まる' : '✗ NG 屋上へワープ'}`)
  if (!okA) bad++
  await page.evaluate(() => { window.__proto3d._pose && window.__proto3d._pose() }); await sleep(200); await shot(page, 'playcheck_A_intobuilding.png')

  console.log('\n=== 巡回B：「ただいま」→駐車場→109→家 を実際に歩く ===')
  await page.evaluate(() => { const P = window.__proto3d; P._home(false); P._setYaw(Math.PI) })
  await sleep(1500)
  const s0 = await st(page); const hasTadaima = /ただいま/.test(s0.act || '')
  console.log(` 玄関ドア前=${JSON.stringify(s0)} → 「ただいま」ボタン ${hasTadaima ? '✅ 出ている' : '✗ NG 出ていない（行動ボタンの死にコード疑い）'}`)
  if (!hasTadaima) bad++
  const clicked = await page.evaluate(() => { const b = document.getElementById('act'); if (b && /ただいま/.test(b.textContent || '')) { b.click(); return true } return false })
  await sleep(2000)
  const s1 = await st(page); const inHome = s1.y > 100
  console.log(` 押した=${clicked} 着地=${JSON.stringify(s1)} → ${inHome ? '✅ 自宅の床(Y≈120)に着いた' : '✗ NG 家に入れていない'}`)
  if (!inHome) bad++
  await page.evaluate(() => { const P = window.__proto3d; window.__freezeCam = true; const b = P.boy.position; P._lookAt(b.x, b.y + 1.4, b.z, b.x, b.y + 1.1, b.z + 8, 'yato'); if (P.scene.fog) { P.scene.fog.near = 900; P.scene.fog.far = 2000 } })
  await sleep(400); await shot(page, 'playcheck_B_fpv_parking.png')
  await page.evaluate(() => { window.__freezeCam = false })
  const b2 = await walk(page, 'ArrowUp', 10)
  console.log(` 前進後=${JSON.stringify(b2)}`)
  await page.evaluate(() => { const P = window.__proto3d; const H = P.scene.getObjectByName('home109'); const HY = 120; if (H) H.traverse((o) => { if (o.isMesh && o.position.y > HY + 2.0) o.visible = false }); window.__freezeCam = true; P._lookAt(4300, HY + 44, 2200 + 4, 4300, HY, 2200 - 1, 'yato'); if (P.scene.fog) { P.scene.fog.near = 900; P.scene.fog.far = 3000 } })
  await sleep(400); await shot(page, 'playcheck_B_top_walked.png')

  console.log('\n' + (bad === 0 ? '✅ playcheck 合格：屋上ワープなし・「ただいま」で入室・自宅の床に着く（俯瞰/主観の実写は .verify）' : `❌ playcheck 不合格：${bad} 件`))
} catch (e) { console.log('FATAL', e.stack || e.message); bad++ } finally { await browser.close(); server.close() }
process.exit(bad === 0 ? 0 : 1)
