// ひと夏の一日 ― 自前の最小 Service Worker（外部CDN/ライブラリ非依存＝「自分がいなくても動く」原則）。
// 方針：
//   ・HTML（ページ）＝ネット優先。更新をすぐ反映する（既存のキャッシュ更新の作法を壊さない）。オフラインのときだけキャッシュから出す。
//   ・ハッシュ付きの資産（js/css/画像/音）＋VRM＝キャッシュ優先。一度読めばオフラインでも動く・表示が速い。
//   ・VRM（キャラモデル）は install 時に本体へ先読みDL（プリキャッシュ）＝機内モード/初回でもキャラをVRMで出す・VRM化を速くする（ユーザー要望2026-07-11「本体に全部ダウンロードしておきたい」）。
//   どこでつまずいてもゲーム本体には影響しない（respondWith しない＝通常のネット取得にフォールバック／プリキャッシュ失敗も起動に影響させない）。
const CACHE = 'hitonatsu-v4' // v4=VRMを含むキャラモデルをローカルキャッシュ＋プリキャッシュ（機内モードでもVRM表示・VRM化を速く・2026-07-11）。※VERSIONは毎デプロイ上げる

// 起動時に本体へ先読みDLしておく固定パス（ハッシュ無し＝ファイル名が変わらないものだけ）。VRMは baked版(住人)＋通常版(主人公/予備)の両方。
const PRECACHE = [
  'models/baked/sakurada_fumiriya.vrm', 'models/baked/sendagaya_shibu.vrm', 'models/baked/sendagaya_shino.vrm',
  'models/sakurada_fumiriya.vrm', 'models/sendagaya_shibu.vrm', 'models/sendagaya_shino.vrm',
]

self.addEventListener('install', (e) => {
  self.skipWaiting()
  // VRMを先に本体へ落とす。allSettled＝1つ失敗しても他は入る・SWのインストール自体は失敗させない（ゲーム起動に影響ゼロ）
  e.waitUntil((async () => {
    try { const c = await caches.open(CACHE)
      await Promise.allSettled(PRECACHE.map((p) => c.add(new URL(p, self.location).href)))
    } catch (_) {}
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))) // 古い世代のキャッシュを掃除
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch (_) { return }
  if (url.origin !== self.location.origin) return // 別オリジン（万一の外部）は触らない

  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('.html')
  if (isHTML) {
    // ネット優先＝更新を即反映。落ちていたらキャッシュ（オフライン）
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res })
        .catch(() => caches.match(req))
    )
  } else if (/\.(js|mjs|css|png|jpe?g|gif|svg|webp|mp3|m4a|ogg|wav|woff2?|json|webmanifest|ico|vrm|glb|bin|ktx2)$/.test(url.pathname)) {
    // キャッシュ優先（ハッシュ付き＝不変／VRM等のモデルも不変）。無ければネット取得して保存＝一度読めばオフラインでもVRMで出る・次回から即ロード
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      }))
    )
  }
})
