# CREDITS — 使用素材の出典とライセンス

このゲームで使用しているフリー素材の出典・作者・ライセンスを全数記録します（CLAUDE.md / SPEC.md 準拠）。
素材はいずれも**改変せずそのまま**ループ再生に使用しています。

## 環境音

すべて [Wikimedia Commons](https://commons.wikimedia.org/) から取得。各ファイルの説明ページのライセンスに従います。
※元は Ogg Vorbis 形式。Safari/iPhone でも再生できるよう **MP3 に形式変換**して同梱しています（音の内容は無加工）。

| ゲーム内の音 | ファイル | 元ファイル | 作者 | ライセンス | 出典ページ |
|---|---|---|---|---|---|
| 昼・油蝉 | `src/assets/audio/cicada.mp3` | Cicada_orni.ogg | DavidDelon | パブリックドメイン | https://commons.wikimedia.org/wiki/File:Cicada_orni.ogg |
| 夕方・ヒグラシ | `src/assets/audio/higurashi.mp3` | Tanna_japonensis_v01.ogg | Σ64 | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Tanna_japonensis_v01.ogg |
| 夜・カエル（田んぼ） | `src/assets/audio/night.mp3` | Frogs_note02.ogg | Koba-chan | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Frogs_note02.ogg |
| 朝・ウグイス | `src/assets/audio/morning.mp3` | Japanese_nightingale_note01.ogg | Koba-chan | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:Japanese_nightingale_note01.ogg |
| 縁側・風鈴 | `src/assets/audio/windchime.mp3` | Windchime.ogg | Stephan（pdsounds.org 経由） | パブリックドメイン | https://commons.wikimedia.org/wiki/File:Windchime.ogg |
| 川辺・せせらぎ | `src/assets/audio/river.mp3` | Hemlock_stream.ogg | Dirtslayer | パブリックドメイン | https://commons.wikimedia.org/wiki/File:Hemlock_stream.ogg |

### ライセンスについての補足
- **CC BY 4.0**（ヒグラシ）: 作者クレジットを表示すれば利用可（上表に記載）。<https://creativecommons.org/licenses/by/4.0/>
- **CC BY-SA 3.0**（カエル・ウグイス）: 作者クレジット表示＋同一ライセンス継承。これらの音声ファイル自体は CC BY-SA 3.0 のまま再配布されます。<https://creativecommons.org/licenses/by-sa/3.0/>
- **パブリックドメイン**（油蝉・風鈴・せせらぎ）: 権利者により公共領域へ提供。クレジット義務はありませんが、敬意と追跡可能性のため記載しています。

> ライセンスが不明な素材は使用していません。素材を差し替える場合は、本ファイルの記録も必ず更新してください。

## 画像・描画
- 背景・キャラクター・エフェクトは基本すべて自作のコード描画です。
- 後日 `src/assets/scenes/` に自作画像を置いて差し替える場合は、その出典・作成方法をここに追記します。

### 質感テクスチャ（外部AI生成・Pollinations Flux）
建物の質感を底上げするため、シームレステクスチャを **Pollinations の Flux モデル（無料）** で生成し `public/textures/` に同梱しています。
- **生成方法**：開発時に `scripts/gen-textures.mjs` で `https://gen.pollinations.ai/image/...?model=flux`（認証キー使用）を1回だけ呼び出して生成・保存。**本番のゲームは外部APIを叩かず、この静的ファイルを読み込むだけ**（「自分がいなくなっても動く」原則を維持）。APIキーは `.pollinations_key`（`.gitignore`済み）にのみ置き、Gitには上げていません。
- **生成日**：2026-06-16 / **モデル**：flux（Pollinations）
- **プロンプト（全文は `scripts/gen-textures.mjs` に記載）**：
  | ファイル | 用途 | プロンプト要旨 | seed |
  |---|---|---|---|
  | `public/textures/roof_kawara.jpg` | 屋根（瓦） | 昭和の和瓦・濃い青灰のセラミック・シームレス・水彩トゥーン | 71 |
  | `public/textures/wall_plaster.jpg` | 建物の壁（土壁/漆喰） | 昭和の砂漆喰・一様な細かい砂目・クリーム・シームレス | 88 |
  | `public/textures/wood_plank.jpg` | 木部（縁側・柱・柵・橋・木の幹） | 古い木板・暖かい茶・縦の木目・シームレス | 74 |
- **ライセンス**：Flux 生成画像。趣味の個人プロジェクトでの利用。既存作品の固有の絵・キャラは模倣していません（普遍的な昭和の質感のみ）。出典の追跡可能性のため本記録を残します。
- ※地面・空・水面は今回未適用（地面は土道・布と共有テクスチャのため、別マテリアル化が必要。後日対応）。

## フォント
- 画面表示は OS 標準フォント（游ゴシック等のsans-serif）を使用し、フォントファイルは同梱していません。
