import './style.css'
import { createClock } from './engine/clock.js'
import { createLoop } from './engine/loop.js'
import { createSceneManager } from './engine/sceneManager.js'
import { createEngawaScene } from './scenes/engawa.js'
import { getBlendedPalette, getCurrentPhase } from './data/phases.js'
import { drawHud } from './draw/hud.js'

// ── P1: エンジン土台＋縁側でシグネチャの空 ──
// 空のキャンバスに、時間帯につれて滑らかに移ろう空と縁側の風景を描く。

// 検証・調整用のURLパラメータ（本番では使わない）
//   ?t=0.62      … 時刻を固定して表示（0=朝 0.3=昼 0.62=夕方 0.85=夜）
//   ?paused=1    … 時間を止める（?t と併用で特定の時刻を観察）
//   ?speed=60    … 時間を早送り（動作確認用）
//   ?autostart=1 … スタート画面を出さずにすぐ始める
const params = new URLSearchParams(location.search)
const startTime = params.has('t') ? parseFloat(params.get('t')) : 0
const speed = params.has('speed') ? parseFloat(params.get('speed')) : 1
const paused = params.get('paused') === '1'
const autostart = params.get('autostart') === '1' || params.has('t')

const canvas = document.getElementById('scene')
const ctx = canvas.getContext('2d')
const startScreen = document.getElementById('start-screen')
const startButton = document.getElementById('start-button')

const view = { w: 0, h: 0 }

function resize() {
  const dpr = window.devicePixelRatio || 1
  view.w = window.innerWidth
  view.h = window.innerHeight
  canvas.width = Math.floor(view.w * dpr)
  canvas.height = Math.floor(view.h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
window.addEventListener('resize', resize)
resize()

// 時計・場面・ループを用意
const clock = createClock({ startTime, speed, paused: true }) // 最初は止めておく
const scenes = createSceneManager()
scenes.register(createEngawaScene())

function onFrame(dt, now) {
  clock.update(dt)
  const time = clock.time
  const frame = {
    time,
    now,
    palette: getBlendedPalette(time),
  }
  scenes.draw(ctx, view, frame)
  drawHud(ctx, view, frame, getCurrentPhase(time))
}

const loop = createLoop(onFrame)
loop.start() // 描画自体はすぐ始める（時計はスタートまで止まったまま＝静かな朝の一枚絵）

// 「はじめる」で一日が動き出す（音はこの操作の後に立ち上げる設計＝iOS対策。音はP3で実装）
function beginDay() {
  if (startScreen) startScreen.classList.add('hidden')
  if (!paused) clock.start()
}
if (startButton) startButton.addEventListener('click', beginDay)

if (autostart) beginDay()
