// ひと夏の一日 ― 自前の最小 Service Worker（外部CDN/ライブラリ非依存＝「自分がいなくても動く」原則）。
// 方針：
//   ・HTML（ページ）＝ネット優先。更新をすぐ反映する（既存のキャッシュ更新の作法を壊さない）。オフラインのときだけキャッシュから出す。
//   ・ハッシュ付きの資産（js/css/画像/音）＝キャッシュ優先。一度読めばオフラインでも動く・表示が速い。
//   どこでつまずいてもゲーム本体には影響しない（respondWith しない＝通常のネット取得にフォールバック）。
const CACHE = 'hitonatsu-v3' // v3=アイコン本気版(夕暮れの帰り道・2026-07-07)

self.addEventListener('install', () => self.skipWaiting())

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
  } else if (/\.(js|mjs|css|png|jpe?g|gif|svg|webp|mp3|m4a|ogg|wav|woff2?|json|webmanifest|ico)$/.test(url.pathname)) {
    // キャッシュ優先（ハッシュ付き＝不変）。無ければネット取得して保存
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      }))
    )
  }
})
