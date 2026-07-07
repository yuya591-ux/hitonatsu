# CREDITS — 使用素材の出典とライセンス

このゲームで使用しているフリー素材の出典・作者・ライセンスを全数記録します（CLAUDE.md / SPEC.md 準拠）。
素材はいずれも**改変せずそのまま**ループ再生に使用しています。

## 環境音

すべて [Wikimedia Commons](https://commons.wikimedia.org/) から取得。各ファイルの説明ページのライセンスに従います。
※元は Ogg Vorbis 形式。Safari/iPhone でも再生できるよう **MP3 に形式変換**して同梱しています（音の内容は無加工）。
※J2：初回読み込みを軽くするため、同じ音を **AAC（.m4a）にも再エンコード**して同梱（蝉/ヒグラシ/風鈴=96kbps、朝/夜/川=64kbps・ステレオ/サンプルレート維持）。AAC対応ブラウザ（iPhone含む）には軽い .m4a を、非対応には .mp3 をフォールバックで渡します。元素材・ライセンスは上表のまま（差し替えなし）。

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

### 音量の調整（2026-06-16）
- 環境音は全体に控えめへ（`AUDIO.ambMaster`）。**夜のカエル（`night.mp3`）は音量を大きく下げました**（`AUDIO.nightAmb`＝眠れる静けさ優先）。素材自体は上表のまま（差し替えなし）。
- 「夕方〜夜の紛らわしい音」＝薄曇りで鳴っていた**薄い雨音・遠雷**でした。本降りのときだけ鳴るよう開始しきい値を上げて解消（`AUDIO.rainStart` / `AUDIO.thunderStart`）。

## 効果音・お祭り・雨の音楽（自前合成＝AudioContextで生成・外部素材なし）
以下は外部素材を使わず、Web Audio API（AudioContext）で**コードから合成**しています。既存作品の旋律・固有の音は模倣していない完全オリジナルで、ライセンス上の制約はありません（CLAUDE.mdの「自前合成のみ」方針）。

| ゲーム内の音 | 合成方法（要旨） | 実装関数 | 音量パラメータ |
|---|---|---|---|
| 雨音 | ホワイトノイズ＋HPF/LPF＝やわらかい夏の雨。weatherで音量 | `initRainAudio` | `AUDIO.rainVol` |
| 遠雷 | 低いノイズのランブル（LPFを下降）。本降りのときだけ | `maybeThunder` | （関数内 tvol） |
| 花火 | 深い低音の「ドーン」（低いサインの胴）＋破裂の空気（低域ノイズ）＋丘にこだまする余韻（フィードバックディレイ）。遅れて火花の高域。**縁日の夜の決まった時間だけ**上がる（一晩中は鳴らさない） | `playFireworkBoom` / `spawnFirework` | 開催日・時間 `FIREWORK.days/from/to` |
| 夕焼けチャイム | 鐘らしい倍音の5音＋山びこエコー（特定の防災旋律は不使用） | `playChime` | （関数内 vol） |
| **縁日のお囃子＝盆踊り** | 踊れる太鼓の地打ち＋鉦（チキチキ）＋篠笛の民謡旋律（ヨナ抜き/陽音階の呼びと応え2小節）。**屋台からの距離で音量が変わる空間音響**＝音をたどって縁日へ。炭坑節など特定曲は模倣しないオリジナル | `updateFestival` / `scheduleFestBar` | `AUDIO.festVol` / `festRefDist` / `festMaxDist`、開催日 `FESTIVAL.days` |
| **雨の神秘的BGM** | やわらかいパッド（Am7・少しデチューン＋ゆっくり開閉するLPF）。雨のときだけ静かに流し、止むとフェードアウト | `initRainBgm` | `AUDIO.rainBgmVol` |
| オルゴール（**既定OFF**） | ペンタトニックの短い旋律をまばらに。常時BGMなしの方針で既定オフ・設定でON可 | `updateMusicBox` | （`getBgmOut` gain） |

> 音量・距離減衰・開催日などは `src/proto3d/main.js` 先頭付近の `AUDIO{}` / `FESTIVAL{}` で数値だけ変更できます。

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
  | `public/textures/ground_grass.jpg` | 地面の草 | 淡く脱色した草の穂のみ・低コントラスト（頂点色の地面色を保つ）・シームレス | 91 |
- **ライセンス**：Flux 生成画像。趣味の個人プロジェクトでの利用。既存作品の固有の絵・キャラは模倣していません（普遍的な昭和の質感のみ）。出典の追跡可能性のため本記録を残します。
- 地面は土道・布と共有の `watercolorTex` を汚さないよう、**地面メッシュ専用テクスチャ**として適用（頂点色×淡い草の穂）。土道・布は無改変。
- ※空・水面は今回未適用（水面はシェーダ、空は別系統のため）。

## フォント
- 画面表示は OS 標準フォント（游ゴシック等のsans-serif）を使用し、フォントファイルは同梱していません。

## 効果音・環境音・人の声（自前合成）
- 蝉・風鈴・川などのMP3環境音以外の効果音（お囃子・ラジオ体操の旋律・生活音）はすべて **Web Audio API による自前合成**で、外部録音素材は使用していません。
- **人の声・子どもの歓声・ざわめき・犬・自転車のベル等（賑わいの生活音）も録音を一切使わず合成**しています。声は母音的なフォルマント止まり＝特定の言葉・固有の発話は含みません（既存作品の音・台詞は模倣していません）。
- ラジオ体操の旋律は完全オリジナルで、実在のラジオ体操の楽曲は使用していません。

## 3Dキャラクターモデル（VRM・画風刷新パイロット 2026-07-07）
- **Sendagaya Shino（千駄ヶ谷 篠）** `public/models/sendagaya_shino.vrm`（約15MB）
  - 作者・提供：**VRoid Project（pixiv）** の旧ベータ版公式サンプルモデル
  - **ライセンス：CC0（パブリックドメイン）** — VRoid公式ヘルプの「CC0 license models」一覧に該当。加えて**VRMファイル内の埋め込みメタデータでも `licenseName: "CC0"` / `allowedUserName: "Everyone"` / 商用可 を直接確認済み**
  - CC0の説明: https://creativecommons.org/publicdomain/zero/1.0/
  - 入手元（公開ミラー）: https://github.com/madjin/vrm-samples （vroid/beta/Sendagaya_Shino.vrm）
  - 用途：画風刷新の判断用パイロット（第三公園に1体を試験配置・遅延読込）
- 読み込みライブラリ：**@pixiv/three-vrm**（MITライセンス・npm経由で同梱ビルド・実行時の外部通信なし）
- **Sendagaya Shibu（千駄ヶ谷 渋）** `public/models/sendagaya_shibu.vrm`（約17MB）— 同上（VRoid公式旧サンプル・**CC0**・ファイル内メタで確認済み・入手元同じ）。子ども体型化の実験体（全体0.72倍＋頭ボーン1.38倍）
- **Sakurada Fumiriya（桜田 文理也）** `public/models/sakurada_fumiriya.vrm`（約19MB）— 同上（VRoid公式旧サンプルの男性モデル・**CC0**・ファイル内メタで `licenseName:"CC0"` / Everyone / 商用可を確認済み・入手元同じ vroid/beta/Sakurada_Fumiriya.vrm）。主人公刷新（Phase A）の基体候補＝「夏の男の子」パイロット（子ども化＋麦わら帽子＋半ズボンはコード側で付与）
