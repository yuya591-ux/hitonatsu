// 時間帯（朝・昼・夕方・夜）ごとの設定をデータで持ち、時刻に応じて切り替え・補間する。
// Cradle の「フェーズ駆動（設定をデータで持って切り替える）」と同じ発想。
// ここを編集するだけで世界の色や時間配分を調整できる。

import { lerpColor } from '../util/color.js'

export const DAY_LENGTH_SEC = 900 // ゲーム内の1日 = 15分

// 時間帯ごとの色パレット（アートトークン）。すべて同じキーを持たせ、補間できるようにする。
// 郷愁寄りに少しくすませた色。鮮やかすぎないのが「あの夏」のコツ。
const PALETTES = {
  morning: {
    skyTop: '#A9CFE0', skyMid: '#CFE0DA', skyBottom: '#F3E6CC',
    light: '#FFF1D5', cloud: '#FBF6EC', cloudShade: '#D8DCD6',
    sun: '#FFEFC4', moon: '#F4EFD0', star: '#FFFFFF',
    far: '#93A6AC', ground: '#93AC73', groundShade: '#6C875A',
    wood: '#C2A06A', woodShade: '#90704A',
  },
  noon: {
    skyTop: '#7FAFD2', skyMid: '#AEC9D8', skyBottom: '#DDE5DC',
    light: '#FBFBF2', cloud: '#FCFAF3', cloudShade: '#C9D4D2',
    sun: '#FCF6E6', moon: '#F4EFD0', star: '#FFFFFF',
    far: '#8AA0A6', ground: '#86A65C', groundShade: '#5C7C46',
    wood: '#C09C5E', woodShade: '#8C6A3E',
  },
  evening: {
    skyTop: '#5E5680', skyMid: '#D98C63', skyBottom: '#F0BE78',
    light: '#F6CE9A', cloud: '#C98A6E', cloudShade: '#8E5E58',
    sun: '#EE7E4C', moon: '#F4EFD0', star: '#FFF1CC',
    far: '#76697A', ground: '#7C7650', groundShade: '#4C423C',
    wood: '#9E784C', woodShade: '#684A34',
  },
  night: {
    skyTop: '#121A33', skyMid: '#1E2846', skyBottom: '#39415E',
    light: '#5A6088', cloud: '#2A3252', cloudShade: '#191F37',
    sun: '#FFF6E0', moon: '#F2EACE', star: '#F4F2E2',
    far: '#222C44', ground: '#2A3636', groundShade: '#171F22',
    wood: '#463E30', woodShade: '#28221A',
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
