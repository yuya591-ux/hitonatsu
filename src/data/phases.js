// 時間帯（朝・昼・夕方・夜）ごとの設定をデータで持ち、時刻に応じて切り替え・補間する。
// Cradle の「フェーズ駆動（設定をデータで持って切り替える）」と同じ発想。
// ここを編集するだけで世界の色や時間配分を調整できる。

import { lerpColor } from '../util/color.js'

export const DAY_LENGTH_SEC = 900 // ゲーム内の1日 = 15分

// 時間帯ごとの色パレット（アートトークン）。すべて同じキーを持たせ、補間できるようにする。
const PALETTES = {
  morning: {
    skyTop: '#BFE3F0', skyMid: '#DCEBE4', skyBottom: '#FCEFD2',
    light: '#FFF3D6', cloud: '#FFFFFF', cloudShade: '#E5ECEC',
    sun: '#FFF6E0', moon: '#F4EFD0', star: '#FFFFFF',
    far: '#8FA9B8', ground: '#9FB873', groundShade: '#6E8A57',
    wood: '#C9A86E', woodShade: '#9A7B49',
  },
  noon: {
    skyTop: '#6FB1E4', skyMid: '#A9D2EE', skyBottom: '#DCEFF7',
    light: '#FFFFFF', cloud: '#FFFFFF', cloudShade: '#D7E2E8',
    sun: '#FFFFFF', moon: '#F4EFD0', star: '#FFFFFF',
    far: '#7E9BB0', ground: '#8FB95E', groundShade: '#5E8246',
    wood: '#CBA463', woodShade: '#94703F',
  },
  evening: {
    skyTop: '#4A4374', skyMid: '#E8915B', skyBottom: '#F6C76A',
    light: '#FFD9A0', cloud: '#E8A87C', cloudShade: '#B5675A',
    sun: '#FF8A4C', moon: '#F4EFD0', star: '#FFF6D0',
    far: '#6A5A6E', ground: '#7A7A4E', groundShade: '#4A3F3A',
    wood: '#A6794A', woodShade: '#6E4F33',
  },
  night: {
    skyTop: '#0E1430', skyMid: '#1A2142', skyBottom: '#2A2F50',
    light: '#6A6F9A', cloud: '#2C3358', cloudShade: '#1B2140',
    sun: '#FFF6E0', moon: '#F4EFD0', star: '#FFFFFF',
    far: '#1E2740', ground: '#2E3A3A', groundShade: '#161E22',
    wood: '#4A4030', woodShade: '#2A2418',
  },
}

// 時間帯のキーフレーム。at = 一日の中の位置(0.0〜1.0)。
// ここで時間配分（朝が長い/夕方の入り など）を調整できる。
export const PHASES = [
  { key: 'morning', at: 0.0, label: '朝', icon: 'sun', ambient: 'morning', palette: PALETTES.morning },
  { key: 'noon', at: 0.3, label: '昼', icon: 'sun', ambient: 'noon', palette: PALETTES.noon },
  { key: 'evening', at: 0.62, label: '夕方', icon: 'sun', ambient: 'evening', palette: PALETTES.evening },
  { key: 'night', at: 0.85, label: '夜', icon: 'moon', ambient: 'night', palette: PALETTES.night },
]

// 補間用の区切り。最後に「夜→翌朝」へ戻る仮想キーフレーム(at=1.0=朝)を足して輪にする。
const STOPS = [...PHASES, { ...PHASES[0], at: 1.0 }]

// いまの時刻 t(0..1) における、混ぜ合わせたパレットを返す（{r,g,b} の集まり）。
// 隣り合う時間帯の間を線形補間するので、色は急に変わらずじわじわ移ろう。
export function getBlendedPalette(t) {
  const time = ((t % 1) + 1) % 1
  let i = 0
  for (; i < STOPS.length - 1; i++) {
    if (time >= STOPS[i].at && time < STOPS[i + 1].at) break
  }
  const a = STOPS[i]
  const b = STOPS[i + 1]
  const span = b.at - a.at
  const f = span > 0 ? (time - a.at) / span : 0

  const out = {}
  for (const key of Object.keys(a.palette)) {
    out[key] = lerpColor(a.palette[key], b.palette[key], f)
  }
  return out
}

// いまの時刻に最も近い時間帯の見出し（HUD表示用）。
export function getCurrentPhase(t) {
  const time = ((t % 1) + 1) % 1
  let current = PHASES[0]
  for (const p of PHASES) {
    if (time >= p.at) current = p
  }
  return current
}
