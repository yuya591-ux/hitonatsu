// 全場面の定義。各場面は「空（共通シグネチャ）＋遠景＋地面＋前景」のレイヤーで構成する。
// 隣接関係でつなぎ、移動で行き来する。
//
// レイヤーは createLayer 経由なので、将来 image を指定すれば
// 'assets/scenes/<id>/<layer>.png' のような画像に差し替えできる。

import { createLayer } from '../draw/layer.js'
import { drawSky } from '../draw/sky.js'
import { sceneImage } from '../data/assets.js'
import {
  drawFarHills,
  drawGround,
  foreEngawa,
  foreHarappa,
  foreJinja,
  foreTanbomichi,
  foreKawabe,
  foreShoutengai,
  foreJuutakugai,
  foreDanchi,
  foreIe,
} from '../draw/scenery.js'

// 1場面ぶんのレイヤーを組み立てるファクトリ。
function createScene({ id, name, neighbors, drawForeground, creatures = [], npcs = [], examinables = [] }) {
  return {
    id,
    name,
    neighbors,
    creatures,
    npcs,
    examinables,
    layers: [
      // 空（シグネチャ・全場面共通）。差し替えは想定せずコード描画固定。
      createLayer({ id: 'sky', drawCode: drawSky }),
      // 以下は src/assets/scenes/<id>/<layer>.png を置けば自動で画像版に切り替わる
      createLayer({ id: 'far', drawCode: drawFarHills, image: sceneImage(id, 'far') }),
      createLayer({ id: 'ground', drawCode: drawGround, image: sceneImage(id, 'ground') }),
      createLayer({ id: 'fore', drawCode: drawForeground, image: sceneImage(id, 'fore') }),
    ],
  }
}

