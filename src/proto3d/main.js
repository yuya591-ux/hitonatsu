// ひと夏の一日 ― 3D試作（低ポリ＋トゥーン）
// 目的：本物の3Dで「僕君を操作して歩く／斜めの固定カメラ／高台に座って指スワイプで360度見回す」を確かめる縦スライス。
// 既存の2Dゲームとは別ページ(proto3d.html)。ここで操作感・没入感・絵の方向を実機で判定する。

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

const canvas = document.getElementById('c')
const actBtn = document.getElementById('act')
const lookHint = document.getElementById('look')

// ── 地面の高さ（解析式）。地面メッシュもキャラの足元もこの式で揃える。──
function heightAt(x, z) {
  const hill = 6.0 * Math.exp(-((x * x) + (z + 28) * (z + 28)) / (2 * 18 * 18)) // -Z側のなだらかな高台
  const undul = 0.6 * Math.sin(x * 0.08) * Math.cos(z * 0.08) // 微妙なうねり
  return hill + undul
}
const SEAT = new THREE.Vector3(0, 0, -27) // 高台のベンチ位置
SEAT.y = heightAt(SEAT.x, SEAT.z)

// ── レンダラ ──
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)) // 発熱対策で控えめ
renderer.outputColorSpace = THREE.SRGBColorSpace
// トゥーンの明るく彩度のある色を保つため、Neutral トーンマップ（ACESは色がくすむ）
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xdfeaf0, 55, 240) // 空気遠近（霞）。手前は鮮明、奥は淡く

const swayables = [] // 風で揺らす草木（{ obj, ph, amp }）

// ── トゥーン用のグラデ（数段の階調）──
function toonGradient(steps = 4) {
  const data = new Uint8Array(steps)
  for (let i = 0; i < steps; i++) data[i] = Math.round(255 * (i / (steps - 1)))
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}
const GRAD = toonGradient(4)
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: GRAD })

// ── ライト ──
const sunDir = new THREE.Vector3(-0.5, 0.82, -0.32).normalize()
const sun = new THREE.DirectionalLight(0xfff2d8, 2.1)
sun.position.copy(sunDir.clone().multiplyScalar(120))
sun.castShadow = true
sun.shadow.mapSize.set(1024, 1024)
sun.shadow.camera.near = 10
sun.shadow.camera.far = 260
const sc = sun.shadow.camera
sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70
sun.shadow.bias = -0.0004
scene.add(sun)
scene.add(new THREE.HemisphereLight(0xcfeaf6, 0x86a05a, 1.15)) // 空色↔草色の柔らかい環境光（明るめ）

