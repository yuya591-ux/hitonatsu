// 環境音ファイルの置き場を管理する。
// src/assets/audio/<音ID>.m4a（mp3/ogg/wav可）を置くと自動で拾われ、その音が鳴るようになる。
// 置かなければ無音（エラーにはならない）。
//
// J2：同じ音IDで .m4a(AAC) と .mp3 の両方があれば、AAC対応ブラウザには軽い .m4a を、
//      非対応には .mp3 をフォールバックで渡す（初回読み込みを軽くしつつ、どの環境でも鳴る）。
//      ※Ogg/Opus は Safari/iPhone で鳴らないため使わない（AACはiOSネイティブで安全）。
//
// 音ID（CREDITS.md と対応）:
//   morning   … 朝（ウグイス・遠い鶏）
//   cicada    … 昼（油蝉のジワジワ）
//   higurashi … 夕方（ヒグラシのカナカナ）
//   night     … 夜（虫の音・カエル）
//   windchime … 縁側（風鈴）
//   river     … 川辺（せせらぎ）
//   eveningbgm… 夕暮れ〜夜の温かいBGM（任意・CC0のループ曲を置くと自前合成の代わりに鳴る。無ければ自前合成）

const modules = import.meta.glob('../assets/audio/*.{ogg,mp3,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
})

// 音IDごとに拡張子別のURLをまとめる { id: { m4a, mp3, ogg, wav } }
const byId = {}
for (const [path, url] of Object.entries(modules)) {
  const m = path.match(/audio\/([^/]+)\.(\w+)$/)
  if (m) { (byId[m[1]] || (byId[m[1]] = {}))[m[2]] = url }
}

// このブラウザがAAC(.m4a)を再生できるか（decodeAudioDataもこれに準じる）
function canPlayAAC() {
  try {
    const a = document.createElement('audio')
    return !!(a.canPlayType && a.canPlayType('audio/mp4; codecs="mp4a.40.2"'))
  } catch (e) { return false }
}

// 利用可能な音の { 音ID: URL } を返す（無ければ空）。AAC対応なら.m4a優先、非対応は.mp3へ。
export function loadAudioUrls() {
  const aac = canPlayAAC()
  const out = {}
  for (const id in byId) {
    const v = byId[id]
    out[id] = (aac && v.m4a) ? v.m4a : (v.mp3 || v.m4a || v.ogg || v.wav)
  }
  return out
}
