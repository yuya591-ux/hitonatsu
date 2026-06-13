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
function createScene({ id, name, neighbors, drawForeground }) {
  return {
    id,
    name,
    neighbors,
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
    }),
    createScene({
      id: 'harappa',
      name: '原っぱ',
      neighbors: { right: 'engawa' },
      drawForeground: foreHarappa,
    }),
    createScene({
      id: 'jinja',
      name: '神社',
      neighbors: { down: 'engawa' },
      drawForeground: foreJinja,
    }),
    createScene({
      id: 'tanbomichi',
      name: '田んぼ道',
      neighbors: { left: 'engawa', right: 'kawabe' },
      drawForeground: foreTanbomichi,
    }),
    createScene({
      id: 'kawabe',
      name: '川辺',
      neighbors: { left: 'tanbomichi' },
      drawForeground: foreKawabe,
    }),
  ]
}
