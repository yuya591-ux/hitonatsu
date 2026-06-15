// 3D試作(proto3d.html)の確認用スクリーンショット。
// 使い方: npm run build のあと  node scripts/shot-proto3d.mjs
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
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.json': 'application/json', '.ico': 'image/x-icon' }

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0])
    if (path.startsWith(BASE)) path = path.slice(BASE.length - 1)
    if (path === '/' || path === '') path = '/index.html'
    const body = await readFile(join(DIST, path))
    res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, path))] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end('not found') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const baseUrl = `http://127.0.0.1:${port}${BASE}`

const errors = []
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('status of 404')) errors.push(`console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'networkidle0', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 2500))
  const gl = await page.evaluate(() => !!window.__proto3d)
  console.log(`3D初期化: ${gl ? 'OK' : 'NG'}`)
  // タイトルを閉じて環境音を起動
  await page.evaluate(() => { window.__proto3d.startAudio(); document.getElementById('title')?.classList.add('hidden') })
  await new Promise((r) => setTimeout(r, 1200))
  const audio = await page.evaluate(() => window.__proto3d.audioState())
  console.log(`環境音: started=${audio.started} ctx=${audio.ctx} loaded=${audio.loaded} playing=[${audio.playing.join(',')}]`)
  if (audio.loaded < 4) errors.push(`環境音の読み込み不足（loaded=${audio.loaded}）`)
  if (!audio.playing.length) errors.push('環境音が再生されていない')
  // ジャンプ：跳ねて地面より高くなる。固定180ms snapshotは重いシーンで描画が遅いと1フレームしか進まず
  // 誤検知するため、時間方向にサンプルして「ピーク高さ」で判定する（堅牢化）。
  await page.evaluate(() => { window.__proto3d.setDay(0.4); window.__proto3d.placeBoy(8, 8) })
  await new Promise((r) => setTimeout(r, 300))
  const y0 = await page.evaluate(() => window.__proto3d.boy.position.y)
  await page.evaluate(() => window.__proto3d._jump())
  let yPeak = y0
  for (let i = 0; i < 14; i++) { await new Promise((r) => setTimeout(r, 50)); const y = await page.evaluate(() => window.__proto3d.boy.position.y); if (y > yPeak) yPeak = y }
  console.log(`ジャンプテスト: 地上=${y0.toFixed(2)} → ピーク=${yPeak.toFixed(2)} ${yPeak - y0 > 0.5 ? 'OK' : 'NG'}`)
  if (yPeak - y0 < 0.5) errors.push('ジャンプで跳ねていない')
  for (const [t, tag] of [[0.22, 'asa'], [0.5, 'hiru'], [0.74, 'yu'], [0.97, 'yoru']]) {
    await page.evaluate((tt) => window.__proto3d.setDay(tt), t)
    await new Promise((r) => setTimeout(r, 700))
    await page.screenshot({ path: join(outDir, `proto3d-${tag}.png`) })
    console.log(`撮影: proto3d-${tag}.png`)
  }
  // 座って景色を見回す（昼）
  await page.evaluate(() => { window.__proto3d.setDay(0.4); window.__proto3d.sitDown() })
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: join(outDir, 'proto3d-sit.png') })
  console.log('撮影: proto3d-sit.png')
  // 寝ころんで空を見る（昼・原っぱの開けた場所で）
  await page.evaluate(() => { window.__proto3d.standUp(); window.__proto3d.boy.position.set(10, 0, 8); window.__proto3d.setDay(0.35); window.__proto3d.lieDown() })
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: join(outDir, 'proto3d-lie.png') })
  console.log('撮影: proto3d-lie.png')
  // 木漏れ日：夕方、太陽の方を向く
  await page.evaluate(() => { window.__proto3d.standUp(); window.__proto3d.aimSun(0.7) })
  await new Promise((r) => setTimeout(r, 1800))
  await page.screenshot({ path: join(outDir, 'proto3d-godray.png') })
  console.log('撮影: proto3d-godray.png')
  // 夕方のカラス：夕焼け空を見上げる
  await page.evaluate(() => window.__proto3d.aimSky(0.74))
  await new Promise((r) => setTimeout(r, 1000))
  const crowN = await page.evaluate(() => window.__proto3d.crowsVisible())
  console.log(`カラステスト: 画面内のカラス=${crowN}`)
  if (crowN < 1) errors.push('夕方のカラスが空に見えていない')
  await page.screenshot({ path: join(outDir, 'proto3d-crow.png') })
  console.log('撮影: proto3d-crow.png')
  // 池（水面）：池の北側に立つと手前に水面が入る
  await page.evaluate(() => { window.__proto3d.setDay(0.45); window.__proto3d.placeBoy(26, 29) })
  await new Promise((r) => setTimeout(r, 1200))
  await page.screenshot({ path: join(outDir, 'proto3d-pond.png') })
  console.log('撮影: proto3d-pond.png')
  // 池に入れない：中心へ置いても岸へ押し戻される
  await page.evaluate(() => window.__proto3d.placeBoy(26, 18))
  await new Promise((r) => setTimeout(r, 400))
  const pondDist = await page.evaluate(() => { const b = window.__proto3d.boy.position; return Math.round(Math.hypot(b.x - 26, b.z - 18) * 10) / 10 })
  console.log(`池ブロックテスト: 中心からの距離=${pondDist}（>=9なら岸でとまっている）`)
  if (pondDist < 9) errors.push('池に入れてしまう（岸でとまらない）')
  // 昭和の田舎家（縁側）
  await page.evaluate(() => { window.__proto3d.setDay(0.6); window.__proto3d.placeBoy(-17, 23) })
  await new Promise((r) => setTimeout(r, 1200))
  await page.screenshot({ path: join(outDir, 'proto3d-house.png') })
  console.log('撮影: proto3d-house.png')
  // 当たり判定：家の中に置いても外へ押し戻される
  await page.evaluate(() => window.__proto3d.placeBoy(-16, 13))
  await new Promise((r) => setTimeout(r, 350))
  const houseDist = await page.evaluate(() => { const b = window.__proto3d.boy.position; return Math.round(Math.hypot(b.x + 17, b.z - 13) * 10) / 10 })
  console.log(`当たり判定テスト: 家の中心からの距離=${houseDist}（>=2.6なら通り抜けない）`)
  if (houseDist < 2.6) errors.push('家をすり抜けてしまう（当たり判定なし）')
  // うろつく猫（家のまわり）
  await page.evaluate(() => { window.__proto3d.standUp(); window.__proto3d.setDay(0.45); window.__proto3d.placeBoy(-10, 21) })
  await new Promise((r) => setTimeout(r, 600))
  await page.screenshot({ path: join(outDir, 'proto3d-cat.png') })
  console.log('撮影: proto3d-cat.png')
  // 縁側にすわって庭を眺める
  await page.evaluate(() => { window.__proto3d.setDay(0.62); window.__proto3d.sitDown('engawa') })
  await new Promise((r) => setTimeout(r, 1500))
  await page.screenshot({ path: join(outDir, 'proto3d-engawa.png') })
  console.log('撮影: proto3d-engawa.png')
  await page.evaluate(() => window.__proto3d.standUp())
  // 村の人と会話
  await page.evaluate(() => { window.__proto3d.setDay(0.4); const v = window.__proto3d.villager; window.__proto3d.placeBoy(v.position.x, v.position.z + 2.4) })
  await new Promise((r) => setTimeout(r, 900))
  await page.evaluate(() => window.__proto3d.talk())
  await new Promise((r) => setTimeout(r, 600))
  const talking = await page.evaluate(() => document.getElementById('dialogue').style.display === 'block' && document.getElementById('dlg-text').textContent.length > 0)
  console.log(`会話テスト: ${talking ? 'OK' : 'NG'}`)
  if (!talking) errors.push('村の人と会話できていない')
  await page.screenshot({ path: join(outDir, 'proto3d-talk.png') })
  console.log('撮影: proto3d-talk.png')
  // 会話を閉じる（以降のテストに残さない）
  for (let i = 0; i < 4; i++) { await page.evaluate(() => document.getElementById('dialogue').click()); await new Promise((r) => setTimeout(r, 120)) }
  // 虫採り（カブトムシのそばで つかまえる）
  await page.evaluate(() => { window.__proto3d.standUp(); window.__proto3d.placeBoy(14, 8) })
  await new Promise((r) => setTimeout(r, 700))
  await page.evaluate(() => window.__proto3d.doCatch())
  const caughtN = await page.evaluate(() => window.__proto3d.caught)
  console.log(`虫採りテスト: つかまえた数=${caughtN}`)
  if (caughtN < 1) errors.push('虫をつかまえられない')
  // 往来：野原の門のボタンを押して、歩いて町へ抜ける（ぷつっと切り替わらない）
  await page.evaluate(() => { const H = window.__proto3d; H.standUp(); H.setDay(0.42); H.placeBoy(42, 30) })
  await new Promise((r) => setTimeout(r, 500))
  await page.screenshot({ path: join(outDir, 'proto3d-gate.png') }) // 野原の門＋町へ続く道
  console.log('撮影: proto3d-gate.png')
  await page.evaluate(() => window.__proto3d.placeBoy(42, 33))
  await new Promise((r) => setTimeout(r, 300))
  const goShown = await page.evaluate(() => document.getElementById('go').style.display === 'block')
  await page.evaluate(() => document.getElementById('go').click())
  await new Promise((r) => setTimeout(r, 700))
  await page.screenshot({ path: join(outDir, 'proto3d-travel.png') }) // 歩き抜けの途中
  await new Promise((r) => setTimeout(r, 900))
  const walked = await page.evaluate(() => ({ area: window.__proto3d.area, bx: window.__proto3d.boy.position.x | 0 }))
  console.log(`歩き往来テスト: 門ボタン=${goShown ? 'OK' : 'NG'} → ${walked.area}(x=${walked.bx})`)
  if (!goShown || walked.area !== 'town') errors.push('門から町へ歩いて往来できない')
  console.log('撮影: proto3d-travel.png')
  // 野原→神社の往来（複数エリア対応の門システム）
  await page.evaluate(() => { const H = window.__proto3d; H.goArea('field'); H.placeBoy(-40, 35) })
  await new Promise((r) => setTimeout(r, 350))
  const shGate = await page.evaluate(() => { const g = document.getElementById('go'); return g.style.display === 'block' ? g.textContent : '' })
  await page.evaluate(() => document.getElementById('go').click())
  await new Promise((r) => setTimeout(r, 1500))
  const shArea = await page.evaluate(() => window.__proto3d.area)
  console.log(`神社往来テスト: 門ボタン=「${shGate}」 → ${shArea}`)
  if (shGate !== '神社へ →' || shArea !== 'shrine') errors.push('野原から神社へ往来できない')
  await page.screenshot({ path: join(outDir, 'proto3d-shrine-arrive.png') })
  // 絵日記（その日やったこと→翌日への予告）
  await page.evaluate(() => { window.__proto3d.openDiary() })
  await new Promise((r) => setTimeout(r, 500))
  const diaryShown = await page.evaluate(() => document.getElementById('diary').style.display === 'flex' && document.getElementById('diary-body').children.length > 0)
  console.log(`絵日記テスト: ${diaryShown ? 'OK' : 'NG'}（${await page.evaluate(() => window.__proto3d.day)}にちめ）`)
  if (!diaryShown) errors.push('絵日記が表示されない')
  await page.screenshot({ path: join(outDir, 'proto3d-diary.png') })
  console.log('撮影: proto3d-diary.png')
  // 住宅街エリア（往来先・ドラえもん的）
  await page.evaluate(() => { document.getElementById('diary').style.display = 'none'; const H = window.__proto3d; H.standUp(); H.setGameDay(1); H.setDay(0.4); H.goArea('town') })
  await new Promise((r) => setTimeout(r, 1000))
  const inTown = await page.evaluate(() => window.__proto3d.area === 'town')
  console.log(`往来テスト: 街エリア=${inTown ? 'OK' : 'NG'}`)
  if (!inTown) errors.push('街エリアへ移動できない')
  await page.screenshot({ path: join(outDir, 'proto3d-town.png') })
  console.log('撮影: proto3d-town.png')
  // 自販機でラムネを買う
  await page.evaluate(() => window.__proto3d.placeBoy(1003, 16))
  await new Promise((r) => setTimeout(r, 500))
  const buyBtn = await page.evaluate(() => { const n = document.getElementById('npc'); return n.style.display === 'block' ? n.textContent : '' })
  await page.evaluate(() => document.getElementById('npc').click())
  await new Promise((r) => setTimeout(r, 300))
  const bought = await page.evaluate(() => document.getElementById('toast').textContent.includes('ラムネ'))
  console.log(`ラムネ購入テスト: ボタン=「${buyBtn}」 買えた=${bought ? 'OK' : 'NG'}`)
  if (buyBtn !== 'ラムネを買う' || !bought) errors.push('自販機でラムネを買えない')
  await page.screenshot({ path: join(outDir, 'proto3d-vending.png') })
  console.log('撮影: proto3d-vending.png')
  // 見晴らしベンチ／ブランチ：頂上で「街を ながめる」、ブランコで「のる」
  await page.evaluate(() => window.__proto3d.sitDown('mtview'))
  await new Promise((r) => setTimeout(r, 700))
  const overlook = await page.evaluate(() => window.__proto3d.modeNow === 'sit')
  await page.screenshot({ path: join(outDir, 'proto3d-overlook.png') })
  console.log(`一望テスト: ${overlook ? 'OK' : 'NG'}`)
  if (!overlook) errors.push('頂上ベンチに座れない')
  await page.evaluate(() => window.__proto3d.standUp())
  await page.evaluate(() => window.__proto3d.placeBoy(984, 34.4))
  await new Promise((r) => setTimeout(r, 400))
  const swingBtn = await page.evaluate(() => { const a = document.getElementById('act'); return a.style.display === 'block' ? a.textContent : '' })
  await page.evaluate(() => window.__proto3d.rideSwing())
  let yMin = Infinity, yMax = -Infinity, modeOk = true
  for (let i = 0; i < 12; i++) { // 1.8秒かけて高さの振れ幅を測る
    await new Promise((r) => setTimeout(r, 150))
    const s = await page.evaluate(() => ({ m: window.__proto3d.modeNow, y: window.__proto3d.camera.position.y }))
    if (s.m !== 'swing') modeOk = false
    yMin = Math.min(yMin, s.y); yMax = Math.max(yMax, s.y)
  }
  const swung = modeOk && (yMax - yMin) > 0.1 // 視点が上下にあおられている
  console.log(`ブランコテスト: ボタン=「${swingBtn}」 揺れ幅=${(yMax - yMin).toFixed(2)} ${swung ? 'OK' : 'NG'}`)
  if (swingBtn !== 'ブランコに のる' || !swung) errors.push('ブランコに乗って揺れない')
  await page.screenshot({ path: join(outDir, 'proto3d-swing.png') })
  await page.evaluate(() => window.__proto3d.standUp())
  // 空き地の土管＋近所の子
  await page.evaluate(() => { window.__proto3d.placeBoy(972, 21) })
  await new Promise((r) => setTimeout(r, 900))
  await page.screenshot({ path: join(outDir, 'proto3d-lot.png') })
  console.log('撮影: proto3d-lot.png')
  // 3日目の夜＝おまつり（提灯＋花火）
  await page.evaluate(() => {
    const H = window.__proto3d
    document.getElementById('diary').style.display = 'none'
    H.standUp(); H.setGameDay(3); H.setDay(0.95); H.placeBoy(-15, 22)
    for (let i = 0; i < 5; i++) H.spawnFirework()
  })
  await new Promise((r) => setTimeout(r, 700))
  await page.screenshot({ path: join(outDir, 'proto3d-festival.png') })
  console.log('撮影: proto3d-festival.png')
  // 夏の終わり：3日目に女の子と会うと おまもりをもらい、最後の絵日記に結ばれる
  await page.evaluate(() => { const H = window.__proto3d; document.getElementById('diary').style.display = 'none'; H.setGameDay(3); H.setDay(0.5); H.goArea('field'); const v = H.villager; H.placeBoy(v.position.x, v.position.z + 2.2) })
  await new Promise((r) => setTimeout(r, 500))
  await page.evaluate(() => window.__proto3d.talk())
  await new Promise((r) => setTimeout(r, 250))
  for (let i = 0; i < 4; i++) { await page.evaluate(() => document.getElementById('dialogue').click()); await new Promise((r) => setTimeout(r, 100)) }
  await page.evaluate(() => window.__proto3d.openDiary())
  await new Promise((r) => setTimeout(r, 400))
  const ending = await page.evaluate(() => ({ title: document.getElementById('diary-title').textContent, body: document.getElementById('diary-body').textContent }))
  const okEnd = ending.title.includes('おわった') && ending.body.includes('おまもり')
  console.log(`夏の終わりテスト: ${okEnd ? 'OK' : 'NG'}（${ending.title}）`)
  if (!okEnd) errors.push('3日目に女の子と会っても おまもりの結びが出ない')
  await page.screenshot({ path: join(outDir, 'proto3d-ending.png') })
  console.log('撮影: proto3d-ending.png')
  await page.close()
} finally {
  await browser.close()
  server.close()
}
if (errors.length) { console.log('\n❌ エラー:'); for (const e of errors) console.log('  - ' + e); process.exitCode = 1 }
else console.log('\n✅ コンソールエラーなし')