// ── 空（グラデのドーム。霧は掛けない）──
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  fog: false,
  uniforms: {
    top: { value: new THREE.Color(0x8fc4e6) },
    mid: { value: new THREE.Color(0xcfe8f0) },
    bottom: { value: new THREE.Color(0xeef4e6) },
  },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
    void main(){ float h = normalize(vP).y; vec3 c = h>0.0 ? mix(mid, top, clamp(h*1.4,0.0,1.0)) : mix(mid, bottom, clamp(-h*2.0,0.0,1.0)); gl_FragColor = vec4(c,1.0);} `,
})
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat))

// 太陽（明るい球。ブルームでにじむ）
const sunBall = new THREE.Mesh(
  new THREE.SphereGeometry(9, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff4cf, fog: false }),
)
sunBall.position.copy(sunDir.clone().multiplyScalar(300))
scene.add(sunBall)

// ── 地面（高台つきの草地。頂点を heightAt で持ち上げる）──
const gGeo = new THREE.PlaneGeometry(240, 240, 90, 90)
gGeo.rotateX(-Math.PI / 2)
const gPos = gGeo.attributes.position
const gCol = []
const cGrassLo = new THREE.Color(0x6f9c45)
const cGrassHi = new THREE.Color(0x9cc06a)
for (let i = 0; i < gPos.count; i++) {
  const x = gPos.getX(i), z = gPos.getZ(i)
  const y = heightAt(x, z)
  gPos.setY(i, y)
  const t = THREE.MathUtils.clamp(0.4 + y * 0.06 + 0.5 * Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.2, 0, 1)
  const c = cGrassLo.clone().lerp(cGrassHi, t)
  gCol.push(c.r, c.g, c.b)
}
gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3))
gGeo.computeVertexNormals()
const ground = new THREE.Mesh(gGeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD }))
ground.receiveShadow = true
scene.add(ground)

// ── 低ポリの木（幹＋葉のかたまり）──
function makeTree(x, z, s = 1) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 3.4 * s, 6), toon(0x7a5a3a))
  trunk.position.y = 1.7 * s
  trunk.castShadow = true
  g.add(trunk)
  const greens = [0x6f9a47, 0x79a44e, 0x5f8b3c]
  for (let i = 0; i < 3; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry((1.7 - i * 0.3) * s, 0), toon(greens[i % 3]))
    blob.position.set((Math.random() - 0.5) * 1.4 * s, (3.4 + i * 0.9) * s, (Math.random() - 0.5) * 1.4 * s)
    blob.castShadow = true
    g.add(blob)
  }
  g.position.set(x, heightAt(x, z), z)
  scene.add(g)
  swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.02 })
}
for (const [x, z, s] of [[14, 6, 1.1], [-16, 2, 1.0], [22, -10, 1.2], [-22, -14, 1.1], [9, -22, 0.9], [-10, -24, 0.95], [30, 12, 1.0], [-30, 14, 1.1]]) makeTree(x, z, s)

// ── 小さな草花（赤・白・黄の点。場を生き生きと）──
{
  const flowerCols = [0xe06a6a, 0xf2efe6, 0xe8c84a, 0x6e7fd0]
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * 110, z = (Math.random() - 0.5) * 110
    if (x * x + (z + 28) * (z + 28) < 30) continue
    const fg = new THREE.Group()
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), toon(0x5f8b3c)); stem.position.y = 0.3; fg.add(stem)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toon(flowerCols[i % flowerCols.length])); head.position.y = 0.62; fg.add(head)
    fg.position.set(x, heightAt(x, z), z)
    scene.add(fg)
  }
}

// ── 遠くの丘（360度の景色のため、周囲に低い丘をぐるりと）──
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2 + 0.3
  const r = 150 + Math.random() * 40
  const hx = Math.cos(a) * r, hz = Math.sin(a) * r
  const hill = new THREE.Mesh(new THREE.SphereGeometry(30 + Math.random() * 24, 16, 10), toon(0x86b06a))
  hill.position.set(hx, -10 + Math.random() * 4, hz)
  hill.scale.y = 0.4
  scene.add(hill)
}

// ── 草むら（低い茂みのかたまり。InstancedMeshで安く密に）──
{
  const tuft = new THREE.IcosahedronGeometry(0.5, 0)
  tuft.scale(1, 0.45, 1) // ぺたっと平たく＝草むらのかたまり
  const N = 520
  const grass = new THREE.InstancedMesh(tuft, toon(0x76a249), N)
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s2 = new THREE.Vector3()
  let n = 0
  while (n < N) {
    const x = (Math.random() - 0.5) * 150, z = (Math.random() - 0.5) * 150
    if (x * x + (z + 28) * (z + 28) < 36) continue // ベンチ周りは空ける
    p.set(x, heightAt(x, z) + 0.12, z)
    q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0))
    const sc2 = 0.5 + Math.random() * 1.1
    s2.set(sc2, sc2 * (0.7 + Math.random() * 0.5), sc2)
    m.compose(p, q, s2)
    grass.setMatrixAt(n++, m)
  }
  grass.castShadow = false
  scene.add(grass)
}

// ── ひまわり ──
function makeSunflower(x, z) {
  const g = new THREE.Group()
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), toon(0x5f8b3c)); stem.position.y = 1.2; g.add(stem)
  const petals = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 16), toon(0xe8b23a)); petals.position.y = 2.5; petals.rotation.x = 0.5; g.add(petals)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12), toon(0x7a4a22)); core.position.set(0, 2.55, 0.04); core.rotation.x = 0.5; g.add(core)
  g.position.set(x, heightAt(x, z), z)
  g.children.forEach((c) => (c.castShadow = true))
  scene.add(g)
  swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.05 })
}
for (const [x, z] of [[6, 8], [7.2, 9], [-5, 7], [4, -4]]) makeSunflower(x, z)

// ── ベンチ（高台の上）──
function makeBench() {
  const g = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.0), toon(0x9c7a4a)); seat.position.y = 0.9; g.add(seat)
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.16), toon(0x9c7a4a)); back.position.set(0, 1.35, -0.42); g.add(back)
  for (const lx of [-1.4, 1.4]) for (const lz of [-0.4, 0.4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), toon(0x6a5230)); leg.position.set(lx, 0.45, lz); g.add(leg)
  }
  g.children.forEach((c) => (c.castShadow = true))
  g.position.copy(SEAT)
  g.rotation.y = Math.PI // 背を-Z側に＝座ると景色(-Z, 外側)を向く
  scene.add(g)
}
makeBench()

// 数個の石
for (const [x, z, r] of [[3, -20, 0.7], [-4, -18, 0.5], [12, -2, 0.6]]) {
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), toon(0x9a958c))
  rock.position.set(x, heightAt(x, z) + r * 0.4, z); rock.castShadow = true; rock.receiveShadow = true
  scene.add(rock)
}

// ── 主人公（低ポリの少年・麦わら帽子）──
function makeBoy() {
  const g = new THREE.Group()
  const skin = toon(0xe9bb8e), shirt = toon(0xf4f1e8), pants = toon(0x3f5a77), hat = toon(0xe0bc72)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.38), shirt); torso.position.y = 1.5; g.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 16), skin); head.position.y = 2.12; g.add(head)
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 16), hat); brim.position.y = 2.3; g.add(brim)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hat); cap.position.y = 2.3; g.add(cap)
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), pants); legL.position.set(-0.16, 0.9, 0); g.add(legL)
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), skin); armL.position.set(-0.42, 1.5, 0); g.add(armL)
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.userData = { legL, legR, armL, armR }
  return g
}
const boy = makeBoy()
boy.position.set(0, heightAt(0, 6), 6)
scene.add(boy)

// ── 空気中の光の粒（ふわふわ漂う埃／花粉）＝生気と奥行き ──
{
  const N = 140
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 90
    pos[i * 3 + 1] = 1 + Math.random() * 14
    pos[i * 3 + 2] = (Math.random() - 0.5) * 90
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xfff6d8, size: 0.16, transparent: true, opacity: 0.5, depthWrite: false, fog: true,
  }))
  motes.userData.isMotes = true
  scene.add(motes)
  window.__motes = motes
}

// ── カメラ（既定は斜め見下ろし。視点はユーザーが回せる/寄れる） ──
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 600)
// 視点の制御値（球面）。yaw=水平角, pitch=見下ろし角, dist=距離。
const camCtl = { yaw: 0.32, pitch: 0.62, dist: 19, minDist: 8, maxDist: 34, minPitch: 0.18, maxPitch: 1.25 }
function camOffset(out) {
  const cp = Math.cos(camCtl.pitch)
  out.set(Math.sin(camCtl.yaw) * cp, Math.sin(camCtl.pitch), Math.cos(camCtl.yaw) * cp).multiplyScalar(camCtl.dist)
  return out
}
camera.position.copy(boy.position).add(camOffset(new THREE.Vector3()))

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 0.86) // 強さ・半径・しきい値（控えめ）
composer.addPass(bloom)

// 仕上げ：夏の暖色グレード＋周辺減光（没入感）
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, warmth: { value: 0.012 }, vig: { value: 0.12 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float warmth; uniform float vig;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      c.r += warmth; c.b -= warmth*0.5;                 // ごくわずかな夏の暖かみ
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - vig * smoothstep(0.55, 0.95, d);        // ごく控えめな周辺減光
      gl_FragColor = vec4(c, 1.0); }`,
})
composer.addPass(gradePass)

