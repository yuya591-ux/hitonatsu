import './style.css'
import { createClock } from './engine/clock.js'
import { createLoop } from './engine/loop.js'
import { createSceneManager } from './engine/sceneManager.js'
import { buildScenes } from './scenes/scenes.js'
import { getBlendedPalette, getCurrentPhase } from './data/phases.js'
import { drawHud } from './draw/hud.js'
import { applyPost } from './draw/post.js'
import { drawParticles } from './draw/particles.js'
import { createAudioManager } from './audio/audioManager.js'
import { loadAudioUrls } from './data/audioAssets.js'
import { activeSounds } from './data/soundscape.js'

// ── P2: 残り4場面＋場面の行き来 ──
// 縁側・原っぱ・神社・田んぼ道・川辺を、隣接にそって crossfade で行き来する。

// 検証・調整用のURLパラメータ（本番では使わない）
//   ?t=0.62 …時刻を固定  ?paused=1 …時間停止  ?speed=60 …早送り
//   ?autostart=1 …スタート画面を出さず開始   ?scene=jinja …開始場面を指定
const params = new URLSearchParams(location.search)
const startTime = params.has('t') ? parseFloat(params.get('t')) : 0
const speed = params.has('speed') ? parseFloat(params.get('speed')) : 1
const paused = params.get('paused') === '1'
const autostart = params.get('autostart') === '1' || params.has('t') || params.has('scene')
const startScene = params.get('scene')

const canvas = document.getElementById('scene')
const ctx = canvas.getContext('2d')
const startScreen = document.getElementById('start-screen')
const startButton = document.getElementById('start-button')
const placeLabel = document.getElementById('place-label')
const nav = {
  left: document.getElementById('nav-left'),
  right: document.getElementById('nav-right'),
  up: document.getElementById('nav-up'),
  down: document.getElementById('nav-down'),
}
const muteButton = document.getElementById('mute-button')
const volumeInput = document.getElementById('volume')

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

// 時計・場面・ループ
const clock = createClock({ startTime, speed, paused: true })
const scenes = createSceneManager()
for (const scene of buildScenes()) scenes.register(scene)
if (startScene) scenes.setStart(startScene)

// 環境音（素材が無ければ無音で安全に動く）
const audio = createAudioManager(loadAudioUrls())

// 場所名を控えめに表示し、移動できる方向の矢印だけ出す
function refreshUi(scene) {
  if (placeLabel) {
    placeLabel.textContent = scene.name
    placeLabel.classList.remove('show')
    // いったん消してから出すと、場面が変わるたびにふわっと出る
    void placeLabel.offsetWidth
    placeLabel.classList.add('show')
  }
  for (const dir of ['left', 'right', 'up', 'down']) {
    if (nav[dir]) nav[dir].classList.toggle('hidden', !scene.neighbors[dir])
  }
}
scenes.onChange(refreshUi)

// 方向ボタン
for (const dir of ['left', 'right', 'up', 'down']) {
  if (nav[dir]) nav[dir].addEventListener('click', () => scenes.move(dir))
}
// キーボードでも移動できる（PC向け）
window.addEventListener('keydown', (e) => {
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
  if (map[e.key]) scenes.move(map[e.key])
})

function onFrame(dt, now) {
  clock.update(dt)
  scenes.update(dt)
  const time = clock.time
  const frame = { time, now, palette: getBlendedPalette(time) }
  scenes.draw(ctx, view, frame)
  drawParticles(ctx, view, frame) // 光に舞う埃・夜の蛍
  applyPost(ctx, view, frame) // 一枚絵としての仕上げ（霞・色味・減光・紙の質感）
  drawHud(ctx, view, frame, getCurrentPhase(time))
  // いまの時間帯・場面に合う環境音へなめらかに切り替える
  if (audio.started) {
    audio.setActive(activeSounds(time, scenes.currentId))
    audio.update(dt)
  }
}

const loop = createLoop(onFrame)
loop.start()

// 自己検証用の最小ハンドル（本番の挙動には影響しない）
window.__hitonatsu = { audio, scenes, clock }

// 音量・ミュートUI
if (volumeInput) {
  audio.setVolume(Number(volumeInput.value) / 100)
  volumeInput.addEventListener('input', () => audio.setVolume(Number(volumeInput.value) / 100))
}
if (muteButton) {
  muteButton.addEventListener('click', () => {
    const muted = audio.toggleMute()
    muteButton.textContent = muted ? '🔇' : '🔊'
    muteButton.setAttribute('aria-label', muted ? '音を出す' : '音を消す')
  })
}

// 横画面いっぱいに表示するため、可能ならフルスクリーン＋横向き固定にする
// （iPhoneのSafariは未対応。その場合は「ホーム画面に追加」で起動するとバーが消える）
function goFullscreen() {
  const el = document.documentElement
  const req = el.requestFullscreen || el.webkitRequestFullscreen
  if (!req) return
  Promise.resolve(req.call(el))
    .then(() => {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {})
      }
    })
    .catch(() => {})
}

// 「はじめる」で一日が動き出す（このユーザー操作の後に音を立ち上げる＝iOS自動再生制限への先回り）
function beginDay() {
  if (startScreen) startScreen.classList.add('hidden')
  if (!paused) clock.start()
  refreshUi(scenes.current)
  audio.start()
  goFullscreen()
}
if (startButton) startButton.addEventListener('click', beginDay)
if (autostart) beginDay()
