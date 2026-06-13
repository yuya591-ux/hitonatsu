import './style.css'
import { createClock } from './engine/clock.js'
import { createLoop } from './engine/loop.js'
import { createSceneManager } from './engine/sceneManager.js'
import { buildScenes } from './scenes/scenes.js'
import { getBlendedPalette, getCurrentPhase } from './data/phases.js'
import { smoothstep } from './util/color.js'
import { drawHud } from './draw/hud.js'
import { applyPost } from './draw/post.js'
import { drawParticles } from './draw/particles.js'
import { createFireworks } from './draw/fireworks.js'
import { createAudioManager } from './audio/audioManager.js'
import { loadAudioUrls } from './data/audioAssets.js'
import { activeSounds } from './data/soundscape.js'
import { createPlayer, updatePlayer, drawPlayer, placeAfterMove, BAND } from './entities/player.js'
import { drawCreature, creaturePos } from './entities/creatures.js'
import { drawNpc } from './entities/npc.js'
import {
  isCaught, catchCreature, caughtCount,
  meetPerson, metEntries, caughtEntries, visitScene, visitedScenes,
} from './engine/record.js'

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
const catchPrompt = document.getElementById('catch-prompt')
const toast = document.getElementById('toast')
const sleepPrompt = document.getElementById('sleep-prompt')
const dialogueBox = document.getElementById('dialogue')
const dialogueName = document.getElementById('dialogue-name')
const dialogueText = document.getElementById('dialogue-text')
const diaryOverlay = document.getElementById('diary')
const diaryBody = document.getElementById('diary-body')
const diaryPicture = document.getElementById('diary-picture')
const diaryTitle = document.getElementById('diary-title')
const diaryClose = document.getElementById('diary-close')
const recordButton = document.getElementById('record-button')
const recordOverlay = document.getElementById('record')
const recordBody = document.getElementById('record-body')
const recordClose = document.getElementById('record-close')

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

// 操作する主人公
const player = createPlayer()

// 夏の夜の花火
const fireworks = createFireworks()

// 近くの対象（虫 or 住人）、会話の状態、絵日記の状態
let nearby = null // { type:'bug'|'npc', ref }
let dialogue = null // { npc, idx }
let diaryOpen = false
let recordOpen = false
let sleepReady = false

function showToast(msg) {
  if (!toast) return
  toast.textContent = msg
  toast.classList.add('show')
  clearTimeout(toast._t)
  toast._t = setTimeout(() => toast.classList.remove('show'), 1800)
}

// ── 会話 ──
function startDialogue(npc) {
  dialogue = { npc, idx: 0 }
  meetPerson(npc)
  player.target = null
  player.dirX = 0
  player.dirY = 0
  renderDialogue()
}
function renderDialogue() {
  if (!dialogue || !dialogueBox) return
  dialogueName.textContent = dialogue.npc.name
  dialogueText.textContent = dialogue.npc.lines[dialogue.idx]
  dialogueBox.classList.remove('hidden')
}
function advanceDialogue() {
  if (!dialogue) return
  dialogue.idx += 1
  if (dialogue.idx >= dialogue.npc.lines.length) {
    dialogue = null
    if (dialogueBox) dialogueBox.classList.add('hidden')
  } else {
    renderDialogue()
  }
}
if (dialogueBox) {
  dialogueBox.addEventListener('click', advanceDialogue)
  dialogueBox.addEventListener('pointerdown', (e) => e.stopPropagation())
}

// 採取の瞬間のきらめき
let catchFx = []

// ── つかまえる／はなしかける ──
function doInteract() {
  if (!nearby) return
  if (nearby.type === 'bug') {
    if (catchCreature(nearby.ref)) {
      showToast(`${nearby.ref.name}をつかまえた`)
      catchFx.push({ x: nearby.x, y: nearby.y, age: 0 })
    }
  } else if (nearby.type === 'npc') {
    startDialogue(nearby.ref)
  }
  nearby = null
  if (catchPrompt) catchPrompt.classList.add('hidden')
}
if (catchPrompt) {
  catchPrompt.addEventListener('click', doInteract)
  catchPrompt.addEventListener('pointerdown', (e) => e.stopPropagation())
}

