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
} from '../draw/scenery.js'

// 1場面ぶんのレイヤーを組み立てるファクトリ。
function createScene({ id, name, neighbors, drawForeground, creatures = [], npcs = [] }) {
  return {
    id,
    name,
    neighbors,
    creatures,
    npcs,
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
      neighbors: { left: 'harappa', right: 'tanbomichi', up: 'jinja' },
      drawForeground: foreEngawa,
      npcs: [
        {
          id: 'engawa-obaa',
          name: 'おばあさん',
          kind: 'grandma',
          x: 0.3,
          y: 0.84,
          face: 'right',
          lines: ['よう帰った。今日も よう晴れたねえ。', 'のどが渇いたら、井戸の水を飲みなさい。', 'あんまり遠くまで 行きすぎちゃ いかんよ。'],
        },
      ],
    }),
    createScene({
      id: 'harappa',
      name: '原っぱ',
      neighbors: { right: 'engawa' },
      drawForeground: foreHarappa,
      creatures: [
        { id: 'harappa-beetle', kind: 'beetle', name: 'カブトムシ', x: 0.8, y: 0.66, seed: 1 },
        { id: 'harappa-dragonfly', kind: 'dragonfly', name: 'トンボ', x: 0.35, y: 0.66, seed: 5 },
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
    }),
    createScene({
      id: 'jinja',
      name: '神社',
      neighbors: { down: 'engawa' },
      drawForeground: foreJinja,
      creatures: [{ id: 'jinja-cicada', kind: 'cicada', name: 'セミ', x: 0.24, y: 0.5, seed: 2 }],
      npcs: [
        {
          id: 'jinja-ojii',
          name: 'おじいさん',
          kind: 'grandpa',
          x: 0.74,
          y: 0.82,
          face: 'left',
          lines: ['この石段はな、わしが子供の頃から ここにある。', '夏の宮は 涼しくて ええじゃろう。', '日が暮れる前に 帰るんじゃぞ。'],
        },
      ],
    }),
    createScene({
      id: 'tanbomichi',
      name: '田んぼ道',
      neighbors: { left: 'engawa', right: 'kawabe' },
      drawForeground: foreTanbomichi,
      creatures: [{ id: 'tanbo-dragonfly', kind: 'dragonfly', name: 'トンボ', x: 0.7, y: 0.62, seed: 3 }],
    }),
    createScene({
      id: 'kawabe',
      name: '川辺',
      neighbors: { left: 'tanbomichi' },
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
    }),
  ]
}
