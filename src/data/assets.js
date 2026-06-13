// 場面の差し替え画像の置き場を管理する。
// src/assets/scenes/<場面ID>/<レイヤー名>.png（jpg/webp可）を置くと、
// ビルド時に自動で拾われ、その場面のそのレイヤーが「画像を貼る版」に切り替わる。
// 置かなければコード描画版のまま（余計な読み込みも 404 も出さない）。
//
// 例: src/assets/scenes/engawa/fore.png を置く → 縁側の前景が画像になる
//     レイヤー名は far / ground / fore（空はシグネチャ固定で差し替え対象外）

// Vite の機能：存在するファイルだけを集める（無ければ空）
const modules = import.meta.glob('../assets/scenes/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const map = {}
for (const [path, url] of Object.entries(modules)) {
  const m = path.match(/scenes\/([^/]+)\/([^/]+)\.\w+$/)
  if (m) map[`${m[1]}/${m[2]}`] = url
}

// 場面ID・レイヤー名に対応する画像URLを返す（無ければ null）
export function sceneImage(id, layer) {
  return map[`${id}/${layer}`] || null
}
