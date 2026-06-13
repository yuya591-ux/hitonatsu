// 場面の差し替え画像の置き場を管理する。
// src/assets/scenes/<場面ID>/<レイヤー名>.png（jpg/webp/svg可）を置くと、
// ビルド時に自動で拾われ、その場面のそのレイヤーが「画像を貼る版」に切り替わる。
// 置かなければコード描画版のまま（余計な読み込みも 404 も出さない）。
//
// レイヤー名：
//   scene … 場面まるごと一枚の絵（水彩のプリレンダ画像など）。これがあると far/ground/fore の
//            コード描画を丸ごと置き換える＝AIで描いた一枚絵を1ファイル置くだけで差し替え完了。
//   far / ground / fore … 層ごとに差し替えたいとき（部分差し替え）
//   sky … 空も絵にしたいとき（省略時はコードのシグネチャ空のまま）
// ※ 時間帯の色（朝昼夕夜）は仕上げ（シェーダー/ポスト）で自動的に乗るので、絵は「昼の素直な色」で描けばよい。
//
// 例: src/assets/scenes/engawa/scene.png を置く → 縁側がまるごとその絵に

// Vite の機能：存在するファイルだけを集める（無ければ空）
const modules = import.meta.glob('../assets/scenes/**/*.{png,jpg,jpeg,webp,svg}', {
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
