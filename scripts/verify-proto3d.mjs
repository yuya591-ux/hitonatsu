// proto3d（Three.js 3D版・本番の主軸）の自己検証スモークテスト（C2・2026-06-27）。
// 旧 verify.mjs は index.html(2D版)しか見ず、proto3d のモジュール評価エラー
//（例：inWater 未定義で __proto3d が生えない）を見逃していた＝堅牢性の穴。
// ここでは proto3d.html を headless で開き：
//   ・ページ例外 / コンソールエラーが出ないこと（favicon 404 は除外）
//   ・window.__proto3d が生える＝モジュール評価が最後まで通ったこと（致命傷の検出）
//   ・各エリア/各時刻/各乗り物(自転車/滑走/浮遊/ジャンプ)で例外が出ないこと
//   ・シーン統計が取れる＝描画が回ること
// を確認する。networkidle0 は proto3d では張り付くので domcontentloaded を使う。
//
// 使い方:  npm run build したあとに  node scripts/verify-proto3d.mjs

import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')
const BASE = '/hitonatsu/'
// ブラウザの実行ファイル：CI等は環境変数で明示（PUPPETEER_EXECUTABLE_PATH / CHROME_PATH）。無ければローカル同梱chrome→Windows Edgeの順。
const EDGE = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH || (() => { const c = join(ROOT, 'chrome'); if (existsSync(c)) for (const d of readdirSync(c)) { const p = join(c, d, 'chrome-win64', 'chrome.exe'); if (existsSync(p)) return p } return 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })()
const outDir = join(ROOT, '.verify'); mkdirSync(outDir, { recursive: true })
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav' }