function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h)
  composer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// ── 入力・状態 ──
let mode = 'walk' // 'walk' | 'sit'
let moving = false
let phase = 0
let facing = 0 // 向き(rad)
const keys = {}
const seatLook = { yaw: Math.PI, pitch: -0.05 } // 座ったときの視線（初期は外側=-Z）

// ぷにコン（指でスライドした方向へ歩く・白猫プロジェクト風）
const stickEl = document.getElementById('stick')
const knobEl = document.getElementById('knob')
const STICK_R = 60
const puni = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vy: 0 } // vx,vy = -1..1
const pointers = new Map() // 多点タッチ（2本指で視点操作）
let orbit = null // { mx, my, d }
let sitTap = null // 座っている時のタップ判定（軽タップ＝立つ）

function startPuni(id, x, y) {
  puni.active = true; puni.id = id; puni.ox = x; puni.oy = y; puni.vx = 0; puni.vy = 0
  stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px'
  knobEl.style.left = '50%'; knobEl.style.top = '50%'
  stickEl.style.display = 'block'
}
function endPuni() { puni.active = false; puni.id = -1; puni.vx = 0; puni.vy = 0; stickEl.style.display = 'none' }
function midDist() {
  const a = [...pointers.values()]
  return { mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }
}

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  canvas.setPointerCapture(e.pointerId)
  if (mode === 'sit') { sitTap = { x: e.clientX, y: e.clientY, moved: false }; return }
  if (pointers.size === 1) startPuni(e.pointerId, e.clientX, e.clientY)
  else if (pointers.size === 2) { endPuni(); orbit = midDist() }
})
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return
  const prev = pointers.get(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (mode === 'sit') {
    if (sitTap) {
      seatLook.yaw -= (e.clientX - prev.x) * 0.005
      seatLook.pitch = THREE.MathUtils.clamp(seatLook.pitch + (e.clientY - prev.y) * 0.005, -1.2, 1.1)
      if (Math.abs(e.clientX - sitTap.x) + Math.abs(e.clientY - sitTap.y) > 8) sitTap.moved = true
    }
    return
  }
  if (pointers.size >= 2 && orbit) {
    // 2本指：視点を回す・つまんで寄る
    const m = midDist()
    camCtl.yaw -= (m.mx - orbit.mx) * 0.006
    camCtl.pitch = THREE.MathUtils.clamp(camCtl.pitch - (m.my - orbit.my) * 0.005, camCtl.minPitch, camCtl.maxPitch)
    if (m.d > 0) camCtl.dist = THREE.MathUtils.clamp(camCtl.dist * (orbit.d / m.d), camCtl.minDist, camCtl.maxDist)
    orbit = m
  } else if (puni.active && e.pointerId === puni.id) {
    let dx = e.clientX - puni.ox, dy = e.clientY - puni.oy
    const len = Math.hypot(dx, dy) || 1
    const cl = Math.min(len, STICK_R)
    dx = (dx / len) * cl; dy = (dy / len) * cl
    knobEl.style.left = `calc(50% + ${dx}px)`; knobEl.style.top = `calc(50% + ${dy}px)`
    puni.vx = dx / STICK_R; puni.vy = dy / STICK_R
  }
})
function onUp(e) {
  if (!pointers.has(e.pointerId)) return
  pointers.delete(e.pointerId)
  if (mode === 'sit') { if (sitTap && !sitTap.moved) standUp(); sitTap = null; return }
  if (pointers.size < 2) orbit = null
  if (e.pointerId === puni.id) endPuni()
  // 2本指→1本に戻ったら、残った指でぷにコン再開
  if (pointers.size === 1 && !puni.active) {
    const [id, p] = [...pointers.entries()][0]
    startPuni(id, p.x, p.y)
  }
}
canvas.addEventListener('pointerup', onUp)
canvas.addEventListener('pointercancel', onUp)
addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true })
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false })