// 場面のつながり：
//            神社
//             │
//   原っぱ─縁側─田んぼ道─川辺
export function buildScenes() {
  return [
    createScene({
      id: 'engawa',
      name: '縁側',
      neighbors: { left: 'harappa', right: 'tanbomichi', up: 'jinja', down: 'ie' },
      drawForeground: foreEngawa,
      npcs: [
        {
          id: 'engawa-obaa',
          name: 'おばあさん',
          kind: 'grandma',
          x: 0.3,
          y: 0.84,
          face: 'right',
          lines: ['よう帰った。今日も よう晴れたねえ。', 'のどが渇いたら、井戸の水を飲みなさい。'],
          linesByPhase: {
            morning: ['おはよう。今日も いい天気だ。', '朝ごはん、できとるよ。'],
            noon: ['暑いねえ。日かげで 休みなさい。', 'すいか、冷えとるよ。'],
            evening: ['もう こんな時間かい。', '夕やけが きれいだねえ。'],
            night: ['暗くなったね。気をつけて お帰り。', 'そろそろ 寝る支度を しなさいな。'],
          },
        },
      ],
      examinables: [
        { id: 'engawa-suika', x: 0.17, y: 0.9, lines: ['よく冷えてる。あとで 食べよう。'] },
        { id: 'engawa-oke', x: 0.44, y: 0.93, lines: ['つめたい 井戸水だ。'] },
        { id: 'engawa-furin', x: 0.82, y: 0.16, lines: ['ちりん、と 鳴った。'] },
      ],
    }),
    createScene({
      id: 'harappa',
      name: '原っぱ',
      neighbors: { right: 'engawa' },
      drawForeground: foreHarappa,
      creatures: [
        { id: 'harappa-beetle', kind: 'beetle', name: 'カブトムシ', x: 0.8, y: 0.66, seed: 1 },
        { id: 'harappa-dragonfly', kind: 'dragonfly', name: 'トンボ', x: 0.35, y: 0.62, seed: 5 },
        { id: 'harappa-butterfly', kind: 'butterfly', name: 'チョウ', x: 0.62, y: 0.74, seed: 8 },
        { id: 'harappa-grasshopper', kind: 'grasshopper', name: 'バッタ', x: 0.2, y: 0.86, seed: 11 },
        { id: 'harappa-ladybug', kind: 'ladybug', name: 'てんとうむし', x: 0.45, y: 0.82, seed: 14 },
      ],
      npcs: [
        {
          id: 'harappa-boy',
          name: '近所の子',
          kind: 'boy',
          x: 0.55,
          y: 0.8,
          face: 'left',
          lines: ['あっちの木に でっかいカブトムシが いたよ。', 'いっしょに 虫とり しようよ！'],
        },
      ],
      examinables: [
        { id: 'harappa-himawari', x: 0.9, y: 0.8, lines: ['せいくらべ。ぼくより 大きい。'] },
        { id: 'harappa-tree', x: 0.84, y: 0.6, lines: ['みきに せみの ぬけがらが ついてる。'] },
      ],
    }),
    createScene({
      id: 'jinja',
      name: '神社',
      neighbors: { down: 'engawa' },
      drawForeground: foreJinja,
      creatures: [
        { id: 'jinja-cicada', kind: 'cicada', name: 'セミ', x: 0.24, y: 0.5, seed: 2 },
        { id: 'jinja-mantis', kind: 'mantis', name: 'カマキリ', x: 0.78, y: 0.78, seed: 15 },
      ],
      npcs: [
        {
          id: 'jinja-ojii',
          name: 'おじいさん',
          kind: 'grandpa',
          x: 0.74,
          y: 0.82,
          face: 'left',
          lines: ['この石段はな、わしが子供の頃から ここにある。', '夏の宮は 涼しくて ええじゃろう。'],
          linesByPhase: {
            morning: ['朝の宮は 空気が ちがうじゃろう。', 'ラジオ体操は もう 済んだかね。'],
            noon: ['木かげは 涼しいのう。', 'セミが よう 鳴いとる。'],
            evening: ['ヒグラシが 鳴き始めたな。', '日が暮れる前に 帰るんじゃぞ。'],
            night: ['夜の宮は 静かじゃろう。', '星が きれいな 晩じゃ。'],
          },
          // 連日で少しずつ進む話（村のおまつり）
          linesByDay: {
            1: ['もうすぐ 村の おまつりが あるんじゃ。', 'たのしみに しておきなさい。'],
            2: ['おまつりは あさってかのう。', '提灯の 飾りつけが 始まったよ。'],
            3: ['おまつりは こんやじゃ！', '宮の あかりが きれいじゃろう。'],
          },
        },
      ],
      examinables: [
        { id: 'jinja-saisen', x: 0.5, y: 0.46, lines: ['そっと 手を合わせた。'] },
        { id: 'jinja-toro', x: 0.2, y: 0.8, lines: ['石灯籠。苔が むしている。'] },
        { id: 'jinja-koma', x: 0.66, y: 0.82, lines: ['狛犬。ちょっと こわい顔。'] },
      ],
    }),
    createScene({
      id: 'tanbomichi',
      name: '田んぼ道',
      neighbors: { left: 'engawa', right: 'kawabe' },
      drawForeground: foreTanbomichi,
      creatures: [
        { id: 'tanbo-dragonfly', kind: 'dragonfly', name: 'トンボ', x: 0.7, y: 0.62, seed: 3 },
        { id: 'tanbo-grasshopper', kind: 'grasshopper', name: 'バッタ', x: 0.3, y: 0.88, seed: 12 },
      ],
      examinables: [
        { id: 'tanbo-kakashi', x: 0.78, y: 0.62, lines: ['かかし。ぼうしを かぶってる。'] },
        { id: 'tanbo-jizo', x: 0.28, y: 0.82, lines: ['お地蔵さん。赤い前掛けが あたらしい。'] },
      ],
    }),
    createScene({
      id: 'kawabe',
      name: '川辺',
      neighbors: { left: 'tanbomichi', right: 'shoutengai' },
      drawForeground: foreKawabe,
      creatures: [{ id: 'kawabe-dragonfly', kind: 'dragonfly', name: 'トンボ', x: 0.5, y: 0.55, seed: 4 }],
      npcs: [
        {
          id: 'kawabe-girl',
          name: '女の子',
          kind: 'girl',
          x: 0.32,
          y: 0.84,
          face: 'right',
          lines: ['川の水、つめたくて 気持ちいいよ。', 'むこう岸に きれいな石が あるんだ。', 'すべるから 気をつけてね。'],
        },
      ],
      examinables: [
        { id: 'kawabe-ishi', x: 0.4, y: 0.85, lines: ['川の石。つるつるして いる。'] },
        { id: 'kawabe-ashi', x: 0.7, y: 0.92, lines: ['葦が さらさら 揺れている。'] },
      ],
    }),
    createScene({
      id: 'shoutengai',
      name: '商店街',
      neighbors: { left: 'kawabe', right: 'juutakugai' },
      drawForeground: foreShoutengai,
      npcs: [
        {
          id: 'shoutengai-obasan',
          name: '店のおばさん',
          kind: 'grandma',
          x: 0.32,
          y: 0.82,
          face: 'right',
          lines: ['いらっしゃい。今日は 暑いねえ。', 'ラムネ、冷えてるよ。'],
          linesByPhase: {
            evening: ['そろそろ 店じまいだよ。', 'おまけ しとくね。'],
            night: ['もう 遅いよ。気をつけて お帰り。'],
          },
        },
      ],
      examinables: [
        { id: 'shoutengai-jihanki', x: 0.16, y: 0.9, lines: ['自動販売機。ジュースが ならんでる。'] },
        { id: 'shoutengai-dagashi', x: 0.7, y: 0.84, lines: ['駄菓子屋。なにを 買おうか まよう。'] },
      ],
    }),
    createScene({
      id: 'juutakugai',
      name: '住宅街',
      neighbors: { left: 'shoutengai', right: 'danchi' },
      drawForeground: foreJuutakugai,
      npcs: [
        {
          id: 'juutaku-boy',
          name: '同級生',
          kind: 'boy',
          x: 0.6,
          y: 0.84,
          face: 'left',
          lines: ['この道、まっすぐ行くと 団地だよ。', 'こんど うちに 遊びに きなよ。'],
        },
      ],
      examinables: [
        { id: 'juutaku-post', x: 0.2, y: 0.86, lines: ['赤い まるい ポスト。'] },
        { id: 'juutaku-hei', x: 0.78, y: 0.82, lines: ['ブロック塀。だれかの 落書きが ある。'] },
      ],
    }),
    createScene({
      id: 'danchi',
      name: '団地',
      neighbors: { left: 'juutakugai' },
      drawForeground: foreDanchi,
      npcs: [
        {
          id: 'danchi-girl',
          name: '団地の子',
          kind: 'girl',
          x: 0.4,
          y: 0.86,
          face: 'right',
          lines: ['ブランコ、こいでみる？', '夕方になると いい においが してくるんだ。'],
        },
      ],
      examinables: [
        { id: 'danchi-suberidai', x: 0.24, y: 0.92, lines: ['すべり台。すこし さびてる。'] },
        { id: 'danchi-suna', x: 0.48, y: 0.95, lines: ['砂場。だれかの お城の あと。'] },
      ],
    }),
    createScene({
      id: 'ie',
      name: 'おじいちゃんち',
      neighbors: { up: 'engawa' },
      drawForeground: foreIe,
      npcs: [
        {
          id: 'ie-ojii',
          name: 'おじいちゃん',
          kind: 'grandpa',
          x: 0.66,
          y: 0.82,
          face: 'left',
          lines: ['おう、入ってきたか。', 'お茶でも 飲んでいきなさい。'],
          linesByPhase: {
            evening: ['もうすぐ 夕飯だな。', 'テレビでも 見るか。'],
            night: ['夜ふかしは いかんぞ。', 'ふとんは 敷いてあるからな。'],
          },
        },
      ],
      examinables: [
        { id: 'ie-tv', x: 0.82, y: 0.9, lines: ['ブラウン管テレビ。砂あらしが 映っている。'] },
        { id: 'ie-chabudai', x: 0.46, y: 0.86, lines: ['ちゃぶ台。お茶が 入れてある。'] },
        { id: 'ie-calendar', x: 0.83, y: 0.45, lines: ['カレンダー。きょうに 丸が してある。'] },
      ],
    }),
  ]
}
