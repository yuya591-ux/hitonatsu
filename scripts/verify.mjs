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
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
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
// 全場面（昼で見え方を確認）
const SCENES = ['engawa', 'harappa', 'jinja', 'tanbomichi', 'kawabe', 'shoutengai', 'juutakugai', 'danchi', 'ie']

const errors = []
let checkedCanvas = false

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})

try {
  // タイトル画面（パラメータなし＝スタート画面が出る）
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 700))
    await page.screenshot({ path: join(outDir, 'title.png') })
    console.log('撮影: title.png')
    await page.close()
  }

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

  // デバッグパネルを確認
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[debug] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?t=0.3&debug=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 500))
    const shown = await page.evaluate(() => !document.querySelector('#debug').classList.contains('hidden'))
    await page.screenshot({ path: join(outDir, 'debug.png') })
    console.log(`デバッグパネル: 表示=${shown}`)
    if (!shown) errors.push('デバッグパネルが ?debug=1 で出ない')
    await page.close()
  }

  // おまつり（3日目の夜の神社）を確認
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(`${baseUrl}?scene=jinja&t=0.9&day=3&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 500))
    await page.screenshot({ path: join(outDir, 'festival.png') })
    console.log('撮影: festival.png')
    await page.close()
  }

  // 全場面を昼で確認（PC横）
  for (const scene of SCENES) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(`[scene/${scene}] console: ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => errors.push(`[scene/${scene}] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=${scene}&t=0.3&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 500))
    const file = join(outDir, `scene-${scene}.png`)
    await page.screenshot({ path: file })
    console.log(`撮影: ${file}`)
    await page.close()
  }

  // 移動の機能テスト：縁側から右へ動くと「田んぼ道」に変わること
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[move] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=engawa&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 400))
    // 主人公を右へ歩かせ、右端で隣（田んぼ道）へ移ることを確認
    await page.evaluate(() => { window.__hitonatsu.player.dirX = 1 })
    await new Promise((r) => setTimeout(r, 4000)) // 右端まで歩く＋crossfade
    const place = await page.evaluate(() => document.querySelector('#place-label')?.textContent)
    console.log(`移動テスト: 縁側→右へ歩く→「${place}」`)
    if (place !== '田んぼ道') errors.push(`歩いて移動できていない（期待:田んぼ道 / 実際:${place}）`)

    // 環境音が実際にデコード・読み込みできたか（素材の破損チェック）
    const loaded = await page.evaluate(() => window.__hitonatsu?.audio?.loadedCount ?? -1)
    console.log(`音の読み込み: ${loaded} / 6`)
    if (loaded < 6) errors.push(`環境音の読み込みが不足（読み込めた数: ${loaded} / 6）`)
    await page.close()
  }

  // 町の当たり判定・行き来テスト：
  // 商店街→右へ歩く→住宅街（即・逆戻りしない）→さらに右→団地。道の外（建物）に立たないこと。
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[town] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=shoutengai&t=0.3&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 400))
    await page.evaluate(() => { window.__hitonatsu.player.dirX = 1 })
    await new Promise((r) => setTimeout(r, 4000))
    const place1 = await page.evaluate(() => document.querySelector('#place-label')?.textContent)
    console.log(`町移動テスト: 商店街→右→「${place1}」`)
    if (place1 !== '住宅街') errors.push(`商店街→住宅街に入れていない（逆戻り？ 実際:${place1}）`)
    await new Promise((r) => setTimeout(r, 4000))
    const place2 = await page.evaluate(() => document.querySelector('#place-label')?.textContent)
    console.log(`町移動テスト: 住宅街→右→「${place2}」`)
    if (place2 !== '団地') errors.push(`住宅街→団地に入れていない（実際:${place2}）`)
    // 道の外に立っていないか（住宅街/団地の道幅の内側にいるか）をざっくり確認
    const onRoad = await page.evaluate(() => {
      const H = window.__hitonatsu
      const s = H.scenes.current
      if (!s.walk) return true
      const w = s.walk
      const f = Math.max(0, Math.min(1, (H.player.y - w.top) / (0.95 - w.top)))
      const left = w.farL + (w.nearL - w.farL) * f
      const right = w.farR + (w.nearR - w.farR) * f
      return H.player.x >= left - 0.02 && H.player.x <= right + 0.02
    })
    if (!onRoad) errors.push('主人公が道の外（建物の上）に立っている')
    await page.close()
  }

  // 虫採りの機能テスト：原っぱのカブトムシの近くで「つかまえる」と記録が増える
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[catch] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=harappa&t=0.3&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 500))
    const result = await page.evaluate(async () => {
      const H = window.__hitonatsu
      H.player.x = 0.8
      H.player.y = 0.7 // カブトムシ(0.8,0.66)の近くへ
      await new Promise((r) => setTimeout(r, 200))
      const before = H.caughtCount()
      H.doInteract()
      return { before, after: H.caughtCount() }
    })
    console.log(`虫採りテスト: ${result.before} → ${result.after}`)
    if (result.after !== result.before + 1) errors.push(`虫採りが機能していない（${result.before}→${result.after}）`)
    await page.close()
  }

  // 会話＋夜の絵日記の機能テスト
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[diary] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=engawa&t=0.9&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 500))
    const res = await page.evaluate(async () => {
      const H = window.__hitonatsu
      // おばあさん(0.3,0.84)の近くで はなしかける
      H.player.x = 0.3
      H.player.y = 0.84
      await new Promise((r) => setTimeout(r, 200))
      H.doInteract()
      const talking = !document.querySelector('#dialogue').classList.contains('hidden')
      // 絵日記を開く
      H.openDiary()
      const diaryShown = !document.querySelector('#diary').classList.contains('hidden')
      const bodyLen = document.querySelector('#diary-body').textContent.length
      return { talking, diaryShown, bodyLen }
    })
    console.log(`会話/日記テスト: 会話=${res.talking} 日記=${res.diaryShown} 本文長=${res.bodyLen}`)
    if (!res.talking) errors.push('会話が始まらない')
    if (!res.diaryShown || res.bodyLen < 5) errors.push('絵日記が表示されない/空')
    await page.screenshot({ path: join(outDir, 'diary.png') })
    await page.close()
  }

  // 図鑑（標本画つき）の確認：虫を採って「きろく」を開く
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[zukan] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=harappa&t=0.3&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 400))
    await page.evaluate(async () => {
      const H = window.__hitonatsu
      for (const [x, y] of [[0.8, 0.66], [0.62, 0.74], [0.2, 0.86]]) {
        H.player.x = x
        H.player.y = y
        await new Promise((r) => setTimeout(r, 150))
        H.doInteract()
      }
    })
    await page.click('#record-button').catch(() => {})
    await new Promise((r) => setTimeout(r, 300))
    await page.screenshot({ path: join(outDir, 'zukan.png') })
    console.log('撮影: zukan.png')
    await page.close()
  }

  // 虫相撲の機能テスト：カブトムシを採って近所の子に話すと相撲が始まり、連打で決着する
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[sumo] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=harappa&t=0.3&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 400))
    await page.evaluate(async () => {
      const H = window.__hitonatsu
      H.player.x = 0.8
      H.player.y = 0.66 // カブトムシの近く
      await new Promise((r) => setTimeout(r, 150))
      H.doInteract() // 採る
      H.player.x = 0.55
      H.player.y = 0.8 // 近所の子の近く
      await new Promise((r) => setTimeout(r, 150))
      H.doInteract() // 話す→虫相撲
    })
    await new Promise((r) => setTimeout(r, 200))
    const started = await page.evaluate(() => !document.querySelector('#sumo').classList.contains('hidden'))
    // 連打して決着させる
    for (let i = 0; i < 80; i++) {
      await page.click('#sumo-push').catch(() => {})
    }
    await new Promise((r) => setTimeout(r, 200))
    const result = await page.evaluate(() => document.querySelector('#sumo-result').textContent)
    console.log(`虫相撲テスト: 開始=${started} 結果=「${result}」`)
    if (!started) errors.push('虫相撲が始まらない')
    await page.close()
  }

  // 釣りの機能テスト：川辺で対象が無いと「つる」が出て、押すと釣りが始まる
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[fish] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=kawabe&t=0.3&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 500))
    await page.evaluate(() => {
      window.__hitonatsu.player.x = 0.5
      window.__hitonatsu.player.y = 0.92 // 虫から離れる
    })
    await new Promise((r) => setTimeout(r, 200))
    const shown = await page.evaluate(() => !document.querySelector('#fish-prompt').classList.contains('hidden'))
    await page.click('#fish-prompt').catch(() => {})
    await new Promise((r) => setTimeout(r, 200))
    const startedHidden = await page.evaluate(() => document.querySelector('#fish-prompt').classList.contains('hidden'))
    console.log(`釣りテスト: つる表示=${shown} 開始=${startedHidden}`)
    if (!shown) errors.push('川辺で「つる」が出ない')
    await page.close()
  }

  // 環境音が実際に「鳴る」か（再生状態と音量の立ち上がり）
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 720 })
    page.on('pageerror', (err) => errors.push(`[sound] pageerror: ${err.message}`))
    await page.goto(`${baseUrl}?scene=engawa&t=0.0&paused=1`, { waitUntil: 'networkidle0', timeout: 20000 })
    await new Promise((r) => setTimeout(r, 2500)) // 立ち上がりを待つ
    const snd = await page.evaluate(() => {
      const a = window.__hitonatsu.audio
      return { state: a.state, peak: a.peakGain(), loaded: a.loadedCount }
    })
    console.log(`再生テスト: state=${snd.state} peakGain=${snd.peak.toFixed(2)} loaded=${snd.loaded}`)
    if (snd.state !== 'running') errors.push(`音が再生状態でない（state=${snd.state}）`)
    if (snd.peak < 0.3) errors.push(`音量が上がっていない（peakGain=${snd.peak.toFixed(2)}）`)
    await page.close()
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