actBtn.addEventListener('click', () => { if (mode === 'walk') sitDown() })

function sitDown() {
  mode = 'sit'
  endPuni()
  boy.position.copy(SEAT)
  boy.rotation.y = Math.PI // 外側を向く
  boy.userData.legL.rotation.x = -1.4; boy.userData.legR.rotation.x = -1.4 // 座り姿勢
  boy.position.y = SEAT.y + 0.55
  moving = false
  actBtn.style.display = 'none'
  lookHint.style.display = 'block'
}
function standUp() {
  mode = 'walk'
  boy.userData.legL.rotation.x = 0; boy.userData.legR.rotation.x = 0
  boy.position.y = heightAt(boy.position.x, boy.position.z)
  lookHint.style.display = 'none'
}

// ── ループ ──
const clock = new THREE.Clock()
const seatEye = new THREE.Vector3()
const lookTo = new THREE.Vector3()
const camGoal = new THREE.Vector3()
const lookGoal = new THREE.Vector3()
const tmp = new THREE.Vector3()
const camFwd = new THREE.Vector3()
const camRight = new THREE.Vector3()

function update(dt) {
  // 風で草木をゆらす・光の粒を漂わせる（生気）
  const tsec = clock.elapsedTime
  for (const s of swayables) s.obj.rotation.z = Math.sin(tsec * 1.1 + s.ph) * s.amp
  if (window.__motes) window.__motes.rotation.y = tsec * 0.02

  if (mode === 'walk') {
    // カメラ基準の前/右（地面上）。指のスライド方向を世界の向きへ変換。
    camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize()
    camRight.set(-camFwd.z, 0, camFwd.x)
    const kx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0)
    const kz = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0)
    let sx = 0, sy = 0
    if (puni.active && Math.hypot(puni.vx, puni.vy) > 0.06) { sx = puni.vx; sy = puni.vy }
    else if (kx || kz) { sx = kx; sy = kz }
    const mag = Math.min(1, Math.hypot(sx, sy))
    moving = mag > 0.06
    if (moving) {
      // 画面：右=+sx, 上=前(=-sy)
      const wx = camRight.x * sx + camFwd.x * (-sy)
      const wz = camRight.z * sx + camFwd.z * (-sy)
      const l = Math.hypot(wx, wz) || 1
      const sp = 7 * dt * mag
      boy.position.x += (wx / l) * sp
      boy.position.z += (wz / l) * sp
      boy.position.y = heightAt(boy.position.x, boy.position.z)
      facing = Math.atan2(wx, wz)
      phase += dt * 9 * Math.max(0.6, mag)
    }
    // 向きをなめらかに
    let d = facing - boy.rotation.y
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2
    boy.rotation.y += d * Math.min(1, dt * 12)
    // 歩行アニメ
    const sw = moving ? Math.sin(phase) * 0.6 : 0
    boy.userData.legL.rotation.x = sw; boy.userData.legR.rotation.x = -sw
    boy.userData.armL.rotation.x = -sw; boy.userData.armR.rotation.x = sw
    boy.position.y += moving ? Math.abs(Math.sin(phase)) * 0.06 : 0

    const near = Math.hypot(boy.position.x - SEAT.x, boy.position.z - SEAT.z) < 3.2
    actBtn.style.display = near ? 'block' : 'none'

    // カメラ：今の視点（yaw/pitch/dist）で追従
    camGoal.copy(boy.position).add(camOffset(tmp))
    lookGoal.copy(boy.position); lookGoal.y += 1.4
  } else {
    // 座って360度見回す
    seatEye.copy(SEAT); seatEye.y = SEAT.y + 2.0
    const cp = Math.cos(seatLook.pitch)
    lookTo.set(
      seatEye.x + Math.sin(seatLook.yaw) * cp,
      seatEye.y + Math.sin(seatLook.pitch),
      seatEye.z + Math.cos(seatLook.yaw) * cp,
    )
    camGoal.copy(seatEye)
    lookGoal.copy(lookTo)
  }
  // カメラを目標へなめらかに寄せる
  camera.position.lerp(camGoal, Math.min(1, dt * (mode === 'sit' ? 6 : 5)))
  // 注視点もなめらかに
  camera.userData._look = camera.userData._look || new THREE.Vector3().copy(lookGoal)
  camera.userData._look.lerp(lookGoal, Math.min(1, dt * 6))
  camera.lookAt(camera.userData._look)
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05)
  update(dt)
  composer.render()
})

// 自己検証用の最小ハンドル
window.__proto3d = { THREE, scene, camera, boy, get mode() { return mode }, sitDown, standUp }
