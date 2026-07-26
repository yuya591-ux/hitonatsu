// 実操作巡回・その2＝「操作ボタンを実際に押して、押した後の姿まで確かめる」回帰ゲート（2026-07-27）。
//
// なぜ要るのか（同じ失敗を3回した）：
//   ・playcheck の固定ルート（自宅の出入り）は通るのに、直したはずの飛行UI・ONの色・設定の
//     スクロールは一度も触れていなかった＝「ゲートが緑」でも何も確かめていない状態だった。
//   ・とくに「ボタンを押した後の姿（ON）」と「そのモード専用に出るUI（飛行中の #fl-*）」を
//     見落とし続けた。ここを機械が毎回つぶす。
//
// やること：昼と夜それぞれで
//   ①ドックの各ボタン（ねころぶ/のる/とぶ/しゅかん）を本物のクリックで押す
//   ②押した後に出ている全ボタンの「文字と下地の明暗比」を、描かれた画素から測る
//   ③飛行中は上昇して、飛行専用ボタンと見通し（霧）の上限も見る
//   ④設定を開いて、縦だけにスクロールする指定になっているかを見る
//   ⑤重なり（押せないボタン）とページ例外を見る
// 落ちる条件：明暗比3.0未満のボタン／重なり／ページ例外。全部 .verify/playui に写真を残す。
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { resolveBrowser } from './browser-path.mjs' // ブラウザ解決は共有ヘルパー1箇所（分岐禁止・CI事故対策）
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'); const DIST = join(ROOT, 'dist'); const BASE = '/hitonatsu/'
const OUT = join(ROOT, '.verify', 'playui')
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.json': 'application/json', '.vrm': 'application/octet-stream', '.webmanifest': 'application/manifest+json' }
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(req.url.split('?')[0]); if (p.startsWith(BASE)) p = p.slice(BASE.length - 1); if (p === '/' || p === '') p = '/index.html'; const body = await readFile(join(DIST, p)); res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, p))] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end('x') } })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}${BASE}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(OUT, { recursive: true })
let bad = 0, warn = 0
const NG = 3.0, THIN = 4.5 // 3.0未満＝読めない（不合格）／4.5未満＝ぎりぎり（警告）

// 描かれた画素から「下地＝中央値」「文字＝下地から遠い側の3%」を取り、その明暗比を返す。
// ※濃い側を12%にすると幅の広いボタンで文字が下地に薄められ不当に低く出る（2026-07-26の学び）
const MEASURE = async (shot, rects) => {
  const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + shot })
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const x = c.getContext('2d'); x.drawImage(img, 0, 0)
  const S = img.width / innerWidth
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const out = []
  for (const r of rects) {
    const px = Math.round((r.x + r.w * 0.12) * S), py = Math.round((r.y + r.h * 0.12) * S)
    const pw = Math.max(2, Math.round(r.w * 0.76 * S)), ph = Math.max(2, Math.round(r.h * 0.76 * S))
    if (px < 0 || py < 0 || px + pw > c.width || py + ph > c.height) { out.push({ id: r.id, err: '画面の外' }); continue }
    const d = x.getImageData(px, py, pw, ph).data
    const L = []
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]))
    L.sort((a, b) => a - b)
    const n = L.length, q = Math.max(1, Math.round(n * 0.03))
    let dark = 0; for (let i = 0; i < q; i++) dark += L[i]; dark /= q
    let light = 0; for (let i = n - q; i < n; i++) light += L[i]; light /= q
    const mid = L[Math.floor(n * 0.5)]
    const ink = (mid - dark) >= (light - mid) ? dark : light
    const hi = Math.max(mid, ink), lo = Math.min(mid, ink)
    out.push({ id: r.id, ratio: +((hi + 0.05) / (lo + 0.05)).toFixed(2) })
  }
  return out
}
// 画面に出ている操作ボタンをぜんぶ拾う（そのモード専用に出るものも含める＝ここが見落としの元だった）
const ALL = ['jump', 'zin', 'zout', 'lie', 'bike', 'float', 'fpvbtn', 'act', 'catch', 'fish', 'npc', 'go', 'sleep', 'set-btn',
  'mb-btn', 'pm-btn', 'senko-btn', 'plan', 'fl-up', 'fl-down', 'fl-zin', 'fl-zout', 'fl-speed', 'fl-fpv']