// ── 夜の絵日記 ──
function openDiary() {
  diaryOpen = true
  clock.pause()
  if (diaryTitle) diaryTitle.textContent = 'ひと夏の一日 ― きょうのえにっき'
  // いまの画面を「描いた絵」として取り込む
  if (diaryPicture) {
    diaryPicture.innerHTML = ''
    const img = new Image()
    img.src = canvas.toDataURL('image/png')
    diaryPicture.appendChild(img)
  }
  const bugs = caughtEntries().map((e) => e.name)
  const people = metEntries().map((e) => e.name)
  const places = visitedScenes()
  const lines = []
  if (places.length) lines.push(`きょうは ${places.join('・')} を あるいた。`)
  if (bugs.length) lines.push(`むしを ${bugs.length}ひき つかまえた（${bugs.join('・')}）。`)
  else lines.push('むしは つかまえられなかった。また あした。')
  if (people.length) lines.push(`${people.join('・')} と はなした。`)
  lines.push('たのしい いちにちだった。')
  if (diaryBody) diaryBody.innerHTML = lines.map((l) => `<div class="line">${l}</div>`).join('')
  if (diaryOverlay) diaryOverlay.classList.remove('hidden')
}
// ── 夏の記録（図鑑） ──
function openRecord() {
  recordOpen = true
  clock.pause()
  if (recordBody) {
    // 採った虫を種類ごとにまとめて数える
    const counts = {}
    for (const e of caughtEntries()) counts[e.name] = (counts[e.name] || 0) + 1
    const bugLines = Object.entries(counts).map(([n, c]) => `${n} × ${c}`)
    const people = metEntries().map((e) => e.name)
    const places = visitedScenes()
    const section = (title, items) =>
      `<h3>${title}</h3>` +
      (items.length ? items.map((i) => `<div>${i}</div>`).join('') : '<div class="empty">まだ ありません</div>')
    recordBody.innerHTML =
      section('つかまえた虫', bugLines) +
      section('はなした人', people) +
      section('あるいた場所', places)
  }
  if (recordOverlay) recordOverlay.classList.remove('hidden')
}
function closeRecord() {
  recordOpen = false
  if (recordOverlay) recordOverlay.classList.add('hidden')
  if (!paused) clock.start()
}
if (recordButton) {
  recordButton.addEventListener('click', openRecord)
  recordButton.addEventListener('pointerdown', (e) => e.stopPropagation())
}
if (recordClose) recordClose.addEventListener('click', closeRecord)

function closeDiary() {
  diaryOpen = false
  if (diaryOverlay) diaryOverlay.classList.add('hidden')
  // 1日完結なので、また朝から（時計を朝へ戻して再開）
  clock.setTime(0)
  if (!paused) clock.start()
}
if (diaryClose) diaryClose.addEventListener('click', closeDiary)
if (sleepPrompt) {
  sleepPrompt.addEventListener('click', openDiary)
  sleepPrompt.addEventListener('pointerdown', (e) => e.stopPropagation())
}

window.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return
  if (diaryOpen) closeDiary()
  else if (dialogue) advanceDialogue()
  else if (sleepReady) openDiary()
  else doInteract()
})

// 端に達したとき：隣の場面があれば歩いて移れる
function onPlayerEdge(dir) {
  if (scenes.isMoving) return false
  const id = scenes.neighbor(dir)
  if (!id) return false
  scenes.goto(id)
  placeAfterMove(player, dir)
  return true
}

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
  visitScene(scene) // 訪れた場所を記録（夜の日記に出る）
}
scenes.onChange(refreshUi)

// ── 操作 ──
// 画面をタップ／クリックした場所へ歩く
function walkTo(clientX, clientY) {
  if (dialogue || diaryOpen || recordOpen || scenes.isMoving) return // 会話・日記・記録・移動中は歩かない
  const x = clientX / window.innerWidth
  const y = clientY / window.innerHeight
  player.target = {
    x: Math.min(Math.max(x, 0), 1),
    // 空をタップしたら地平線側（奥）へ向かう
    y: Math.min(Math.max(y, BAND.top - 0.06), BAND.bottom + 0.04),
  }
}
canvas.addEventListener('pointerdown', (e) => walkTo(e.clientX, e.clientY))

