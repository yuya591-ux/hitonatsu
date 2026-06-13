// 環境音ファイルの置き場を管理する。
// src/assets/audio/<音ID>.ogg（mp3/wav可）を置くと自動で拾われ、その音が鳴るようになる。
// 置かなければ無音（エラーにはならない）。
//
// 音ID（CREDITS.md と対応）:
//   morning   … 朝（ウグイス・遠い鶏）
//   cicada    … 昼（油蝉のジワジワ）
//   higurashi … 夕方（ヒグラシのカナカナ）
//   night     … 夜（虫の音・カエル）
//   windchime … 縁側（風鈴）
//   river     … 川辺（せせらぎ）

const modules = import.meta.glob('../assets/audio/*.{ogg,mp3,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const map = {}
for (const [path, url] of Object.entries(modules)) {
  const m = path.match(/audio\/([^/]+)\.\w+$/)
  if (m) map[m[1]] = url
}

// 利用可能な音の { 音ID: URL } を返す（無ければ空）
export function loadAudioUrls() {
  return { ...map }
}