const server = createServer(async (req, res) => {
  try { let path = decodeURIComponent(req.url.split('?')[0]); if (path.startsWith(BASE)) path = path.slice(BASE.length - 1); if (path === '/' || path === '') path = '/index.html'
    const body = await readFile(join(DIST, path)); res.writeHead(200, { 'Content-Type': MIME[extname(join(DIST, path))] || 'application/octet-stream' }); res.end(body)
  } catch { res.writeHead(404); res.end('not found') }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${server.address().port}${BASE}`
console.log(`静的サーバ: ${baseUrl}`)

const errors = []
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 900, height: 540, deviceScaleFactor: 1.2 })
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(r.status() + ': ' + r.url()) })

  await page.goto(`${baseUrl}proto3d.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // __proto3d が生える＝モジュール評価が最後まで通った（致命傷=ここで生えない）
  let ok = false
  for (let i = 0; i < 120; i++) { if (await page.evaluate(() => !!(window.__proto3d && window.__proto3d.SG))) { ok = true; break } await new Promise((r) => setTimeout(r, 200)) }
  if (!ok) errors.push('window.__proto3d.SG が生えない＝proto3d のモジュール評価に失敗（致命傷）')
  console.log(`初期化: __proto3d=${ok}`)

  if (ok) {
    await page.evaluate(() => { document.getElementById('t-start').click(); window.__proto3d.setTitle(false); const g = document.getElementById('guide-ok'); if (g) g.click() })
    await new Promise((r) => setTimeout(r, 500))
    // 各エリア × 各時刻で例外が出ないこと＋描画が回ること
    // C⑭ 性能予算ゲート：各エリアの draw call / 三角形数に上限を設け、超えたら exit 1。
    //   目的＝モバイル生存の最重要リスク「goAreaが全エリアを足すだけで撤去しない＝draw call/tris が青天井」を
    //   回帰として機械的に捕まえる。閾値は2026-06-27の実測ピーク(C⑮のMaterial共有後)に約25%の余裕＝
    //   ロード毎のMath.random配置揺れ(約7%)では誤検知せず、倍増/リーク/重い新要素はちゃんと落とす。
    //   ※ goArea は加算式なので yato 計測時は全エリアがシーンに在り、各カメラ位置の視錐台で見える分を測る。
    const BUDGET = {
      field: { calls: 950, tris: 450000 },
      town: { calls: 1150, tris: 3200000 },
      shrine: { calls: 600, tris: 3200000 },
      // yato：静的ワールドの空間チャンク化(2026-06-29)で広域の樹林/夏草/家並みが frustum/距離カリングされるようになり、
      //   三角形が約3.19M→約1.3M(視点による・実測ピーク)へ大幅減。代わりに密な核に立つと可視チャンクが増えて
      //   draw call は約3490→最大約3660(+約170、シャドウパスの分割込み)へ僅増（GPU的には些少・モバイルでも許容範囲。ユーザー承認済2026-06-29）。
      //   そこで calls の上限は実測ピーク約3660+余裕で 3800 へ“締め直す”（3900は緩すぎ＝回帰見逃しのため3800に）、
      //   tris は新ピーク約1.3Mに合わせて 2,000,000 へ＝以前の3.6M天井では見逃した「樹林の倍増/カリング無効化の回帰」をこの低い天井で確実に捕まえる（ゲートとして強化）。
      yato: { calls: 4100, tris: 2000000 }, // 2026-07-02：RTX 4050前提で3800→4100へ引き上げ（ユーザー承認済）。サンライズ駐輪場(自転車6+原付2+ポート)など実家周辺の忠実再現の増分を収める。無制限ではない＝回帰はこの天井で捕まえる
    }
    for (const area of ['field', 'town', 'shrine', 'yato']) {
      await page.evaluate((a) => window.__proto3d.goArea(a), area)
      for (const t of [0.0, 0.3, 0.62, 0.9]) { await page.evaluate((t) => window.__proto3d.setDay(t), t); await new Promise((r) => setTimeout(r, 120)) }
      const st = await page.evaluate(() => window.__proto3d._sceneStats())
      const b = BUDGET[area]
      const overC = st && st.calls > b.calls, overT = st && st.tris > b.tris
      console.log(`  ${area}: calls=${st.calls}/${b.calls} tris=${st.tris}/${b.tris}${overC || overT ? '  ← 予算超過' : ' ✓'}`)
      if (!st || !st.calls) errors.push(`${area}: シーン統計が取れない＝描画が回っていない`)
      if (overC) errors.push(`${area}: draw call ${st.calls} が予算 ${b.calls} を超過（性能回帰の疑い）`)
      if (overT) errors.push(`${area}: 三角形 ${st.tris} が予算 ${b.tris} を超過（性能回帰の疑い）`)
    }
    // P6 メモリ予算ゲート：全エリアを訪問した後（=常駐ピーク）の GPUジオメトリ/テクスチャと JSヒープに上限。
    //   実測（_memcheck.mjs 2026-06-27）＝全エリア後 geom≈5536/tex≈97/heap≈360MB で、2巡してもほぼ不変＝リーク無し・有界。
    //   この予算は「goAreaが再ビルドで重複生成する」等の将来のリーク/肥大を機械的に捕まえる（モバイル生存の核）。
    const MEM_BUDGET = { geometries: 9000, textures: 160, heapMB: 600 } // verify全工程(全エリア×全時刻×乗り物スモークでGPUアップロード)の実測ピーク geom≈7274/tex≈118/heap≈367 に余裕。超えたら回帰（goAreaの再ビルド重複等のリークは1.5万超に膨らむので確実に捕まえる）
    const mem = await page.evaluate(() => window.__proto3d._mem())
    const overG = mem.geometries > MEM_BUDGET.geometries, overTx = mem.textures > MEM_BUDGET.textures, overH = mem.heapMB != null && mem.heapMB > MEM_BUDGET.heapMB
    console.log(`  メモリ(全エリア常駐): geom=${mem.geometries}/${MEM_BUDGET.geometries} tex=${mem.textures}/${MEM_BUDGET.textures} heap=${mem.heapMB}MB/${MEM_BUDGET.heapMB}${overG || overTx || overH ? '  ← 予算超過' : ' ✓'}`)
    if (overG) errors.push(`常駐ジオメトリ ${mem.geometries} が予算 ${MEM_BUDGET.geometries} を超過（メモリリーク/肥大の疑い）`)
    if (overTx) errors.push(`常駐テクスチャ ${mem.textures} が予算 ${MEM_BUDGET.textures} を超過（メモリリーク/肥大の疑い）`)
    if (overH) errors.push(`JSヒープ ${mem.heapMB}MB が予算 ${MEM_BUDGET.heapMB}MB を超過（メモリリーク/肥大の疑い）`)
    // 乗り物・所作の機能スモーク（例外が出ないこと）
    const moves = await page.evaluate(() => {
      const H = window.__proto3d, out = {}
      try { H.goArea('yato'); H.setDay(0.5) } catch (e) { out.area = e.message }
      try { H.setRiding(true); H._jump(); out.bikeJump = H._jumpState.airborne; H.setRiding(false) } catch (e) { out.bike = e.message }
      try { const r = H._rideSlide(); out.slide = r ? r.total : 'no-slide' } catch (e) { out.slide = 'ERR:' + e.message }
      try { H.setFloat(true); H.setFloatUp(true); out.float = H.floatY != null } catch (e) { out.float = 'ERR:' + e.message }
      try { H.setFloat(false) } catch (e) {}
      return out
    })
    console.log('  乗り物スモーク:', JSON.stringify(moves))
    for (const k of ['area', 'bike', 'slide', 'float']) if (typeof moves[k] === 'string' && moves[k].startsWith('ERR')) errors.push(`乗り物 ${k}: ${moves[k]}`)
    if (moves.bikeJump !== true) errors.push('自転車中ジャンプが成立しない')
    await new Promise((r) => setTimeout(r, 400))
    await page.screenshot({ path: join(outDir, 'proto3d-smoke.png') })
    console.log('撮影: .verify/proto3d-smoke.png')
    // 道の上の小物（電柱/ゴミ集積所/鉢/自転車）が無いか＝交差点の真ん中に物が立つ不具合の再発を止める（ユーザー指摘2026-06-28）
    try { const op = await page.evaluate(() => window.__proto3d._propsOnRoad ? window.__proto3d._propsOnRoad() : null)
      if (op) { console.log(`  道の上の小物: ${op.length}${op.length ? '  ← 道路上に小物' : ' ✓'}`)
        if (op.length) errors.push(`道の上に小物 ${op.length}件（例:${JSON.stringify(op.slice(0, 4))}）＝電柱/ゴミ等が道路の上`) }
    } catch (e) {}
  }
  await page.close()
} finally { await browser.close(); server.close() }

if (errors.length) {
  console.error('\n❌ proto3d でエラーを検出しました:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
} else {
  console.log('\n✅ proto3d：ページ例外/コンソールエラー無し・全エリア描画OK・乗り物スモークOK')
}
