# 絵の差し替えガイド（水彩画像で“本物”に近づける）

このゲームは各場面を **「コードで描く版（最初から動く）」** と **「画像を貼る版（あなたが用意した水彩画）」** の2通りで持てます。
画像を置くだけで自動的に切り替わり、**時間帯の色味・やわらかな光・霞・周辺減光・紙の質感・舞う粒子（埃/蛍）はその画像の上にも乗る**ので、1枚の静止画でも“朝→夜”の移ろいを感じられます。

## 置き方（これだけ）

```
src/assets/scenes/<場面ID>/fore.png   ← その場面の水彩画（画面いっぱいの一枚絵）
```

- 場面ID: `engawa`（縁側）/ `harappa`（原っぱ）/ `jinja`（神社）/ `tanbomichi`（田んぼ道）/ `kawabe`（川辺）
- ファイルを置いて私に「置いた」と言ってください。ビルドして反映・デプロイします。
- 消したい時はファイルを消すだけで、元のコード描画に戻ります。

## 画像の仕様

- **比率 16:9 / 解像度 1920×1080 程度 / PNG**（横画面いっぱいに引き伸ばして表示）
- **昼〜午後くらいの中庸な明るさ**で描く（夜や夕方は engine が色味で寄せます）
- 空も含めた一枚絵でOK（時間帯の色は engine が上から重ねます）

## 画風（プロンプト共通の指示）

> soft watercolor painting, nostalgic Japanese countryside summer, gentle muted palette, hazy atmospheric perspective, soft diffused edges (wet-on-wet), visible paper texture, calm and quiet, fixed wide-angle one-scene composition, no people, no text, no logos, no UI, original scenery (do not imitate any existing game or franchise)

色の目安（くすませた夏）: 空 #A9CFE0〜#DDE5DC、緑 #86A65C/#5C7C46、土・木 #C09C5E/#8C6A3E、遠景の霞 #93A6AC。

## 場面ごとのプロンプト（英語が生成向き）

**縁側 engawa**
> A quiet wooden veranda (engawa) of an old Japanese country house seen from under the eaves, looking out over a green yard toward distant hazy hills, a glass wind chime hanging from the eaves, soft summer light. soft watercolor, muted nostalgic palette, paper texture, no people, no text, original.

**原っぱ harappa**
> An open grassy summer field in the Japanese countryside, tall green grass swaying, a single tree to one side, distant hazy mountains, big soft summer sky. soft watercolor, muted nostalgic palette, atmospheric haze, paper texture, no people, no text, original.

**神社 jinja**
> A small rural Japanese shrine in tree shade, mossy stone steps leading up, a simple weathered torii gate slightly off-center, dappled light through leaves, cicada-summer stillness. soft watercolor, muted nostalgic palette, paper texture, no people, no text, original.

**田んぼ道 tanbomichi**
> A narrow earthen path between green rice paddies receding toward distant hazy hills, paddies reflecting the sky, telephone poles in the distance, late-summer afternoon. soft watercolor, muted nostalgic palette, atmospheric perspective, paper texture, no people, no text, original.

**川辺 kawabe**
> A calm clear shallow river in the Japanese countryside, grassy banks, smooth stones, gentle ripples reflecting the sky, trees along the far bank, quiet summer. soft watercolor, muted nostalgic palette, paper texture, no people, no text, original.

## 著作権の注意（厳守）
- 既存作品（「僕の夏休み」等）の絵・構図・キャラ・固有名を**まねない**。あくまで普遍的な「あの夏の田舎」を、完全オリジナルで描く。
- 生成画像に他作品のロゴ・キャラ・文字が混ざっていないか確認してから採用する。