// 方向ボタン：その端まで歩いて、隣の場面へ
const edgeTarget = {
  left: { x: 0, y: () => player.y },
  right: { x: 1, y: () => player.y },
  up: { x: () => player.x, y: BAND.top - 0.06 },
  down: { x: () => player.x, y: BAND.bottom + 0.04 },
}
for (const dir of ['left', 'right', 'up', 'down']) {
  if (!nav[dir]) continue
  nav[dir].addEventListener('click', () => {
    const e = edgeTarget[dir]
    player.target = {
      x: typeof e.x === 'function' ? e.x() : e.x,
      y: typeof e.y === 'function' ? e.y() : e.y,
    }
  })
}

// キーボードでも歩ける（PC向け）。押している間その向きへ。
const keyDir = {
  ArrowLeft: ['dirX', -1], ArrowRight: ['dirX', 1],
  ArrowUp: ['dirY', -1], ArrowDown: ['dirY', 1],
  a: ['dirX', -1], d: ['dirX', 1], w: ['dirY', -1], s: ['dirY', 1],
}
window.addEventListener('keydown', (e) => {
  const k = keyDir[e.key]
  if (k) {
    player[k[0]] = k[1]
    player.target = null
  }
})
window.addEventListener('keyup', (e) => {
  const k = keyDir[e.key]
  if (k && player[k[0]] === k[1]) player[k[0]] = 0
})

function onFrame(dt, now) {
  clock.update(dt)
  scenes.update(dt)
  const time = clock.time
  const frame = { time, now, palette: getBlendedPalette(time) }
  // 場面遷移中・会話中・日記中・記録中は操作を止める
  player.frozen = scenes.isMoving || !!dialogue || diaryOpen || recordOpen
  updatePlayer(player, dt, onPlayerEdge)

  scenes.draw(ctx, view, frame)

  // 夏の夜の花火（夜だけ・空に開く）
  const night = time >= 0.82 ? smoothstep(0.82, 0.92, time) : 0
  fireworks.update(dt, view, night)
  fireworks.draw(ctx, view, night)

  // 虫・住人を描き、近くの対象（つかまえる/はなしかける）を決める
  nearby = null
  let best = Infinity
  const scene = scenes.current
  for (const c of scene.creatures || []) {
    if (isCaught(c.id)) continue
    drawCreature(c, ctx, view, frame)
    const pos = creaturePos(c, now)
    const d = Math.hypot((player.x - pos.x) * view.w, (player.y - pos.y) * view.h)
    if (d < view.h * 0.24 && d < best) {
      best = d
      nearby = { type: 'bug', ref: c, x: pos.x, y: pos.y }
    }
  }
  for (const npc of scene.npcs || []) {
    drawNpc(npc, ctx, view)
    const d = Math.hypot((player.x - npc.x) * view.w, (player.y - npc.y) * view.h)
    if (d < view.h * 0.26 && d < best) {
      best = d
      nearby = { type: 'npc', ref: npc, x: npc.x, y: npc.y }
    }
  }

  const busy = scenes.isMoving || !!dialogue || diaryOpen
  // 夜、縁側にいて対象が無ければ「ねる」を出す
  sleepReady = !busy && !nearby && scenes.currentId === 'engawa' && time >= 0.82
  if (catchPrompt) {
    if (nearby && !busy) {
      catchPrompt.textContent = nearby.type === 'bug' ? 'つかまえる' : 'はなしかける'
      catchPrompt.classList.remove('hidden')
    } else {
      catchPrompt.classList.add('hidden')
    }
  }
  if (sleepPrompt) sleepPrompt.classList.toggle('hidden', !sleepReady)

  drawPlayer(player, ctx, view) // 背景の上を歩く主人公

  // 採取の瞬間のきらめき
  for (const fx of catchFx) {
    fx.age += dt
    const pr = fx.age / 500
    const cx = fx.x * view.w
    const cy = fx.y * view.h
    const a = Math.max(0, 1 - pr)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(255,250,210,${a})`
    ctx.lineWidth = Math.max(1, view.h * 0.004)
    ctx.beginPath()
    ctx.arc(cx, cy, view.h * 0.02 + pr * view.h * 0.05, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = `rgba(255,255,230,${a})`
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + pr * 2
      const d = view.h * 0.03 * (0.5 + pr)
      ctx.beginPath()
      ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, view.h * 0.005 * a + 1, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  catchFx = catchFx.filter((f) => f.age < 500)

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
window.__hitonatsu = { audio, scenes, clock, player, caughtCount, doInteract, openDiary }

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