const browser = await puppeteer.launch({ executablePath: resolveBrowser(ROOT), headless: 'new', userDataDir: join(ROOT, '.verify', `_edge-playui-${process.pid}`), args: ['--no-sandbox', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] })
try {
  const page = await browser.newPage(); await page.setViewport({ width: 932, height: 430, deviceScaleFactor: 2 })
  page.on('pageerror', (e) => { console.log('  [ページ例外]', String(e.message || e).slice(0, 160)); bad++ })
  await page.goto(`${baseUrl}proto3d.html?dev=1`, { waitUntil: 'domcontentloaded', timeout: 240000 })
  for (let i = 0; i < 1600 && !(await page.evaluate(() => !!(window.__proto3d && window.__proto3d.boy))); i++) await sleep(50)
  for (let i = 0; i < 500 && !(await page.evaluate(() => { const b = document.getElementById('t-start'); return b && !b.disabled })); i++) await sleep(100)
  await page.evaluate(() => { const t = document.getElementById('t-start'); if (t) t.click(); const g = document.getElementById('guide-ok'); if (g) g.click(); const gd = document.getElementById('guide'); if (gd) gd.style.display = 'none' })
  await sleep(3000)
  // ★タイトルが残るとカメラも操作も別物になる＝確実に降ろす（2026-07-27の学び）
  await page.evaluate(() => { const P = window.__proto3d; if (P._resGate.title && P.setTitle) P.setTitle(false); P.placeBoy(3018, 48)
    // 「しばらく触らないと消える」演出は測定の邪魔（消えた画面を測ると全部1.0になる）
    // ★`body.ui-idle #jump{opacity:0!important}` の方が詳しい指定なので、こちらも body.ui-idle を付けないと負ける
    //   （最初これを忘れて「ふつうの状態」だけ全部 明暗比1.0＝消えた画面を測っていた）
    const ids = '#hint,#badge,#act,#jump,#zin,#zout,#look,#dock,#dock>button,#npc,#go,#catch,#fish,#sleep,#set-btn,#mb-btn,#senko-btn,#pm-btn,#fl-up,#fl-down,#fl-zin,#fl-zout,#fl-speed,#fl-fpv'
    const sel = ids.split(',').map((v) => `body.ui-idle ${v}`).join(',')
    const s = document.createElement('style'); s.id = '_nofade'
    s.textContent = `${ids}{opacity:1 !important;} ${sel}{opacity:1 !important;}`
    document.head.appendChild(s) })
  await sleep(900)

  const visRects = () => page.evaluate((list) => { const out = []
    for (const id of list) { const e = document.getElementById(id); if (!e) continue
      // ★親が display:none でも本人の computed display は 'block' のまま＝offsetParent で「本当に出ているか」を見る
      //   （これを忘れて、飛行中は隠れているはずのドックのボタンを測っていた）
      if (e.offsetParent === null && getComputedStyle(e).position !== 'fixed') continue
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') continue
      { let p = e.parentElement, hidden = false
        while (p && p !== document.body) { const pc = getComputedStyle(p); if (pc.display === 'none' || pc.visibility === 'hidden') { hidden = true; break } p = p.parentElement }
        if (hidden) continue }
      const b = e.getBoundingClientRect(); if (b.width < 8 || b.height < 8) continue
      if (b.right < 0 || b.bottom < 0 || b.left > innerWidth || b.top > innerHeight) continue
      out.push({ id, x: b.x, y: b.y, w: b.width, h: b.height }) }
    return out }, ALL)

  const check = async (label, file) => {
    // ★「そっと消える」演出は仕様なので、消えかけを測るのは誤り。少し間をあけて3回撮り、
    //   いちばんよく写った回で採点する（どこかの瞬間に読めていれば、その配色は読める）。
    let best = null, rects = null, moved = 0
    for (let t = 0; t < 3; t++) {
      await page.evaluate(() => { document.body.classList.remove('ui-idle')
        const b = document.getElementById('badge'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })) })
      await sleep(120)
      const r0 = await visRects()
      const s0 = await page.screenshot({ encoding: 'base64' })
      const r1 = await visRects()
      const m = new Map(r1.map((r) => [r.id, r]))
      const st = r0.filter((r) => { const a = m.get(r.id); return a && Math.abs(a.x - r.x) < 1.5 && Math.abs(a.y - r.y) < 1.5 && Math.abs(a.w - r.w) < 1.5 })
      const res0 = await page.evaluate(MEASURE, s0, st)
      if (!best) { best = new Map(res0.map((r) => [r.id, r])); rects = st; moved = r0.length - st.length }
      else for (const r of res0) { const b = best.get(r.id); if (!b || (r.ratio != null && b.ratio != null && r.ratio > b.ratio)) best.set(r.id, r) }
      if (t === 0) await page.screenshot({ path: join(OUT, file + '.png') })
    }
    const stable = rects
    const res = [...best.values()]
    // 重なり（押せないボタンを作っていないか）
    const ov = []
    for (let i = 0; i < stable.length; i++) for (let j = i + 1; j < stable.length; j++) {
      const a = stable[i], b = stable[j]
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (w > 6 && h > 6) ov.push(`${a.id}×${b.id}`) }
    const ngs = res.filter((r) => r.ratio != null && r.ratio < NG)
    const thins = res.filter((r) => r.ratio != null && r.ratio >= NG && r.ratio < THIN)
    console.log(`\n[${label}] 見えているボタン ${rects.length}個`)
    if (ngs.length) { bad++; console.log('  ❌ 読めない:', ngs.map((r) => `${r.id}(${r.ratio})`).join(' ')) }
    if (thins.length) { warn++; console.log('  ⚠ ぎりぎり:', thins.map((r) => `${r.id}(${r.ratio})`).join(' ')) }
    if (ov.length) { bad++; console.log('  ❌ 重なり:', ov.join(' / ')) }
    if (!ngs.length && !ov.length) console.log('  ✅ 全部読める・重なりなし')
  }
  const clickEl = (id) => page.evaluate((i) => { const e = document.getElementById(i); if (!e) return false
    e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); e.click(); return true }, id)

  for (const [tname, tday] of [['ひる', 0.42], ['よる', 0.9]]) {
    await page.evaluate((t) => window.__proto3d.setDay(t), tday)
    await sleep(1500)
    await check(`${tname}・ふつう`, `${tname}_1_normal`)
    // ★ここが今まで抜けていた＝「押した後の姿」
    for (const [id, jp] of [['bike', 'のる'], ['fpvbtn', 'しゅかん']]) {
      await clickEl(id); await sleep(1200)
      await check(`${tname}・${jp} を押した後`, `${tname}_2_${id}on`)
      await clickEl(id); await sleep(900)
    }
    // ★飛行＝押すと専用のボタン群に入れ替わる。ここを一度も見ていなかった
    await clickEl('float'); await sleep(1400)
    await page.evaluate(() => window.__proto3d.setFloatUp(true)); await sleep(2600)
    await page.evaluate(() => window.__proto3d.setFloatUp(false)); await sleep(800)
    const air = await page.evaluate(() => { const P = window.__proto3d
      return { floating: document.body.classList.contains('floating'), alt: +(P.boy.position.y).toFixed(0), fog: Math.round(P.scene.fog.far), phone: P._memStat().phone } })
    console.log(`\n  （空中：飛行中=${air.floating} 高さ${air.alt} 見通し${air.fog}m スマホ判定=${air.phone}）`)
    if (!air.floating) { bad++; console.log('  ❌「とぶ」を押しても飛行に入っていない') }
    await check(`${tname}・とんでいる間`, `${tname}_3_flying`)
    await page.evaluate(() => window.__proto3d.setFloat(false)); await sleep(1200)
  }
  // ★設定＝縦だけにスクロールする指定になっているか（斜めに流れる指摘・2回目）
  await page.evaluate(() => { const s = document.getElementById('settings'); if (s) s.classList.add('on') })
  await sleep(600)
  const sc = await page.evaluate(() => { const b = document.querySelector('.set-body'), c = document.querySelector('.set-card')
    if (!b || !c) return null
    const cs = getComputedStyle(b), cc = getComputedStyle(c)
    // はみ出しの犯人を名指しする（直す所が分からないと意味がない）
    const wide = []
    const bb = b.getBoundingClientRect()
    b.querySelectorAll('*').forEach((e) => { const r = e.getBoundingClientRect()
      if (r.width > 0 && (r.right > bb.right + 1 || r.left < bb.left - 1)) wide.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : (e.className ? '.' + String(e.className).split(' ')[0] : '')}(幅${Math.round(r.width)}・右${Math.round(r.right - bb.right)}はみ出し)`) })
    return { touch: cs.touchAction, ox: cs.overflowX, cardTouch: cc.touchAction, scrollW: b.scrollWidth, clientW: b.clientWidth, wide: wide.slice(0, 6) } })
  if (!sc) { bad++; console.log('\n[設定] ❌ 設定の中身が見つからない') }
  else {
    const okTouch = /pan-y/.test(sc.touch) && /pan-y/.test(sc.cardTouch)
    const okX = sc.ox === 'hidden' && sc.scrollW <= sc.clientW + 1
    console.log(`\n[設定] 指の向き=${sc.touch}/${sc.cardTouch}  横あふれ=${sc.scrollW - sc.clientW}px`)
    if (!okTouch) { bad++; console.log('  ❌ 縦だけの指定になっていない（斜めに流れる）') }
    if (!okX) { bad++; console.log('  ❌ 横にスクロールできてしまう'); if (sc.wide.length) console.log('     はみ出している物:', sc.wide.join(' / ')) }
    if (okTouch && okX) console.log('  ✅ 縦だけにスクロールする')
  }
  await page.screenshot({ path: join(OUT, 'settings.png') })
  console.log(`\n写真: ${OUT}`)
} catch (e) { console.log('FATAL', String(e.stack || e.message).slice(0, 400)); bad++ } finally { await browser.close(); server.close() }
if (bad) { console.log(`\n❌ 操作巡回：${bad}件の不合格`); process.exit(1) }
console.log(`\n✅ 操作巡回：合格（ぎりぎり ${warn}件は写真で確認）`)
