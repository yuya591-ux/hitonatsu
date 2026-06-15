// ひと夏の一日 ― 3D試作（低ポリ＋トゥーン）
// 目的：本物の3Dで「僕君を操作して歩く／斜めの固定カメラ／高台に座って指スワイプで360度見回す」を確かめる縦スライス。
// 既存の2Dゲームとは別ページ(proto3d.html)。ここで操作感・没入感・絵の方向を実機で判定する。

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { loadAudioUrls } from '../data/audioAssets.js'
import boyImgUrl from './boy.png' // 主人公＝手描き水彩画（作者オリジナル）をビルボードで立てる
import { initPhotoMode } from './photo.js' // 写真モード（平成レトロ画質）＝独立モジュール（足すだけ）

const canvas = document.getElementById('c')
const actBtn = document.getElementById('act')
const lookHint = document.getElementById('look')

// ── 地面の高さ（解析式）。地面メッシュもキャラの足元もこの式で揃える。──
const POND = { x: 26, z: 18, r: 11 } // 池の位置・半径
const CREEK = { ax: 14, az: 26, bx: -42, bz: 40, half: 2.4, y: -0.1 } // 浅い小川（歩いて入れる）。yは水面の高さ
const HOUSE = { x: -17, z: 13 } // 昭和の田舎家（縁側）の位置
const TOWN = { x: 1000, z: 0 } // 住宅街エリアは遠くにオフセット（霧で野原と分離）。x>500=街
const MOUNT = { x: TOWN.x + 6, z: TOWN.z + 92, h: 34, w: 40, d: 18 } // 町の北にそびえる裏山（頂上で街を一望）
const SUNRISE_HILL = { x: TOWN.x - 82, z: TOWN.z - 26, h: 11, w: 15, d: 11 } // サンライズ(作者の家)の建つ高台＝裏山とは別（鶴見の山坂を再現・しっかり高い丘）
const SHRINE = { x: 2000, z: 0 } // 鎮守の杜（神社）エリア。x>1500=神社。石段の先の小高い杜
const SHR_HILL = { x: SHRINE.x, z: SHRINE.z + 45, h: 14, w: 26, d: 15 } // 社のある小山（入口側は平ら、奥でせり上がる）
const SWING = { x: TOWN.x - 16, z: TOWN.z + 37, py: 3.0, L: 2.2 } // 裏山ふもとのブランコ（乗ると街を見おろすブランコ視点）
// 当たり判定（建物・木などをすり抜けない）：円のリスト。移動時に外へ押し戻す
const colliders = []
function addCollider(x, z, r) { colliders.push({ x, z, r }) }
let swingSeat = null, swingPhase = 0, swingAmp = 0.3 // 振り子の状態
function heightAt(x, z) {
  if (x > 1500) {
    // 神社エリア：石段の先（+z奥）に社の小山がせり上がる
    const dx = x - SHR_HILL.x, dz = z - SHR_HILL.z
    const h = SHR_HILL.h * Math.exp(-(dx * dx / (2 * SHR_HILL.w * SHR_HILL.w) + dz * dz / (2 * SHR_HILL.d * SHR_HILL.d)))
    return h + (h > 0.5 ? 0.4 * Math.sin(x * 0.1) * Math.cos(z * 0.1) : 0)
  }
  if (x > 500) {
    // 北（+z奥）へ行くほど裏山がせり上がる＋西にサンライズの丘（山坂の町）
    const mdx = x - MOUNT.x, mdz = z - MOUNT.z
    const m = MOUNT.h * Math.exp(-(mdx * mdx / (2 * MOUNT.w * MOUNT.w) + mdz * mdz / (2 * MOUNT.d * MOUNT.d)))
    const sdx = x - SUNRISE_HILL.x, sdz = z - SUNRISE_HILL.z
    const s = SUNRISE_HILL.h * Math.exp(-(sdx * sdx / (2 * SUNRISE_HILL.w * SUNRISE_HILL.w) + sdz * sdz / (2 * SUNRISE_HILL.d * SUNRISE_HILL.d)))
    const undul = 0.4 * Math.sin(x * 0.1) * Math.cos(z * 0.1)
    return m + s + ((m > 0.5 || s > 0.5) ? undul : 0)
  }
  const hill = 6.0 * Math.exp(-((x * x) + (z + 28) * (z + 28)) / (2 * 18 * 18)) // -Z側のなだらかな高台
  const undul = 0.6 * Math.sin(x * 0.08) * Math.cos(z * 0.08) // 微妙なうねり
  const pond = -2.8 * Math.exp(-(((x - POND.x) ** 2) + ((z - POND.z) ** 2)) / (2 * 7 * 7)) // 池のくぼみ
  // 小川の川床（中心線に沿ったくぼみ＝浅い溝。ここに水がたまる）
  const cdx = CREEK.bx - CREEK.ax, cdz = CREEK.bz - CREEK.az
  const ct = Math.max(0, Math.min(1, ((x - CREEK.ax) * cdx + (z - CREEK.az) * cdz) / (cdx * cdx + cdz * cdz)))
  const cD2 = (x - (CREEK.ax + cdx * ct)) ** 2 + (z - (CREEK.az + cdz * ct)) ** 2
  const creek = -0.8 * Math.exp(-cD2 / (2 * 2.4 * 2.4))
  return hill + undul + pond + creek
}
const WATER_Y = -1.05 // 水面の高さ
const SEAT = new THREE.Vector3(0, 0, -27) // 高台のベンチ位置
SEAT.y = heightAt(SEAT.x, SEAT.z)

// ── レンダラ ──
// antialias は EffectComposer 経由だと最終ブリットにしか効かず実質無駄なので切る（軽量化）
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true }) // 絵日記に画面を取り込むため
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25)) // 発熱対策でさらに控えめ
renderer.outputColorSpace = THREE.SRGBColorSpace
// トゥーンの明るく彩度のある色を保つため、Neutral トーンマップ（ACESは色がくすむ）
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 1.18
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap // Softより軽い（トゥーンなら十分）

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xdfeaf0, 48, 185) // 空気遠近（霞）。遠景を空の色へ溶かす

const swayables = [] // 風で揺らす草木（{ obj, ph, amp }）

// ── トゥーン用のグラデ（数段の階調）──
function toonGradient(steps = 4) {
  // 影側が真っ暗にならないよう、最暗を 0.5 まで持ち上げる（やわらかく明るいトゥーン）
  const min = 0.5
  const data = new Uint8Array(steps)
  for (let i = 0; i < steps; i++) data[i] = Math.round(255 * (min + (1 - min) * (i / (steps - 1))))
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RedFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}
const GRAD = toonGradient(4)
const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: GRAD })

// ── トゥーンの輪郭線（インクのフチ）：少し膨らませた裏面を暗色で描く＝アニメ/僕夏的な線 ──
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x2c2419, side: THREE.BackSide, fog: true })
function addOutline(mesh, thickness = 0.05) {
  mesh.geometry.computeBoundingSphere()
  const r = (mesh.geometry.boundingSphere && mesh.geometry.boundingSphere.radius) || 1
  const o = new THREE.Mesh(mesh.geometry, OUTLINE_MAT)
  o.scale.setScalar(1 + thickness / r) // 世界でほぼ一定の太さに
  mesh.add(o)
}
function outlineObj(obj, thickness = 0.05) {
  const meshes = []
  obj.traverse((m) => { if (m.isMesh) meshes.push(m) })
  for (const m of meshes) addOutline(m, thickness)
}
// 静止オブジェクト用：全パーツの反転ハル輪郭を1ジオメトリに統合＝輪郭が1ドローに（描画コール削減）。
// ※腕脚が動くキャラには使わない（統合すると輪郭が手足に追従しないため outlineObj を使う）
function mergedOutline(group, thickness = 0.05) {
  const geos = []
  group.traverse((m) => {
    if (!m.isMesh || m === group || m.material === OUTLINE_MAT) return
    const g = m.geometry.clone().toNonIndexed() // 全て非インデックス化＝統合可能に
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.deleteAttribute('color') // 反転ハルは position だけでよい
    g.computeBoundingSphere()
    const r = (g.boundingSphere && g.boundingSphere.radius) || 1
    g.applyMatrix4(new THREE.Matrix4().makeScale(1 + thickness / r, 1 + thickness / r, 1 + thickness / r)) // 幾何中心まわりに膨らます
    // m の group 基準の相対変換を合成（armなどネストにも対応）
    const chain = new THREE.Matrix4().identity()
    let cur = m
    while (cur && cur !== group) { cur.updateMatrix(); chain.premultiply(cur.matrix); cur = cur.parent }
    g.applyMatrix4(chain)
    geos.push(g)
  })
  if (!geos.length) return
  const merged = mergeGeometries(geos, false)
  geos.forEach((g) => g.dispose())
  if (merged) group.add(new THREE.Mesh(merged, OUTLINE_MAT))
}

// ── 接地影（やわらかい丸影）：物が地面から浮いて見える低ポリの安っぽさを消す ──
const SHADOW_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const x = c.getContext('2d')
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30)
  // 中心を濃く＝伸ばしても接地点直下に密度が残り“浮き”を防ぐ
  g.addColorStop(0, 'rgba(20,24,16,0.62)'); g.addColorStop(0.4, 'rgba(20,24,16,0.34)'); g.addColorStop(1, 'rgba(20,24,16,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
})()
const shadowMat = new THREE.MeshBasicMaterial({ map: SHADOW_TEX, transparent: true, depthWrite: false, fog: true })
function addContactShadow(parent, radius, y = 0.05) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), shadowMat)
  m.rotation.x = -Math.PI / 2; m.position.y = y
  parent.add(m); return m
}

// ── ライト ──
const sunDir = new THREE.Vector3(-0.5, 0.82, -0.32).normalize()
const sun = new THREE.DirectionalLight(0xfff2d8, 2.1)
sun.position.copy(sunDir.clone().multiplyScalar(120))
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048) // 固定カメラで広域を覆うので解像度を上げて補う（再描画は稀なのでコスト可）
sun.shadow.camera.near = 10
sun.shadow.camera.far = 360
const sc = sun.shadow.camera
sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true // 影は手動再描画（エリア切替/時刻変化の時だけ＝歩行中はチカチカしない）
sun.shadow.bias = -0.0005
scene.add(sun)
scene.add(sun.target)
let shadowArea = '', lastShadowTday = -1
// 影カメラを「エリア」ごとに固定して張る（歩いても動かさない＝影の縁がずれずチカチカが出ない）。
// 動く主人公やNPCは別の接地影ブロブで表現しているので、この固定影マップで十分。
function frameShadow(cx, cz, size) {
  sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld()
  sun.position.set(cx + sunDir.x * 180, sunDir.y * 180, cz + sunDir.z * 180)
  sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.updateProjectionMatrix()
  sun.shadow.needsUpdate = true
}
const hemi = new THREE.HemisphereLight(0xcfeaf6, 0x86a05a, 1.15) // 空色↔草色の柔らかい環境光（明るめ）
scene.add(hemi)
// 逆光のリムライト（太陽の反対側から低く差す暖色。輪郭をふちどり、夕方は特に強く）。影は落とさない。
const rim = new THREE.DirectionalLight(0xffd9a8, 0.4)
scene.add(rim); scene.add(rim.target)

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
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat)
scene.add(skyDome)

// 太陽（明るい球。ブルームでにじむ）
const sunBall = new THREE.Mesh(
  new THREE.SphereGeometry(6, 24, 24), // 小さめ＝白飛びの種を減らす
  new THREE.MeshBasicMaterial({ color: 0xffeec0, fog: false }), // 純白を避けたやわらかい黄
)
sunBall.position.copy(sunDir.clone().multiplyScalar(300))
scene.add(sunBall)

// ── 時間帯のライティング（朝→昼→夕→夜。光色・影の長さ・空・霞が移ろう＝郷愁の核）──
const PAL = {
  morn: { light: 0xffe9c8, li: 1.95, sky: 0x9fc8e8, mid: 0xdcebef, bot: 0xf3efe0, fog: 0xe7eee6, hi: 1.45, hsky: 0xcfe6f4, hgnd: 0x95a766, ball: 0xfff0cf, rim: 0xffdcb0, ri: 0.5 },
  noon: { light: 0xfff6e8, li: 2.3, sky: 0x84bce2, mid: 0xc3e1ef, bot: 0xeff5e7, fog: 0xdfeaf0, hi: 1.58, hsky: 0xdaf0fb, hgnd: 0x95a766, ball: 0xfff6d8, rim: 0xfff0d8, ri: 0.3 },
  dusk: { light: 0xff9a4f, li: 2.05, sky: 0x6a5a98, mid: 0xee7438, bot: 0xf7b262, fog: 0xe7a074, hi: 1.15, hsky: 0xe89a72, hgnd: 0x7e7250, ball: 0xff8f48, rim: 0xff7a30, ri: 1.32 },
  night: { light: 0x97abdc, li: 1.18, sky: 0x172236, mid: 0x2a3859, bot: 0x44557c, fog: 0x35466a, hi: 1.05, hsky: 0x4e6398, hgnd: 0x4a5e72, ball: 0xcdd6ff, rim: 0x8aa0d8, ri: 0.32 },
}
const _a = new THREE.Color(), _b = new THREE.Color()
const lc = (out, ha, hb, u) => out.copy(_a.set(ha)).lerp(_b.set(hb), u)
const ln = (a, b, u) => a + (b - a) * u
function pickPal(t) {
  if (t < 0.5) return { from: PAL.morn, to: PAL.noon, u: t / 0.5 }
  if (t < 0.78) return { from: PAL.noon, to: PAL.dusk, u: (t - 0.5) / 0.28 }
  return { from: PAL.dusk, to: PAL.night, u: (t - 0.78) / 0.22 }
}
function setTimeOfDay(t) {
  const { from, to, u } = pickPal(t)
  // 太陽の運行（朝=低い東 → 昼=高い → 夕=低い西）。夜は地平線下。
  const elev = Math.sin(Math.min(t, 0.9) / 0.9 * Math.PI) // 0..1..0
  const elevAngle = elev * 1.25
  const az = Math.PI * (0.12 + t * 0.95)
  sunDir.set(Math.cos(az) * Math.cos(elevAngle), Math.sin(elevAngle) + 0.04, Math.sin(az) * Math.cos(elevAngle)).normalize()
  // sun.position は影カメラと一体なので frameShadow が管理（毎フレームここで動かすと影がずれる）
  sunBall.position.copy(sunDir).multiplyScalar(300)
  lc(sun.color, from.light, to.light, u)
  sun.intensity = ln(from.li, to.li, u)
  lc(sunBall.material.color, from.ball, to.ball, u)
  lc(skyMat.uniforms.top.value, from.sky, to.sky, u)
  lc(skyMat.uniforms.mid.value, from.mid, to.mid, u)
  lc(skyMat.uniforms.bottom.value, from.bot, to.bot, u)
  lc(scene.fog.color, from.fog, to.fog, u)
  hemi.intensity = ln(from.hi, to.hi, u)
  lc(hemi.color, from.hsky, to.hsky, u)
  lc(hemi.groundColor, from.hgnd, to.hgnd, u)
  // リムライト：太陽の水平反対側から、やや低く差す（輪郭の暖かいふち）
  lc(rim.color, from.rim, to.rim, u)
  rim.intensity = ln(from.ri, to.ri, u)
}
let tday = 0.18 // 朝から始める
let dayAuto = true // ゆっくり一日が流れる
setTimeOfDay(tday)

// ── 地面（高台つきの草地。頂点を heightAt で持ち上げる）──
const gGeo = new THREE.PlaneGeometry(240, 240, 90, 90)
gGeo.rotateX(-Math.PI / 2)
const gPos = gGeo.attributes.position
const gCol = []
const cGrassLo = new THREE.Color(0x86a256) // 彩度を少し落としたオリーブ寄りの夏草（鮮やかすぎる“ゲーム緑”を避け記憶の色へ）
const cGrassHi = new THREE.Color(0xb0cb7c)
const cGrassDry = new THREE.Color(0xbcb076) // 夏の日に焼けた乾いた草＝大きなムラで点在
for (let i = 0; i < gPos.count; i++) {
  const x = gPos.getX(i), z = gPos.getZ(i)
  const y = heightAt(x, z)
  gPos.setY(i, y)
  const t = THREE.MathUtils.clamp(0.4 + y * 0.06 + 0.5 * Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.2, 0, 1)
  const c = cGrassLo.clone().lerp(cGrassHi, t)
  // 低い周波数の大きなパッチで、ところどころ乾いた色へ寄せる（のっぺり単一緑を崩す＝乾いたムラを増やす）
  const dry = 0.5 + 0.5 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05 - 0.7)
  c.lerp(cGrassDry, THREE.MathUtils.smoothstep(dry, 0.62, 1.0) * 0.62)
  // さらに細かい斑（小さなムラ）で“絨毯のような均一”を崩す
  const fleck = 0.5 + 0.5 * Math.sin(x * 0.7 + 2.1) * Math.cos(z * 0.66 - 1.1)
  c.lerp(cGrassDry, THREE.MathUtils.smoothstep(fleck, 0.85, 1.0) * 0.3)
  gCol.push(c.r, c.g, c.b)
}
gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3))
gGeo.computeVertexNormals()
// 水彩風のムラ（無地の面に手描きの濃淡を足す＝のっぺり感を消す）
const watercolorTex = (() => {
  const s = 256
  const c = document.createElement('canvas'); c.width = c.height = s
  const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 300; i++) {
    const r = 6 + Math.random() * 46
    const v = 188 + Math.random() * 60 // 薄いグレーの濃淡
    x.globalAlpha = 0.05
    x.fillStyle = `rgb(${v|0},${v|0},${v|0})`
    const px = Math.random() * s, py = Math.random() * s
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { // 継ぎ目をまたいで描く
      x.beginPath(); x.arc(px + ox, py + oy, r, 0, Math.PI * 2); x.fill()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(7, 7)
  return t
})()
// ── 質感テクスチャ（低ポリ＋トゥーンのまま“底上げ”：瓦・土壁・木目）──
const toonMap = (color, map) => new THREE.MeshToonMaterial({ color, gradientMap: GRAD, map })
// 瓦屋根：流れ方向の筋＋段の重なり
const roofTex = (() => {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s)
  const cols = 8, cw = s / cols
  for (let i = 0; i < cols; i++) { const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0); g.addColorStop(0, 'rgba(80,80,80,0.30)'); g.addColorStop(0.5, 'rgba(255,255,255,0.04)'); g.addColorStop(0.86, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(70,70,70,0.34)'); x.fillStyle = g; x.fillRect(i * cw, 0, cw, s) }
  x.strokeStyle = 'rgba(60,60,60,0.28)'; x.lineWidth = 1.4
  for (let y = 0; y <= s; y += s / 5) { x.beginPath(); x.moveTo(0, y + 1); x.lineTo(s, y); x.stroke() }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 3); return t
})()
// 土壁/モルタル：細かな濃淡のむら
const plasterTex = (() => {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 280; i++) { x.globalAlpha = 0.045; const v = 198 + Math.random() * 56; x.fillStyle = `rgb(${v | 0},${v | 0},${(v - 12) | 0})`; const px = Math.random() * s, py = Math.random() * s, r = 2 + Math.random() * 9; for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { x.beginPath(); x.arc(px + ox, py + oy, r, 0, Math.PI * 2); x.fill() } }
  // 雨だれの筋（昭和の壁のくたびれ＝上から下へ薄く流れる縦の汚れ）。控えめにして“新築感”を消す
  x.globalAlpha = 1
  for (let i = 0; i < 20; i++) {
    const sx = Math.random() * s, sy = Math.random() * s * 0.35, len = s * (0.3 + Math.random() * 0.55), w = 1 + Math.random() * 2.4
    const g = x.createLinearGradient(0, sy, 0, sy + len)
    g.addColorStop(0, 'rgba(116,104,88,0)'); g.addColorStop(0.3, `rgba(116,104,88,${(0.05 + Math.random() * 0.06).toFixed(3)})`); g.addColorStop(1, 'rgba(108,98,82,0)')
    x.fillStyle = g
    for (const ox of [-s, 0, s]) x.fillRect(sx + ox - w / 2, sy, w, len)
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t
})()
// 木目：縦に流れる筋
const woodTex = (() => {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d')
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 46; i++) { x.globalAlpha = 0.07; const v = 110 + Math.random() * 110; x.strokeStyle = `rgb(${v | 0},${(v * 0.78) | 0},${(v * 0.58) | 0})`; x.lineWidth = 1 + Math.random() * 2; const px = Math.random() * s; x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= s; y += 8) x.lineTo(px + Math.sin(y * 0.1 + i) * 2, y); x.stroke() }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2); return t
})()
const ground = new THREE.Mesh(gGeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, map: watercolorTex }))
ground.receiveShadow = true
scene.add(ground)

// ── 池（様式化したトゥーン水面：さざ波＋きらめき）──
const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    uTime: { value: 0 },
    deep: { value: new THREE.Color(0x2f6f86) },
    shallow: { value: new THREE.Color(0x7fc0c8) },
    sky: { value: new THREE.Color(0xcfe8f0) }, // 水面が映す空の色
    tint: { value: new THREE.Color(0xffffff) }, // 時間帯の色（夕=橙, 夜=紺）
    bright: { value: 1.0 }, // 時間帯の明るさ
    glint: { value: new THREE.Color(0xfffaf0) }, // 太陽のきらめき色
  },
  vertexShader: `varying vec2 vUv; varying vec3 vW;
    void main(){ vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime; uniform vec3 deep; uniform vec3 shallow; uniform vec3 sky; uniform vec3 tint; uniform float bright; uniform vec3 glint;
    void main(){
      float d = distance(vUv, vec2(0.5)) * 2.0;
      vec3 col = mix(deep, shallow, smoothstep(0.4, 1.0, d)); // 岸ほど淡く
      // 2層のさざ波（向きと速さを変えて重ねる＝のっぺりしない）
      float w1 = sin(vW.x * 0.7 + uTime * 0.9) * sin(vW.z * 0.7 - uTime * 0.7);
      float w2 = sin(vW.x * 1.7 - uTime * 1.3 + 1.7) * sin(vW.z * 1.4 + uTime * 1.1);
      col += vec3(0.06, 0.10, 0.10) * smoothstep(0.30, 0.95, w1);
      col += vec3(0.05, 0.08, 0.09) * smoothstep(0.45, 0.98, w2);
      // 空の映り込み（横じまの帯＝水面の反射のゆらぎ）
      float band = sin(vW.z * 0.9 + uTime * 0.5 + sin(vW.x * 0.6) * 0.8);
      col = mix(col, sky, 0.18 * smoothstep(0.2, 1.0, band));
      // 太陽のきらめき（細かい点滅）
      float sp = sin(vW.x * 6.0 + uTime * 3.0) * sin(vW.z * 5.3 + uTime * 2.1);
      col += glint * 0.26 * smoothstep(0.92, 1.0, sp);
      // 岸ぎわの泡（白い縁取り）＋透け
      float foam = smoothstep(0.86, 0.99, d) * (0.6 + 0.4 * sin(vW.x * 3.0 + vW.z * 3.0 + uTime * 2.0));
      col = mix(col, vec3(0.96, 0.99, 1.0), foam * 0.5);
      float edge = smoothstep(0.9, 1.0, d);
      gl_FragColor = vec4(col * tint * bright, 0.92 - edge * 0.4);
    }`,
})
const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 48), waterMat)
water.rotation.x = -Math.PI / 2
water.position.set(POND.x, WATER_Y, POND.z)
scene.add(water)
// 岸の小石
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + 0.4
  const rr = POND.r * (0.92 + Math.random() * 0.18)
  const rx = POND.x + Math.cos(a) * rr, rz = POND.z + Math.sin(a) * rr
  const sz = 0.4 + Math.random() * 0.5
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(sz, 0), toon(0x9a958c))
  rock.position.set(rx, heightAt(rx, rz) + sz * 0.3, rz); rock.castShadow = true
  addOutline(rock, 0.05); addContactShadow(rock, sz * 1.4, -sz * 0.28)
  scene.add(rock)
}
// ── 浅い小川（歩いて入れる＝ぽちゃぽちゃ水遊び）。野原の開けた所を流れる ──
{
  const dx = CREEK.bx - CREEK.ax, dz = CREEK.bz - CREEK.az, len = Math.hypot(dx, dz)
  const w = new THREE.Mesh(new THREE.PlaneGeometry(CREEK.half * 2 + 0.6, len + 1), waterMat)
  w.rotation.x = -Math.PI / 2; w.rotation.z = -Math.atan2(dx, dz)
  w.position.set((CREEK.ax + CREEK.bx) / 2, CREEK.y, (CREEK.az + CREEK.bz) / 2); scene.add(w)
  // 川べりの小石
  for (let i = 0; i < 12; i++) {
    const t = Math.random(), side = Math.random() < 0.5 ? 1 : -1
    const cx = CREEK.ax + dx * t, cz = CREEK.az + dz * t
    const nx = -dz / len, nz = dx / len // 法線
    const rx = cx + nx * side * (CREEK.half + 0.3 + Math.random() * 0.6), rz = cz + nz * side * (CREEK.half + 0.3 + Math.random() * 0.6)
    const s = 0.22 + Math.random() * 0.32
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), toon(0xa49e92)); rock.position.set(rx, heightAt(rx, rz) + s * 0.3, rz); rock.castShadow = true; addOutline(rock, 0.03); scene.add(rock)
  }
}
function distToCreek(px, pz) { // 点から小川の中心線までの距離
  const dx = CREEK.bx - CREEK.ax, dz = CREEK.bz - CREEK.az
  const t = THREE.MathUtils.clamp(((px - CREEK.ax) * dx + (pz - CREEK.az) * dz) / (dx * dx + dz * dz), 0, 1)
  return Math.hypot(px - (CREEK.ax + dx * t), pz - (CREEK.az + dz * t))
}
// 波紋リング（水に入ると足元から広がる）
const ripples = []
{
  const rgeo = new THREE.RingGeometry(0.7, 0.95, 18); rgeo.rotateX(-Math.PI / 2)
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0, depthWrite: false }))
    m.visible = false; scene.add(m); ripples.push({ m, life: 0 })
  }
}
let ripHead = 0
function spawnRipple(x, z) { const r = ripples[ripHead]; ripHead = (ripHead + 1) % ripples.length; r.m.position.set(x, CREEK.y + 0.02, z); r.m.scale.setScalar(0.25); r.m.visible = true; r.life = 1 }

// ── メダカの群れ（池の中。近づくと さっと散る＝見ると見つかる小さな命）──
const medaka = []
const medakaC = { x: POND.x, z: POND.z } // 群れの中心
{
  const fmat = toon(0x4a4636)
  const fgeo = (() => { const b = new THREE.SphereGeometry(0.06, 6, 5); b.scale(1, 0.6, 2.2); return b })()
  for (let i = 0; i < 11; i++) {
    const g = new THREE.Mesh(fgeo, fmat)
    g.userData = { ox: (Math.random() - 0.5) * 3.2, oz: (Math.random() - 0.5) * 3.2, ph: Math.random() * 6.28, sp: 0.8 + Math.random() * 0.5 }
    scene.add(g); medaka.push(g)
  }
}
// ── カエル（池や小川のほとり。じっとして時おり ぴょこっと跳ねる）──
const frogs = []
function makeFrog(x, z) {
  const g = new THREE.Group(); const green = toon(0x6f9a48), belly = toon(0xccd89c)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), green); body.scale.set(1, 0.72, 1.2); body.position.y = 0.17; g.add(body)
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), belly); bel.scale.set(1, 0.55, 0.9); bel.position.set(0, 0.11, 0.1); g.add(bel)
  for (const ex of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), green); eye.position.set(ex, 0.31, 0.04); g.add(eye)
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), new THREE.MeshBasicMaterial({ color: 0x18180f })); pup.position.set(ex, 0.32, 0.09); g.add(pup)
  }
  for (const lx of [-0.17, 0.17]) { const leg = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), green); leg.scale.set(0.55, 0.45, 1.5); leg.position.set(lx, 0.07, -0.13); g.add(leg) }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true }); mergedOutline(g, 0.018); addContactShadow(g, 0.3)
  g.position.set(x, heightAt(x, z), z); scene.add(g)
  frogs.push({ obj: g, t: 1 + Math.random() * 4, hopT: 0, dir: Math.random() * 6.28 })
}
makeFrog(POND.x - 9, POND.z + 4); makeFrog(POND.x + 7, POND.z - 6); makeFrog(-16, 32) // 池のほとり×2・小川のほとり

// ── 低ポリの木（幹＋葉のかたまり）──
function makeTree(x, z, s = 1) {
  const g = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 3.4 * s, 6), toonMap(0x7a5a3a, woodTex))
  trunk.position.y = 1.7 * s
  trunk.castShadow = true
  g.add(trunk)
  // 葉＝こんもり繁った樹冠。多数のかたまりを1ジオメトリに統合＝わさっと茂って軽い。
  // detail=1 のイコサヘドロンで、カクカクのまま角だけやわらげる。
  const crown = [
    [1.7, 0, 3.2, 0], [1.45, 1.15, 3.45, 0.3], [1.45, -1.05, 3.5, -0.35], [1.4, 0.3, 3.5, 1.15], [1.4, -0.4, 3.55, -1.15],
    [1.55, 0.15, 4.05, -0.1], [1.3, 1.05, 4.2, 0.5], [1.3, -0.95, 4.25, -0.5], [1.25, 0.4, 4.0, 1.0], [1.2, -0.5, 4.1, -1.0],
    [1.3, 0.1, 4.75, 0.25], [1.05, 0.7, 4.9, -0.3], [1.15, 0.0, 3.85, 0.0],
  ]
  const geos = []
  for (const [r, bx, by, bz] of crown) { const ge = new THREE.IcosahedronGeometry(r * s, 1); ge.translate(bx * s, by * s, bz * s); geos.push(ge) }
  const canopy = new THREE.Mesh(mergeGeometries(geos), toon(0x6f9a47)); canopy.castShadow = true; g.add(canopy)
  geos.forEach((ge) => ge.dispose())
  // 陽の当たる上の明るい房（立体感・木漏れ日の素）
  for (const [r, bx, by, bz] of [[1.15, 0.35, 4.8, 0.25], [0.98, -0.35, 5.05, -0.1], [1.05, 1.0, 4.5, 0.5], [0.9, -0.8, 4.7, -0.55]]) {
    const hb = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), toon(0x9ec06c)); hb.position.set(bx * s, by * s, bz * s); hb.castShadow = true; g.add(hb)
  }
  g.position.set(x, heightAt(x, z), z)
  mergedOutline(g, 0.08)
  addContactShadow(g, 2.0 * s)
  addCollider(x, z, 0.7 * s) // 幹だけ当たる（枝葉の下は通れる）
  scene.add(g)
  swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.02 })
}
for (const [x, z, s] of [[14, 6, 1.1], [-16, 2, 1.0], [22, -10, 1.2], [-22, -14, 1.1], [9, -22, 0.9], [-10, -24, 0.95], [30, 12, 1.0], [-30, 14, 1.1]]) makeTree(x, z, s)
// 木立を増やして“わさっと”茂らせる（原っぱの縁・木かげを増やす）
for (const [x, z, s] of [[36, -4, 1.1], [-34, 6, 1.0], [19, 20, 0.95], [-25, 25, 1.05], [29, 29, 1.0], [-13, 33, 0.9], [34, 22, 1.05], [-37, -26, 1.0], [40, 8, 1.15], [-40, -8, 1.1]]) makeTree(x, z, s)
// ── 低木・茂み（下草。木の根元や縁に点々と＝葉の密度を上げる）──
function makeBush(x, z, s = 1) {
  const g = new THREE.Group()
  const blobs = [[0.7, 0, 0.36, 0], [0.56, 0.5, 0.32, 0.2], [0.56, -0.46, 0.34, -0.2], [0.5, 0.12, 0.52, 0.4], [0.48, -0.22, 0.5, -0.36], [0.46, 0.42, 0.5, -0.3]]
  const geos = []
  for (const [r, bx, by, bz] of blobs) { const ge = new THREE.IcosahedronGeometry(r * s, 1); ge.translate(bx * s, by * s, bz * s); geos.push(ge) }
  const m = new THREE.Mesh(mergeGeometries(geos), toon([0x5f8b3c, 0x6f9a47, 0x79a44e][Math.floor(Math.random() * 3)])); m.castShadow = true; g.add(m)
  geos.forEach((ge) => ge.dispose())
  g.position.set(x, heightAt(x, z), z)
  mergedOutline(g, 0.05); addContactShadow(g, 0.75 * s)
  scene.add(g)
  swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.035 })
}
for (const [x, z, s] of [[16, 9, 1.0], [-14, 5, 0.9], [24, -7, 1.1], [-20, -11, 1.0], [11, -19, 0.85], [-8, -21, 0.9], [32, 14, 1.0], [-28, 16, 1.05], [38, -2, 0.95], [-32, 9, 1.0], [21, 23, 0.9], [-23, 27, 1.0], [-15, 30, 0.85], [33, 25, 0.95], [7, 26, 0.9], [-35, -22, 1.0]]) makeBush(x, z, s)
// 町の緑（街路樹・植え込み）＝商店街と住宅街にも木かげと葉を。道や店先を避けて配置
for (const [dx, dz, s] of [[16, -10, 1.0], [-16, 14, 0.95], [15, 28, 1.05], [-15, 28, 1.0], [16, 8, 0.9], [-30, 6, 1.0]]) makeTree(TOWN.x + dx, TOWN.z + dz, s)
for (const [dx, dz, s] of [[8.5, -12, 0.95], [-8.5, -2, 0.9], [8.5, 6, 0.95], [-8.5, 12, 0.9], [10, 30, 0.85], [-10, 30, 0.85], [-34, 14, 0.9], [-30, 18, 0.85]]) makeBush(TOWN.x + dx, TOWN.z + dz, s)
// 神社の杜にも木立を足す（鎮守の杜らしく）
for (const [dx, dz, s] of [[14, 18, 1.1], [-14, 20, 1.05], [10, 30, 1.0], [-12, 34, 1.0], [18, 40, 1.05]]) makeTree(SHRINE.x + dx, SHRINE.z + dz, s)
// ── 木漏れ日（繁った樹冠の下に落ちる光のゆらぎ）──
const dappleTex = (() => {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d')
  for (let i = 0; i < 11; i++) { const px = Math.random() * s, py = Math.random() * s, r = 8 + Math.random() * 22; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,248,214,0.55)'); g.addColorStop(1, 'rgba(255,248,214,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill() }
  return new THREE.CanvasTexture(c)
})()
const dapples = []
function addDapple(x, z, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ map: dappleTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }))
  m.rotation.x = -Math.PI / 2; m.position.set(x, heightAt(x, z) + 0.07, z); scene.add(m); dapples.push(m)
}
for (const [x, z] of [[14, 6], [-16, 2], [22, -10], [-22, -14], [9, -22], [-10, -24], [30, 12], [-30, 14], [36, -4], [-34, 6], [19, 20], [-25, 25]]) addDapple(x, z, 2.4)

// ── 昭和の田舎家（縁側・瓦屋根・障子）＝時代の空気の核。麦わら帽子の少年の“おばあちゃんち”的な原風景 ──
function makeHouse(x, z, rot, roofHex) {
  const g = new THREE.Group()
  const wall = toonMap(0xe6dcc4, plasterTex), wood = toonMap(0x8a6a44, woodTex), roofC = toonMap(roofHex || 0x586472, roofTex), woodDark = toonMap(0x6a4e30, woodTex)
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.1, 5), wall); body.position.y = 1.75; g.add(body)
  // 縁側（前面の木の床）と支柱
  const engawa = new THREE.Mesh(new THREE.BoxGeometry(7, 0.28, 1.5), wood); engawa.position.set(0, 0.62, 3.2); g.add(engawa)
  for (const px of [-3.2, 3.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), woodDark); post.position.set(px, 1.9, 3.7); g.add(post) }
  // 障子（前面の白い格子）
  for (let i = 0; i < 3; i++) {
    const sho = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 2.0), new THREE.MeshToonMaterial({ color: 0xf2efe2, gradientMap: GRAD }))
    sho.position.set(-2.2 + i * 2.2, 1.85, 2.51); g.add(sho)
  }
  // 軒（前面の小庇）
  const eave = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.16, 1.7), roofC); eave.position.set(0, 3.25, 3.3); eave.rotation.x = -0.12; g.add(eave)
  // 瓦屋根（寄棟・青灰）
  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.1, 2.7, 4), roofC); roof.position.y = 4.7; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.76); g.add(roof)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  mergedOutline(g, 0.06)
  addContactShadow(g, 5.2)
  addCollider(x, z, 2.8) // 家の本体は通り抜けない（縁側の前には立てる）
  scene.add(g)
  return g
}
makeHouse(HOUSE.x, HOUSE.z, 0.35)
// 縁側の生活感：蚊取り線香（煙がゆらぐ）。風鈴は音とともに後段で。
const HENG = { x: HOUSE.x + Math.sin(0.35) * 3.0, y: heightAt(HOUSE.x, HOUSE.z), z: HOUSE.z + Math.cos(0.35) * 3.0 }
{
  const katori = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 18), toon(0x3a5a3a))
  katori.rotation.x = -Math.PI / 2; katori.position.set(HENG.x + 1.4, HENG.y + 0.62, HENG.z); katori.castShadow = true
  scene.add(katori)
}
const smokers = [] // 蚊取り線香などの細い煙。複数の発生源を持てる
function makeSmoke(x, y, z, n = 14) {
  const g = new THREE.BufferGeometry(); const sp = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { sp[i * 3] = x; sp[i * 3 + 1] = y + i * 0.16; sp[i * 3 + 2] = z }
  g.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xeceae2, size: 0.13, transparent: true, opacity: 0.3, depthWrite: false, fog: true }))
  scene.add(pts); smokers.push({ pts, x, y, z, n })
}
makeSmoke(HENG.x + 1.4, HENG.y + 0.7, HENG.z) // 縁側の蚊取り線香

// ── 物干し竿＝洗濯物が風にゆれる（昭和の生活感）──
{
  const lx = HOUSE.x - 4.2, lz0 = HOUSE.z + 1.5, lz1 = HOUSE.z + 6.5, lzm = (lz0 + lz1) / 2
  const postMat = toon(0x9a8a6a)
  for (const lz of [lz0, lz1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 6), postMat); post.position.set(lx, heightAt(lx, lz) + 0.9, lz); post.castShadow = true; addOutline(post, 0.02); scene.add(post) }
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, lz1 - lz0, 4), toon(0x6a5a44)); line.rotation.x = Math.PI / 2; line.position.set(lx, heightAt(lx, lzm) + 1.66, lzm); scene.add(line)
  const cols = [0xece4d4, 0x9ac0d8, 0xd89090, 0xece4d4, 0xc8d8a0]
  const sizes = [[0.5, 0.62], [0.42, 0.72], [0.54, 0.5], [0.4, 0.66]]
  let i = 0
  for (const cz of [lz0 + 1.0, lz0 + 2.3, lz0 + 3.6, lz0 + 4.6]) {
    const grp = new THREE.Group(); grp.position.set(lx, heightAt(lx, cz) + 1.66, cz)
    const [w, h] = sizes[i % sizes.length]
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshToonMaterial({ color: cols[i % cols.length], gradientMap: GRAD, side: THREE.DoubleSide, map: watercolorTex }))
    cloth.position.y = -h / 2; cloth.castShadow = true; grp.add(cloth)
    scene.add(grp)
    swayables.push({ obj: grp, ph: i * 1.3, amp: 0.11 }) // 風でゆらゆら（pendulum）
    i++
  }
}

// ── 時代の生活痕（昭和後期〜平成初期）：丸ポスト・物干し・電柱と電線・自販機 ──
function placeProp(g, x, z, rot, outline, shadowR) {
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  mergedOutline(g, outline); addContactShadow(g, shadowR); scene.add(g)
  return g
}
// 丸ポスト
{
  const g = new THREE.Group(); const red = toon(0xc0392b)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 2.2, 12), red); body.position.y = 1.1; g.add(body)
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); top.position.y = 2.2; g.add(top)
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.06), toon(0x241712)); slot.position.set(0, 1.72, 0.42); g.add(slot)
  placeProp(g, -7, 22, 0, 0.04, 0.7)
}
// 物干し（洗濯もの）
{
  const g = new THREE.Group(); const pole = toon(0xb4b4b0)
  for (const px of [-1.8, 1.8]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), pole); p.position.set(px, 1.0, 0); g.add(p) }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.9, 6), pole); bar.rotation.z = Math.PI / 2; bar.position.y = 1.85; g.add(bar)
  const cols = [0xeaeae6, 0x9fc6e0, 0xeaeae6, 0xe8b7a0]
  for (let i = 0; i < 4; i++) { const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.85), new THREE.MeshToonMaterial({ color: cols[i], gradientMap: GRAD, side: THREE.DoubleSide })); cloth.position.set(-1.3 + i * 0.86, 1.4, 0); g.add(cloth) }
  placeProp(g, -22, 18, 0.4, 0.03, 1.6)
}
// 当時の自販機（前面が光る）
{
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.9), toon(0xc23a2c)); body.position.y = 1.1; g.add(body)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.25, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff3c8 })); panel.position.set(0, 1.45, 0.46); g.add(panel)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const can = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), toon([0xd24a3a, 0x3a6a9a, 0x3e8a4a][(i + j) % 3])); can.position.set(-0.3 + i * 0.3, 1.05 + j * 0.4, 0.5); g.add(can) }
  placeProp(g, -2, 24, 0.2, 0.04, 1.0)
}
// 電柱２本＋電線（drooping）
function makePole(x, z) {
  const g = new THREE.Group(); const pole = toon(0x9a958c)
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 9, 8), pole); p.position.y = 4.5; g.add(p)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.16), toon(0x6a5a44)); arm.position.y = 8.2; g.add(arm)
  placeProp(g, x, z, 0, 0.05, 0.6)
  return new THREE.Vector3(x, heightAt(x, z) + 8.2, z)
}
const poleA = makePole(-6, 30)
const poleB = makePole(10, 32)
function drawWire(a, b, sag) {
  const pts = []
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t)) }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.7 }))
  scene.add(line)
}
drawWire(poleA, poleB, 1.2)
drawWire(poleB, new THREE.Vector3(HOUSE.x, heightAt(HOUSE.x, HOUSE.z) + 3.5, HOUSE.z), 0.8)

// ── 住宅街エリア（昭和の街並み：家・ブロック塀・電柱・空き地の土管）＝ドラえもん的な往来先 ──
const GATE_FIELD = new THREE.Vector3(42, 0, 36)            // 野原側の出入口（→町へ）
const GATE_TOWN = new THREE.Vector3(TOWN.x, 0, TOWN.z - 26) // 街側の出入口（→はらっぱへ）
function makeGate(p, rot) {
  const g = new THREE.Group(); const w = toon(0x9a6a3a)
  for (const px of [-1.7, 1.7]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 3.4, 8), w); post.position.set(px, 1.7, 0); g.add(post) }
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.34, 0.34), toon(0x7a5230)); top.position.y = 3.3; g.add(top)
  placeProp(g, p.x, p.z, rot || 0, 0.05, 1.6)
}
makeGate(GATE_FIELD, 0)
makeGate(GATE_TOWN, 0)
const GATE_SHRINE_F = new THREE.Vector3(-40, 0, 38)              // 野原側の出入口（→神社へ）
const GATE_SHRINE = new THREE.Vector3(SHRINE.x, 0, SHRINE.z - 24) // 神社側の出入口（→はらっぱへ）
// 鳥居（神社への入口の目印）
function makeTorii(x, z, rot, s = 1) {
  const g = new THREE.Group(); const red = toon(0xc0432f)
  for (const px of [-1.5 * s, 1.5 * s]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 3.6 * s, 8), red); post.position.set(px, 1.8 * s, 0); g.add(post) }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(4.4 * s, 0.3 * s, 0.5 * s), red); kasagi.position.y = 3.7 * s; g.add(kasagi) // 笠木
  const shimagi = new THREE.Mesh(new THREE.BoxGeometry(4.0 * s, 0.22 * s, 0.36 * s), toon(0x8a2a20)); shimagi.position.y = 3.36 * s; g.add(shimagi) // 島木
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(3.5 * s, 0.22 * s, 0.3 * s), red); nuki.position.y = 2.7 * s; g.add(nuki) // 貫
  placeProp(g, x, z, rot || 0, 0.04, 1.6)
}
makeTorii(GATE_SHRINE_F.x, GATE_SHRINE_F.z, 0) // 野原に立つ鳥居（神社への入口）
// エリアをつなぐ門（複数エリア対応）。area=今いる所, to=行き先, t*=到着位置/向き
const GATES = [
  { area: 'field', x: GATE_FIELD.x, z: GATE_FIELD.z, label: '町へ →', to: 'town', tx: GATE_TOWN.x, tz: GATE_TOWN.z + 2.2, tf: 0 },
  { area: 'town', x: GATE_TOWN.x, z: GATE_TOWN.z, label: 'はらっぱへ →', to: 'field', tx: GATE_FIELD.x, tz: GATE_FIELD.z - 2.2, tf: Math.PI },
  { area: 'field', x: GATE_SHRINE_F.x, z: GATE_SHRINE_F.z, label: '神社へ →', to: 'shrine', tx: GATE_SHRINE.x, tz: GATE_SHRINE.z + 2.2, tf: 0 },
  { area: 'shrine', x: GATE_SHRINE.x, z: GATE_SHRINE.z, label: 'はらっぱへ →', to: 'field', tx: GATE_SHRINE_F.x, tz: GATE_SHRINE_F.z - 2.2, tf: Math.PI },
]
// 野原から門へ続く土の道（往来の導線＝門が「町への道」だと分かる）
{
  const pgeo = new THREE.PlaneGeometry(5, 38); pgeo.rotateX(-Math.PI / 2)
  const path = new THREE.Mesh(pgeo, new THREE.MeshToonMaterial({ color: 0xc6aa7c, gradientMap: GRAD, map: watercolorTex }))
  path.rotation.y = 1.05; path.position.set(36, 0.06, 31); path.receiveShadow = true; scene.add(path)
}
// ── 神社エリア（鎮守の杜：鳥居 → 参道・石段 → お社）──
{
  const S = SHRINE
  // 地面（杜＝緑。石段の先の小山がせり上がる）
  const SGX = S.x, SGZ = S.z + 18
  const sgeo = new THREE.PlaneGeometry(110, 140, 56, 70); sgeo.rotateX(-Math.PI / 2)
  const spos = sgeo.attributes.position, scol = []
  const cG1 = new THREE.Color(0x6f9a47), cG2 = new THREE.Color(0x4f763a)
  for (let i = 0; i < spos.count; i++) { const wx = spos.getX(i) + SGX, wz = spos.getZ(i) + SGZ, y = heightAt(wx, wz); spos.setY(i, y); const c = cG1.clone().lerp(cG2, THREE.MathUtils.smoothstep(y, 2, 12)); scol.push(c.r, c.g, c.b) }
  sgeo.setAttribute('color', new THREE.Float32BufferAttribute(scol, 3)); sgeo.computeVertexNormals()
  const sg = new THREE.Mesh(sgeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, map: watercolorTex })); sg.position.set(SGX, 0, SGZ); sg.receiveShadow = true; scene.add(sg)
  makeTorii(S.x, S.z - 24, 0, 1.15) // 入口の鳥居（神社→はらっぱの門と同じ位置）
  // 参道（石畳）＋石段（小山をのぼる）
  const stoneMat = toon(0xbdb6a6)
  const sando = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 30), new THREE.MeshToonMaterial({ color: 0xc0b9a8, gradientMap: GRAD, map: watercolorTex })); sando.rotation.x = -Math.PI / 2; sando.position.set(S.x, 0.05, S.z - 9); scene.add(sando)
  for (let i = 0; i < 14; i++) { const sz = S.z + 6 + i * 2.2, sy = heightAt(S.x, sz); const step = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 2.2), stoneMat); step.position.set(S.x, sy + 0.05, sz); step.receiveShadow = true; addOutline(step, 0.015); scene.add(step) }
  // 石灯籠 ×2（参道の脇）
  function makeLantern(x, z) {
    const g = new THREE.Group(); const st = toon(0xa8a296)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 6), st); base.position.y = 0.25; g.add(base)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 6), st); pole.position.y = 1.05; g.add(pole)
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), st); box.position.y = 1.8; g.add(box)
    const lit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe6a0 })); lit.position.y = 1.8; g.add(lit)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.4, 4), st); roof.position.y = 2.2; roof.rotation.y = Math.PI / 4; g.add(roof)
    placeProp(g, x, z, 0, 0.02, 0.5)
  }
  makeLantern(S.x - 3.2, S.z - 4); makeLantern(S.x + 3.2, S.z - 4)
  // 狛犬 ×2（入口の両脇・向き合う）
  function makeKomainu(x, z, flip) {
    const g = new THREE.Group(); const st = toon(0x9a958a)
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), st); ped.position.y = 0.35; g.add(ped)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), st); body.scale.set(1, 1.2, 0.9); body.position.y = 1.0; g.add(body)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), st); head.position.set(0, 1.45, 0.1); g.add(head)
    for (const ez of [-0.1, 0.1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 5), st); ear.position.set(0, 1.66, ez); g.add(ear) }
    placeProp(g, x, z, flip ? Math.PI : 0, 0.02, 0.6)
  }
  makeKomainu(S.x - 2.8, S.z - 19, false); makeKomainu(S.x + 2.8, S.z - 19, true)
  // お社（朱塗り・瓦屋根）＝頂上。手前に賽銭箱
  {
    const sz = S.z + 38, sy = heightAt(S.x, sz)
    const g = new THREE.Group()
    const base = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 4), toonMap(0x7a5230, woodTex)); base.position.y = 0.25; g.add(base)
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 3.4), toon(0xc9402f)); body.position.y = 1.7; g.add(body)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 4), toonMap(0x37474f, roofTex)); roof.position.y = 3.6; roof.rotation.y = Math.PI / 4; g.add(roof)
    g.traverse((o) => { if (o.isMesh) o.castShadow = true }); g.position.set(S.x, sy, sz); mergedOutline(g, 0.04); addContactShadow(g, 3.5); addCollider(S.x, sz, 2.8); scene.add(g)
    const sai = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 0.85), toon(0x6a4a30)); sai.position.set(S.x, sy + 0.35, sz - 3); sai.castShadow = true; addOutline(sai, 0.02); scene.add(sai)
  }
  // 鎮守の杜（社のまわりの木立）
  for (const [tx, tz, ts] of [[S.x - 16, S.z + 30, 1.3], [S.x + 16, S.z + 34, 1.4], [S.x - 22, S.z + 14, 1.2], [S.x + 22, S.z + 18, 1.2], [S.x - 11, S.z + 48, 1.3], [S.x + 12, S.z + 50, 1.3], [S.x - 26, S.z + 40, 1.1], [S.x + 26, S.z + 44, 1.1]]) makeTree(tx, tz, ts)
}
// 門の外へ続く田舎道＝往来の先が「もう一方の場所へ続く道」だと分かる導線。
// 電柱と電線が霧の奥へ遠ざかり、道がそのまま続いている気配を出す。
function makeApproach(cx, cz, dz, len) {
  const pg = new THREE.PlaneGeometry(5, len); pg.rotateX(-Math.PI / 2)
  const road = new THREE.Mesh(pg, new THREE.MeshToonMaterial({ color: 0xc6aa7c, gradientMap: GRAD, map: watercolorTex }))
  road.position.set(cx, 0.05, cz + dz * (len / 2)); road.receiveShadow = true; scene.add(road)
  let prev = null
  for (let i = 1; i <= 3; i++) { const top = makePole(cx + 3.4, cz + dz * (i * len / 3.2)); if (prev) drawWire(prev, top, 0.9); prev = top }
}
makeApproach(GATE_FIELD.x, GATE_FIELD.z + 1.5, 1, 28)  // 野原の門→（町の方へ続く道）
makeApproach(GATE_TOWN.x, GATE_TOWN.z - 1.5, -1, 28)   // 町の門→（野原の方へ続く道）
// 道しるべ（木の標識）＝どこへ行けるか ひと目で分かるように。プレイヤーの方を向く面に文字。
function makeSignpost(x, z, rot, text) {
  const g = new THREE.Group(); const w = toon(0x8a5e34)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), w); post.position.y = 1.3; g.add(post)
  const c = document.createElement('canvas'); c.width = 320; c.height = 90; const cx = c.getContext('2d')
  cx.fillStyle = '#ecdfc2'; cx.fillRect(0, 0, 320, 90)
  cx.strokeStyle = '#6a5230'; cx.lineWidth = 7; cx.strokeRect(4, 4, 312, 82)
  cx.fillStyle = '#4a3a24'; cx.font = 'bold 38px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'
  cx.fillText(text, 160, 48)
  const tex = new THREE.CanvasTexture(c)
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 0.1), new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: GRAD }))
  board.position.y = 2.15; g.add(board)
  placeProp(g, x, z, rot || 0, 0.03, 0.5)
}
// 野原側：門の手前に立て、野原から来る人（-z向き）に見えるよう板を-zへ向ける
makeSignpost(GATE_FIELD.x + 3.0, GATE_FIELD.z - 2.2, Math.PI, 'このさき 町（まち）')
// 町側：門の手前に立て、町から来る人（+z向き）に見えるよう板を+zへ向ける
makeSignpost(GATE_TOWN.x - 3.0, GATE_TOWN.z + 2.2, 0, 'このさき はらっぱ')
// 商店街の一軒（昭和の店構え：店先・縞テント・看板・袖看板・品物）
function makeShop(x, z, rot, opt) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 5), toonMap(0xe2d6bc, plasterTex)); body.position.y = 2.1; g.add(body)
  const front = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.3), new THREE.MeshBasicMaterial({ color: 0x2a221a })); front.position.set(0, 1.35, 2.51); g.add(front)
  // 暖簾（のれん・切れ目つき）
  for (let i = 0; i < 4; i++) { const nr = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.95), toon(opt.sign)); nr.position.set(-1.8 + i * 1.2, 2.05, 2.53); g.add(nr) }
  // 縞テント（白×店色）
  const tent = new THREE.Group()
  const stripes = 6
  for (let i = 0; i < stripes; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(6.2 / stripes, 0.18, 1.7), toon(i % 2 ? 0xf2efe6 : opt.awn))
    s.position.set(-3.1 + (i + 0.5) * (6.2 / stripes), 0, 0); tent.add(s)
  }
  tent.position.set(0, 2.75, 3.2); tent.rotation.x = -0.18; g.add(tent)
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 0.2), toon(opt.sign)); sign.position.set(0, 3.55, 2.5); g.add(sign)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 0.72), toon(opt.sign)); blade.position.set(-3.05, 2.7, 2.7); g.add(blade)
  // 品物
  if (opt.kind === 'yaoya') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 1.1), toon(0x9c6b3a)); crate.position.set(0, 0.5, 3.4); g.add(crate)
    const veg = [0xd2542a, 0xe0a030, 0x5a8a3a, 0xc03030, 0xe8c040]
    for (let i = 0; i < 5; i++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), toon(veg[i])); v.position.set(-1.6 + i * 0.8, 0.85, 3.4); g.add(v) }
  } else if (opt.kind === 'denki') {
    for (let i = 0; i < 2; i++) { const tv = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.6), toon(0x2a2a30)); tv.position.set(-1 + i * 2, 1.2, 2.7); g.add(tv); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshBasicMaterial({ color: [0x88c8e0, 0xe0c060][i] })); sc.position.set(-1 + i * 2, 1.25, 3.01); g.add(sc) }
  } else if (opt.kind === 'dagashi') {
    for (let i = 0; i < 4; i++) { const jar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), toon([0xe05a6a, 0x5aa0e0, 0xe0c040, 0x7ac060][i])); jar.position.set(-1.5 + i * 1, 0.85, 3.3); g.add(jar) }
  } else if (opt.kind === 'niku') {
    const caseM = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 1.1), new THREE.MeshToonMaterial({ color: 0xdadfe2, gradientMap: GRAD, transparent: true, opacity: 0.7 })); caseM.position.set(0, 0.6, 3.4); g.add(caseM)
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  mergedOutline(g, 0.05); addContactShadow(g, 4)
  addCollider(x, z, 2.6) // 店の本体は通り抜けない
  scene.add(g)
  return g
}
const townNightLights = [] // 夜に灯る街のあかり（窓・街灯・自販機）。nfで点灯＝夜のエモさ
{
  const T = TOWN
  // 地面：手前＝住宅街の平地、奥（+z）＝裏山へせり上がる。頂点をheightAtで持ち上げ、高さで色分け
  const TGX = T.x + 5, TGZ = T.z + 35 // 地面メッシュの中心（北へ広げ裏山を含む）
  const tgeo = new THREE.PlaneGeometry(230, 210, 115, 105); tgeo.rotateX(-Math.PI / 2) // 西へ拡張（地元の配置＝団地の西にグラウンド等を置く余地）
  const tpos = tgeo.attributes.position, tcol = []
  const cTownGnd = new THREE.Color(0xb6ad99), cMntGrass = new THREE.Color(0x86b257), cMntDark = new THREE.Color(0x6f9a47)
  for (let i = 0; i < tpos.count; i++) {
    const wx = tpos.getX(i) + TGX, wz = tpos.getZ(i) + TGZ
    const y = heightAt(wx, wz); tpos.setY(i, y)
    const c = cTownGnd.clone().lerp(cMntGrass, THREE.MathUtils.smoothstep(y, 1, 6))
    c.lerp(cMntDark, THREE.MathUtils.smoothstep(y, 16, 30))
    tcol.push(c.r, c.g, c.b)
  }
  tgeo.setAttribute('color', new THREE.Float32BufferAttribute(tcol, 3)); tgeo.computeVertexNormals()
  const tg = new THREE.Mesh(tgeo, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, map: watercolorTex }))
  tg.position.set(TGX, 0, TGZ); tg.receiveShadow = true; scene.add(tg)
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, 64), new THREE.MeshToonMaterial({ color: 0x8c8c8c, gradientMap: GRAD }))
  road.rotation.x = -Math.PI / 2; road.position.set(T.x, 0.02, T.z); scene.add(road)
  // 道のセンターライン＝トゥーン材で夜は一緒に暗くなる（昔の白線のテカリ防止）
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 64), new THREE.MeshToonMaterial({ color: 0xcfc9bb, gradientMap: GRAD }))
  cl.rotation.x = -Math.PI / 2; cl.position.set(T.x, 0.03, T.z); scene.add(cl)
  // 右側：家＋ブロック塀（道を向く・屋根色をばらして“クローン感”を消す）
  const roofs = [0x586472, 0x6a5a4a, 0x4a6a5a, 0x705a52, 0x556088]
  for (let i = 0; i < 4; i++) {
    const hx = T.x + 12, hz = T.z - 18 + i * 13
    makeHouse(hx, hz, -Math.PI / 2, roofs[i % roofs.length])
    const wall = new THREE.Mesh(new THREE.BoxGeometry(9, 1.0, 0.4), toonMap(0xbcb6a4, plasterTex))
    wall.position.set(hx - 4.4, 0.5, hz); wall.rotation.y = Math.PI / 2; wall.castShadow = true
    addOutline(wall, 0.03); scene.add(wall)
  }
  // 左側：商店街（八百屋・肉屋・電器屋・駄菓子屋）
  const shopDefs = [
    { awn: 0x3e8a4a, sign: 0x2e7a3e, kind: 'yaoya' },
    { awn: 0xc0492f, sign: 0xb03020, kind: 'niku' },
    { awn: 0x3a6a9a, sign: 0x2a5080, kind: 'denki' },
    { awn: 0xc85a95, sign: 0xa84080, kind: 'dagashi' },
  ]
  for (let i = 0; i < shopDefs.length; i++) makeShop(T.x - 12, T.z - 18 + i * 13, Math.PI / 2, shopDefs[i])
  // ── 夜のあかり：街灯・窓あかり（昼は消え、夜にぽつぽつ灯る＝夏の夜のエモさ）──
  function addGlow(x, y, z, ry, w, h, color, base) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide }))
    m.position.set(x, y, z); m.rotation.y = ry; scene.add(m)
    townNightLights.push({ m, base, ph: Math.random() * 6 })
    return m
  }
  // 街灯（道ぞいに4本。柱＋かさ＋灯り。灯りはブルームでにじむ）
  for (let i = 0; i < 4; i++) {
    const sx = T.x + (i % 2 ? 6.2 : -6.2), sz = T.z - 22 + i * 15
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 3.6, 6), toon(0x46423a)); pole.position.set(sx, 1.8, sz); pole.castShadow = true; addOutline(pole, 0.02); scene.add(pole)
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 10), toon(0x39352e)); shade.position.set(sx, 3.72, sz); addOutline(shade, 0.02); scene.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe2a6, fog: false, transparent: true, opacity: 0 }))
    bulb.position.set(sx, 3.5, sz); scene.add(bulb); townNightLights.push({ m: bulb, base: 1.0, ph: i })
    // 灯りが地面へ落とす淡い光だまり
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshBasicMaterial({ color: 0xffcf86, fog: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    pool.rotation.x = -Math.PI / 2; pool.position.set(sx, 0.04, sz); scene.add(pool); townNightLights.push({ m: pool, base: 0.22, ph: i })
  }
  // 商店・家の窓あかり（道を向く面に。あたたかいオレンジ）
  for (let i = 0; i < 4; i++) {
    const sz = T.z - 18 + i * 13
    addGlow(T.x - 9.4, 1.5, sz - 1.4, Math.PI / 2, 1.0, 0.7, 0xffce82, 0.9) // 商店の窓（左・道向き）
    addGlow(T.x - 9.4, 1.5, sz + 1.4, Math.PI / 2, 1.0, 0.7, 0xffce82, 0.9)
    addGlow(T.x + 9.4, 1.7, sz, -Math.PI / 2, 1.1, 0.8, 0xffd98e, 0.85) // 家の窓（右・道向き）
  }
  // 交差路の北の家の窓（南向き）
  for (const hx of [T.x - 26, T.x - 8, T.x + 10, T.x + 28]) addGlow(hx, 1.7, T.z + 28.6, 0, 1.2, 0.8, 0xffd98e, 0.85)
  // ── 夜の屋台（夕方〜夜に灯る。焼きそば・かき氷の気配＝夏祭りのエモさ）──
  {
    const yg = new THREE.Group(); const wood = toonMap(0x8a6038, woodTex), woodDark = toonMap(0x5e4226, woodTex)
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.9), wood); counter.position.y = 0.7; yg.add(counter)
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 1.1), woodDark); top.position.y = 1.2; yg.add(top)
    for (const sx of [-1.15, 1.15]) for (const sz of [-0.45, 0.45]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), woodDark); post.position.set(sx, 1.35, sz); yg.add(post) }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.12, 1.45), toon(0xb04a3a)); roof.position.y = 2.36; yg.add(roof)
    const noren = new THREE.Mesh(new THREE.BoxGeometry(2.95, 0.46, 0.04), toon(0xc0392b)); noren.position.set(0, 2.06, 0.7); yg.add(noren) // 赤い幕
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff7a3a, fog: false, transparent: true, opacity: 0 })); lantern.scale.y = 1.25; lantern.position.set(-1.05, 1.92, 0.62); yg.add(lantern)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.85), new THREE.MeshBasicMaterial({ color: 0xffce86, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide })); glow.position.set(0, 1.55, 0.5); yg.add(glow) // カウンターの中のあかり
    yg.traverse((o) => { if (o.isMesh) o.castShadow = true })
    const yx = T.x - 7, yz = T.z + 19
    yg.position.set(yx, heightAt(yx, yz), yz); yg.rotation.y = -0.5
    mergedOutline(yg, 0.03); addContactShadow(yg, 1.9); scene.add(yg)
    townNightLights.push({ m: lantern, base: 1.0, ph: 1.3 }, { m: glow, base: 0.9, ph: 2.1 })
    makeSmoke(yx + 0.3, heightAt(yx, yz) + 1.3, yz + 0.2, 12) // 湯気
    addCollider(yx, yz, 1.8)
    // ── 縁日の提灯ガーランド（昼は紙の提灯が連なり、夜にあかりが灯る＝夏祭りの賑わい）──
    const gar = new THREE.Group()
    const poleMat = toonMap(0x9a7b4a, woodTex)
    for (const [px, pz] of [[-5.5, -2.5], [5.5, 3.5]]) { const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 6), poleMat); bp.position.set(px, 1.8, pz); gar.add(bp) }
    const paperRed = toon(0xd2402e), paperCream = toon(0xeadcb8)
    const nLan = 9
    for (let i = 0; i < nLan; i++) {
      const t = i / (nLan - 1)
      const lx = -5.5 + t * 11, lz = -2.5 + t * 6
      const ly = 3.3 - Math.sin(t * Math.PI) * 0.55 // ワイヤーのたわみ
      const red = i % 2 === 0
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), red ? paperRed : paperCream); body.scale.y = 1.3; body.position.set(lx, ly, lz); gar.add(body) // 紙の提灯（昼も見える）
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), toon(0x4a3a2a)); cap.position.set(lx, ly + 0.22, lz); gar.add(cap)
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), new THREE.MeshBasicMaterial({ color: red ? 0xff7a48 : 0xffdf9c, fog: false, transparent: true, opacity: 0 })); glow.scale.y = 1.3; glow.position.set(lx, ly, lz); gar.add(glow) // 夜のあかり
      townNightLights.push({ m: glow, base: 0.95, ph: i * 0.6 })
    }
    gar.traverse((o) => { if (o.isMesh && o.material.transparent !== true) o.castShadow = true })
    const gx = T.x - 7, gz = T.z + 19
    gar.position.set(gx, heightAt(gx, gz), gz); gar.rotation.y = -0.5
    scene.add(gar)
  }
  // ── 町を埋める：団地（マンション）・パチンコ屋・住宅を増設（空き地を町並みに）──
  function makeApartment(x, z, rot, floors, units) {
    const g = new THREE.Group()
    const W = units * 2.4, H = floors * 2.2 + 0.4, D = 5.2
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), toonMap(0xcfc6b4, plasterTex)); body.position.y = H / 2; g.add(body)
    const winGlows = []
    for (let f = 0; f < floors; f++) for (let u = 0; u < units; u++) {
      const wx = -W / 2 + 1.2 + u * 2.4, wy = 1.5 + f * 2.2
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.05), toon(0x53636b)); win.position.set(wx, wy, D / 2 + 0.03); g.add(win)
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.12, 0.8), toon(0xb8aa92)); ledge.position.set(wx, wy - 0.64, D / 2 + 0.36); g.add(ledge)
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.42, 0.08), toon(0xc6bba4)); rail.position.set(wx, wy - 0.4, D / 2 + 0.72); g.add(rail)
      if (Math.random() < 0.5) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.95), new THREE.MeshBasicMaterial({ color: 0xffd98e, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide })); gl.position.set(wx, wy, D / 2 + 0.05); g.add(gl); winGlows.push(gl) }
    }
    const para = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.5, D + 0.2), toon(0xc2b8a4)); para.position.y = H + 0.2; g.add(para)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 10), toon(0x9aa0a4)); tank.position.set(W * 0.28, H + 0.95, 0.4); g.add(tank)
    const stair = new THREE.Mesh(new THREE.BoxGeometry(1.5, H, 1.7), toonMap(0xc2b8a6, plasterTex)); stair.position.set(-W / 2 - 0.75, H / 2, D / 2 - 0.9); g.add(stair) // 外階段の塔
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.position.set(x, heightAt(x, z), z); g.rotation.y = rot
    mergedOutline(g, 0.05); addContactShadow(g, Math.max(W, D) * 0.6); addCollider(x, z, Math.max(W, D) * 0.45)
    scene.add(g)
    for (const gl of winGlows) townNightLights.push({ m: gl, base: 0.85, ph: Math.random() * 6 })
  }
  function makePachinko(x, z, rot) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 5.5, 7), toonMap(0xd8d0c0, plasterTex)); body.position.y = 2.75; g.add(body)
    const signbg = new THREE.Mesh(new THREE.BoxGeometry(9.4, 1.8, 0.5), toon(0xd23a4a)); signbg.position.set(0, 6.3, 3.4); g.add(signbg)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 1.4), new THREE.MeshBasicMaterial({ map: textTex('パチンコ', '#d23a4a', '#fff3c8', false) })); sign.position.set(0, 6.3, 3.67); g.add(sign)
    const ent = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ color: 0x2a2018 })); ent.position.set(0, 1.8, 3.52); g.add(ent)
    const neons = []
    for (const nx of [-4.3, 4.3]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.0, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd24a, fog: false, transparent: true, opacity: 0 })); n.position.set(nx, 3.0, 3.5); g.add(n); neons.push(n) }
    for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff6a6a : 0xffe24a, fog: false, transparent: true, opacity: 0 })); b.position.set(-4.4 + i * 0.98, 7.3, 3.5); g.add(b); neons.push(b) }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.position.set(x, heightAt(x, z), z); g.rotation.y = rot
    mergedOutline(g, 0.05); addContactShadow(g, 6); addCollider(x, z, 5.2)
    scene.add(g)
    for (let i = 0; i < neons.length; i++) townNightLights.push({ m: neons[i], base: 0.95, ph: i * 0.7 })
  }
  // ── 昭和の小学校（獅子ヶ谷小学校のオマージュ＝普遍的な昭和の校舎。実在の名称/校章は使わない）──
  function makeSakura(x, z, s = 1) {
    const g = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26 * s, 0.4 * s, 3.0 * s, 6), toonMap(0x7a5a4a, woodTex)); trunk.position.y = 1.5 * s; g.add(trunk)
    const crown = [[1.5, 0, 3.0, 0], [1.2, 1.0, 3.3, 0.3], [1.2, -0.9, 3.3, -0.3], [1.15, 0.3, 3.3, 1.0], [1.1, -0.3, 3.5, -0.9], [1.2, 0.1, 3.8, 0.2]]
    const geos = []
    for (const [r, bx, by, bz] of crown) { const ge = new THREE.IcosahedronGeometry(r * s, 1); ge.translate(bx * s, by * s, bz * s); geos.push(ge) }
    const cz = new THREE.Mesh(mergeGeometries(geos), toon(0xf3c6d2)); cz.castShadow = true; g.add(cz) // 桜のピンク
    geos.forEach((ge) => ge.dispose())
    g.position.set(x, heightAt(x, z), z); mergedOutline(g, 0.06); addContactShadow(g, 1.8 * s); addCollider(x, z, 0.6 * s)
    scene.add(g); swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.02 })
  }
  function makeSchool(cx, cz) {
    const grp = new THREE.Group()
    const floors = 3, units = 8, W = units * 2.6, H = floors * 2.4 + 0.6, D = 6.5
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), toonMap(0xe9e1cd, plasterTex)); body.position.y = H / 2; grp.add(body)
    const winGlows = []
    for (let f = 0; f < floors; f++) for (let u = 0; u < units; u++) {
      const wx = -W / 2 + 1.3 + u * 2.6, wy = 1.7 + f * 2.4
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.35), toon(0x8fb0c0)); win.position.set(wx, wy, -D / 2 - 0.03); grp.add(win) // 南向き(-z)の窓
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.12, 0.32), toon(0xcfc6b0)); sill.position.set(wx, wy - 0.76, -D / 2 - 0.12); grp.add(sill)
      if (Math.random() < 0.35) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.25), new THREE.MeshBasicMaterial({ color: 0xffe7a0, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide })); gl.position.set(wx, wy, -D / 2 - 0.05); grp.add(gl); winGlows.push(gl) }
    }
    const ent = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 2.2), toonMap(0xddd4be, plasterTex)); ent.position.set(0, 1.5, -D / 2 - 1.0); grp.add(ent) // 昇降口
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), toon(0x3a4a52)); door.position.set(0, 1.1, -D / 2 - 2.11); grp.add(door)
    const para = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.5, D + 0.2), toon(0xd8cfb6)); para.position.y = H + 0.2; grp.add(para)
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.18, 20), new THREE.MeshBasicMaterial({ color: 0xfaf6ea })); clock.rotation.x = Math.PI / 2; clock.position.set(0, H + 1.5, -D / 2 - 0.05); grp.add(clock) // 屋上の時計
    for (const [a, len] of [[1.0, 0.55], [-1.9, 0.8]]) { const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, len, 0.04), new THREE.MeshBasicMaterial({ color: 0x333333 })); hand.position.set(Math.sin(a) * len / 2, H + 1.5 + Math.cos(a) * len / 2, -D / 2 - 0.15); hand.rotation.z = -a; grp.add(hand) }
    grp.traverse((o) => { if (o.isMesh) o.castShadow = true })
    grp.position.set(cx, heightAt(cx, cz), cz)
    mergedOutline(grp, 0.05); addContactShadow(grp, W * 0.55); addCollider(cx, cz, Math.max(W, D) * 0.45); scene.add(grp)
    for (const gl of winGlows) townNightLights.push({ m: gl, base: 0.7, ph: Math.random() * 6 })
    // ── 校庭（砂地）＋設備 ──
    const yz = cz - D / 2 - 15
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(W + 7, 24), new THREE.MeshToonMaterial({ color: 0xcdb389, gradientMap: GRAD, map: watercolorTex })); yard.rotation.x = -Math.PI / 2; yard.position.set(cx, heightAt(cx, yz) + 0.04, yz); yard.receiveShadow = true; scene.add(yard)
    // フェンス（低いコンクリ基礎＋支柱）
    const fy = heightAt(cx, yz)
    for (let i = -1; i <= 1; i += 2) { const wall = new THREE.Mesh(new THREE.BoxGeometry(W + 7, 0.6, 0.2), toon(0xc8c0b0)); wall.position.set(cx, fy + 0.3, yz + i * 12); scene.add(wall) }
    for (let i = 0; i <= 10; i++) { const px = cx - (W + 7) / 2 + i * (W + 7) / 10; for (const zz of [yz - 12, yz + 12]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), toon(0xa8a89c)); pole.position.set(px, fy + 0.8, zz); scene.add(pole) } }
    // 鉄棒（高さ違い）
    for (const [bx, bh] of [[cx - W * 0.32, 1.1], [cx - W * 0.32 + 1.4, 1.4]]) {
      for (const sx of [-0.7, 0.7]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, bh, 6), toon(0x8a9aa2)); p.position.set(bx + sx, fy + bh / 2, yz + 6); p.castShadow = true; scene.add(p) }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), toon(0xb0bcc2)); bar.rotation.z = Math.PI / 2; bar.position.set(bx, fy + bh, yz + 6); scene.add(bar)
    }
    // 朝礼台
    const dais = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.6), toon(0xbcae96)); dais.position.set(cx + W * 0.3, fy + 0.25, yz - 5); dais.castShadow = true; addOutline(dais, 0.02); scene.add(dais)
    // 二宮金次郎像（薪を背負い本を読む少年・台座。緑青色のブロンズ）。原作不問のオリジナル造形
    {
      const st = new THREE.Group(); const bronze = toon(0x6e7a5e)
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.8), toon(0xb8b0a0)); ped.position.y = 0.5; st.add(ped)
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 8), bronze); torso.position.set(0, 1.3, 0); torso.rotation.x = 0.3; st.add(torso)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), bronze); head.position.set(0, 1.62, 0.12); st.add(head)
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.2), bronze); book.position.set(0, 1.42, 0.28); book.rotation.x = -0.5; st.add(book)
      for (let i = 0; i < 4; i++) { const fw = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), toon(0x5a6a4e)); fw.position.set(-0.08 + i * 0.05, 1.35, -0.2); fw.rotation.x = 0.3; st.add(fw) } // 背中の薪
      st.traverse((o) => { if (o.isMesh) o.castShadow = true })
      st.position.set(cx - W * 0.42, fy, yz - 8); mergedOutline(st, 0.02); addContactShadow(st, 0.7); scene.add(st)
    }
    // ── 体育館（校舎の西どなり・大きな箱＋低い屋根）──
    {
      const gx = cx - W / 2 - 10, gW = 11, gD = 16, gH = 7.5
      const gg = new THREE.Group()
      const gb = new THREE.Mesh(new THREE.BoxGeometry(gW, gH, gD), toonMap(0xdcd3bf, plasterTex)); gb.position.y = gH / 2; gg.add(gb)
      const groof = new THREE.Mesh(new THREE.BoxGeometry(gW + 0.4, 0.6, gD + 0.4), toonMap(0x8a9098, roofTex)); groof.position.y = gH + 0.3; gg.add(groof)
      for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.4), toon(0x88a4b2)); w.position.set(-gD * 0 + 0, gH * 0.6, gD / 2 + 0.03); w.position.x = -gW / 2 + 1.4 + i * 2.0; gg.add(w) } // 高窓
      const gent = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 0.3), toon(0x4a5258)); gent.position.set(0, 1.3, gD / 2 + 0.16); gg.add(gent)
      gg.traverse((o) => { if (o.isMesh) o.castShadow = true })
      gg.position.set(gx, heightAt(gx, cz), cz); mergedOutline(gg, 0.05); addContactShadow(gg, gW * 0.7); addCollider(gx, cz, Math.max(gW, gD) * 0.45); scene.add(gg)
    }
    // ── プール（夏！）：水面＋コンクリのデッキ＋フェンス＋飛び込み台 ──
    {
      const px = cx + (W + 7) / 2 + 8, pz = yz + 1
      const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 9.5), toon(0xd2cdbe)); deck.position.set(px, fy + 0.15, pz); deck.receiveShadow = true; scene.add(deck)
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 6.6), waterMat); pool.rotation.x = -Math.PI / 2; pool.position.set(px, fy + 0.33, pz); scene.add(pool)
      for (let i = 0; i <= 7; i++) for (const zz of [pz - 4.6, pz + 4.6]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), toon(0xb8b8ac)); pl.position.set(px - 6.5 + i * 13 / 7, fy + 0.8, zz); scene.add(pl) }
      const dive = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 1.4), toon(0x9aa0a4)); dive.position.set(px - 5.6, fy + 0.9, pz); dive.castShadow = true; scene.add(dive) // 飛び込み台
      addCollider(px, pz, 6)
    }
    // ── 校門（門柱＋表札・原作不問の generic 表記）＋国旗掲揚台 ──
    const gateZ = yz + 12.6
    for (const sx of [-3.2, 3.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.5, 0.6), toon(0xcac2b2)); post.position.set(cx + sx, fy + 1.25, gateZ); post.castShadow = true; addOutline(post, 0.02); scene.add(post) }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.5), new THREE.MeshBasicMaterial({ map: textTex('しょうがっこう', '#3a3a3a', '#f2eee2', false) })); plate.position.set(cx - 3.2, fy + 1.55, gateZ + 0.33); scene.add(plate)
    {
      const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 6.5, 8), toon(0xdadace)); fp.position.set(cx + W * 0.44, fy + 3.25, yz - 4); fp.castShadow = true; scene.add(fp)
      const flagW = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ color: 0xfafafa, side: THREE.DoubleSide })); flagW.position.set(cx + W * 0.44 + 0.8, fy + 5.8, yz - 4); scene.add(flagW)
      const flagR = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0xd03a3a })); flagR.position.set(cx + W * 0.44 + 0.8, fy + 5.8, yz - 3.99); scene.add(flagR) // 日の丸（普遍）
    }
    // 桜（門の両脇）
    makeSakura(cx - (W + 7) / 2 - 1.5, gateZ, 1.1); makeSakura(cx + (W + 7) / 2 + 1.5, gateZ, 1.0)
  }
  makeSchool(T.x - 60, T.z + 56)
  // ── 土のサッカーグラウンド（当時のマリノスのグラウンドのオマージュ。団地の西）──
  function makeGround(cx, cz) {
    const W = 44, D = 28, fy = heightAt(cx, cz)
    // ほぼ使われず草ぼうぼうの広い原っぱ（昔のグラウンドの名残）。子どもが時々入って虫取り/鬼ごっこする場所
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshToonMaterial({ color: 0x8aa64c, gradientMap: GRAD, map: watercolorTex })); grass.rotation.x = -Math.PI / 2; grass.position.set(cx, fy + 0.04, cz); grass.receiveShadow = true; scene.add(grass)
    // 伸び放題の夏草（30〜40cm）が一面に。InstancedMeshで安く密に
    const tuftGeo = new THREE.IcosahedronGeometry(0.22, 0); const tuftMat = toon(0x86a448)
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 260); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3()
    for (let i = 0; i < 260; i++) {
      const wx = cx + (Math.random() - 0.5) * (W - 1), wz = cz + (Math.random() - 0.5) * (D - 1)
      sc.set(0.8 + Math.random() * 0.5, 1.6 + Math.random() * 1.0, 0.8 + Math.random() * 0.5)
      m4.compose(new THREE.Vector3(wx, fy + 0.3, wz), q, sc); tufts.setMatrixAt(i, m4)
    }
    tufts.instanceMatrix.needsUpdate = true; tufts.castShadow = false; scene.add(tufts)
    // さらに背の高い雑草の塊（点々と・風に揺れる）
    for (let i = 0; i < 40; i++) {
      const wx = cx + (Math.random() - 0.5) * (W - 2), wz = cz + (Math.random() - 0.5) * (D - 2)
      const big = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), toon([0x7e9a40, 0x92b056, 0x6f8c3a][i % 3])); big.scale.set(1, 2.0 + Math.random() * 1.2, 1)
      big.position.set(wx, fy + 0.42, wz); scene.add(big); swayables.push({ obj: big, ph: Math.random() * 6.28, amp: 0.07 })
    }
    // ゴール2基（使われず朽ちかけ＝白がくすみ、少し傾き、草に埋もれ気味）。白線・フェンスは草に消えて無し
    function goal(gz, tilt) {
      const gg = new THREE.Group(); const gm = toon(0xcfcbbd)
      for (const sx of [-3.6, 3.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), gm); p.position.set(sx, 1.2, 0); gg.add(p) }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.4, 8), gm); bar.rotation.z = Math.PI / 2; bar.position.y = 2.4; gg.add(bar)
      gg.traverse((o) => { if (o.isMesh) o.castShadow = true })
      gg.position.set(cx, fy, cz + gz); gg.rotation.z = tilt; mergedOutline(gg, 0.03); scene.add(gg)
    }
    goal(-D / 2 + 2.5, 0.04); goal(D / 2 - 2.5, -0.06)
  }
  makeGround(T.x - 84, T.z + 11)
  // ── 小さな公園（作者が幼少期に遊んだ場所のオマージュ）──
  function makePark(cx, cz) {
    const fy = heightAt(cx, cz)
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(9, 28), new THREE.MeshToonMaterial({ color: 0xb8aa7c, gradientMap: GRAD, map: watercolorTex })); gnd.rotation.x = -Math.PI / 2; gnd.position.set(cx, fy + 0.05, cz); gnd.receiveShadow = true; scene.add(gnd)
    // 砂場（木枠）
    const sand = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 3), toon(0xe6d3a0)); sand.position.set(cx - 4.5, fy + 0.18, cz + 3.5); scene.add(sand)
    for (const [ex, ez, ew, ed] of [[0, -1.55, 3.2, 0.2], [0, 1.55, 3.2, 0.2], [-1.55, 0, 0.2, 3.2], [1.55, 0, 0.2, 3.2]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.22, ed), toon(0x9a6a3a)); e.position.set(cx - 4.5 + ex, fy + 0.2, cz + 3.5 + ez); scene.add(e) }
    // 鉄棒（大・小）
    for (const [bx, bh] of [[cx + 3.6, 1.4], [cx + 5.0, 1.0]]) {
      for (const sx of [-0.65, 0.65]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, bh, 6), toon(0x6f9ac0)); p.position.set(bx + sx, fy + bh / 2, cz - 3); p.castShadow = true; scene.add(p) }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), toon(0xc0ccd2)); bar.rotation.z = Math.PI / 2; bar.position.set(bx, fy + bh, cz - 3); scene.add(bar)
    }
    // 滑り台＋雲梯（連結）
    const plat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2), toon(0xb04a3a)); plat.position.set(cx - 2.5, fy + 1.5, cz - 4); plat.castShadow = true; scene.add(plat)
    for (const lx of [-0.5, 0.5]) for (const lz of [-0.5, 0.5]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), toon(0x7a8a96)); leg.position.set(cx - 2.5 + lx, fy + 0.75, cz - 4 + lz); scene.add(leg) }
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 2.6), toon(0xd0d4d8)); slide.position.set(cx - 3.2, fy + 0.85, cz - 4); slide.rotation.x = 0.0; slide.rotation.z = 0.5; scene.add(slide) // すべり面
    // 雲梯（はしご状の横棒）：プラットフォームから伸びる
    for (const sx of [-0.55, 0.55]) { for (const ex2 of [0, 4]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), toon(0x7a8a96)); post.position.set(cx - 1.5 + ex2, fy + 1.1, cz - 4 + sx); scene.add(post) } const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4, 6), toon(0x9aa6ac)); rail.rotation.z = Math.PI / 2; rail.position.set(cx + 0.5, fy + 2.1, cz - 4 + sx); scene.add(rail) }
    for (let i = 0; i < 7; i++) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), toon(0xc0ccd2)); rung.rotation.x = Math.PI / 2; rung.position.set(cx - 1.3 + i * 0.6, fy + 2.1, cz - 4); scene.add(rung) }
    // タイヤブランコ（タイヤを地面と水平に吊るす＝回るやつ）
    const tg = new THREE.Group()
    const apost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), toon(0x6a7a86)); apost.position.set(0, 1.3, 0); tg.add(apost)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), toon(0x6a7a86)); arm.rotation.z = Math.PI / 2; arm.position.set(0.7, 2.5, 0); tg.add(arm)
    for (const a of [0, Math.PI * 0.66, Math.PI * 1.33]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 4), toon(0x4a4034)); rope.position.set(1.4 + Math.cos(a) * 0.35, 1.75, Math.sin(a) * 0.35); tg.add(rope) }
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 8, 16), toon(0x2a2a2a)); tire.rotation.x = Math.PI / 2; tire.position.set(1.4, 1.0, 0); tg.add(tire) // 水平のタイヤ
    tg.traverse((o) => { if (o.isMesh) o.castShadow = true })
    tg.position.set(cx + 5.5, fy, cz + 3); mergedOutline(tg, 0.03); scene.add(tg)
    // 水飲み場（上＝飲む・下＝手洗い。トイレは無い）
    const wstand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 8), toon(0xbfc4c2)); wstand.position.set(cx - 6.5, fy + 0.45, cz - 5); wstand.castShadow = true; scene.add(wstand)
    const wbasin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.18, 12), toon(0xcfd4d2)); wbasin.position.set(cx - 6.5, fy + 0.95, cz - 5); scene.add(wbasin)
    const wspout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5), toon(0x8a9aa0)); wspout.position.set(cx - 6.5, fy + 1.12, cz - 5); scene.add(wspout)
    const wtap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), toon(0x8a9aa0)); wtap.rotation.z = 0.6; wtap.position.set(cx - 6.35, fy + 0.7, cz - 5); scene.add(wtap)
    // 背の高い街灯（夕方に光る）
    const lpole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6), toon(0x46423a)); lpole.position.set(cx + 6.5, fy + 2.2, cz - 6); lpole.castShadow = true; addOutline(lpole, 0.02); scene.add(lpole)
    const lhead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), toon(0xcfcabb)); lhead.position.set(cx + 6.5, fy + 4.4, cz - 6); lhead.rotation.x = Math.PI; scene.add(lhead)
    const lbulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffe2a6, fog: false, transparent: true, opacity: 0 })); lbulb.position.set(cx + 6.5, fy + 4.25, cz - 6); scene.add(lbulb)
    townNightLights.push({ m: lbulb, base: 1.0, ph: 3 })
    // あじさい（北側・夏に咲く青紫）
    for (let i = 0; i < 5; i++) {
      const hx = cx - 5 + i * 2.4, hz = cz - 7.6
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), toon(0x5f8b4a)); bush.scale.set(1, 0.8, 1); bush.position.set(hx, fy + 0.45, hz); bush.castShadow = true; scene.add(bush)
      for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), toon([0x7a8ed0, 0x9a7ad0, 0x6aa0d0][k % 3])); bl.position.set(hx + (Math.random() - 0.5) * 0.7, fy + 0.7 + Math.random() * 0.2, hz + (Math.random() - 0.5) * 0.5); scene.add(bl) } // 花房
    }
    // ※公園内は歩けるよう当たり判定は置かない（遊具の細部は通り抜け可）
  }
  makePark(T.x - 86, T.z + 38)
  // ── サンライズ（作者の家）：丘の上の7階建てグレーのマンション。原作不問のオリジナル造形（実名は出さない）──
  function makeMansion(cx, cz) {
    const g = new THREE.Group()
    const floors = 7, units = 5, FH = 2.6, baseH = 3.2, W = units * 2.6, D = 6.5
    // 1階＝立体駐車場の土台（濃いグレー・駐車場の暗い開口）。地形が丘なので道路側に露出する
    // 1階＝立体駐車場（柱で抜けた開放構造）。前面(-z/道路側)が開いて車が見える＋入口ランプ。背面(+z/崖側)に地下からの出入口
    const miniCar = (col) => { const c = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.8), toon(col)); b.position.y = 0.35; c.add(b); const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.74), toon(col)); cab.position.set(-0.1, 0.76, 0); c.add(cab); const ws = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), toon(0x3a4650)); ws.position.set(-0.1, 0.76, 0); c.add(ws); for (const wx of [-0.6, 0.6]) for (const wz of [-0.42, 0.42]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), toon(0x222222)); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.16, wz); c.add(w) } return c }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, D), toonMap(0x9a9a94, plasterTex)); floor.position.y = 0.15; g.add(floor)
    for (const px of [-W / 2 + 0.6, -W / 6, W / 6, W / 2 - 0.6]) for (const pz of [-D / 2 + 0.6, D / 2 - 0.6]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.42, baseH - 0.3, 0.42), toon(0x8c8c88)); col.position.set(px, baseH / 2, pz); g.add(col) }
    const backw = new THREE.Mesh(new THREE.BoxGeometry(W, baseH - 0.3, 0.25), toonMap(0x8c8c88, plasterTex)); backw.position.set(0, baseH / 2, D / 2 - 0.12); g.add(backw) // 背面の壁
    for (let i = 0; i < 3; i++) { const car = miniCar([0xd2d2cc, 0x9a5a4a, 0x3a5a7a][i]); car.position.set(-W / 2 + 1.7 + i * 2.4, 0.45, 0.2); car.rotation.y = Math.PI / 2; g.add(car) }
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 3), toon(0x7a7a74)); ramp.position.set(W / 2 - 1.5, 0.45, -D / 2 - 1.3); ramp.rotation.x = 0.34; g.add(ramp) // 道路からの入口ランプ
    const ug = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.9, 0.4), toon(0x4a5058)); ug.position.set(W * 0.3, 0.95, D / 2 + 0.18); g.add(ug) // 地下出入口（崖側）
    const ugd = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), toon(0x20262c)); ugd.position.set(W * 0.3, 0.85, D / 2 + 0.4); g.add(ugd)
    // 居室7階（グレー）
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, floors * FH, D), toonMap(0xb8b8b2, plasterTex)); body.position.y = baseH + floors * FH / 2; g.add(body)
    const winGlows = []
    for (let f = 0; f < floors; f++) for (let u = 0; u < units; u++) {
      const wx = -W / 2 + 1.3 + u * 2.6, wy = baseH + 1.3 + f * FH
      const isView = (f === floors - 1 && u === 0) // 最上階(7F)の西端＝部屋が無く景色を一望するスペース
      if (isView) { const rail = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 0.08), toon(0xc0c0ba)); rail.position.set(wx, wy - 0.3, D / 2 + 0.45); g.add(rail); continue }
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), toon(0x53636b)); win.position.set(wx, wy, D / 2 + 0.03); g.add(win)
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.8), toon(0xaaaaa4)); ledge.position.set(wx, wy - 0.62, D / 2 + 0.36); g.add(ledge)
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 0.08), toon(0xbebeb8)); rail.position.set(wx, wy - 0.4, D / 2 + 0.72); g.add(rail)
      if (Math.random() < 0.5) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.95), new THREE.MeshBasicMaterial({ color: 0xffd98e, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide })); gl.position.set(wx, wy, D / 2 + 0.05); g.add(gl); winGlows.push(gl) }
    }
    const para = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.5, D + 0.2), toon(0xc2c2bc)); para.position.y = baseH + floors * FH + 0.2; g.add(para)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 10), toon(0x9aa0a4)); tank.position.set(W * 0.28, baseH + floors * FH + 1.1, 0.4); g.add(tank)
    const stair = new THREE.Mesh(new THREE.BoxGeometry(1.5, baseH + floors * FH, 1.8), toonMap(0xacaca6, plasterTex)); stair.position.set(W / 2 + 0.75, (baseH + floors * FH) / 2, -D / 2 + 0.9); g.add(stair) // 外階段塔＝道路側(-z)
    const ent = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.5), toon(0x5a6068)); ent.position.set(-W * 0.28, baseH * 0.5 + 0.1, -D / 2 - 0.22); g.add(ent) // エントランス＝道路側(-z)・バルコニーの反対面
    const entdoor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.0), toon(0x2e3a40)); entdoor.position.set(-W * 0.28, baseH * 0.5, -D / 2 - 0.48); entdoor.rotation.y = Math.PI; g.add(entdoor)
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.position.set(cx, heightAt(cx, cz), cz) // 丘の上に建つ
    mergedOutline(g, 0.05); addContactShadow(g, Math.max(W, D) * 0.7); addCollider(cx, cz, Math.max(W, D) * 0.5); scene.add(g)
    for (const gl of winGlows) townNightLights.push({ m: gl, base: 0.85, ph: Math.random() * 6 })
  }
  makeMansion(SUNRISE_HILL.x, SUNRISE_HILL.z)
  // ── ゲーム屋「ビスコ」のオマージュ（昭和末〜平成初のゲーム/おもちゃ屋）。実名は出さず generic「ゲーム」看板 ──
  function makeGameShop(cx, cz, rot) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 5), toonMap(0xe2d2ba, plasterTex)); body.position.y = 1.8; g.add(body)
    const front = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), new THREE.MeshBasicMaterial({ color: 0x20242a })); front.position.set(0, 1.25, 2.51); g.add(front) // 店先の暗いガラス
    for (let i = 0; i < 6; i++) { const toy = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), toon([0xd24a3a, 0x3a6a9a, 0x3e8a4a, 0xe0a030, 0x8a5ad0][i % 5])); toy.position.set(-2 + i * 0.8, 0.95, 2.36); g.add(toy) } // ショーウィンドウのおもちゃ
    const signbg = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.1, 0.4), toon(0xd23a6a)); signbg.position.set(0, 3.95, 2.4); g.add(signbg)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.9), new THREE.MeshBasicMaterial({ map: textTex('ゲーム', '#d23a6a', '#fff3c8', false) })); sign.position.set(0, 3.95, 2.62); g.add(sign)
    const stripes = 6; for (let i = 0; i < stripes; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(6.2 / stripes, 0.16, 1.4), toon(i % 2 ? 0xf2efe6 : 0xd23a6a)); s.position.set(-3.1 + (i + 0.5) * (6.2 / stripes), 2.95, 3.1); s.rotation.x = -0.18; g.add(s) } // 縞の日よけ
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.32, 5.4), toonMap(0x6a5a4a, roofTex)); roof.position.y = 3.7; g.add(roof)
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.position.set(cx, heightAt(cx, cz), cz); g.rotation.y = rot
    mergedOutline(g, 0.05); addContactShadow(g, 4.5); addCollider(cx, cz, 3); scene.add(g)
    const c = Math.cos(rot), s = Math.sin(rot)
    const place = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c] // 店の前(+z)へ世界座標で配置
    // ガチャガチャ（カプセルトイ）×2
    for (let gi = 0; gi < 2; gi++) {
      const [gx, gz] = place(-2.1 + gi * 0.95, 3.2); const gg = new THREE.Group()
      const gbase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.6), toon([0xd24a3a, 0x3a6a9a][gi])); gbase.position.y = 0.48; gg.add(gbase)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color: 0xcfeaf6, transparent: true, opacity: 0.4, side: THREE.DoubleSide })); dome.position.y = 1.12; gg.add(dome)
      for (let k = 0; k < 8; k++) { const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), toon([0xff6a6a, 0xffe24a, 0x6aa0e0, 0x6ad06a][k % 4])); cap.position.set((Math.random() - 0.5) * 0.4, 0.98 + Math.random() * 0.14, (Math.random() - 0.5) * 0.4); gg.add(cap) }
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), toon(0xc0c0b8)); knob.rotation.x = Math.PI / 2; knob.position.set(0, 0.62, 0.32); gg.add(knob)
      gg.traverse((o) => { if (o.isMesh) o.castShadow = true }); gg.position.set(gx, heightAt(gx, gz), gz); gg.rotation.y = rot; mergedOutline(gg, 0.02); scene.add(gg)
    }
    // アーケード筐体（店先に1台）
    const [ax, az] = place(2.3, 3.2); const ag = new THREE.Group()
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.7, 0.7), toon(0x2e3a4a)); cab.position.y = 0.85; ag.add(cab)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5), new THREE.MeshBasicMaterial({ color: 0x3a6aa0 })); screen.position.set(0, 1.32, 0.36); screen.rotation.x = -0.3; ag.add(screen)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.42), toon(0x4a5a6a)); panel.position.set(0, 0.96, 0.4); panel.rotation.x = 0.5; ag.add(panel)
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), toon(0x222222)); stick.position.set(-0.16, 1.06, 0.46); ag.add(stick)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), toon(0xd23a3a)); ball.position.set(-0.16, 1.16, 0.46); ag.add(ball)
    for (let b = 0; b < 2; b++) { const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), toon([0xffe24a, 0x6ad06a][b])); btn.rotation.x = Math.PI / 2; btn.position.set(0.1 + b * 0.13, 1.03, 0.46); ag.add(btn) }
    ag.traverse((o) => { if (o.isMesh) o.castShadow = true }); ag.position.set(ax, heightAt(ax, az), az); ag.rotation.y = rot; mergedOutline(ag, 0.02); scene.add(ag)
  }
  makeGameShop(T.x - 78, T.z - 10, 0)
  // ── 駄菓子屋「新店」のオマージュ（原っぱを抜けた近道の先の、昔ながらの駄菓子屋）。実名は出さない ──
  function makeDagashi(cx, cz, rot) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3.0, 4), toonMap(0xe6dcc4, plasterTex)); body.position.y = 1.5; g.add(body)
    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 4.6), toonMap(0x7a6a5a, roofTex)); roof.position.y = 3.12; g.add(roof) // トタン屋根
    const front = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: 0x2a2218 })); front.position.set(0, 1.05, 2.01); g.add(front) // 店先の暗がり
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.2), toon([0xff6a6a, 0xffe24a, 0x6aa0e0, 0x6ad06a, 0xff9a3a, 0xd06ad0][(r + i) % 6])); box.position.set(-1.55 + i * 0.62, 0.5 + r * 0.56, 1.82); g.add(box) } // 駄菓子の箱
    const caseq = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.7), toon(0xb8a888)); caseq.position.set(0, 0.55, 2.3); g.add(caseq) // 店先のガラスケース台
    const kuji = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshBasicMaterial({ color: 0xf4e8c8 })); kuji.position.set(-2.0, 1.7, 2.02); g.add(kuji) // くじの台紙
    for (let k = 0; k < 12; k++) { const card = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), new THREE.MeshBasicMaterial({ color: [0xff6a6a, 0xffe24a, 0x6aa0e0, 0x6ad06a][k % 4] })); card.position.set(-2.32 + (k % 4) * 0.2, 1.4 + Math.floor(k / 4) * 0.22, 2.03); g.add(card) }
    for (let i = 0; i < 5; i++) { const nr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), toon(0x2a3a6a)); nr.position.set(-1.6 + i * 0.8, 2.3, 2.05); g.add(nr) } // 紺ののれん
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: textTex('だがし', '#3a2c1e', '#f4e8c8', false) })); sign.position.set(0, 2.75, 2.06); g.add(sign)
    // 10円ゲーム（店先の小さな筐体）
    const gm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.5), toon(0xc0392b)); gm.position.set(2.0, 0.5, 2.7); g.add(gm)
    const gms = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe24a })); gms.position.set(2.0, 0.75, 2.96); g.add(gms)
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.position.set(cx, heightAt(cx, cz), cz); g.rotation.y = rot
    mergedOutline(g, 0.05); addContactShadow(g, 3.6); addCollider(cx, cz, 2.6); scene.add(g)
    // 店先の縁台（赤毛氈っぽい）
    const ben = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 0.7), toon(0xb0563f)); const c = Math.cos(rot), s = Math.sin(rot)
    ben.position.set(cx + (-2.6) * c + (2.4) * s, heightAt(cx, cz) + 0.35, cz - (-2.6) * s + (2.4) * c); ben.rotation.y = rot; ben.castShadow = true; addOutline(ben, 0.02); scene.add(ben)
  }
  makeDagashi(T.x - 100, T.z + 30, Math.PI) // 原っぱの北西・近道の先（店先は南＝グラウンド側を向く）
  // ── 二つ池の公園（三ツ池公園のオマージュ。複数の池・桜並木・あずまや・おしどり）──
  function makePondPark(cx, cz) {
    const fy = heightAt(cx, cz)
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(13, 32), new THREE.MeshToonMaterial({ color: 0x88ad52, gradientMap: GRAD, map: watercolorTex })); gnd.rotation.x = -Math.PI / 2; gnd.position.set(cx, fy + 0.05, cz); gnd.receiveShadow = true; scene.add(gnd)
    for (const [px, pz, pr] of [[cx - 4.5, cz + 2.5, 3.6], [cx + 4.8, cz - 1.5, 3.1]]) {
      const w = new THREE.Mesh(new THREE.CircleGeometry(pr, 28), waterMat); w.rotation.x = -Math.PI / 2; w.position.set(px, fy + 0.08, pz); scene.add(w)
      for (let a = 0; a < 18; a++) { const rx = px + Math.cos(a / 18 * Math.PI * 2) * (pr + 0.2), rz = pz + Math.sin(a / 18 * Math.PI * 2) * (pr + 0.2); const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + Math.random() * 0.1, 0), toon(0x9a958c)); rock.position.set(rx, fy + 0.12, rz); rock.castShadow = true; scene.add(rock) }
      for (let d = 0; d < 2; d++) { const dk = new THREE.Group(); const bd = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), toon(d ? 0xe7e2d6 : 0xd2843a)); bd.scale.set(1.4, 0.8, 1); dk.add(bd); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), toon(d ? 0xc09030 : 0x3a6a4a)); hd.position.set(0.22, 0.13, 0); dk.add(hd); const bk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 5), toon(0xe0a030)); bk.rotation.z = -Math.PI / 2; bk.position.set(0.34, 0.12, 0); dk.add(hd); dk.add(bk); dk.position.set(px + (Math.random() - 0.5) * pr, fy + 0.2, pz + (Math.random() - 0.5) * pr); dk.rotation.y = Math.random() * 6; dk.traverse((o) => { if (o.isMesh) o.castShadow = true }); scene.add(dk) } // おしどり
      addCollider(px, pz, pr - 0.3) // 池には入れない
    }
    // 太鼓橋（赤・2池の間）
    { const br = new THREE.Group(); for (let i = -2; i <= 2; i++) { const plank = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.5), toon(0xb0563f)); plank.position.set(0, 0.5 - Math.abs(i) * 0.06, i * 0.45); br.add(plank) } for (const sx of [-0.65, 0.65]) for (let i = -2; i <= 2; i += 2) { const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 5), toon(0xc0392b)); rail.position.set(sx, 0.7 - Math.abs(i) * 0.06, i * 0.45); br.add(rail) } br.traverse((o) => { if (o.isMesh) o.castShadow = true }); br.position.set(cx, fy, cz + 0.5); scene.add(br) }
    // あずまや（四阿）
    { const az = new THREE.Group(); for (const sx of [-1.3, 1.3]) for (const sz of [-1.3, 1.3]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), toon(0x8a6a44)); post.position.set(sx, 1.2, sz); az.add(post) } const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.3, 4), toon(0x586472)); roof.position.y = 3.0; roof.rotation.y = Math.PI / 4; az.add(roof); const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.5), toon(0x9a6a3a)); bench.position.set(0, 0.45, -1.0); az.add(bench); az.traverse((o) => { if (o.isMesh) o.castShadow = true }); az.position.set(cx - 7.5, fy, cz - 6); mergedOutline(az, 0.03); addContactShadow(az, 2.4); addCollider(cx - 7.5, cz - 6, 1.6); scene.add(az) }
    makeSakura(cx - 10, cz + 4, 1.1); makeSakura(cx + 10, cz + 5, 1.0); makeSakura(cx + 2, cz - 9, 1.05); makeSakura(cx - 4, cz + 10, 1.0)
    for (const [bx, bz, br2] of [[cx - 9, cz - 4, 0.4], [cx + 9, cz - 6, -0.6]]) { const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.5), toon(0x9a6a3a)); bench.position.set(bx, fy + 0.45, bz); bench.rotation.y = br2; bench.castShadow = true; addOutline(bench, 0.02); scene.add(bench); for (const lx of [-0.9, 0.9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), toon(0x7a5230)); leg.position.set(bx + Math.cos(br2) * lx, fy + 0.22, bz - Math.sin(br2) * lx); scene.add(leg) } }
  }
  makePondPark(T.x + 55, T.z - 16)
  // 原っぱから駄菓子屋へ続く踏み跡の近道
  { const path = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 18), new THREE.MeshToonMaterial({ color: 0xc2a878, gradientMap: GRAD, map: watercolorTex })); path.rotation.x = -Math.PI / 2; path.rotation.z = 0.2; path.position.set(T.x - 98, heightAt(T.x - 98, T.z + 22) + 0.05, T.z + 22); scene.add(path) }
  // 配置：西側に団地2棟（道を向く）、入口東側にパチンコ屋、空き地に住宅を増設
  makeApartment(T.x - 46, T.z + 6, -Math.PI / 2, 4, 4)
  makeApartment(T.x - 46, T.z + 26, -Math.PI / 2, 5, 5)
  makePachinko(T.x + 30, T.z - 16, Math.PI / 2)
  for (const [hx, hz, r, roof] of [[T.x + 34, T.z + 4, Math.PI / 2, 0x6a5a4a], [T.x + 34, T.z + 16, Math.PI / 2, 0x556088], [T.x - 30, T.z - 12, 0, 0x705a52], [T.x + 50, T.z + 30, Math.PI, 0x4a6a5a]]) makeHouse(hx, hz, r, roof)
  // 西側の枝道（団地へ続く）＋それ沿いの街灯
  const wroad = new THREE.Mesh(new THREE.PlaneGeometry(7, 40), new THREE.MeshToonMaterial({ color: 0x8c8c8c, gradientMap: GRAD })); wroad.rotation.x = -Math.PI / 2; wroad.position.set(T.x - 40, 0.02, T.z + 12); scene.add(wroad)
  // 電柱＋電線
  const tp = []
  for (let i = 0; i < 4; i++) tp.push(makePole(T.x + 5.5, T.z - 22 + i * 15))
  for (let i = 0; i < tp.length - 1; i++) drawWire(tp[i], tp[i + 1], 1.0)
  // 空き地＋土管（ドラえもん的）＋雑草
  function pipe(x, y, z) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.3, 18, 1, true), new THREE.MeshToonMaterial({ color: 0xc0bcb0, gradientMap: GRAD, side: THREE.DoubleSide }))
    p.rotation.z = Math.PI / 2; p.position.set(x, y, z); p.castShadow = true; addOutline(p, 0.04); scene.add(p)
  }
  const lx = T.x - 33, lz = T.z + 12
  pipe(lx, 1.0, lz); pipe(lx + 2.4, 1.0, lz); pipe(lx + 1.2, 2.7, lz)
  for (let i = 0; i < 34; i++) {
    const wx = lx - 7 + Math.random() * 18, wz = lz - 9 + Math.random() * 16
    const w = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), toon(0x88a250)); w.scale.set(1, 0.4, 1)
    w.position.set(wx, 0.1, wz); scene.add(w)
  }
  // ── 一本道ではなく「複数の道がある住宅街」に：交差する道＋枝道＋家のブロック ──
  const roofs2 = [0x6a5a4a, 0x4a6a5a, 0x705a52, 0x556088, 0x586472]
  const asphalt = () => new THREE.MeshToonMaterial({ color: 0x8c8c8c, gradientMap: GRAD })
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(90, 8), asphalt()); cross.rotation.x = -Math.PI / 2; cross.position.set(T.x, 0.02, T.z + 24); scene.add(cross) // 交差する東西の道
  const cl2 = new THREE.Mesh(new THREE.PlaneGeometry(90, 0.3), new THREE.MeshToonMaterial({ color: 0xcfc9bb, gradientMap: GRAD })); cl2.rotation.x = -Math.PI / 2; cl2.position.set(T.x, 0.03, T.z + 24); scene.add(cl2)
  const side = new THREE.Mesh(new THREE.PlaneGeometry(7, 30), asphalt()); side.rotation.x = -Math.PI / 2; side.position.set(T.x - 28, 0.02, T.z + 9); scene.add(side) // 枝道（南北）
  // 交差路の北に並ぶ家（南向き）＋ブロック塀
  const northXs = [T.x - 26, T.x - 8, T.x + 10, T.x + 28]
  for (let i = 0; i < northXs.length; i++) {
    const hx = northXs[i], hz = T.z + 31
    makeHouse(hx, hz, Math.PI, roofs2[i % roofs2.length])
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 1.0, 0.4), toonMap(0xbcb6a4, plasterTex))
    wall.position.set(hx, 0.5, hz - 4.4); wall.castShadow = true; addOutline(wall, 0.03); scene.add(wall)
  }
  // 枝道ぞいの家（東向き）
  makeHouse(T.x - 37, T.z + 3, Math.PI / 2, roofs2[1]); makeHouse(T.x - 37, T.z + 16, Math.PI / 2, roofs2[3])
  // 裏山へのぼる飛び石の小道
  for (let i = 0; i < 10; i++) {
    const sz = T.z + 33 + i * 4.6, sx = T.x + 2 + Math.sin(i * 0.7) * 3.2
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.15, 8), toon(0xb6ab97))
    stone.position.set(sx, heightAt(sx, sz) + 0.05, sz); scene.add(stone)
  }
  // 裏山の雑木（斜面に点々と＝木立の山）
  for (const [tx, tz, ts] of [[T.x - 22, T.z + 50, 1.1], [T.x + 26, T.z + 56, 1.2], [T.x - 6, T.z + 66, 1.0], [T.x + 16, T.z + 72, 1.1], [T.x - 30, T.z + 66, 0.95], [T.x + 36, T.z + 46, 1.0], [T.x - 14, T.z + 80, 0.9]]) makeTree(tx, tz, ts)
  // ── ブランコ（乗ってブランコ視点であそぶ）──
  {
    const g = new THREE.Group(); const frame = toon(0x7a8a96), frameDark = toon(0x52646f)
    for (const sx of [-1.5, 1.5]) for (const dz of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.35, 6), frame)
      leg.position.set(sx + (dz > 0 ? 0.0 : 0.0), SWING.py / 2, dz * 0.9); leg.rotation.x = dz > 0 ? 0.22 : -0.22; g.add(leg)
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), frameDark); top.rotation.z = Math.PI / 2; top.position.y = SWING.py; g.add(top)
    // 座面＝振り子。swingSeat を吊り元(top)に置き、x軸で回す
    swingSeat = new THREE.Group(); swingSeat.position.y = SWING.py; g.add(swingSeat)
    for (const rx of [-0.42, 0.42]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, SWING.L, 4), frameDark); rope.position.set(rx, -SWING.L / 2, 0); swingSeat.add(rope) }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 0.42), toon(0x8a5a32)); seat.position.y = -SWING.L; swingSeat.add(seat)
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.position.set(SWING.x, heightAt(SWING.x, SWING.z), SWING.z); outlineObj(g, 0.03); addContactShadow(g, 2.2); scene.add(g)
  }
  // 街かどの生活痕：丸ポスト・当時の自販機
  {
    const pg = new THREE.Group(); const red = toon(0xc0392b)
    const pbody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 2.2, 12), red); pbody.position.y = 1.1; pg.add(pbody)
    const ptop = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red); ptop.position.y = 2.2; pg.add(ptop)
    placeProp(pg, T.x + 5.5, T.z - 25, 0, 0.04, 0.7)
    const vg = new THREE.Group()
    const vb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 0.9), toon(0xc23a2c)); vb.position.y = 1.1; vg.add(vb)
    const vp = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.25, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff3c8 })); vp.position.set(0, 1.45, 0.46); vg.add(vp)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const can = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), toon([0xd24a3a, 0x3a6a9a, 0x3e8a4a][(i + j) % 3])); can.position.set(-0.3 + i * 0.3, 1.05 + j * 0.4, 0.5); vg.add(can) }
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.04), toon(0x241712)); slot.position.set(0.4, 0.7, 0.46); vg.add(slot) // 取り出し口
    placeProp(vg, T.x + 4.5, T.z + 16, -Math.PI / 2, 0.04, 1.0)
  }
  // 夕涼みの縁台＋蚊取り線香（商店街の軒先）
  {
    const en = new THREE.Group(); const w = toon(0x9a6a3a)
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.66), w); top.position.y = 0.46; en.add(top)
    for (const lx of [-0.9, 0.9]) for (const lz of [-0.22, 0.22]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.46, 0.12), toon(0x7a5230)); leg.position.set(lx, 0.23, lz); en.add(leg) }
    placeProp(en, T.x - 6.5, T.z + 2, Math.PI / 2, 0.03, 1.3) // 道と平行に置く
    const ey = heightAt(T.x - 6.5, T.z + 3)
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), toon(0x3a6a8a)); dish.position.set(T.x - 6.5, ey + 0.55, T.z + 3); dish.castShadow = true; scene.add(dish)
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 16), toon(0x3a5a3a)); coil.rotation.x = -Math.PI / 2; coil.position.set(T.x - 6.5, ey + 0.59, T.z + 3); coil.castShadow = true; scene.add(coil)
    makeSmoke(T.x - 6.5, ey + 0.66, T.z + 3)
  }
  // 簾（すだれ）＝八百屋の軒先に掛ける。横筋のテクスチャで葦の感じ
  {
    const c = document.createElement('canvas'); c.width = 8; c.height = 80; const x = c.getContext('2d')
    x.fillStyle = '#c9b079'; x.fillRect(0, 0, 8, 80)
    x.strokeStyle = '#9a7f4c'; x.lineWidth = 1
    for (let i = 2; i < 80; i += 3) { x.beginPath(); x.moveTo(0, i); x.lineTo(8, i); x.stroke() }
    const tex = new THREE.CanvasTexture(c)
    const sud = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshToonMaterial({ color: 0xffffff, map: tex, gradientMap: GRAD, side: THREE.DoubleSide }))
    sud.position.set(T.x - 9.1, 2.7, T.z - 18); sud.rotation.y = Math.PI / 2; scene.add(sud)
  }
  // ── 住宅街の生活感・遊び（昭和の小物）を増やす ──
  // カーブミラー（街かどの安全ミラー＝住宅街の定番）
  function makeMirror(x, z, rot) {
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6), toon(0xcdc8be)); pole.position.y = 1.6; g.add(pole)
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 16), toon(0xe8731f)); frame.rotation.x = Math.PI / 2; frame.position.set(0, 3.05, 0.12); g.add(frame)
    const mir = new THREE.Mesh(new THREE.CircleGeometry(0.54, 18), new THREE.MeshBasicMaterial({ color: 0xaec6d0 })); mir.position.set(0, 3.05, 0.19); g.add(mir)
    placeProp(g, x, z, rot || 0, 0.03, 0.4)
  }
  makeMirror(T.x + 6, T.z + 21, -0.5); makeMirror(T.x - 6, T.z - 12, 2.6)
  // 植木鉢を家の前にならべる（暮らしの気配）
  function makePots(x, z, n, sx, sz) {
    for (let i = 0; i < n; i++) {
      const px = x + i * sx, pz = z + i * sz
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.26, 8), toon(0xb5703f)); pot.position.set(px, 0.13, pz); pot.castShadow = true; addOutline(pot, 0.02); scene.add(pot)
      const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + Math.random() * 0.06, 0), toon([0x5f8b3c, 0x6f9a47, 0xc05a6a][i % 3])); pl.scale.set(1, 0.85, 1); pl.position.set(px, 0.4, pz); pl.castShadow = true; addOutline(pl, 0.03); scene.add(pl)
    }
  }
  makePots(T.x + 7.4, T.z - 21, 4, 0, 0.55); makePots(T.x - 30, T.z + 28, 3, 1.3, 0); makePots(T.x + 9.6, T.z + 7, 3, 0, 0.5)
  // 自転車（家のかべに立てかけ）
  {
    const g = new THREE.Group(); const metal = toon(0x3a5a7a), tire = toon(0x26282c)
    for (const wx of [-0.62, 0.62]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 14), tire); w.position.set(wx, 0.36, 0); g.add(w) }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.24, 6), metal); bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.5, 0); g.add(bar)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.13), toon(0x2a2018)); seat.position.set(-0.52, 0.82, 0); g.add(seat)
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6), metal); sp.position.set(-0.5, 0.66, 0); sp.rotation.z = 0.25; g.add(sp)
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 6), metal); hb.rotation.x = Math.PI / 2; hb.position.set(0.55, 0.98, 0); g.add(hb)
    const ht = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), metal); ht.position.set(0.55, 0.7, 0); ht.rotation.z = -0.15; g.add(ht)
    const dt = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.74, 6), metal); dt.position.set(0.18, 0.55, 0); dt.rotation.z = 0.7; g.add(dt)
    placeProp(g, T.x + 6.6, T.z - 6, Math.PI / 2, 0.025, 0.8)
  }
  // 空き地の遊び：鉄棒＋ボール
  {
    const g = new THREE.Group(); const m = toon(0x9fb0bc)
    for (const sx of [-0.95, 0.95]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.45, 6), m); post.position.set(sx, 0.72, 0); g.add(post) }
    const bar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 8), m); bar2.rotation.z = Math.PI / 2; bar2.position.y = 1.42; g.add(bar2)
    placeProp(g, lx + 5, lz - 4, 0, 0.025, 0.8)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), toon(0xe0e0d8)); ball.position.set(lx + 2, heightAt(lx + 2, lz + 2) + 0.32, lz + 2); ball.castShadow = true; addOutline(ball, 0.03); addContactShadow(ball, 0.4); scene.add(ball)
  }
}
const VENDING = new THREE.Vector3(TOWN.x + 4.5, 0, TOWN.z + 16) // 街の自販機（ラムネを買える）

// ── 街にスケールと賑わい：総合スーパー(ジャスコ風)・団地・アドバルーン・床屋のサインポール ──
const adballoons = [], barberPoles = []
function textTex(text, bg, fg, vertical) {
  const c = document.createElement('canvas'); c.width = vertical ? 64 : 256; c.height = vertical ? 256 : 80
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height)
  x.fillStyle = fg; x.font = `bold ${vertical ? 40 : 46}px "Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'
  if (vertical) { for (let i = 0; i < text.length; i++) x.fillText(text[i], 32, 38 + i * 46) }
  else x.fillText(text, c.width / 2, c.height / 2)
  return new THREE.CanvasTexture(c)
}
// アドバルーン（空に浮かぶ広告風船＋垂れ幕）。風でゆれる
function makeAdBalloon(x, z, color, text) {
  const baseY = heightAt(x, z), g = new THREE.Group()
  g.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 16), toon(color)))
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.08, 6, 12), toon(0xe8e8e0)); ring.rotation.x = Math.PI / 2; ring.position.y = -1.4; g.add(ring)
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.6), new THREE.MeshToonMaterial({ map: textTex(text, '#f4f1e8', '#c0392b', true), gradientMap: GRAD, side: THREE.DoubleSide })); banner.position.y = -3.4; g.add(banner)
  g.position.set(x, baseY + 14, z)
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, baseY + 8.5, z), new THREE.Vector3(x, baseY + 0.2, z)]), new THREE.LineBasicMaterial({ color: 0x888880, transparent: true, opacity: 0.55 })))
  scene.add(g); g.userData = { baseY: baseY + 14, ph: Math.random() * 6.28 }; adballoons.push(g)
}
// 総合スーパー（ジャスコ風の大箱・屋上看板・縞テント・ガラス入口）
function makeSuperMarket(x, z, rot) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(17, 6.5, 12), toon(0xe2ddd0)); body.position.y = 3.25; g.add(body)
  const signbg = new THREE.Mesh(new THREE.BoxGeometry(11, 2, 0.5), toon(0xc23a2c)); signbg.position.set(0, 7.2, 6); g.add(signbg)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 1.5), new THREE.MeshBasicMaterial({ map: textTex('スーパー', '#c23a2c', '#fff3d8', false) })); sign.position.set(0, 7.2, 6.27); g.add(sign)
  const awn = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 2.4), toon(0xd8d2c4)); awn.position.set(0, 3.4, 7.1); awn.rotation.x = -0.16; g.add(awn)
  const ent = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3, 0.3), new THREE.MeshToonMaterial({ color: 0xbcd4d8, transparent: true, opacity: 0.55, gradientMap: GRAD })); ent.position.set(0, 1.5, 6.16); g.add(ent)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  mergedOutline(g, 0.05); addContactShadow(g, 11); addCollider(x, z, 8); scene.add(g)
}
// 団地（中層住宅・窓とベランダはテクスチャで1ドローに・屋上の給水塔）
function makeDanchi(x, z, rot, floors) {
  const g = new THREE.Group(); const fh = 2.5, w = 9, d = 6.5, h = floors * fh
  const cc = document.createElement('canvas'); cc.width = 96; cc.height = floors * 32; const cx = cc.getContext('2d')
  cx.fillStyle = '#cec9bd'; cx.fillRect(0, 0, cc.width, cc.height)
  for (let f = 0; f < floors; f++) for (let c = 0; c < 3; c++) { cx.fillStyle = '#6a7a86'; cx.fillRect(12 + c * 30, f * 32 + 7, 18, 15); cx.fillStyle = '#b4ae9e'; cx.fillRect(9 + c * 30, f * 32 + 23, 24, 5) }
  const tex = new THREE.CanvasTexture(cc)
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshToonMaterial({ map: tex, gradientMap: GRAD })); body.position.y = h / 2; g.add(body)
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.5, 8), toon(0x9aa0a4)); tank.position.set(2.5, h + 1.2, 0); g.add(tank)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  mergedOutline(g, 0.04); addContactShadow(g, 6); addCollider(x, z, 4.2); scene.add(g)
}
// 床屋のサインポール（赤白青の斜め縞が回る）
function makeBarberPole(x, z) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16; const xc = c.getContext('2d')
  xc.fillStyle = '#f4f4f0'; xc.fillRect(0, 0, 16, 16); xc.lineWidth = 5
  xc.strokeStyle = '#c0392b'; xc.beginPath(); for (let i = -16; i < 32; i += 12) { xc.moveTo(i, 0); xc.lineTo(i + 16, 16) } xc.stroke()
  xc.strokeStyle = '#2a5a9a'; xc.beginPath(); for (let i = -10; i < 32; i += 12) { xc.moveTo(i, 0); xc.lineTo(i + 16, 16) } xc.stroke()
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 2)
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 14), new THREE.MeshBasicMaterial({ map: tex })); pole.position.y = 1.5; g.add(pole)
  for (const cy of [0.92, 2.08]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14), toon(0xcfcabe)); cap.position.y = cy; g.add(cap) }
  g.position.set(x, heightAt(x, z), z); addContactShadow(g, 0.4); scene.add(g); barberPoles.push(tex)
}
// 配置
makeSuperMarket(TOWN.x - 44, TOWN.z - 4, Math.PI / 2)
{ const lot = new THREE.Mesh(new THREE.PlaneGeometry(22, 16), new THREE.MeshToonMaterial({ color: 0x8c8c8c, gradientMap: GRAD })); lot.rotation.x = -Math.PI / 2; lot.position.set(TOWN.x - 30, 0.02, TOWN.z - 4); scene.add(lot) } // 駐車場
makeAdBalloon(TOWN.x - 44, TOWN.z - 4, 0xe8b020, '大売出し')
makeAdBalloon(TOWN.x - 12, TOWN.z + 23, 0xd24a3a, '祝開店')
makeDanchi(TOWN.x + 44, TOWN.z + 4, -Math.PI / 2, 5)
makeDanchi(TOWN.x + 46, TOWN.z + 26, -Math.PI / 2, 4)
makeBarberPole(TOWN.x - 8.6, TOWN.z - 6) // 商店街の床屋の前
// 昭和の車（丸っこいセダン／軽トラ）＝駐車場と通りに止めて生活感
function makeCar(x, z, rot, color, truck) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.66, 4.0), toon(color)); body.position.y = 0.62; g.add(body)
  if (!truck) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.62, 2.1), toon(color)); cabin.position.set(0, 1.16, -0.1); g.add(cabin)
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.46, 2.0), new THREE.MeshToonMaterial({ color: 0x5a6a72, gradientMap: GRAD })); win.position.set(0, 1.2, -0.1); g.add(win)
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.78, 1.4), toon(color)); cabin.position.set(0, 1.2, 1.1); g.add(cabin)
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.42, 1.3), new THREE.MeshToonMaterial({ color: 0x5a6a72, gradientMap: GRAD })); win.position.set(0, 1.36, 1.1); g.add(win)
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.34, 2.0), toon(0x9a958c)); bed.position.set(0, 0.86, -0.9); g.add(bed)
  }
  for (const [wx, wz] of [[0.86, 1.3], [-0.86, 1.3], [0.86, -1.3], [-0.86, -1.3]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.26, 12), toon(0x26282c)); t.rotation.z = Math.PI / 2; t.position.set(wx, 0.32, wz); g.add(t) }
  for (const lx of [0.55, -0.55]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10), new THREE.MeshBasicMaterial({ color: 0xf0ecc8 })); l.position.set(lx, 0.62, 2.01); g.add(l) }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  mergedOutline(g, 0.025); addContactShadow(g, 2.2); scene.add(g)
}
makeCar(TOWN.x - 34, TOWN.z - 9, 0, 0xc4c8cc, false)   // スーパーの駐車場
makeCar(TOWN.x - 28.5, TOWN.z - 9, 0, 0x9a6a4a, false)
makeCar(TOWN.x - 34, TOWN.z + 1.5, 0, 0xeae6da, true)   // 軽トラ
makeCar(TOWN.x - 7.5, TOWN.z + 9, Math.PI / 2, 0x6f8a6a, false) // 通りに路駐
// のぼり旗（かき氷・ラムネ＝夏の店先）。風でなびく
const noboris = []
function makeNobori(x, z, text, bg, fg) {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.8, 6), toon(0xcfc7b6)); pole.position.y = 1.4; g.add(pole)
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 1.7), new THREE.MeshToonMaterial({ map: textTex(text, bg, fg, true), gradientMap: GRAD, side: THREE.DoubleSide })); flag.position.set(0.3, 1.85, 0); g.add(flag)
  g.position.set(x, heightAt(x, z), z); addContactShadow(g, 0.3); scene.add(g); noboris.push({ flag, ph: Math.random() * 6.28 })
}
makeNobori(TOWN.x - 8.4, TOWN.z + 6.5, 'かき氷', '#eaf4ff', '#2a7ab0') // 駄菓子屋の前
makeNobori(TOWN.x - 33, TOWN.z - 10, 'ラムネ', '#eafaf0', '#2e8a5a') // スーパー前
// 朝顔（家のかきねに這う蔓＋青紫の花）＝夏の朝の風物詩
function makeAsagao(x, z, rot) {
  const g = new THREE.Group(); const bamboo = toon(0xbfae6e), leaf = toon(0x4a7a3a)
  for (const px of [-1.2, 0, 1.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), bamboo); p.position.set(px, 1.1, 0); g.add(p) }
  for (const py of [0.7, 1.4, 2.0]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 5), bamboo); h.rotation.z = Math.PI / 2; h.position.set(0, py, 0); g.add(h) }
  const cols = [0x5a6ed0, 0x8a5ad0, 0xd06a9a, 0x6a9ad0]
  for (let i = 0; i < 16; i++) {
    const lx = -1.3 + Math.random() * 2.6, ly = 0.4 + Math.random() * 1.7
    const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), leaf); lf.position.set(lx, ly, 0.02); g.add(lf)
    if (i % 2 === 0) { const f = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), new THREE.MeshToonMaterial({ color: cols[i % 4], gradientMap: GRAD, side: THREE.DoubleSide })); f.position.set(lx + 0.2, ly + 0.15, 0.05); g.add(f); const c2 = new THREE.Mesh(new THREE.CircleGeometry(0.05, 6), new THREE.MeshBasicMaterial({ color: 0xf4f4e8 })); c2.position.set(lx + 0.2, ly + 0.15, 0.07); g.add(c2) }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0; addContactShadow(g, 1.4); scene.add(g)
}
makeAsagao(HOUSE.x + 5.5, HOUSE.z + 3, 0)          // 野原の家のかきね
makeAsagao(TOWN.x + 8, TOWN.z - 14, -Math.PI / 2)  // 町の家のかきね
// 銭湯（昭和の街のランドマーク：瓦屋根・暖簾「ゆ」・煙を吐くレンガの煙突）
function makeSento(x, z, rot) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 4.6, 9), toon(0xe2dac6)); body.position.y = 2.3; g.add(body)
  const eave = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 10), toon(0x556069)); eave.position.y = 4.7; g.add(eave)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.4, 4), toon(0x3f4a54)); roof.position.y = 6.0; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.7); g.add(roof)
  // 入口のひさし＋暖簾「ゆ」
  const hood = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 1.6), toon(0x6a5240)); hood.position.set(0, 3.0, 4.8); hood.rotation.x = -0.12; g.add(hood)
  const noren = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), new THREE.MeshToonMaterial({ map: textTex('ゆ', '#2a5a8a', '#f4f1e8', false), gradientMap: GRAD, side: THREE.DoubleSide })); noren.position.set(0, 2.3, 4.7); g.add(noren)
  // レンガの煙突
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 7.5, 10), toon(0xa05a48)); chimney.position.set(3.6, 6.2, -3); g.add(chimney)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, heightAt(x, z), z); g.rotation.y = rot || 0
  mergedOutline(g, 0.04); addContactShadow(g, 6.5); addCollider(x, z, 5); scene.add(g)
  // 煙突の先から煙（回転を考慮した世界座標）
  const cw = new THREE.Vector3(3.6, 10, -3).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot || 0)
  makeSmoke(x + cw.x, heightAt(x, z) + 10, z + cw.z, 18)
}
makeSento(TOWN.x + 34, TOWN.z - 12, -Math.PI / 2)
// 商店街アーチ（入口をまたぐ門＋看板＋提灯）＝昭和の商店街の象徴
function makeArcade(x, z, rot) {
  const g = new THREE.Group(); const post = toon(0x8a96a2), red = toon(0xc23a2c)
  for (const px of [-5.2, 5.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 6, 8), post); p.position.set(px, 3, 0); g.add(p) }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 0.5), post); beam.position.y = 5.9; g.add(beam)
  const signbg = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.5, 0.3), red); signbg.position.set(0, 5.15, 0.3); g.add(signbg)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshBasicMaterial({ map: textTex('商店街', '#c23a2c', '#fff3d8', false) })); sign.position.set(0, 5.15, 0.47); g.add(sign)
  for (let i = 0; i < 5; i++) { const lan = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), red); lan.scale.set(1, 1.25, 1); lan.position.set(-4.2 + i * 2.1, 5.35, -0.45); g.add(lan) }
  placeProp(g, x, z, rot || 0, 0.04, 1.0)
}
makeArcade(TOWN.x, TOWN.z - 22, 0)
// 公衆電話ボックス（昭和の緑の電話）
function makePhoneBox(x, z, rot) {
  const g = new THREE.Group(); const frame = toon(0x2f7a4a)
  const glass = new THREE.MeshToonMaterial({ color: 0xbcd4d8, transparent: true, opacity: 0.4, gradientMap: GRAD })
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 1.2), frame); base.position.y = 0.09; g.add(base)
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.2, 1.05), glass); box.position.y = 1.28; g.add(box)
  for (const [px, pz] of [[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.52], [0.52, 0.52]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), frame); p.position.set(px, 1.28, pz); g.add(p) }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.28, 1.32), frame); roof.position.y = 2.5; g.add(roof)
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.5, 0.16), toon(0x256a3a)); phone.position.set(0, 1.45, -0.4); g.add(phone)
  placeProp(g, x, z, rot || 0, 0.03, 0.7)
}
makePhoneBox(TOWN.x + 6, TOWN.z - 23, -0.4)

// ── 小さな草花（赤・白・黄の点。場を生き生きと）──
{
  const flowerCols = [0xe06a6a, 0xf2efe6, 0xe8c84a, 0x6e7fd0]
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * 110, z = (Math.random() - 0.5) * 110
    if (x * x + (z + 28) * (z + 28) < 30) continue
    if ((x - POND.x) ** 2 + (z - POND.z) ** 2 < POND.r * POND.r) continue // 池の上は空ける
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

// ── 草むら（低い茂みのかたまり。InstancedMeshで安く密に・風になびく）──
let grassShader = null
{
  const tuft = new THREE.IcosahedronGeometry(0.5, 0)
  tuft.scale(1, 0.52, 1) // 少し丈を出した草むらのかたまり
  const N = 1300 // わさっと密に（InstancedMeshなので1ドローのまま）
  const grassMat = toon(0x7a9a4e) // 地面に合わせて彩度を落とした夏草の色
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }
    sh.uniforms.uWind = { value: 0.5 } // 風の強さ（突風で草が大きくしなる）
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float gw = sin(uTime * 1.3 + (instanceMatrix[3].x + instanceMatrix[3].z) * 0.25);
        transformed.x += gw * (0.1 + uWind * 0.24) * max(position.y, 0.0);
        transformed.z += gw * (0.03 + uWind * 0.08) * max(position.y, 0.0);`)
    grassShader = sh
  }
  const grass = new THREE.InstancedMesh(tuft, grassMat, N)
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s2 = new THREE.Vector3()
  let n = 0
  while (n < N) {
    let x, z
    if (n < N * 0.45) { // 半分弱は中央の遊び場を密に＝歩く所がいちばん草深い
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 44
      x = Math.cos(a) * r; z = Math.sin(a) * r
    } else { x = (Math.random() - 0.5) * 150; z = (Math.random() - 0.5) * 150 }
    if (x * x + (z + 28) * (z + 28) < 36) continue // ベンチ周りは空ける
    if ((x - POND.x) ** 2 + (z - POND.z) ** 2 < POND.r * POND.r) continue // 池の上は空ける
    if ((x - HOUSE.x) ** 2 + (z - HOUSE.z) ** 2 < 40) continue // 家の周りは空ける
    p.set(x, heightAt(x, z) + 0.12, z)
    q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0))
    const sc2 = 0.5 + Math.random() * 1.1
    const yh = Math.random() < 0.42 ? 1.1 + Math.random() * 0.9 : 0.7 + Math.random() * 0.5 // 約4割は背が高くこんもり＝丈のある夏草
    s2.set(sc2, sc2 * yh, sc2)
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
  const petals = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 16), toon(0xf2cb50)); petals.position.y = 2.5; petals.rotation.x = 0.5; g.add(petals)
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12), toon(0x7a4a22)); core.position.set(0, 2.55, 0.04); core.rotation.x = 0.5; g.add(core)
  g.position.set(x, heightAt(x, z), z)
  g.children.forEach((c) => (c.castShadow = true))
  mergedOutline(g, 0.05)
  addContactShadow(g, 0.7)
  scene.add(g)
  swayables.push({ obj: g, ph: Math.random() * 6.28, amp: 0.05 })
}
for (const [x, z] of [[6, 8], [7.2, 9], [-5, 7], [4, -4]]) makeSunflower(x, z)

// ── 野原(エリア1)の充実：家の畑・田んぼ・すずめ ──
// 家のとなりの畑（うね＋作物＋スイカ）＝暮らしの気配。水やりの“過ごす行動”の場
const GARDEN = { x: HOUSE.x + 7, z: HOUSE.z - 4 }
const gardenCrops = []
{
  const soil = toon(0x6b4a33)
  const gx = HOUSE.x + 7, gz = HOUSE.z - 6
  for (let r = 0; r < 4; r++) {
    const rz = gz + r * 1.3
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(6, 0.24, 0.7), soil); ridge.position.set(gx, heightAt(gx, rz) + 0.12, rz); ridge.castShadow = true; addOutline(ridge, 0.02); scene.add(ridge)
    for (let c = 0; c < 5; c++) {
      const cx = gx - 2.4 + c * 1.2
      const crop = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), toon([0x4a7a3a, 0x6f9a47][(r + c) % 2])); crop.scale.set(1, 0.85, 1); crop.position.set(cx, heightAt(cx, rz) + 0.32, rz); crop.castShadow = true; addOutline(crop, 0.03); scene.add(crop)
      gardenCrops.push({ obj: crop, baseY: crop.position.y, ph: Math.random() * 6.28 })
    }
  }
  for (const [sx, sz] of [[gx - 2, gz + 5.4], [gx + 1.6, gz + 5.7]]) { const wm = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), toon(0x2f6b34)); wm.scale.set(1.1, 0.9, 1.1); wm.position.set(sx, heightAt(sx, sz) + 0.36, sz); wm.castShadow = true; addOutline(wm, 0.03); addContactShadow(wm, 0.5); scene.add(wm) }
}
// 水やりの水しぶき（じょうろから落ちる水の粒）
const WDROPN = 20
const wdropPos = new Float32Array(WDROPN * 3).fill(-9999)
const wdropVel = new Float32Array(WDROPN * 3)
const wdropLife = new Float32Array(WDROPN)
const wdropGeo = new THREE.BufferGeometry(); wdropGeo.setAttribute('position', new THREE.BufferAttribute(wdropPos, 3))
const wdrops = new THREE.Points(wdropGeo, new THREE.PointsMaterial({ color: 0xa8d8ec, size: 0.16, transparent: true, opacity: 0.75, depthWrite: false }))
wdrops.frustumCulled = false; scene.add(wdrops)
let wdropHead = 0
function spawnWaterDrop(x, y, z) {
  const i = wdropHead; wdropHead = (wdropHead + 1) % WDROPN
  wdropPos[i * 3] = x + (Math.random() - 0.5) * 0.4; wdropPos[i * 3 + 1] = y; wdropPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4
  wdropVel[i * 3] = (Math.random() - 0.5) * 0.3; wdropVel[i * 3 + 1] = -0.5; wdropVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3
  wdropLife[i] = 0.5
}
let wateringT = 0 // 水やり中の残り時間
// 田んぼ（青田）＝夏の田舎の原風景。あぜ道で囲み、稲を並べる（InstancedMeshで安く）
{
  const px = 72, pz = 4, by = heightAt(px, pz)
  const paddy = new THREE.Mesh(new THREE.PlaneGeometry(28, 22), new THREE.MeshToonMaterial({ color: 0x7faa4e, gradientMap: GRAD, map: watercolorTex }))
  paddy.rotation.x = -Math.PI / 2; paddy.position.set(px, by + 0.06, pz); paddy.receiveShadow = true; scene.add(paddy)
  for (const [ax, az, sw, sd] of [[px, pz - 11.2, 29, 1], [px, pz + 11.2, 29, 1], [px - 14.2, pz, 1, 23.4], [px + 14.2, pz, 1, 23.4]]) {
    const aze = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.3, sd), toon(0xb09a72)); aze.position.set(ax, by + 0.12, az); scene.add(aze)
  }
  const rice = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.5, 4), toon(0x6f9a3e), 240)
  const m4 = new THREE.Matrix4(); let n = 0
  for (let r = 0; r < 12 && n < 240; r++) for (let c = 0; c < 20 && n < 240; c++) { m4.makeTranslation(px - 12 + c * 1.25, by + 0.32, pz - 9 + r * 1.6); rice.setMatrixAt(n++, m4) }
  rice.instanceMatrix.needsUpdate = true; rice.castShadow = false; scene.add(rice)
  // かかし（あぜの角に立つ＝夏の田んぼの原風景）
  const sx = px - 12.5, sz = pz - 9.5, sy = heightAt(sx, sz)
  const k = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), toon(0x8a6a44)); pole.position.y = 1.1; k.add(pole)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), toon(0x8a6a44)); arm.position.y = 1.5; k.add(arm)
  const shirtm = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.7, 0.5), toon(0xb0563f)); shirtm.position.y = 1.34; k.add(shirtm) // ぼろシャツ
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), toon(0xe2cf9a)); head.position.y = 1.95; k.add(head)
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.32, 12), toon(0xcaad6a)); hat.position.y = 2.16; k.add(hat) // 三角の笠
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3a2c22 })
  for (const ex of [-0.09, 0.09]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat); e.position.set(ex, 1.97, 0.23); k.add(e) }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, 0.02), eyeMat); mouth.position.set(0, 1.88, 0.24); mouth.rotation.z = 0.1; k.add(mouth)
  k.traverse((o) => { if (o.isMesh) o.castShadow = true })
  k.position.set(sx, sy, sz); k.rotation.y = -0.7
  mergedOutline(k, 0.03); addContactShadow(k, 0.9); scene.add(k)
  swayables.push({ obj: k, ph: 1.0, amp: 0.014 }) // 風でわずかに傾ぐ
}
// すずめ（地面をついばみ、近づくと いっせいに飛び立つ＝反応する世界）
const sparrows = []
function makeSparrow(hx, hz) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 7), toon(0x9a7a52)); body.scale.set(1, 0.9, 1.4); g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), toon(0xa88a5e)); head.position.set(0, 0.08, 0.13); g.add(head)
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), toon(0xc8a23a)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.07, 0.22); g.add(beak)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), toon(0x6a5436)); tail.rotation.x = -Math.PI / 2.3; tail.position.set(0, 0.03, -0.2); g.add(tail)
  const wmat = new THREE.MeshToonMaterial({ color: 0x7a6038, gradientMap: GRAD, side: THREE.DoubleSide })
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), wmat); wl.position.set(-0.11, 0.03, 0); g.add(wl)
  const wr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), wmat); wr.position.set(0.11, 0.03, 0); g.add(wr)
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.userData = { wl, wr, hx, hz, ph: Math.random() * 6.28, state: 'ground', t: 0, vx: 0, vz: 0 }
  g.position.set(hx + (Math.random() - 0.5) * 7, heightAt(hx, hz) + 0.12, hz + (Math.random() - 0.5) * 7)
  scene.add(g); sparrows.push(g)
}
for (let i = 0; i < 6; i++) makeSparrow(12, 30)

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
  mergedOutline(g, 0.05)
  addContactShadow(g, 1.8)
  scene.add(g)
}
makeBench()

// 数個の石
for (const [x, z, r] of [[3, -20, 0.7], [-4, -18, 0.5], [12, -2, 0.6]]) {
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), toon(0x9a958c))
  rock.position.set(x, heightAt(x, z) + r * 0.4, z); rock.castShadow = true; rock.receiveShadow = true
  addOutline(rock, 0.05)
  addContactShadow(rock, r * 1.5, -r * 0.32)
  scene.add(rock)
}

// ── 蝶（昼に舞う。夜は消える）──
const butterflies = []
function makeButterfly(cx, cz) {
  const g = new THREE.Group()
  const col = [0xf2c84a, 0xe8743c, 0xf0f0f0, 0x8a6ed0][Math.floor(Math.random() * 4)]
  const wmat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true })
  const wing = new THREE.PlaneGeometry(0.34, 0.46)
  const wl = new THREE.Mesh(wing, wmat); wl.position.x = -0.18; g.add(wl)
  const wr = new THREE.Mesh(wing, wmat); wr.position.x = 0.18; g.add(wr)
  g.userData = { wl, wr, cx, cz, r: 4 + Math.random() * 6, ph: Math.random() * 6.28, sp: 0.5 + Math.random() * 0.5, mat: wmat }
  scene.add(g)
  butterflies.push(g)
}
for (const [x, z] of [[5, 2], [-8, -4], [12, -8]]) makeButterfly(x, z)
if (butterflies[0]) butterflies[0].userData.visitor = true // 立ち止まると寄ってくる一匹（間の演出）

// ── 赤とんぼ（夕方に飛ぶ＝夏の終わりの象徴）──
const dragonflies = []
function makeDragonfly(cx, cz) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.75, 5), new THREE.MeshToonMaterial({ color: 0xd0503a, gradientMap: GRAD, transparent: true })); body.rotation.z = Math.PI / 2; g.add(body)
  const wmat = new THREE.MeshBasicMaterial({ color: 0xdcecff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.15), wmat); w.position.set(s * 0.05, 0.03, s * 0.12); g.add(w) }
  g.userData = { cx, cz, ph: Math.random() * 6.28, r: 3 + Math.random() * 5, sp: 0.5 + Math.random() * 0.4, body: body.material, wing: wmat }
  scene.add(g); dragonflies.push(g)
}
for (const [x, z] of [[7, 4], [-6, 6], [10, -6], [-12, -2]]) makeDragonfly(x, z)
if (dragonflies[0]) dragonflies[0].userData.visitor = true // 夕方に立ち止まると 近くへ寄ってくる一匹（間のごほうび）

// ── 夕方のカラス（夕焼け空を ねぐらへ帰っていく＝「そろそろ帰る時間」）──
const crows = []
function makeCrow() {
  const g = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0x23252f, fog: false, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat); body.scale.set(1, 0.7, 2.4); g.add(body)
  // 翼は体の中心をピボットにして はばたかせる（翼端が上下する＝鳥のV字）
  const wl = new THREE.Group(); g.add(wl)
  const wlm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), mat); wlm.position.x = -0.7; wlm.rotation.x = -Math.PI / 2; wl.add(wlm)
  const wr = new THREE.Group(); g.add(wr)
  const wrm = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.42), mat); wrm.position.x = 0.7; wrm.rotation.x = -Math.PI / 2; wr.add(wrm)
  g.rotation.y = -Math.PI / 2 // 進行方向（+x）を向く
  g.userData = { wl, wr, mat, off: Math.random() * 240, sp: 5 + Math.random() * 2, alt: 17 + Math.random() * 9, lane: -85 + Math.random() * 45, flap: 7 + Math.random() * 3, fph: Math.random() * 6.28 }
  g.visible = false; scene.add(g); crows.push(g)
}
for (let i = 0; i < 5; i++) makeCrow()

// ── 足元の砂ぼこり（走ると ふっと土が舞う）──
const DUSTN = 36
const dustPos = new Float32Array(DUSTN * 3).fill(-9999)
const dustVel = new Float32Array(DUSTN * 3)
const dustLife = new Float32Array(DUSTN)
const dustGeo = new THREE.BufferGeometry()
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xd8c6a2, size: 0.42, transparent: true, opacity: 0.45, depthWrite: false, fog: true }))
dustPts.frustumCulled = false; scene.add(dustPts)
let dustHead = 0
function spawnDust(x, y, z) {
  const i = dustHead; dustHead = (dustHead + 1) % DUSTN
  dustPos[i * 3] = x + (Math.random() - 0.5) * 0.3; dustPos[i * 3 + 1] = y; dustPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3
  dustVel[i * 3] = (Math.random() - 0.5) * 0.5; dustVel[i * 3 + 1] = 0.4 + Math.random() * 0.4; dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.5
  dustLife[i] = 0.55
}
let lastStepS = 0

// ── 虫採り（つかまえる遊び）：蝶・カブトムシ・セミ ──
const caught = { count: 0, kinds: {} }
const catchables = []
for (const b of butterflies) catchables.push({ obj: b, kind: 'チョウ', done: false })
function makeBug(x, y, z, kind) {
  const g = new THREE.Group()
  if (kind === 'カブトムシ') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toon(0x3a2a1a)); body.scale.set(1, 0.7, 1.35); g.add(body)
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), toon(0x241810)); horn.position.set(0, 0.1, 0.34); horn.rotation.x = -0.7; g.add(horn)
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toon(0x5a5a50)); body.scale.set(1, 0.8, 1.7); g.add(body)
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.set(x, y, z); scene.add(g)
  catchables.push({ obj: g, kind, done: false })
}
makeBug(14, 2.2, 6.5, 'カブトムシ')
makeBug(22, 2.4, -9.6, 'カブトムシ')
makeBug(-16, 2.6, 2.5, 'セミ')
makeBug(9, 2.0, -21.5, 'セミ')

// ── うろつく猫（茶トラ）。家のまわりを気ままに歩き、近づくと なでられる ──
function makeCat() {
  const g = new THREE.Group()
  const fur = toon(0xdf9450), cream = toon(0xf2e4cb)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), fur); body.scale.set(1.45, 0.86, 0.92); body.position.y = 0.4; g.add(body)
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), cream); chest.scale.set(0.8, 1, 0.8); chest.position.set(0.42, 0.34, 0); g.add(chest) // 胸の白
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), fur); head.position.set(0.5, 0.58, 0); g.add(head)
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), cream); muzzle.scale.set(1, 0.72, 0.9); muzzle.position.set(0.64, 0.5, 0); g.add(muzzle) // 口元の白
  for (const ez of [-0.13, 0.13]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 5), fur); ear.position.set(0.46, 0.8, ez); g.add(ear)
    const ein = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 5), toon(0xe6a8a4)); ein.position.set(0.48, 0.8, ez); g.add(ein) // 耳の中のピンク
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.6, 6), fur); tail.position.set(-0.56, 0.55, 0); tail.rotation.z = -1.0; g.add(tail)
  for (const [lx, lz] of [[0.34, 0.2], [0.34, -0.2], [-0.34, 0.2], [-0.34, -0.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.4, 6), fur); leg.position.set(lx, 0.2, lz); g.add(leg)
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), cream); paw.position.set(lx, 0.04, lz); g.add(paw) // 白い足先
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = false }) // 動く猫も残像防止で影マップへ焼かない
  outlineObj(g, 0.022); addContactShadow(g, 0.7)
  // 顔（輪郭線の後・フチ無し）：目・鼻
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2e2a22 })
  for (const ez of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 8), eyeMat); e.scale.set(0.7, 1, 0.6); e.position.set(0.71, 0.62, ez); g.add(e) }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd98a9a })); nose.position.set(0.78, 0.52, 0); g.add(nose)
  g.userData.tail = tail
  scene.add(g)
  return g
}
const cat = makeCat()
cat.position.set(-10, heightAt(-10, 18), 18)
Object.assign(cat.userData, { tx: -10, tz: 18, rest: 2000, phase: 0 })

// ── 主人公（丸っこく立体的な少年・麦わら帽子。あどけない頭でっかちの体つき）──
// ※特定作品のキャラ・顔の模倣はしない。素朴で可愛い普遍的なトゥーン顔。
function makeBoy() {
  const g = new THREE.Group()
  const skin = toon(0xf6cda3), shirt = toon(0xf2f3ee), pants = toon(0xcaa86a), hat = toon(0xe9c67e) // 明るい肌・白シャツ・ベージュ半ズボン
  // ── 日本の小学2〜4年生（7〜9歳）の“幼児寄り”体型に忠実に：頭が相対的に大きく（約3.5〜4頭身）、
  //    胴は短くぽってり、手足は短めでむちっと、脚は短く重心は低い。これが「ゴリラ/ひょろ長い」を同時に避ける鍵。
  //    関節は継ぎ目を“同径”の丸で隠して人形感を消す（太いコブを作らない）。──
  function makeLeg(side) {
    const hip = new THREE.Group(); hip.position.set(0.115 * side, 0.62, 0) // 腰をさらに低く＝脚を短く・重心を下げて幼児体型に
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.098, 0.1, 6, 12), skin); thigh.position.y = -0.13; hip.add(thigh) // 短くむちっとした太もも
    const knee = new THREE.Group(); knee.position.y = -0.27; hip.add(knee)
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.094, 12, 10), skin); knee.add(kneeCap) // 膝の継ぎ目（太ももと同径＝コブを作らない）
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.084, 0.1, 6, 12), skin); shin.position.y = -0.13; knee.add(shin) // すね（短い）
    // 足首ピボット＝歩いても足裏が地面に沿う（スケートのように爪先が突き出ない）
    const ankle = new THREE.Group(); ankle.position.y = -0.26; knee.add(ankle)
    // サンダル：素足の甲＋革のソール＋甲ストラップ（子どもサイズ・ちょっと大きめの足）
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.08, 0.23), skin); foot.position.set(0, -0.02, 0.05); ankle.add(foot)
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.28), toon(0x7a5436)); sole.position.set(0, -0.07, 0.06); ankle.add(sole)
    const strapF = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.08), toon(0x6a4830)); strapF.position.set(0, 0.02, 0.09); ankle.add(strapF)
    g.add(hip)
    return { hip, knee, ankle }
  }
  const L = makeLeg(-1), R = makeLeg(1)
  const legL = L.hip, legR = R.hip, kneeL = L.knee, kneeR = R.knee, ankleL = L.ankle, ankleR = R.ankle
  // 半ズボン（腰まわり・股の継ぎ目を覆う）。低めの腰に合わせる。
  const shorts = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 12), pants); shorts.scale.set(1.08, 0.72, 0.84); shorts.position.y = 0.64; g.add(shorts)
  // 胴＝短くぽってり（子どもの丸いおなか）。縦を詰めて幼児体型に。
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 14), shirt); torso.scale.set(1.14, 1.2, 0.84); torso.position.y = 0.95; g.add(torso)
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 12), shirt); chest.scale.set(1.08, 0.82, 0.8); chest.position.y = 1.08; g.add(chest) // 肩まわり（なで肩・狭い）
  // 腕（肩ピボット→肘）。短めでむちっと。半袖から素手。肘は同径の丸で継ぎ目を隠す
  function makeArm(side) {
    const sh = new THREE.Group(); sh.position.set(0.19 * side, 1.08, 0); sh.rotation.z = -0.13 * side // なで肩・腕は体から少し離してだらっと
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.082, 12, 10), shirt); sleeve.scale.set(1, 0.9, 1); sleeve.position.y = -0.02; sh.add(sleeve) // 半袖
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.075, 6, 10), skin); upper.position.y = -0.11; sh.add(upper) // 短くむちっとした二の腕
    const elbow = new THREE.Group(); elbow.position.y = -0.185; sh.add(elbow)
    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin); elbow.add(elbowCap)
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.07, 6, 10), skin); fore.position.y = -0.09; elbow.add(fore) // 短い前腕
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 9), skin); hand.scale.set(1, 1.05, 0.72); hand.position.y = -0.17; elbow.add(hand) // ぷっくりした手
    g.add(sh)
    return { sh, elbow }
  }
  const AL = makeArm(-1), AR = makeArm(1)
  const armL = AL.sh, armR = AR.sh, elbowL = AL.elbow, elbowR = AR.elbow
  // 首（細く・短い・ほぼ隠れる）
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.07, 0.09, 10), skin); neck.position.y = 1.24; g.add(neck)
  // あたま＝相対的に大きく（幼児の王道）。geometryは0.185のまま、scaleで実効を大きく＝顔(子)も一緒に拡大される
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 22, 20), skin); head.scale.set(1.13, 1.19, 1.1); head.position.y = 1.37; g.add(head)
  // むぎわら帽子（大きい頭に合わせる）
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 22), hat); brim.position.y = 1.47; g.add(brim)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), hat); cap.position.y = 1.47; g.add(cap)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.05, 22), toon(0x5b7a9c)); band.position.y = 1.49; g.add(band) // 帽子のリボン（青）
  // 虫取り網（ふだんは肩にかつぐ。採取時に前へ振る）
  const net = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), toon(0x9a7b4a)); pole.position.y = 0.55; net.add(pole)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 14), toon(0x8a6b3a)); ring.position.y = 1.3; ring.rotation.x = Math.PI / 2; net.add(ring)
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshBasicMaterial({ color: 0xf5f5ee, transparent: true, opacity: 0.28, side: THREE.DoubleSide })); bag.position.y = 1.3; bag.rotation.x = Math.PI; net.add(bag)
  net.position.set(0.28, 0.7, -0.1); net.rotation.set(-0.2, 0, -0.55) // 肩にかつぐ（低くなった肩に合わせる）
  g.add(net)
  // 斜めがけのかばん（夏の探検バッグ）。胴に付くので歩いても自然
  const bagBody = toon(0xb98a52), bagStrap = toon(0x8a6a3a)
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.64, 0.08), bagStrap)
  strap.position.set(0.02, 0.86, 0.19); strap.rotation.set(0.16, 0, 0.58); g.add(strap) // 左肩→右腰へ斜めに
  const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.13), bagBody)
  satchel.position.set(0.23, 0.58, 0.19); satchel.rotation.z = 0.07; g.add(satchel)
  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.15), toon(0xa6794a))
  flap.position.set(0.23, 0.64, 0.19); flap.rotation.z = 0.07; g.add(flap) // ふた
  g.traverse((o) => { if (o.isMesh) o.castShadow = false }) // 動く主人公を固定影マップに焼くと“残像(ゴースト)”が残るので落とさない＝接地は専用の丸影で表現
  g.userData = { legL, legR, kneeL, kneeR, ankleL, ankleR, armL, armR, elbowL, elbowR, head, net, swing: 0 }
  return g
}
const boy = makeBoy()
const BOY_SCALE = 0.85 // 基準スケール（さらに小柄に）。ジャンプの伸び縮みはこれに掛ける
boy.scale.setScalar(BOY_SCALE) // 体全体をもう少し小さく
boy.position.set(0, heightAt(0, 6), 6)
outlineObj(boy, 0.03)
// 顔（輪郭線の後に付ける＝フチ無しのきれいな顔）。少年は+z方向を向く。
{
  const head = boy.userData.head
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x3a2c22 })
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xf3a59a, transparent: true, opacity: 0.5 })
  const browMat = new THREE.MeshBasicMaterial({ color: 0x6a4a34 })
  // 目＝大きく丸い瞳＋うるうるハイライト2つ＝世界共通の“かわいい”。眉は出さない（やさしい印象）。頭0.185に合わせる
  for (const ex of [-0.078, 0.078]) {
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.053, 16, 14), hiMat); sclera.scale.set(0.82, 1.12, 0.4); sclera.position.set(ex, 0.025, 0.151); head.add(sclera) // 白目（大）
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 14), eyeMat); iris.scale.set(0.94, 1.0, 0.42); iris.position.set(ex, 0.02, 0.166); head.add(iris) // 瞳（大・茶）
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 10), hiMat); hi.position.set(ex + 0.015, 0.046, 0.18); head.add(hi) // きらり大
    const hi2 = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), hiMat); hi2.position.set(ex - 0.012, -0.004, 0.18); head.add(hi2) // きらり小（うるうる）
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), blushMat); bl.scale.set(1, 0.64, 0.4); bl.position.set(ex + (ex > 0 ? 0.05 : -0.05), -0.046, 0.143); head.add(bl) // ふんわりほっぺ
  }
  // 口＝小さなにっこり（線だけ・暗い穴は作らない＝怖くならない）
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0085, 6, 14, Math.PI * 0.9), eyeMat)
  mouth.rotation.z = Math.PI + (Math.PI - Math.PI * 0.9) / 2; mouth.position.set(0, -0.064, 0.168); head.add(mouth)
}
scene.add(boy)
// 主人公の接地影（地面に沿って追従。歩いて弾んでも影は地面に）
const boyShadowMat = shadowMat.clone() // 主人公の影は時間帯で長さ・濃さを変えるので専用マテリアル
const boyShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), boyShadowMat)
boyShadow.rotation.x = -Math.PI / 2
scene.add(boyShadow)

// ── 主人公＝手描き水彩画のビルボード（差し替え可能：CLAUDE.mdの「画像差し替え」設計の実体化）──
// 立体モデルは隠し、絵を板に貼って世界に立たせ、生きた挿絵のように弾む/揺れる。カメラへ水平に正対（直立を保つ）。
const USE_BILLBOARD = false // ※実機で崩れたため3Dモデルへ戻す（ビルボード機構は温存）
let charMesh = null, charReady = false
const charNightTint = new THREE.Color(0x5a6890)
if (USE_BILLBOARD) {
  boy.traverse((o) => { if (o.isMesh) o.visible = false }) // コードの立体は隠す（位置・判定のため boy 自体は残す）
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0.5, 0) // 足元を原点に
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.42, side: THREE.DoubleSide, fog: true, depthWrite: true })
  charMesh = new THREE.Mesh(geo, mat); charMesh.renderOrder = 2; scene.add(charMesh)
  new THREE.TextureLoader().load(boyImgUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4
    mat.map = tex; mat.needsUpdate = true
    const asp = (tex.image.width || 1) / (tex.image.height || 1)
    const H = 2.6 // 世界での背丈（足〜帽子）
    charMesh.scale.set(H * asp, H, 1)
    charMesh.userData.baseH = H; charMesh.userData.asp = asp
    charReady = true
  })
}
// ビルボードを主人公に追従＋生命感（毎フレーム呼ぶ）。phase/moving はモジュール変数。
function updateBillboard() {
  if (!charReady || !charMesh) return
  charMesh.visible = boy.visible && mode === 'walk' // 座る/寝る/ブランコ＝一人称なので隠す
  if (!charMesh.visible) return
  const t = clock.elapsedTime
  charMesh.position.set(boy.position.x, boy.position.y, boy.position.z)
  charMesh.rotation.y = Math.atan2(camera.position.x - boy.position.x, camera.position.z - boy.position.z) // カメラへ水平正対＝直立
  const sway = moving ? Math.sin(phase) * 0.06 : Math.sin(t * 1.5) * 0.012 // 歩くと左右に揺れ・立つと呼吸で小さく
  const sq = moving ? 1 + Math.sin(phase * 2) * 0.035 : 1 + Math.sin(t * 1.5) * 0.012 // 縦の伸び縮み
  charMesh.rotation.z = sway
  const H = charMesh.userData.baseH, asp = charMesh.userData.asp
  charMesh.scale.set(H * asp * (2 - sq), H * sq, 1) // 体積保存ぎみに
  // 昼夜で明るさを合わせる（無光源マテリアルなので手動で陰る）
  charMesh.material.color.setRGB(1, 1, 1).lerp(charNightTint, nightFactor(tday) * 0.62)
}

// ── 村の人（“人の気配”。近づくと話せる。台詞は時間帯で変わる）──
function makeVillager(x, z, opt) {
  const g = new THREE.Group()
  const skin = toon(0xf0c49c), shirtM = toon(opt.shirt)
  const full = !opt.simple // 会話する村人＝関節あり／背景の通行人＝軽量（股ピボットのみ）
  // 主人公と同じ“幼児寄り”の頭身に統一（頭大きめ・胴短く・脚短め・重心低い）。大人はopt.scaleで少し背を高く。
  let kneeL = null, kneeR = null
  function makeLeg(side) {
    const hip = new THREE.Group(); hip.position.set(0.11 * side, 0.6, 0); g.add(hip) // 腰を下げて脚を短く（主人公と統一）
    if (full) {
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.098, 0.1, 4, 8), skin); thigh.position.y = -0.13; hip.add(thigh)
      const knee = new THREE.Group(); knee.position.y = -0.27; hip.add(knee)
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.084, 0.1, 4, 8), skin); shin.position.y = -0.13; knee.add(shin)
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), toon(0x6a4a32)); shoe.scale.set(1, 0.6, 1.4); shoe.position.set(0, -0.26, 0.04); knee.add(shoe)
      return { hip, knee }
    }
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.092, 0.42, 4, 8), skin); leg.position.y = -0.3; hip.add(leg)
    return { hip, knee: null }
  }
  const LL = makeLeg(-1), LR = makeLeg(1)
  const legL = LL.hip, legR = LR.hip; kneeL = LL.knee; kneeR = LR.knee
  if (opt.boy) { const shorts = new THREE.Mesh(new THREE.SphereGeometry(0.205, 14, 10), toon(opt.skirt)); shorts.scale.set(1.08, 0.68, 0.84); shorts.position.y = 0.56; g.add(shorts) }
  else { const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.4, 14), toon(opt.skirt)); skirt.position.y = 0.54; g.add(skirt) }
  // 胴。会話する村人は円筒＋丸い肩、背景の人はたまご型（軽量）。短くぽってり。
  if (full) {
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.24, 14), shirtM); torso.position.y = 0.92; g.add(torso)
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), shirtM); chest.scale.set(1.08, 0.82, 0.8); chest.position.y = 1.04; g.add(chest)
  } else {
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.255, 14, 12), shirtM); torso.scale.set(1.04, 1.0, 0.82); torso.position.y = 0.95; g.add(torso)
  }
  // 首
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.07, 0.09, 9), skin); neck.position.y = 1.22; g.add(neck)
  // あたま＝相対的に大きく（主人公と同じ幼児頭身に統一）。geometry0.185＋scaleで実効を大きく
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.185, 18, 16), skin); head.scale.set(1.13, 1.19, 1.1); head.position.y = 1.35; g.add(head)
  // 髪＝頭をきれいに包むボブ。前髪のフチは額（目の上）で止め、目に被らないようにする（怖さ解消）。
  // 浅いキャップ(0.50π)＝前は額、横は耳、後ろはうなじまで。少しの前傾で自然な被り。
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.226, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(opt.hair)); hair.position.y = 1.385; hair.rotation.x = -0.2; g.add(hair)
  // 前髪（額の生え際を少しだけ前へ。目の上で止まる薄い庇）
  if (!opt.boy) { const bang = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, Math.PI * 0.34, Math.PI * 0.18), toon(opt.hair)); bang.position.set(0, 1.4, 0.03); bang.rotation.x = 0.3; g.add(bang) }
  // 横の毛束（耳の脇。低すぎない位置に）
  if (!opt.boy && !opt.simple) for (const hx of [-0.2, 0.2]) { const pt = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 10), toon(opt.hair)); pt.scale.set(0.8, 1.2, 0.8); pt.position.set(hx, 1.36, -0.02); g.add(pt) }
  // 腕（肩ピボット＝手を振る）。会話する村人は半袖＋肘、背景の人は1本カプセル。短めでむちっと。
  let elbowL = null, elbowR = null
  function makeArm(side) {
    const sh = new THREE.Group(); sh.position.set(0.19 * side, 1.06, 0); sh.rotation.z = -0.13 * side; g.add(sh)
    if (full) {
      const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9), shirtM); sleeve.scale.set(1, 0.9, 1); sleeve.position.y = -0.02; sh.add(sleeve)
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.075, 4, 8), skin); upper.position.y = -0.1; sh.add(upper)
      const elbow = new THREE.Group(); elbow.position.y = -0.185; elbow.rotation.x = -0.2; sh.add(elbow) // 肘を軽く曲げて自然に
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.07, 4, 8), skin); fore.position.y = -0.09; elbow.add(fore)
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 9, 8), skin); hand.position.y = -0.17; elbow.add(hand)
      return { sh, elbow }
    }
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.2, 4, 8), skin); arm.position.y = -0.19; sh.add(arm)
    return { sh, elbow: null }
  }
  const AL = makeArm(-1), AR = makeArm(1)
  const armL = AL.sh, armR = AR.sh; elbowL = AL.elbow; elbowR = AR.elbow
  g.scale.setScalar(opt.scale || 0.95) // 主人公(0.85)の大きさ帯へ寄せる。大人はopt.scaleで少し大きく
  g.traverse((o) => { if (o.isMesh) o.castShadow = false }) // 動く村人/通行人も残像防止（接地は丸影ブロブ）
  g.position.set(x, heightAt(x, z), z)
  g.rotation.y = opt.face || 0
  if (!opt.simple) outlineObj(g, 0.028) // 背景の通行人は輪郭線を省略＝描画コール削減（小さく遠いので影響小）
  // 顔（輪郭線の後・頭の子に付ける＝見回しで一緒に動く・フチ無し）。主人公と同じ親しみやすい作りに統一
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x4a3526 })
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xf3a59a, transparent: true, opacity: 0.5 })
  // ※主人公と完全に同じ作りに統一（大きい丸い瞳＋うるうる2ハイライト・眉なし・ふんわり頬）＝同じ世界の住人に
  for (const ex of [-0.078, 0.078]) {
    if (opt.simple) { // 背景の通行人＝白目＋瞳＋きらり（軽量だが主人公と同じ親しみ）
      const sc = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), hiMat); sc.scale.set(0.82, 1.12, 0.4); sc.position.set(ex, 0.025, 0.151); head.add(sc)
      const ir = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), eyeMat); ir.scale.set(0.94, 1, 0.42); ir.position.set(ex, 0.02, 0.164); head.add(ir)
      const h0 = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), hiMat); h0.position.set(ex + 0.014, 0.044, 0.178); head.add(h0); continue
    }
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.053, 16, 14), hiMat); sclera.scale.set(0.82, 1.12, 0.4); sclera.position.set(ex, 0.025, 0.151); head.add(sclera) // 白目（大）
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.042, 16, 14), eyeMat); iris.scale.set(0.94, 1.0, 0.42); iris.position.set(ex, 0.02, 0.166); head.add(iris) // 瞳（大）
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 10), hiMat); hi.position.set(ex + 0.015, 0.046, 0.18); head.add(hi) // きらり大
    const hi2 = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), hiMat); hi2.position.set(ex - 0.012, -0.004, 0.18); head.add(hi2) // きらり小（うるうる）
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), blushMat); bl.scale.set(1, 0.64, 0.4); bl.position.set(ex + (ex > 0 ? 0.05 : -0.05), -0.046, 0.143); head.add(bl) // ふんわりほっぺ
  }
  if (!opt.simple) { const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0085, 6, 14, Math.PI * 0.9), eyeMat); mouth.rotation.z = Math.PI + (Math.PI - Math.PI * 0.9) / 2; mouth.position.set(0, -0.064, 0.168); head.add(mouth) }
  addContactShadow(g, 0.6)
  g.userData = { info: opt.info, baseY: heightAt(x, z), legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, head, wph: 0, wave: 0, waveCd: 2 + Math.random() * 4 }
  scene.add(g)
  return g
}
const villager = makeVillager(13, 9, {
  shirt: 0xe08aa8, skirt: 0xd2698a, hair: 0x4a3a2e, face: 2.5,
  info: {
    name: '女の子',
    // 3日かけて進む関係（最初はそっけない→打ちとける→夏の終わりの別れ）
    arcByDay: {
      1: ['（女の子は こちらを ちらっと見て、すこし はにかんだ）', 'えっと…　こんにちは。'],
      2: ['あ、きのうの。また 会ったね。', 'この はらっぱ、わたしの おきにいりなんだ。いっしょに 見る？'],
      3: ['今日で 夏休みも おわりだね。', 'はい、これ おまもり。…また 来年、ここで 会えたら いいな。'],
    },
    byPhase: {
      morning: ['おはよう。今日も いい天気だね。', '朝の はらっぱは すずしくて すきなんだ。'],
      noon: ['暑いねえ。日かげで すこし 休もうよ。', 'むこうの 池に、メダカが いるんだよ。'],
      evening: ['夕やけ、きれいだね。', 'ヒグラシが 鳴きはじめたね。そろそろ おうちかな。'],
      night: ['もう こんな時間。', '星が たくさん 見えるね。'],
    },
  },
})
// 生活リズム：時間帯で居場所が変わる（朝＝池ばた、昼＝木かげ、夕＝家のそば、夜＝縁側）
villager.userData.spots = {
  morning: new THREE.Vector3(18, 0, 20),
  noon: new THREE.Vector3(13, 0, 7),
  evening: new THREE.Vector3(-13, 0, 17),
  night: new THREE.Vector3(-15.5, 0, 15),
}
// 街の店のおばさん（商店街の八百屋の前。会話は時間帯で変わる）
const townLady = makeVillager(TOWN.x - 7.5, TOWN.z - 18, {
  scale: 1.12, // 大人なので少し背を高く（同じ幼児トゥーン様式のまま大きめ）
  shirt: 0xd8c0a0, skirt: 0x9a7a5a, hair: 0x8c8c86, face: Math.PI / 2,
  info: {
    name: '店のおばさん',
    byPhase: {
      morning: ['あら、おはよう。はやいねえ。', 'トマト、いいのが 入ってるよ。'],
      noon: ['いらっしゃい。暑いから 気をつけてね。', 'ラムネ、ひやしてあるよ。'],
      evening: ['そろそろ 店じまいだねえ。', 'おまけ しとくよ。もってきな。'],
      night: ['もう しまっちゃったよ。', '気をつけて お帰り。'],
    },
  },
})
// 店のおばさんに うちわ（夏の小芝居：暑い昼はパタパタとあおぐ）
{
  const u = new THREE.Group()
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.16, 0.018), toon(0x9a7b4a)); handle.position.y = 0.07; u.add(handle)
  const paddle = new THREE.Mesh(new THREE.CircleGeometry(0.13, 18), new THREE.MeshToonMaterial({ color: 0xeae2cc, gradientMap: GRAD, side: THREE.DoubleSide })); paddle.position.y = 0.22; u.add(paddle)
  u.traverse((o) => { if (o.isMesh) o.castShadow = true })
  u.position.set(0, -0.24, 0.05); u.rotation.x = -0.5
  townLady.userData.elbowR.add(u)
  townLady.userData.uchiwa = u; townLady.userData.fans = true
}
// 近所の子（空き地の土管のそば＝ひみつきち。昭和の原風景）
const townKid = makeVillager(TOWN.x - 30, TOWN.z + 16, {
  boy: true, shirt: 0x6aa0d8, skirt: 0x3f5a77, hair: 0x3a2e22, face: -0.6,
  info: {
    name: '近所の子',
    byPhase: {
      morning: ['おはよう！ 虫とり 行く？', 'この 土管、ぼくらの ひみつきちなんだ。'],
      noon: ['ここで かくれんぼ するんだ。', 'きみも 入って みる？'],
      evening: ['もう 帰らないと おこられちゃう。', 'また あした 遊ぼうな！'],
      night: ['まだ 起きてるの？', '夜の 空き地は ちょっと こわいや。'],
    },
  },
})
// 会話できる人たち（いちばん近い人に話しかける）
const npcs = [villager, townLady, townKid]

// NPC共通：腕は基本だらんと下げ、近づくと たまに手を振る。
function npcArms(n, near, dt, tsec) {
  const u = n.userData
  if (!u.armR) return
  if (near && u.wave <= 0) { u.waveCd -= dt; if (u.waveCd <= 0) { u.wave = 1; u.waveCd = 5 + Math.random() * 6 } }
  if (u.wave > 0) u.wave = Math.max(0, u.wave - dt / 1.6) // 約1.6秒かけて上げて振って下ろす
  const w = Math.sin(Math.min(u.wave, 1) * Math.PI) // 0→1→0 でなめらか
  u.armR.rotation.z += ((-0.12 - 2.0 * w) - u.armR.rotation.z) * Math.min(1, dt * 10) // 振ってない時は体に沿う角度へ
  u.armR.rotation.x = Math.sin(tsec * 9) * 0.35 * w // 手先を左右に振る
  u.armL.rotation.z += (0.12 - u.armL.rotation.z) * Math.min(1, dt * 6)
  u.armL.rotation.x = Math.sin(tsec * 1.3 + n.position.x) * 0.05 // 反対の腕は息で少し揺れる
}
let talkTarget = null

// 商店街の通行人（道を行き来＝賑わい。会話はしない）
const pedestrians = []
const pedDefs = [
  [-3.4, 0x7a8a9a, 1.0, false], [3.2, 0x9a7a6a, 0.85, true], [-2.6, 0x6f8a6a, 1.15, false],
  [3.6, 0xb07a5a, 0.95, true], [-3.0, 0x5a7a9a, 1.05, false], // ＝計5人（控えめに・速さもばらけ）
]
for (const [dx, col, sp, boyP] of pedDefs) {
  const hair = boyP ? 0x2a2218 : [0x3a2e22, 0x4a3a2e, 0x5a4a3a][Math.floor(Math.random() * 3)]
  const p = makeVillager(TOWN.x + dx, TOWN.z - 18, { shirt: col, skirt: 0x4a4038, hair, boy: boyP, simple: true, face: 0, info: { name: '', byPhase: { noon: [''] } } })
  p.userData.ped = { sp, dir: Math.random() < 0.5 ? 1 : -1, z0: TOWN.z - 28, z1: TOWN.z + 28, x: TOWN.x + dx, ph: Math.random() * 6, state: 'walk', timer: 2 + Math.random() * 6 }
  p.position.z = TOWN.z - 28 + Math.random() * 56; p.rotation.y = p.userData.ped.dir > 0 ? 0 : Math.PI // 散らばった初期位置・向き
  pedestrians.push(p)
}
// 屋台のお客（夕方〜夜にだけ現れて、カウンターに立つ＝縁日の賑わい）
const yataiPatrons = []
for (const [px, pz, fc, col, boyP] of [[TOWN.x - 7.7, TOWN.z + 20.7, 2.7, 0x8a6a9a, false], [TOWN.x - 8.9, TOWN.z + 19.9, 2.4, 0x5a7a9a, true], [TOWN.x - 6.4, TOWN.z + 21.0, 3.0, 0xb07a5a, false]]) {
  const p = makeVillager(px, pz, { shirt: col, skirt: 0x4a4038, hair: boyP ? 0x2a2218 : 0x4a3a2e, boy: boyP, simple: true, face: fc, info: { name: '', byPhase: { noon: [''] } } })
  p.visible = false; yataiPatrons.push(p)
}

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

// ── 夜の演出：月・星・蛍（夜になるほど現れる）──
const nightFactor = (t) => THREE.MathUtils.smoothstep(t, 0.72, 0.99)
const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xeef0ff, fog: false, transparent: true, opacity: 0 }))
moon.position.set(70, 95, -90); scene.add(moon)
const moonGlow = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xbcd0ff, fog: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }))
moonGlow.position.copy(moon.position); scene.add(moonGlow)
const stars = (() => {
  const g = new THREE.BufferGeometry(); const p = []
  // 天頂までびっしり＝満天の星。低い空ほど薄く、天の川あたりは少し密に
  for (let i = 0; i < 360; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.random() * 0.72 + 0.12, r = 380
    p.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r)
  }
  for (let i = 0; i < 120; i++) { // 天の川の帯（一筋に集める）
    const u = Math.random() * Math.PI * 2, v = 0.5 + (Math.random() - 0.5) * 0.18, r = 380
    p.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r, Math.sin(u) * Math.cos(v) * r)
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }))
  scene.add(pts); return pts
})()
const fireflies = (() => {
  const g = new THREE.BufferGeometry(); const p = []
  for (let i = 0; i < 130; i++) p.push((Math.random() - 0.5) * 92, 0.5 + Math.random() * 4.0, (Math.random() - 0.5) * 92)
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcaff86, size: 0.4, transparent: true, opacity: 0, depthWrite: false, fog: true, blending: THREE.AdditiveBlending }))
  scene.add(pts); return pts
})()
// ── 雨上がりの虹（夏の夕立が上がると、空にそっと架かる）──
const rainbow = new THREE.Group()
{
  const cols = [0xff6a6a, 0xff9a3a, 0xffe24a, 0x5ac85a, 0x4aa8e6, 0x4a5ad6, 0x9a5ad6]
  for (let i = 0; i < cols.length; i++) {
    const R = 150 + i * 2.4
    const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 1.2, 5, 64, Math.PI), new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }))
    rainbow.add(arc)
  }
  rainbow.visible = false; scene.add(rainbow)
}
let rainbowTimer = 0, rainbowF = 0
// 提灯（家の軒先・夜にあかりが灯る）
const lanterns = []
for (let i = 0; i < 5; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff8a4a, fog: false, transparent: true, opacity: 0 }))
  m.scale.y = 1.25
  m.position.set(HOUSE.x - 3 + i * 1.5, heightAt(HOUSE.x, HOUSE.z) + 3.3, HOUSE.z + 4.1)
  scene.add(m); lanterns.push(m)
}
// 田舎家の窓あかり（夕方〜夜にともる＝遠くの「灯のついた家」で夜の寂しさを和らげる）
const houseGlows = []
for (const off of [-1.15, 1.15]) {
  const gx = HOUSE.x + Math.sin(0.35) * 3.25 + Math.cos(0.35) * off
  const gz = HOUSE.z + Math.cos(0.35) * 3.25 - Math.sin(0.35) * off
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.82), new THREE.MeshBasicMaterial({ color: 0xffcb7e, fog: false, transparent: true, opacity: 0, side: THREE.DoubleSide }))
  m.position.set(gx, heightAt(HOUSE.x, HOUSE.z) + 1.55, gz); m.rotation.y = 0.35
  scene.add(m); houseGlows.push(m)
}
// 夏の夜の花火（夜に空へ開く。3日目はおまつりで多め）
const fireworksGroup = new THREE.Group(); scene.add(fireworksGroup)
let fwTimer = 3
function spawnFirework() {
  const N = 72
  const cx = (Math.random() - 0.5) * 70, cy = 34 + Math.random() * 18, cz = -36 - Math.random() * 28
  const pos = new Float32Array(N * 3); const vel = []
  for (let i = 0; i < N; i++) {
    pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz
    vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 5))
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const c = new THREE.Color().setHSL(Math.random(), 0.7, 0.62)
  const mat = new THREE.PointsMaterial({ color: c, size: 0.7, transparent: true, opacity: 1, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
  const pts = new THREE.Points(geo, mat); pts.userData = { vel, age: 0 }
  fireworksGroup.add(pts)
}

// ── 入道雲（高くにゆっくり流れる。寝ころんで空を見ると気持ちいい）──
const clouds = []
{
  const cmat = new THREE.MeshBasicMaterial({ color: 0xfbfbf6, fog: false, transparent: true, opacity: 0.95 })
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group()
    const n = 3 + Math.floor(Math.random() * 3)
    for (let k = 0; k < n; k++) {
      const r = 7 + Math.random() * 8
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), cmat)
      puff.position.set((k - n / 2) * 9 + Math.random() * 4, Math.random() * 4, Math.random() * 6)
      puff.scale.y = 0.6
      g.add(puff)
    }
    g.position.set((Math.random() - 0.5) * 260, 60 + Math.random() * 25, (Math.random() - 0.5) * 260)
    g.userData = { sp: 0.6 + Math.random() * 0.7 }
    scene.add(g); clouds.push(g)
  }
}
// ── 入道雲（夏の空のシンボル）。多数の球を有機的に詰めて1ジオメトリに統合＝軽い。
// 法線の上向きで「上は白く下は陰る」独自シェーダ＝もくもくの立体感。複数を各所に配置 ──
const thunderheads = []
const cloudMat = new THREE.ShaderMaterial({
  uniforms: {
    opacity: { value: 0.96 },
    topCol: { value: new THREE.Color(0xfffdf6) },
    botCol: { value: new THREE.Color(0xb6c2d6) },
    sunDir: { value: sunDir },
    sunCol: { value: new THREE.Color(0xfff0d4) },
  },
  vertexShader: `varying vec3 vN; varying vec3 vL; varying vec3 vView;
    void main(){ vN = normalize(mat3(modelMatrix) * normal); vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vView = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  // もくもくの陰影(3Dノイズ)＋上白下青のグラデ＋太陽側の暖色＋フチの銀色(フレネル)で、よりリアルな積乱雲に
  fragmentShader: `varying vec3 vN; varying vec3 vL; varying vec3 vView; uniform float opacity; uniform vec3 topCol; uniform vec3 botCol; uniform vec3 sunDir; uniform vec3 sunCol;
    float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; } return v; }
    void main(){
      float up = clamp(vN.y * 0.5 + 0.5, 0.0, 1.0);
      float bump = smoothstep(0.3, 0.72, fbm(vL * 0.16));            // 表面のもくもく（こぶ＝明、谷＝暗）
      vec3 col = mix(botCol, topCol, smoothstep(0.14, 0.86, up));    // 上は白く、下は青く陰る
      col *= 0.8 + 0.32 * bump;                                      // こぶの陰影で立体感
      col += sunCol * max(0.0, dot(vN, normalize(sunDir))) * 0.18;   // 太陽側を暖かく
      float fres = pow(1.0 - max(0.0, dot(vView, vN)), 3.0);
      col += vec3(0.14, 0.14, 0.13) * fres;                          // フチの銀色（雲の縁が光る）
      gl_FragColor = vec4(col, opacity);
    }`,
  transparent: true, fog: false,
})
const unitSphere = new THREE.SphereGeometry(1, 10, 8)
function buildCumulonimbus() {
  // 多数の球を、ふくらんだ塊状の体積に密に詰める＝もくもくのカリフラワー（積み上げ感を消す）
  const geos = []
  const push = (x, y, z, rx, ry) => { const g = unitSphere.clone(); g.scale(rx, ry, rx); g.translate(x, y, z); geos.push(g) }
  const H = 26, baseW = 13
  for (let i = 0; i < 64; i++) {
    const t = Math.pow(Math.random(), 0.85)              // 下に偏らせる（下がもくもく）
    const y = t * H
    const prof = Math.sin(Math.min(1, t * 1.1 + 0.12) * Math.PI) // 下〜中ふくらみ、上すぼまり
    const maxr = baseW * (0.4 + 0.6 * prof)
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * maxr
    const sr = (1 - t * 0.55) * 3.0 + 1.9 + Math.random() * 1.4
    push(Math.cos(a) * rr, y, Math.sin(a) * rr * 0.78, sr, sr * (0.86 + Math.random() * 0.24))
  }
  // てっぺんの丸い盛り上がり（塔の頭）
  for (const [dx, dy, sr] of [[0, 0.96, 4.6], [-3.5, 0.84, 3.6], [3.4, 0.86, 3.4], [0.5, 1.04, 3.2]]) push(dx, H * dy, (Math.random() - 0.5) * 2, sr, sr)
  const merged = mergeGeometries(geos); geos.forEach((g) => g.dispose()); return merged
}
for (let i = 0; i < 7; i++) {
  const mesh = new THREE.Mesh(buildCumulonimbus(), cloudMat)
  mesh.scale.setScalar(3.4 + Math.random() * 2.6) // さらに巨大に（夏空にどっしり）
  mesh.userData = { az: (i / 7) * Math.PI * 2 + Math.random() * 0.6, dist: 360 + Math.random() * 180, baseY: 2 - Math.random() * 16, drift: 0.0018 + Math.random() * 0.003 }
  scene.add(mesh); thunderheads.push(mesh)
}

// ── 夕立（時おり通り雨。空が陰り、雨が降って すぐ晴れる＝夏の通り雨）──
let weather = 0, weatherTarget = 0, weatherTimer = 50 + Math.random() * 50 // 0=快晴 1=本降り
let rainGain = null, rainStarted = false, thunderCd = 12 // 雨音（自前合成）・遠雷のクールダウン
const RAINN = 280, RAIN_BOX = 15, RAIN_H = 17
const rainGeo = new THREE.BufferGeometry()
const rainPos = new Float32Array(RAINN * 6)
const rainY = new Float32Array(RAINN)
for (let i = 0; i < RAINN; i++) {
  const rx = (Math.random() - 0.5) * 2 * RAIN_BOX, rz = (Math.random() - 0.5) * 2 * RAIN_BOX
  rainY[i] = Math.random() * RAIN_H
  rainPos[i * 6] = rx; rainPos[i * 6 + 2] = rz; rainPos[i * 6 + 3] = rx + 0.06; rainPos[i * 6 + 5] = rz // 上端と下端（少し斜め）
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
const rainMesh = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xb4c6d6, transparent: true, opacity: 0, fog: false }))
rainMesh.frustumCulled = false; scene.add(rainMesh)

// ── カメラ（既定は斜め見下ろし。視点はユーザーが回せる/寄れる） ──
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 600)
// 視点の制御値（球面）。yaw=水平角, pitch=見下ろし角, dist=距離。
const camCtl = { yaw: 0.32, pitch: 0.62, dist: 19, minDist: 4.5, maxDist: 34, minPitch: 0.18, maxPitch: 1.25 } // minDistを下げて主人公にぐっと寄れるように
function camOffset(out) {
  const cp = Math.cos(camCtl.pitch)
  out.set(Math.sin(camCtl.yaw) * cp, Math.sin(camCtl.pitch), Math.cos(camCtl.yaw) * cp).multiplyScalar(camCtl.dist)
  return out
}
camera.position.copy(boy.position).add(camOffset(new THREE.Vector3()))

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))

// 木漏れ日（ゴッドレイ）：太陽の画面位置から、明るい所を放射状に伸ばす光条。
// ※Bloomの“前”に置く＝既に滲んだ巨大ハイライトを再度引き伸ばして画面が白飛びする正帰還を防ぐ。
const godrayPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, lightPos: { value: new THREE.Vector2(0.5, 0.8) }, strength: { value: 0.0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 lightPos; uniform float strength;
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (strength > 0.001) {
        const int N = 18;
        vec2 uv = vUv;
        vec2 delta = (uv - lightPos) * (0.5 / float(N));
        float illum = 1.0;
        vec3 ray = vec3(0.0);
        for (int i = 0; i < N; i++) {
          uv -= delta;
          vec3 s = texture2D(tDiffuse, uv).rgb;
          float b = max(0.0, max(s.r, max(s.g, s.b)) - 0.82); // よりピーキー＝飛んだ巨大ハイライトを拾わない
          ray += s * b * illum;
          illum *= 0.92;
        }
        col += ray * (strength / float(N)) * 3.0; // 増幅を6→3に。光条はBloomで自然に滲ませる
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
})
composer.addPass(godrayPass)
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.92) // 強さ控えめ・しきい値高め＝白飛び/ちらつきを抑える。半解像度
composer.addPass(bloom)

// 仕上げ：退色フィルム調のカラーグレード＋周辺減光（“あの頃の記憶の色”）
// 影を青緑へ・ハイライトを暖色へ転がし、彩度をわずかに落とし、黒を少し浮かせる。
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.05 }, amount: { value: 1.0 }, wc: { value: 1.0 }, golden: { value: 0.0 }, rain: { value: 0.0 }, texel: { value: new THREE.Vector2(1 / 1280, 1 / 720) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
  // 水彩レンダリング：にじみのゆらぎ＋顔料だまり（フチ）＋紙の質感を、グレードに混ぜ込む（パス追加なし）
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float vig; uniform float amount; uniform float wc; uniform float golden; uniform float rain; uniform vec2 texel;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0)), cc = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(cc, d, f.x), f.y); }
    float L(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      // にじみのゆらぎ：低周波ノイズでサンプル位置を歪める＝手描きのよれ（弱め＝輪郭のチラつき防止）
      vec2 wob = vec2(vnoise(vUv * 19.0) - 0.5, vnoise(vUv * 19.0 + 7.3) - 0.5) * texel * (1.4 * wc);
      vec2 uv = vUv + wob;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float lum = L(c);
      // 顔料だまり：周囲との明度差（エッジ）でフチを暗く＝水彩の縁取り（控えめ＝シマシマ防止）
      float e = abs(L(texture2D(tDiffuse, uv + vec2(texel.x, 0.0)).rgb) - lum)
              + abs(L(texture2D(tDiffuse, uv + vec2(0.0, texel.y)).rgb) - lum)
              + abs(L(texture2D(tDiffuse, uv - vec2(texel.x, 0.0)).rgb) - lum)
              + abs(L(texture2D(tDiffuse, uv - vec2(0.0, texel.y)).rgb) - lum);
      c *= 1.0 - clamp(e * 1.7 * wc, 0.0, 0.32);
      vec3 graded = c;
      graded += vec3(-0.020, 0.012, 0.034) * (1.0 - smoothstep(0.0, 0.5, lum)); // 影に青緑
      graded += vec3(0.032, 0.016, -0.022) * smoothstep(0.45, 1.0, lum);        // ハイライトに暖色
      graded = mix(vec3(lum), graded, 0.87 - 0.10 * wc);                        // 退色（水彩のくすみ・記憶の色＝少し強める）
      graded = graded * 0.975 + 0.018;
      c = mix(c, graded, amount);
      // 夕立：降っている間は全体を少し暗く・青く・くすませる（曇って雨が来た空気）
      if (rain > 0.001) {
        float g2 = dot(c, vec3(0.3, 0.59, 0.11));
        c = mix(c, vec3(g2) * vec3(0.82, 0.9, 1.02), rain * 0.5);
        c *= 1.0 - rain * 0.22;
      }
      // 黄金色の夕（ゴールデンアワー）：夕方は画面全体を温かく金色に染め、上空ほど茜色に
      if (golden > 0.001) {
        c += golden * vec3(0.10, 0.045, -0.05) * (0.35 + lum);          // 光の当たる所ほど金色に
        c += golden * vec3(0.05, 0.0, 0.02) * smoothstep(0.45, 1.0, vUv.y); // 上空は茜色がかる
      }
      // 紙の質感：低周波の紙むら＋細かいザラ（暗くしすぎず、白い紙の上の淡いムラに）
      float paper = vnoise(vUv * vec2(150.0, 140.0)) * 0.5 + vnoise(vUv * vec2(38.0, 36.0)) * 0.5;
      c *= 1.0 - wc * (0.03 - paper * 0.12);
      float grain = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      c += (grain - 0.5) * 0.018;
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - vig * smoothstep(0.62, 0.98, d);                              // 周辺減光（ごく控えめ・四隅だけ）
      gl_FragColor = vec4(c, 1.0);
    }`,
})
composer.addPass(gradePass)

function resize() {
  const w = innerWidth, h = innerHeight
  renderer.setSize(w, h)
  composer.setSize(w, h)
  bloom.setSize(w / 2, h / 2) // ブルームは半解像度を維持
  gradePass.uniforms.texel.value.set(1 / w, 1 / h) // 水彩のエッジ/にじみ用の1テクセル幅
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()

// ── 環境音（蝉↔ヒグラシを時間帯でブレンド＋夕焼けチャイム）──
// 音は癒しの半分。2D版の素材(MP3)を流用し、時刻で滑らかにクロスフェード。
const listener = new THREE.AudioListener()
camera.add(listener)
const audioUrls = loadAudioUrls()
const ambients = {} // id -> THREE.Audio
let audioStarted = false
let chimeArmed = true
;(function initAmbients() {
  const loader = new THREE.AudioLoader()
  for (const id of ['morning', 'cicada', 'higurashi', 'night']) {
    const url = audioUrls[id]
    if (!url) continue
    const a = new THREE.Audio(listener)
    a.setLoop(true); a.setVolume(0)
    loader.load(url, (buf) => { a.setBuffer(buf); if (audioStarted) try { a.play() } catch (e) {} }, undefined, () => {})
    ambients[id] = a
  }
})()
let chimeAudio = null // 縁側の風鈴（立体音響）
function startAudio() {
  if (audioStarted) return
  audioStarted = true
  try {
    const ctx = listener.context
    if (ctx.state === 'suspended') ctx.resume()
    for (const id in ambients) { const a = ambients[id]; if (a.buffer && !a.isPlaying) a.play() }
    if (chimeAudio && chimeAudio.buffer && !chimeAudio.isPlaying) chimeAudio.play()
    initRainAudio()
    unlockIOSAudio() // iOSのミュートスイッチ/画面収録対策
  } catch (e) {}
  try { if (window.__applySound) window.__applySound() } catch (e) {} // 設定で「おとOFF」なら止める
}
// iOS対策：無音のループ音源を <audio> で鳴らし、オーディオセッションを「再生(playback)」にする。
// これでマナースイッチONでもWeb Audioが鳴り、画面収録にも音が入りやすくなる（iOSのWeb Audio既知の挙動）。
let iosSilent = null
function unlockIOSAudio() {
  try {
    if (!iosSilent) {
      const rate = 8000, sec = 0.5, n = Math.floor(rate * sec)
      const ab = new ArrayBuffer(44 + n); const dv = new DataView(ab)
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
      ws(0, 'RIFF'); dv.setUint32(4, 36 + n, true); ws(8, 'WAVE'); ws(12, 'fmt '); dv.setUint32(16, 16, true)
      dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate, true)
      dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); ws(36, 'data'); dv.setUint32(40, n, true)
      for (let i = 0; i < n; i++) dv.setUint8(44 + i, 128) // 8bit無音
      let bin = ''; const by = new Uint8Array(ab); for (let i = 0; i < by.length; i++) bin += String.fromCharCode(by[i])
      iosSilent = document.createElement('audio'); iosSilent.loop = true; iosSilent.setAttribute('playsinline', ''); iosSilent.playsInline = true
      iosSilent.volume = 0.001; iosSilent.src = 'data:audio/wav;base64,' + btoa(bin)
    }
    iosSilent.play().catch(() => {})
  } catch (e) {}
}
// 雨音＝自前合成（外部素材ゼロ）。ノイズをループしてLPF/HPFで「夏のやわらかい雨」に。音量は weather で動かす。
function initRainAudio() {
  if (rainStarted) return
  try {
    const ctx = listener.context
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 340
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300; lp.Q.value = 0.4
    rainGain = ctx.createGain(); rainGain.gain.value = 0
    src.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(getSfxOut())
    src.start()
    rainStarted = true
  } catch (e) {}
}
// 遠雷＝低いランブル（本降りのときだけ、たまに）
function maybeThunder(dt) {
  if (!audioStarted || weather < 0.55) return
  thunderCd -= dt
  if (thunderCd > 0) return
  thunderCd = 9 + Math.random() * 18
  try {
    const ctx = listener.context, now = ctx.currentTime
    const src = ctx.createBufferSource(); src.buffer = getNoise(); src.loop = true; src.playbackRate.value = 0.5
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, now); lp.frequency.exponentialRampToValueAtTime(85, now + 1.9)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.11, now + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.5)
    src.connect(lp); lp.connect(g); g.connect(getSfxOut()); src.start(now); src.stop(now + 2.7)
  } catch (e) {}
}
function ambientWeights(t) {
  const ss = (a, b) => THREE.MathUtils.smoothstep(t, a, b)
  return {
    morning: Math.max(0, 1 - Math.abs(t - 0.03) / 0.14),
    cicada: ss(0.08, 0.2) * (1 - ss(0.5, 0.66)),
    higurashi: ss(0.52, 0.64) * (1 - ss(0.8, 0.9)),
    night: ss(0.82, 0.93) + (t < 0.02 ? 0.3 : 0),
  }
}
function playChime() {
  // 完全オリジナルの素朴な5音（特定の防災チャイム旋律は使わない）。遠くから聞こえるよう強めにLPF。
  try {
    const ctx = listener.context
    const now = ctx.currentTime
    const base = 523.25 // C5
    const notes = [0, 2, 4, 7, 4]
    notes.forEach((n, i) => {
      const t0 = now + i * 0.5
      const f = base * Math.pow(2, n / 12)
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7)
      for (const mul of [1, 2.01]) {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f * mul
        osc.connect(g); osc.start(t0); osc.stop(t0 + 1.8)
      }
      g.connect(lp); lp.connect(getSfxOut())
    })
  } catch (e) {}
}
// ── 効果音の自前合成（外部素材ゼロ。AudioContextで都度つくる）──
let noiseBuf = null
// SFX用マスターバス：ゆるいローパス＋リミッタ（コンプレッサ）で、効果音の耳ざわりなピーク/
// クリップ（“異音”の主因）をまとめて抑える。全SFXはここに繋ぐ＝音が荒れない・歪まない。
let sfxBus = null
function getSfxOut() {
  const ctx = listener.context
  if (sfxBus && sfxBus.context === ctx) return sfxBus
  const g = ctx.createGain(); g.gain.value = 0.82
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6200; lp.Q.value = 0.4 // 耳に刺さる高域を丸める
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -16; comp.knee.value = 26; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.22 // 急なピークを抑える＝歪み/異音防止
  g.connect(lp); lp.connect(comp); comp.connect(ctx.destination)
  sfxBus = g
  return sfxBus
}
function getNoise() {
  if (noiseBuf) return noiseBuf
  const ctx = listener.context
  noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return noiseBuf
}
function playStep(vol, town) { // 足音：草はやわらかい低音、舗装は少し明るい擦れ
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    const src = ctx.createBufferSource(); src.buffer = getNoise(); src.playbackRate.value = 0.8 + Math.random() * 0.35
    const bp = ctx.createBiquadFilter()
    bp.type = town ? 'bandpass' : 'lowpass'; bp.frequency.value = town ? 900 + Math.random() * 360 : 360 + Math.random() * 140; bp.Q.value = town ? 0.7 : 0.6 // 舗装の足音をやわらかい“タッ”に（耳ざわりなチクチク音を抑える）
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + (town ? 0.10 : 0.15))
    src.connect(bp); bp.connect(g); g.connect(getSfxOut()); src.start(now); src.stop(now + 0.25)
  } catch (e) {}
}
// 夜の虫の音（鈴虫風の短いトリル）＝夜にまばらに鳴る。静けさに芯を出す。
let cricketCd = 1
function maybeCricket(dt) {
  if (!audioStarted) return
  const nf = nightFactor(tday)
  if (nf < 0.22) return
  cricketCd -= dt
  if (cricketCd > 0) return
  cricketCd = 0.8 + Math.random() * 1.8
  try {
    const ctx = listener.context, now = ctx.currentTime
    const f = 4300 + Math.random() * 700
    for (let i = 0; i < 4; i++) { // リッリッリッ…と数回
      const t0 = now + i * 0.085
      const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = f
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 7
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.03 * nf, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06)
      osc.connect(bp); bp.connect(g); g.connect(getSfxOut()); osc.start(t0); osc.stop(t0 + 0.08)
    }
  } catch (e) {}
}
// 雨上がりのしずく「ぽちゃん」＝軒や葉から落ちる水滴（自前合成）
function playDrip() {
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    const osc = ctx.createOscillator(); osc.type = 'sine'
    osc.frequency.setValueAtTime(900 + Math.random() * 300, now); osc.frequency.exponentialRampToValueAtTime(360, now + 0.09)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.05, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
    osc.connect(g); g.connect(getSfxOut()); osc.start(now); osc.stop(now + 0.15)
  } catch (e) {}
}
let dripQueue = 0, dripTimer = 0, lastWeatherForDrip = 0
// シャッター音「カシャッ」（自前合成）＝写真モードから呼ぶ
function playShutter() {
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    for (const [t, f, dur, vol] of [[0, 2400, 0.035, 0.18], [0.06, 1500, 0.06, 0.14]]) {
      const src = ctx.createBufferSource(); src.buffer = getNoise()
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.3
      const g = ctx.createGain(); const t0 = now + t
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
      src.connect(bp); bp.connect(g); g.connect(getSfxOut()); src.start(t0); src.stop(t0 + dur + 0.02)
    }
  } catch (e) {}
}
// ジャンプ音「ぴょん」：踏み切りの軽いノイズ＋上がるサイン
function playJump() {
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(640, now + 0.13)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    o.connect(g); g.connect(getSfxOut()); o.start(now); o.stop(now + 0.2)
    const src = ctx.createBufferSource(); src.buffer = getNoise(); const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 520
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, now); g2.gain.exponentialRampToValueAtTime(0.05, now + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)
    src.connect(bp); bp.connect(g2); g2.connect(getSfxOut()); src.start(now); src.stop(now + 0.12)
  } catch (e) {}
}
function playPlop() { // 水を踏む「ぽちゃ」：下がるサイン＋小さなしぶきノイズ
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(440 + Math.random() * 80, now); o.frequency.exponentialRampToValueAtTime(150, now + 0.09)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.07, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
    o.connect(g); g.connect(getSfxOut()); o.start(now); o.stop(now + 0.17)
    const src = ctx.createBufferSource(); src.buffer = getNoise(); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.8
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, now); g2.gain.exponentialRampToValueAtTime(0.04, now + 0.004); g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    src.connect(bp); bp.connect(g2); g2.connect(getSfxOut()); src.start(now); src.stop(now + 0.1)
  } catch (e) {}
}
function playThunk() { // 自販機のガコン＋カラン
  if (!audioStarted) return
  try {
    const ctx = listener.context, now = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(155, now); o.frequency.exponentialRampToValueAtTime(58, now + 0.12)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.22, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
    o.connect(g); g.connect(getSfxOut()); o.start(now); o.stop(now + 0.22)
    const t1 = now + 0.14 // 瓶/缶の高い余韻＝カラン
    for (const f of [900, 1340]) {
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t1); g2.gain.exponentialRampToValueAtTime(0.05, t1 + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.26)
      o2.connect(g2); g2.connect(getSfxOut()); o2.start(t1); o2.stop(t1 + 0.3)
    }
  } catch (e) {}
}

// 縁側の風鈴（軒先・立体音響）。近づくとちりんと聞こえる
const windchime = new THREE.Group()
{
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), toon(0x999999)); str.position.y = 0.25; windchime.add(str)
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshToonMaterial({ color: 0xcfe6ee, gradientMap: GRAD, transparent: true, opacity: 0.85 })); windchime.add(bell)
  const tan = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.3), new THREE.MeshToonMaterial({ color: 0xf4f0e2, gradientMap: GRAD, side: THREE.DoubleSide })); tan.position.y = -0.32; windchime.add(tan)
  windchime.userData = { tan }
  windchime.position.set(HENG.x - 1.2, HENG.y + 3.0, HENG.z + 0.3)
  scene.add(windchime)
}
chimeAudio = new THREE.PositionalAudio(listener)
windchime.add(chimeAudio)
if (audioUrls.windchime) {
  new THREE.AudioLoader().load(audioUrls.windchime, (buf) => {
    chimeAudio.setBuffer(buf); chimeAudio.setLoop(true); chimeAudio.setRefDistance(5); chimeAudio.setRolloffFactor(1.6); chimeAudio.setVolume(0.7)
    if (audioStarted) try { chimeAudio.play() } catch (e) {}
  }, undefined, () => {})
}

// ── 入力・状態 ──
let mode = 'walk' // 'walk' | 'sit' | 'lie'
let moving = false
let phase = 0
let facing = 0 // 向き(rad)
const keys = {}
const seatLook = { yaw: Math.PI, pitch: -0.05 } // 座/寝の視線
const vel = new THREE.Vector3() // 歩きの慣性（世界速度 x,z）
let idleTime = 0 // 立ち止まっている時間（“間”の演出用）
let lookUp = 0 // 立ち止まると少し空を見上げる量(0..1)
const BASE_FOV = 45
const BASE_DIST = 19
let camDistTarget = BASE_DIST // ユーザーのズーム基準（立ち止まり時の自動引きはこれを基準にする）
const lieBtn = document.getElementById('lie')
const npcEl = document.getElementById('npc')
const dialogueEl = document.getElementById('dialogue')
const dlgNameEl = document.getElementById('dlg-name')
const dlgTextEl = document.getElementById('dlg-text')
let dialogue = null // { lines, idx }
const phaseOf = (t) => (t < 0.18 ? 'morning' : t < 0.5 ? 'noon' : t < 0.78 ? 'evening' : 'night')
function startDialogue() {
  const who = talkTarget || villager
  const info = who.userData.info
  // その日の関係の台詞（あれば）→ なければ時間帯の台詞
  const lines = (info.arcByDay && info.arcByDay[day]) || info.byPhase[phaseOf(tday)] || info.byPhase.noon
  dialogue = { lines, idx: 0 }
  dlgNameEl.textContent = info.name
  dlgTextEl.textContent = lines[0]
  dialogueEl.style.display = 'block'
  npcEl.style.display = 'none'
  endPuni()
  if (who === villager) todayFlags.metGirl = true
  if (who === villager && day >= 3) { gotOmamori = true; try { localStorage.setItem('hn3d_omamori', '1') } catch (e) {} } // 最終日に会えたら おまもりを受け取る
  if (who === townLady) todayFlags.metShop = true
  who.rotation.y = Math.atan2(boy.position.x - who.position.x, boy.position.z - who.position.z) // こちらを向く
}

// ── 「3日だけの夏」＋絵日記（その日やったこと→翌日への予告／夏の終わり）──
let day = 1
let gotOmamori = false // 夏の終わりに女の子から おまもりを もらった（日をまたいで残る＝関係の証）
try { gotOmamori = localStorage.getItem('hn3d_omamori') === '1' } catch (e) {}
const dayEvents = { radio: false, dinner: false } // 昭和の日課（1日1回）
let diaryOpen = false
const todayFlags = { metGirl: false, sawPond: false, satHill: false, layDown: false, wentTown: false, petCat: false, lamune: false, metShop: false, wadedCreek: false, sawMedaka: false, sawFrog: false, sawView: false, rodeSwing: false, wentShrine: false, jumped: false, watered: false }
try { const s = +localStorage.getItem('hn3d_day'); if (s >= 1 && s <= 3) day = s } catch (e) {}
const sleepEl = document.getElementById('sleep')
const diaryEl = document.getElementById('diary')
const diaryTitleEl = document.getElementById('diary-title')
const diaryBodyEl = document.getElementById('diary-body')
const diaryCloseEl = document.getElementById('diary-close')
const diaryPicEl = document.getElementById('diary-pic')
// 紙の質感タイル（絵日記の絵に重ねる）
const paperPat = (() => {
  const s = 80, c = document.createElement('canvas'); c.width = c.height = s
  const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, s, s)
  for (let i = 0; i < 420; i++) { const v = 200 + Math.random() * 55; x.fillStyle = `rgba(${v | 0},${(v - 8) | 0},${(v - 20) | 0},0.08)`; x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2) }
  return c
})()
// いまの3Dの眺めを「絵」に：やわらかく退色させ、紙の質感を重ねて子どもの絵日記風にする
function makeDiaryPicture() {
  try {
    const src = renderer.domElement
    if (!src.width) return null
    const w = 480, h = Math.max(1, Math.round((w * src.height) / src.width))
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d')
    x.filter = 'saturate(0.85) contrast(1.04) brightness(1.13) blur(0.6px)' // クレヨン/水彩風＋少し明るく（夜でも見やすい）
    x.drawImage(src, 0, 0, w, h)
    x.filter = 'none'
    x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.5
    x.fillStyle = x.createPattern(paperPat, 'repeat'); x.fillRect(0, 0, w, h)
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'
    const g = x.createRadialGradient(w / 2, h * 0.45, h * 0.25, w / 2, h * 0.5, w * 0.72) // ふちの紙の余白
    g.addColorStop(0, 'rgba(252,247,236,0)'); g.addColorStop(1, 'rgba(252,247,236,0.55)')
    x.fillStyle = g; x.fillRect(0, 0, w, h)
    return c.toDataURL('image/png')
  } catch (e) { return null }
}
const badgeEl = document.getElementById('badge')
function refreshBadge() { if (badgeEl) badgeEl.textContent = `なつやすみ ${day}にちめ` }
refreshBadge()
function openDiary() {
  diaryOpen = true; dayAuto = false
  const body = []
  if (caught.count) body.push(`むしを ${caught.count}ひき つかまえた（${Object.keys(caught.kinds).join('・')}）。`)
  if (fish.count) body.push(`池で さかなを ${fish.count}ひき つった（${Object.keys(fish.kinds).join('・')}）。`)
  if (todayFlags.metGirl) body.push('はらっぱで 女の子と はなした。')
  if (todayFlags.petCat) body.push('ねこを なでた。ごろごろ いっていた。')
  if (todayFlags.wentTown) body.push('街の 商店街まで あるいた。')
  if (todayFlags.metShop) body.push('商店街の おばさんと はなした。')
  if (todayFlags.lamune) body.push('自販機で ラムネを 買った。すずしかった。')
  if (todayFlags.wentShrine) body.push('神社の 石段を のぼった。せみが すごかった。')
  if (todayFlags.sawView) body.push('高い ところから 街を ながめた。ずっと 見ていられた。')
  if (todayFlags.rodeSwing) body.push('ブランコに のった。風が きもちよかった。')
  if (todayFlags.wadedCreek) body.push('小川に 入って ぱしゃぱしゃ あそんだ。つめたかった。')
  if (todayFlags.sawMedaka) body.push('池の メダカは、近づくと さっと にげた。')
  else if (todayFlags.sawPond) body.push('池を のぞいた。メダカが いた きがする。')
  if (todayFlags.sawFrog) body.push('カエルを 見つけた。じっと していた。')
  if (todayFlags.watered) body.push('畑に 水を やった。あした 大きく なってるかな。')
  if (todayFlags.satHill) body.push('高台で ぼーっと した。')
  if (todayFlags.layDown) body.push('草の上で ねころんで 空を ながめた。')
  if (!body.length) body.push('きょうは のんびり あるいた。')
  if (day >= 3) {
    diaryTitleEl.textContent = 'ひと夏が おわった'
    if (gotOmamori) { body.push('女の子に おまもりを もらった。'); body.push('ずっと わすれない 夏に なった。…また 来年、あの はらっぱで。') }
    else { body.push('たのしい 夏休みだった。…また 来年。') }
  } else { diaryTitleEl.textContent = `${day}にちめ ― えにっき`; body.push(day === 1 ? '明日は もっと 話せるかな。' : 'もうすぐ おまつりらしい。') }
  diaryBodyEl.innerHTML = body.map((l) => `<div class="line">${l}</div>`).join('')
  // その日の眺めを「絵」として貼る。今日カメラで撮っていたら、その一枚を絵日記に貼る（＝思い出の写真）
  if (diaryPicEl) {
    diaryPicEl.innerHTML = ''
    let pic = null
    try { if (photoMode && photoMode.newCount > 0) { pic = photoMode.latestPhoto(); photoMode.clearNew() } } catch (e) {}
    if (!pic) pic = makeDiaryPicture()
    if (pic) { const im = new Image(); im.src = pic; diaryPicEl.appendChild(im); diaryPicEl.style.display = 'block' }
    else diaryPicEl.style.display = 'none'
  }
  diaryEl.style.display = 'flex'
}
function nextDay() {
  diaryEl.style.display = 'none'; diaryOpen = false
  day = day >= 3 ? 1 : day + 1 // プロトなので3日のあとは1日目へ
  for (const k in todayFlags) todayFlags[k] = false
  tday = 0.18; dayAuto = true; setTimeOfDay(tday)
  dayEvents.radio = false; dayEvents.dinner = false
  try { localStorage.setItem('hn3d_day', day) } catch (e) {}
  refreshBadge()
}
sleepEl.addEventListener('click', () => { if (!diaryOpen && !dialogue) openDiary() })
diaryCloseEl.addEventListener('click', () => { if (diaryOpen) nextDay() })

// ── エリアの往来（野原 ⇄ 昭和の住宅街）。門に近づくとボタン→フェードで移動 ──
let area = 'field'
let transitioning = false
let autoWalk = null // 往来中の自動歩行 {x,z}（門をくぐって前進）
const goEl = document.getElementById('go')
const fadeEl = document.getElementById('fade')
let activeGate = null // 今いるエリアで近づいている門（GATESから毎フレーム選ぶ）
function travel() {
  if (transitioning || dialogue || diaryOpen || !activeGate) return
  const gate = activeGate
  transitioning = true
  endPuni()
  // 門の方へ向き直って歩き出す（その先が、行き先へ続く道）
  facing = Math.atan2(gate.x - boy.position.x, gate.z - boy.position.z)
  autoWalk = { x: Math.sin(facing), z: Math.cos(facing) }
  fadeEl.style.opacity = '1'
  setTimeout(() => {
    area = gate.to
    if (gate.to === 'town') todayFlags.wentTown = true
    if (gate.to === 'shrine') todayFlags.wentShrine = true
    facing = gate.tf
    // 門をくぐって、前へ歩きながら現れる（ぷつっと切り替わらない）
    autoWalk = { x: Math.sin(facing), z: Math.cos(facing) }
    boy.position.set(gate.tx, heightAt(gate.tx, gate.tz), gate.tz)
    boy.rotation.y = facing
    vel.set(autoWalk.x * 3, 0, autoWalk.z * 3)
    camera.position.copy(boy.position).add(camOffset(tmp))
    if (camera.userData._look) camera.userData._look.set(boy.position.x, boy.position.y + 1.4, boy.position.z)
    setTimeout(() => { fadeEl.style.opacity = '0' }, 240)
    setTimeout(() => { autoWalk = null; transitioning = false }, 780) // 数歩あるいてから操作にもどす
  }, 470)
}
goEl.addEventListener('click', travel)
function advanceDialogue() {
  if (!dialogue) return
  dialogue.idx++
  if (dialogue.idx >= dialogue.lines.length) { dialogue = null; dialogueEl.style.display = 'none' }
  else dlgTextEl.textContent = dialogue.lines[dialogue.idx]
}
npcEl.addEventListener('click', () => {
  const act = npcEl.dataset.act
  if (act === 'pet') petCat()
  else if (act === 'buy') buyRamune()
  else if (act === 'water') waterPlants()
  else startDialogue()
})
dialogueEl.addEventListener('click', advanceDialogue)
function petCat() {
  showToast('ねこは ごろごろ いっている。')
  cat.userData.rest = Math.max(cat.userData.rest, 3000)
  cat.rotation.y = Math.atan2(boy.position.x - cat.position.x, boy.position.z - cat.position.z)
  todayFlags.petCat = true
}
function waterPlants() {
  if (wateringT > 0) return
  wateringT = 2.4
  facing = Math.atan2(GARDEN.x - boy.position.x, GARDEN.z - boy.position.z); boy.rotation.y = facing // 畑の方を向く
  todayFlags.watered = true
  playPlop()
  showToast('畑に 水を やった。土が いいにおい。')
}
let lamuneCd = 0
function buyRamune() {
  if (lamuneCd > 0) return
  lamuneCd = 2.2
  facing = Math.atan2(VENDING.x - boy.position.x, VENDING.z - boy.position.z); boy.rotation.y = facing // 自販機の方を向く
  playThunk()
  showToast(todayFlags.lamune ? 'もう一本。やっぱり つめたい。' : 'ガコン。つめたい ラムネ。100円なり。')
  todayFlags.lamune = true
}

// 虫採りの「つかまえる」とお知らせ（トースト）
const catchEl = document.getElementById('catch')
const toastEl = document.getElementById('toast')
let catchTarget = null
function showToast(msg) {
  if (!toastEl) return
  toastEl.textContent = msg; toastEl.classList.add('show')
  clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 1800)
}
function doCatch() {
  if (!catchTarget || catchTarget.done) return
  const tp = catchTarget.obj.position
  facing = Math.atan2(tp.x - boy.position.x, tp.z - boy.position.z); boy.rotation.y = facing // 虫の方を向く
  boy.userData.swing = 320 // 網を振る
  catchTarget.done = true
  catchTarget.obj.visible = false
  catchTarget.obj.userData.done = true
  caught.count += 1
  caught.kinds[catchTarget.kind] = (caught.kinds[catchTarget.kind] || 0) + 1
  showToast(`${catchTarget.kind}を つかまえた！`)
  catchTarget = null
  if (catchEl) catchEl.style.display = 'none'
}
if (catchEl) catchEl.addEventListener('click', doCatch)

// ── 釣り（池）──
const fishEl = document.getElementById('fish')
const FISH_NAMES = ['フナ', 'メダカ', 'ザリガニ', 'ナマズ', 'おたまじゃくし']
const fish = { count: 0, kinds: {} }
let fishState = 'idle'
let fishTimer = null
const floatMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshToonMaterial({ color: 0xe0544a, gradientMap: GRAD }))
floatMesh.visible = false; scene.add(floatMesh)
function castLine() {
  const dir = new THREE.Vector3(POND.x - boy.position.x, 0, POND.z - boy.position.z)
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1); dir.normalize()
  floatMesh.position.set(boy.position.x + dir.x * 2.5, WATER_Y + 0.15, boy.position.z + dir.z * 2.5)
  floatMesh.visible = true
  fishState = 'wait'; showToast('…あたりを まつ')
  clearTimeout(fishTimer)
  fishTimer = setTimeout(() => {
    fishState = 'bite'; if (fishEl) fishEl.textContent = 'ひく！'; showToast('！ いまだ！')
    clearTimeout(fishTimer); fishTimer = setTimeout(() => { if (fishState === 'bite') endFishing('にげられた…') }, 1300)
  }, 1500 + Math.random() * 2500)
}
function reel() {
  if (fishState === 'bite') {
    const name = FISH_NAMES[Math.floor(Math.random() * FISH_NAMES.length)]
    fish.count++; fish.kinds[name] = (fish.kinds[name] || 0) + 1
    showToast(`${name}が つれた！`); endFishing()
  } else if (fishState === 'wait') endFishing('はやい！ にげられた')
}
function endFishing(msg) { fishState = 'idle'; clearTimeout(fishTimer); floatMesh.visible = false; if (fishEl) fishEl.textContent = 'つる'; if (msg) showToast(msg) }
if (fishEl) fishEl.addEventListener('click', () => { if (fishState === 'idle') castLine(); else reel() })

// ぷにコン（指でスライドした方向へ歩く・白猫プロジェクト風）
const stickEl = document.getElementById('stick')
const knobEl = document.getElementById('knob')
const STICK_R = 60
const puni = { active: false, id: -1, ox: 0, oy: 0, vx: 0, vy: 0 } // vx,vy = -1..1
const pointers = new Map() // 多点タッチ
// 一般的なスマホ3人称操作：画面左半分＝移動スティック／右半分＝視点ドラッグ／2本指ピンチ＝ズーム／ボタン＝ジャンプ
const lookIds = new Set() // 視点ドラッグ中の指（右側）。2本になったらピンチズーム
let pinchD = 0
let sitTap = null // 座っている時のタップ判定（軽タップ＝立つ）
let jumpY = 0, jumpV = 0, airborne = false, landSquash = 0 // ジャンプ（高さ・上下速度・空中フラグ・着地のつぶれ）
function doJump() { if (jumpY <= 0.02 && mode === 'walk') { jumpV = 7.0; airborne = true; playJump(); todayFlags.jumped = true } } // 接地時だけ跳ねる＋ジャンプ音

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

function pinchInit() { // 2本の視点指の距離を記録
  const a = [...lookIds].map((id) => pointers.get(id)).filter(Boolean)
  pinchD = a.length === 2 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0
}
canvas.addEventListener('pointerdown', (e) => {
  startAudio() // 最初のタッチで音を立ち上げる（iOSの自動再生制限への先回り）
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false })
  canvas.setPointerCapture(e.pointerId)
  if (mode !== 'walk') { sitTap = { x: e.clientX, y: e.clientY, moved: false }; return }
  // 左半分＝移動スティック／右半分＝視点ドラッグ（移動スティックが無ければ左でも視点に回す）
  if (e.clientX < innerWidth * 0.46 && !puni.active) startPuni(e.pointerId, e.clientX, e.clientY)
  else { lookIds.add(e.pointerId); if (lookIds.size === 2) pinchInit() }
})
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return
  const prev = pointers.get(e.pointerId)
  const prevX = prev.x, prevY = prev.y
  prev.x = e.clientX; prev.y = e.clientY
  if (Math.abs(e.clientX - prev.sx) + Math.abs(e.clientY - prev.sy) > 12) prev.moved = true
  if (mode !== 'walk') {
    if (sitTap) {
      seatLook.yaw -= (e.clientX - prevX) * 0.005
      seatLook.pitch = THREE.MathUtils.clamp(seatLook.pitch + (e.clientY - prevY) * 0.005, -1.4, 1.45)
      if (Math.abs(e.clientX - sitTap.x) + Math.abs(e.clientY - sitTap.y) > 8) sitTap.moved = true
    }
    return
  }
  if (e.pointerId === puni.id) {
    let dx = e.clientX - puni.ox, dy = e.clientY - puni.oy
    const len = Math.hypot(dx, dy) || 1
    const cl = Math.min(len, STICK_R)
    dx = (dx / len) * cl; dy = (dy / len) * cl
    knobEl.style.left = `calc(50% + ${dx}px)`; knobEl.style.top = `calc(50% + ${dy}px)`
    puni.vx = dx / STICK_R; puni.vy = dy / STICK_R
  } else if (lookIds.has(e.pointerId)) {
    if (lookIds.size >= 2) { // 2本指ピンチ＝ズーム
      const a = [...lookIds].map((id) => pointers.get(id)).filter(Boolean)
      if (a.length === 2) { const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinchD > 0 && d > 0) camDistTarget = THREE.MathUtils.clamp(camDistTarget * (pinchD / d), camCtl.minDist, camCtl.maxDist); pinchD = d }
    } else { // 1本指＝視点を回す（手で回したら自動追従を一時停止＝マリオ式の手動優先）
      camCtl.yaw -= (e.clientX - prevX) * 0.006
      camCtl.pitch = THREE.MathUtils.clamp(camCtl.pitch - (e.clientY - prevY) * 0.005, camCtl.minPitch, camCtl.maxPitch)
      camManualTimer = 1.8
    }
  }
})
function onUp(e) {
  if (!pointers.has(e.pointerId)) return
  const p = pointers.get(e.pointerId)
  pointers.delete(e.pointerId)
  if (mode !== 'walk') {
    if (sitTap && !sitTap.moved) { if (mode === 'swing') swingAmp = Math.min(0.95, swingAmp + 0.14); else standUp() } // ブランコはタップで こぐ
    sitTap = null; return
  }
  if (e.pointerId === puni.id) { endPuni() }
  else if (lookIds.has(e.pointerId)) {
    lookIds.delete(e.pointerId)
    // 視点側を動かさず軽くタップ＝ジャンプ（ボタンが届かない時の保険）
    if (!p.moved && performance.now() - p.t < 250) doJump()
    if (lookIds.size === 2) pinchInit(); else pinchD = 0
  }
}
canvas.addEventListener('pointerup', onUp)
canvas.addEventListener('pointercancel', onUp)
addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') doJump() })
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false })

// ジャンプ・ズームの専用ボタン（一般的なゲーム配置：右下ジャンプ、右側＋／－ズーム）
const jumpEl = document.getElementById('jump')
const zinEl = document.getElementById('zin')
const zoutEl = document.getElementById('zout')
if (jumpEl) jumpEl.addEventListener('click', () => doJump())
const zoomStep = (f) => { camDistTarget = THREE.MathUtils.clamp(camDistTarget * f, camCtl.minDist, camCtl.maxDist) }
if (zinEl) zinEl.addEventListener('click', () => zoomStep(0.8))
if (zoutEl) zoutEl.addEventListener('click', () => zoomStep(1.25))
// 上の操作ヒントは数秒で やさしく消す（ずっと出ていると邪魔なので）
const hintEl = document.getElementById('hint')
if (hintEl) { setTimeout(() => hintEl.classList.add('gone'), 6500); canvas.addEventListener('pointerdown', () => hintEl.classList.add('gone'), { once: true }) }

actBtn.addEventListener('click', () => {
  const spot = actBtn.dataset.spot
  if (mode === 'walk') { if (spot === 'swing') rideSwing(); else sitDown(spot || 'bench') }
  else if (mode === 'swing' && spot === 'offswing') getOffSwing()
})
lieBtn.addEventListener('click', () => { if (mode === 'walk') lieDown() })

let lieT = 0 // 横になる所作のタイマー（mode='lying' の進行）
function lieDown() {
  if (mode !== 'walk') return
  mode = 'lying'; lieT = 0 // まず「よいしょ」と横になる所作を見せる→終わったら空の視点へ
  todayFlags.layDown = true
  endPuni(); vel.set(0, 0, 0)
  boy.scale.setScalar(BOY_SCALE); landSquash = 0; airborne = false
  boy.rotation.z = 0; boy.userData.legL.rotation.x = 0; boy.userData.legR.rotation.x = 0; boy.userData.ankleL.rotation.x = 0; boy.userData.ankleR.rotation.x = 0
  actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'; lookHint.style.display = 'none'
}
function enterLieView() { // 一人称で空を見る視点へ（カメラは追従lerpでなめらかに移る＝スナップしない）
  mode = 'lie'
  boy.position.y = heightAt(boy.position.x, boy.position.z) + 0.25
  boy.rotation.x = -1.35
  boy.visible = false
  seatLook.yaw = boy.rotation.y; seatLook.pitch = 1.2
  camera.fov = BASE_FOV; camera.updateProjectionMatrix()
  lookHint.style.display = 'block'
}

// 縁側の座る位置（家の前・外を向く）
const ENGAWA = new THREE.Vector3(HOUSE.x + Math.sin(0.35) * 3.4, 0, HOUSE.z + Math.cos(0.35) * 3.4)
ENGAWA.y = heightAt(ENGAWA.x, ENGAWA.z)
// 裏山の頂上の見晴らしベンチ（座ると街を一望）
const MOUNT_SEAT = new THREE.Vector3(TOWN.x + 4, 0, TOWN.z + 86)
MOUNT_SEAT.y = heightAt(MOUNT_SEAT.x, MOUNT_SEAT.z)
{
  const g = new THREE.Group(); const w = toon(0x9a6a3a)
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.72), w); top.position.y = 0.52; g.add(top)
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.12), w); back.position.set(0, 0.8, 0.3); g.add(back) // 背もたれは北(山側)
  for (const lx of [-1.0, 1.0]) for (const lz of [-0.26, 0.26]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), toon(0x7a5230)); leg.position.set(lx, 0.26, lz); g.add(leg) }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true })
  g.position.copy(MOUNT_SEAT); mergedOutline(g, 0.03); addContactShadow(g, 1.5); scene.add(g)
}
const curSitEye = new THREE.Vector3()
function sitDown(which) {
  mode = 'sit'
  todayFlags.satHill = true
  endPuni()
  let eye, yaw, pitch = -0.05
  if (which === 'engawa') {
    boy.position.set(ENGAWA.x, ENGAWA.y + 0.6, ENGAWA.z)
    boy.rotation.y = 0.35
    // 目線は縁側の少し前・上（支柱に遮られず庭を見渡す）
    eye = curSitEye.set(ENGAWA.x + Math.sin(0.35) * 1.7, ENGAWA.y + 1.55, ENGAWA.z + Math.cos(0.35) * 1.7)
    yaw = 0.35 // 庭と空の方（外）を向く
  } else if (which === 'mtview') {
    todayFlags.sawView = true
    boy.position.copy(MOUNT_SEAT); boy.position.y = MOUNT_SEAT.y + 0.55
    boy.rotation.y = Math.PI // 街（-z）の方を向いて座る
    eye = curSitEye.set(MOUNT_SEAT.x, MOUNT_SEAT.y + 2.0, MOUNT_SEAT.z - 0.95)
    yaw = Math.PI; pitch = -0.28 // 眼下の街を見おろす
  } else {
    boy.position.copy(SEAT); boy.position.y = SEAT.y + 0.55
    boy.rotation.y = Math.PI
    eye = curSitEye.set(SEAT.x, SEAT.y + 2.3, SEAT.z - 0.9)
    yaw = Math.PI
  }
  boy.rotation.x = 0
  boy.userData.legL.rotation.x = -1.4; boy.userData.legR.rotation.x = -1.4 // 座り姿勢（太ももは前へ）
  boy.userData.kneeL.rotation.x = 1.5; boy.userData.kneeR.rotation.x = 1.5 // すねは下へ＝膝を曲げて腰かける
  boy.userData.ankleL.rotation.x = 0.2; boy.userData.ankleR.rotation.x = 0.2 // 足先を前へ
  moving = false
  seatLook.yaw = yaw; seatLook.pitch = pitch
  const cp = Math.cos(seatLook.pitch)
  camera.position.copy(eye)
  camera.userData._look = camera.userData._look || new THREE.Vector3()
  camera.userData._look.set(eye.x + Math.sin(yaw) * cp, eye.y + Math.sin(seatLook.pitch), eye.z + Math.cos(yaw) * cp)
  actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  lookHint.style.display = 'block'
}
function standUp() {
  mode = 'walk'
  boy.scale.setScalar(BOY_SCALE); landSquash = 0; airborne = false // 伸び縮みをリセット
  boy.userData.legL.rotation.x = 0; boy.userData.legR.rotation.x = 0
  boy.userData.kneeL.rotation.x = 0.12; boy.userData.kneeR.rotation.x = 0.12
  boy.userData.ankleL.rotation.x = 0; boy.userData.ankleR.rotation.x = 0
  boy.rotation.x = 0
  boy.visible = true
  boy.position.y = heightAt(boy.position.x, boy.position.z)
  idleTime = 0
  lookHint.style.display = 'none'
}
function rideSwing() {
  mode = 'swing'; endPuni(); moving = false; todayFlags.rodeSwing = true
  swingPhase = 0; swingAmp = 0.35
  boy.visible = false // ブランコ視点：自分の頭の中が映らないよう本体は隠す
  lookHint.style.display = 'none'
}
function getOffSwing() {
  // ブランコの手前（南側）に降りる
  boy.position.set(SWING.x, 0, SWING.z - 2.4); boy.rotation.y = Math.PI
  standUp()
}

// ── ループ ──
const clock = new THREE.Clock()
const seatEye = new THREE.Vector3()
const lookTo = new THREE.Vector3()
const camGoal = new THREE.Vector3()
const lookGoal = new THREE.Vector3()
const tmp = new THREE.Vector3()
let camManualTimer = 0 // 手動でカメラを回した直後は自動追従を止める秒数（マリオ式：手で回すと優先）
let reduceMotion = false // 設定：画面のゆれを減らす（アクセシビリティ）
const camFwd = new THREE.Vector3()
const camRight = new THREE.Vector3()
const sunProj = new THREE.Vector3()

function update(dt) {
  // ジャンプ・ズームボタンは歩いている時だけ表示（座る/寝る/会話/絵日記の時は隠す）
  const walkUI = mode === 'walk' && !dialogue && !diaryOpen
  if (jumpEl) jumpEl.style.display = walkUI ? 'block' : 'none'
  if (zinEl) zinEl.style.display = walkUI ? 'block' : 'none'
  if (zoutEl) zoutEl.style.display = walkUI ? 'block' : 'none'
  // 一日の移ろい（朝→夜で止まり、「ねる」で翌日へ。ループしない＝3日間の区切り）
  if (dayAuto) {
    const prev = tday
    tday = Math.min(0.97, tday + dt / 240)
    setTimeOfDay(tday)
    // 昭和の日課（1日1回）：朝のラジオ体操・夕飯の呼び声・就寝のうながし
    if (!dayEvents.radio && tday < 0.22) { dayEvents.radio = true; showToast('ラジオ体操の じかんだ。') }
    if (!dayEvents.dinner && prev < 0.7 && tday >= 0.7) { dayEvents.dinner = true; showToast('「ごはんよー」と よばれた。') }
    if (prev < 0.9 && tday >= 0.9 && !diaryOpen) showToast('そろそろ ねる じかんだ…')
  }
  // 空・太陽・星・月を主人公/カメラに追従（遠くの街エリアでも空が正しく回り、影も届く）
  skyDome.position.copy(camera.position)
  sunBall.position.copy(camera.position).addScaledVector(sunDir, 300)
  stars.position.copy(camera.position)
  moon.position.set(camera.position.x + 70, 95, camera.position.z - 90)
  moonGlow.position.copy(moon.position)
  // 影：エリアごとに固定して張り直すのは「エリアが変わった／時刻がそれなりに動いた」時だけ。
  // 歩行中は影カメラが一切動かない＝影の縁がずれず、町でのチカチカが原理的に出ない。
  if (area !== shadowArea || Math.abs(tday - lastShadowTday) > 0.012) {
    if (area === 'town') frameShadow(TOWN.x + 4, TOWN.z + 22, 92)
    else if (area === 'shrine') frameShadow(SHRINE.x, SHRINE.z + 16, 62)
    else frameShadow(0, 4, 82)
    shadowArea = area; lastShadowTday = tday
  }
  // リム＝太陽の水平反対側から低く。後ろ上から輪郭をふちどる（影なしなので毎フレームでも軽い）
  rim.position.set(boy.position.x - sunDir.x * 80, boy.position.y + 26, boy.position.z - sunDir.z * 80)
  rim.target.position.copy(boy.position)
  // 風で草木をゆらす・光の粒を漂わせる（生気）
  const tsec = clock.elapsedTime
  // 統一された「風」：ゆるやかなそよ風＋時おりの突風。これで草・木・風鈴・のぼりが一斉に揺れて世界が呼吸する
  const wind = THREE.MathUtils.clamp(0.42 + 0.3 * Math.sin(tsec * 0.21) + 0.22 * Math.sin(tsec * 0.55 + 1.4) + 0.12 * Math.sin(tsec * 1.27 + 0.4), 0.05, 1.25)
  for (const s of swayables) s.obj.rotation.z = Math.sin(tsec * 1.1 + s.ph) * s.amp * (0.5 + wind)
  if (grassShader) { grassShader.uniforms.uTime.value = tsec; grassShader.uniforms.uWind.value = wind } // 草が風になびく
  waterMat.uniforms.uTime.value = tsec // 水面のさざ波・きらめき
  { // 水面を時間帯になじませる（空を映し、夕は橙、夜は紺・暗く）
    const wnf = nightFactor(tday)
    const duskF = THREE.MathUtils.smoothstep(tday, 0.58, 0.74) * (1 - THREE.MathUtils.smoothstep(tday, 0.82, 0.92))
    waterMat.uniforms.sky.value.copy(skyMat.uniforms.mid.value)
    waterMat.uniforms.glint.value.copy(sunBall.material.color)
    waterMat.uniforms.tint.value.setRGB(1, 1, 1).lerp(_a.set(0xffc59a), duskF * 0.55).lerp(_b.set(0x6a7cb0), wnf * 0.85)
    waterMat.uniforms.bright.value = 1.0 - wnf * 0.52
  }
  if (window.__motes) window.__motes.rotation.y = tsec * 0.02
  // 雲がゆっくり流れる
  for (const c of clouds) { c.position.x += dt * c.userData.sp; if (c.position.x > 150) c.position.x -= 300 }
  // 入道雲：地平のまわりをごくゆっくり巡り、どのエリアからも見える。夜はうすれる（回転させない＝上面が常に空向き）
  cloudMat.uniforms.opacity.value = 0.96 * (1 - nightFactor(tday))
  for (const t of thunderheads) {
    const u = t.userData; u.az += dt * u.drift
    t.position.set(camera.position.x + Math.cos(u.az) * u.dist, u.baseY, camera.position.z + Math.sin(u.az) * u.dist)
  }
  // 夕立：時おり通り雨。空が陰り→雨→すぐ晴れる
  weatherTimer -= dt
  if (weatherTimer <= 0) {
    if (weatherTarget > 0.5) { weatherTarget = 0; weatherTimer = 90 + Math.random() * 120 } // 雨→晴れ（晴れは長い）
    else { weatherTarget = 1; weatherTimer = 13 + Math.random() * 14 } // 晴れ→夕立（短い通り雨）
  }
  weather += (weatherTarget - weather) * Math.min(1, dt * 0.3)
  gradePass.uniforms.rain.value = weather
  rainMesh.visible = weather > 0.03
  rainMesh.material.opacity = Math.min(1, weather * 1.5) * 0.62
  if (rainMesh.visible) {
    rainMesh.position.set(camera.position.x, camera.position.y - 6.5, camera.position.z)
    const pa = rainGeo.attributes.position, fall = 30 * dt
    for (let i = 0; i < RAINN; i++) { rainY[i] -= fall; if (rainY[i] < 0) rainY[i] += RAIN_H; pa.array[i * 6 + 1] = rainY[i] + 0.85; pa.array[i * 6 + 4] = rainY[i] }
    pa.needsUpdate = true
  }
  // 雨音：weather に合わせて音量を上げ下げ（クリックしないよう setTargetAtTime でなめらかに）。遠雷もたまに
  if (rainGain) { const tgt = THREE.MathUtils.clamp((weather - 0.04) * 0.27, 0, 0.23); rainGain.gain.setTargetAtTime(tgt, listener.context.currentTime, 0.6) }
  maybeThunder(dt)
  maybeCricket(dt) // 夜の虫の音
  // 雨上がり：本降りが引いた瞬間に しずくを少し落とす（軒や葉から）＋昼なら虹が架かる
  if (lastWeatherForDrip > 0.4 && weather < 0.28) { dripQueue = 8; if (nightFactor(tday) < 0.2) rainbowTimer = 26 }
  lastWeatherForDrip = weather
  // 虹：雨上がりにそっと現れ、ゆっくり消える。太陽の反対側の空に架かる
  if (rainbowTimer > 0) rainbowTimer -= dt
  rainbowF += ((rainbowTimer > 0 ? 1 : 0) - rainbowF) * Math.min(1, dt * 0.6)
  rainbow.visible = rainbowF > 0.01
  if (rainbow.visible) {
    rainbow.position.set(camera.position.x, -42, camera.position.z - 150) // 遠くの空に大きく架かる（カメラ追従）
    for (const arc of rainbow.children) arc.material.opacity = rainbowF * 0.6
  }
  if (dripQueue > 0) { dripTimer -= dt; if (dripTimer <= 0) { dripTimer = 0.35 + Math.random() * 1.0; playDrip(); dripQueue-- } }
  // アドバルーンが風でゆれる／床屋のサインポールが回る
  for (const b of adballoons) { b.position.y = b.userData.baseY + Math.sin(tsec * 0.7 + b.userData.ph) * 0.7; b.rotation.y = Math.sin(tsec * 0.4 + b.userData.ph) * 0.18 }
  for (const tex of barberPoles) { tex.offset.y -= dt * 0.4 }
  for (const nb of noboris) { nb.flag.rotation.y = Math.sin(tsec * 2.0 + nb.ph) * 0.22 * (0.5 + wind) } // のぼりが風になびく
  // 蚊取り線香の煙がゆらゆら昇る（複数の発生源）
  for (const sm of smokers) {
    const pa = sm.pts.geometry.attributes.position
    for (let i = 0; i < sm.n; i++) {
      let y = pa.getY(i) + dt * 0.4
      let x = pa.getX(i) + Math.sin(tsec * 1.5 + i) * dt * 0.18
      if (y > sm.y + 2.3) { y = sm.y; x = sm.x }
      pa.setX(i, x); pa.setY(i, y)
    }
    pa.needsUpdate = true
  }
  // 風鈴の短冊がそよぐ
  windchime.userData.tan.rotation.z = Math.sin(tsec * 2.2) * 0.18 * (0.4 + wind) // 風で短冊がそよぐ
  windchime.rotation.z = Math.sin(tsec * 1.7) * 0.05
  // 主人公の接地影は地面に沿わせる（跳ぶと小さくなって浮遊感を出す）
  // 接地影：太陽の反対側へ伸ばし、夕方ほど長く・薄く（朝夕の長い影で空気が出る）
  const elev = Math.max(0.16, sunDir.y) // 太陽高度（低いほど影が長い）
  const slen = THREE.MathUtils.clamp(1 / elev, 1, 2.2) // 伸ばしすぎない（核が薄れて浮くのを防ぐ）
  const jShrink = Math.min(0.5, jumpY * 0.42) // 跳ぶと影が小さく
  const sgy = heightAt(boy.position.x, boy.position.z) + 0.03
  boyShadow.position.set(boy.position.x - sunDir.x * 0.16 * slen, sgy, boy.position.z - sunDir.z * 0.16 * slen) // 足元から離しすぎない
  boyShadow.rotation.set(-Math.PI / 2, 0, Math.atan2(-sunDir.x, -sunDir.z)) // 影が伸びる向き
  boyShadow.scale.set(0.92 * (1 - jShrink), 0.92 * slen * (1 - jShrink), 1)
  boyShadowMat.opacity = THREE.MathUtils.clamp(0.18 + 0.42 * sunDir.y, 0.07, 0.6) * (1 - jShrink * 0.6)
  boyShadow.visible = boy.visible
  // 虫取り網を振る（採取時）
  if (boy.userData.swing > 0) {
    boy.userData.swing = Math.max(0, boy.userData.swing - dt * 1000)
    const sw = Math.sin((1 - boy.userData.swing / 320) * Math.PI)
    boy.userData.net.rotation.x = -0.2 - sw * 1.9
  } else boy.userData.net.rotation.x = -0.2
  // 池に近づいたら“見た”ことを記録（絵日記用）
  if (Math.hypot(boy.position.x - POND.x, boy.position.z - POND.z) < POND.r + 2) todayFlags.sawPond = true
  // 環境音：時刻でクロスフェード＋夕方に一度だけ夕焼けチャイム
  if (audioStarted) {
    const w = ambientWeights(tday)
    // 蝉しぐれ：ゆっくり寄せては返すように音量がうねる（一様でない＝本物の夏の気配）
    const cicadaSwell = (0.68 + 0.32 * (0.5 + 0.5 * Math.sin(tsec * 0.12)) + 0.06 * Math.sin(tsec * 0.5 + 1.0)) * (1 - weather * 0.75) // 夕立で蝉が静かに
    for (const id in ambients) {
      const a = ambients[id]; if (!a.buffer) continue
      let v = Math.min(1, w[id] || 0) * 0.6
      if (id === 'cicada' || id === 'higurashi') v *= cicadaSwell
      a.setVolume(Math.max(0, v))
    }
    if (tday < 0.4) chimeArmed = true
    if (chimeArmed && tday > 0.69) { chimeArmed = false; playChime() }
  }
  // 夜の演出
  const nf = nightFactor(tday)
  moon.material.opacity = nf
  moonGlow.material.opacity = nf * 0.5
  stars.material.opacity = nf
  fireflies.material.opacity = nf * (0.45 + 0.4 * (0.5 + 0.5 * Math.sin(tsec * 3)))
  fireflies.rotation.y = tsec * 0.05
  // 田舎家の窓あかり（夕方からともり、夜も灯る＝遠くの灯）
  const homeLit = THREE.MathUtils.smoothstep(tday, 0.6, 0.74)
  for (let i = 0; i < houseGlows.length; i++) houseGlows[i].material.opacity = homeLit * (0.85 + 0.08 * Math.sin(tsec * 2.4 + i * 2)) // ほのかな揺らぎ
  // 木漏れ日（昼に強く・夜は消える。ゆっくり回ってちらちら）
  const dapF = (1 - nf) * (0.55 + 0.45 * THREE.MathUtils.smoothstep(tday, 0.12, 0.4))
  for (let i = 0; i < dapples.length; i++) { const m = dapples[i]; m.material.opacity = 0.3 * dapF * (0.7 + 0.3 * Math.sin(tsec * 1.4 + i * 1.7)); m.rotation.z = tsec * 0.04 + i }
  // 屋台のお客（夕方〜夜にだけ立つ＝縁日の賑わい）。ほんのり息づく
  const yataiLit = THREE.MathUtils.smoothstep(tday, 0.56, 0.7)
  for (let i = 0; i < yataiPatrons.length; i++) { const p = yataiPatrons[i]; p.visible = yataiLit > 0.45; if (p.visible) { p.position.y = p.userData.baseY + Math.abs(Math.sin(tsec * 1.2 + i)) * 0.012; p.userData.head.rotation.y = Math.sin(tsec * 0.5 + i) * 0.25 } }
  // 提灯のあかり（夜に灯る・ゆらぐ）
  for (let i = 0; i < lanterns.length; i++) lanterns[i].material.opacity = nf * (0.8 + 0.2 * Math.sin(tsec * 3 + i))
  // 街のあかり（窓・街灯・光だまり）。ほんのり揺らいで灯る
  for (const L of townNightLights) L.m.material.opacity = nf * L.base * (0.9 + 0.1 * Math.sin(tsec * 2.2 + L.ph))
  // 花火（夜・3日目はおまつりで多め）
  if (nf > 0.4) {
    fwTimer -= dt
    if (fwTimer <= 0) { fwTimer = (day >= 3 ? 1.4 : 3.2) + Math.random() * 2.5; spawnFirework() }
  }
  for (const pts of [...fireworksGroup.children]) {
    const u = pts.userData; u.age += dt
    const pa = pts.geometry.attributes.position
    for (let i = 0; i < u.vel.length; i++) {
      const v = u.vel[i]
      pa.setXYZ(i, pa.getX(i) + v.x * dt, pa.getY(i) + v.y * dt - 2.2 * dt, pa.getZ(i) + v.z * dt)
      v.multiplyScalar(0.95)
    }
    pa.needsUpdate = true
    pts.material.opacity = Math.max(0, 1 - u.age / 2.3)
    if (u.age > 2.3) { fireworksGroup.remove(pts); pts.geometry.dispose(); pts.material.dispose() }
  }
  // 商店街の通行人：一様に行進せず、立ち止まったり向きを変えたり＝右往左往して自然に
  for (const p of pedestrians) {
    const u = p.userData.ped
    u.timer -= dt
    if (u.timer <= 0) {
      if (u.state === 'pause') { u.state = 'walk'; u.timer = 3 + Math.random() * 7 } // 歩き出す
      else { const r = Math.random()
        if (r < 0.42) { u.state = 'pause'; u.timer = 1.5 + Math.random() * 4.5 } // ふと立ち止まる
        else { if (r < 0.62) u.dir *= -1; u.timer = 3 + Math.random() * 7 } // 気まぐれに引き返す
        p.rotation.y = u.dir > 0 ? 0 : Math.PI
      }
    }
    if (u.state === 'pause') { // 立ち止まり：息づかい＋見回す、手足は下ろす
      p.position.y = heightAt(u.x, p.position.z) + Math.abs(Math.sin(tsec * 1.3 + u.ph)) * 0.012
      p.userData.legL.rotation.x *= 0.85; p.userData.legR.rotation.x *= 0.85; p.userData.armL.rotation.x *= 0.85; p.userData.armR.rotation.x *= 0.85
      p.userData.head.rotation.y = Math.sin(tsec * 0.5 + u.ph) * 0.5
    } else {
      p.position.z += u.sp * u.dir * dt
      if (p.position.z > u.z1) { u.dir = -1; p.rotation.y = Math.PI } else if (p.position.z < u.z0) { u.dir = 1; p.rotation.y = 0 }
      p.position.x = u.x; p.userData.wph += dt * 7
      p.position.y = heightAt(u.x, p.position.z) + Math.abs(Math.sin(p.userData.wph)) * 0.05
      const sw = Math.sin(p.userData.wph) * 0.5; p.userData.legL.rotation.x = sw; p.userData.legR.rotation.x = -sw
      p.userData.armL.rotation.x = -sw; p.userData.armR.rotation.x = sw
      p.userData.head.rotation.y *= 0.9
    }
  }
  // うろつく猫（家のまわりを気ままに・休む）
  {
    const u = cat.userData
    if (u.rest > 0) { u.rest -= dt * 1000 } else {
      const dx = u.tx - cat.position.x, dz = u.tz - cat.position.z; const d = Math.hypot(dx, dz)
      if (d < 0.3) {
        if (Math.random() < 0.5) u.rest = 2000 + Math.random() * 4000
        else { u.tx = HOUSE.x + (Math.random() - 0.5) * 18; u.tz = HOUSE.z + (Math.random() - 0.5) * 18 }
      } else { const s = 1.1 * dt; cat.position.x += (dx / d) * s; cat.position.z += (dz / d) * s; cat.rotation.y = Math.atan2(dx, dz); u.phase += dt * 8 }
    }
    cat.position.y = heightAt(cat.position.x, cat.position.z) + (u.rest <= 0 ? Math.abs(Math.sin(u.phase)) * 0.03 : 0)
    u.tail.rotation.z = -1.0 + Math.sin(tsec * 2.5) * 0.28 // 尻尾をゆらす
  }
  // 女の子の生活リズム（時間帯の居場所へゆっくり歩く・会話中は止まる）
  if (!dialogue) {
    const sp = villager.userData.spots[phaseOf(tday)]
    const dx = sp.x - villager.position.x, dz = sp.z - villager.position.z
    const dd = Math.hypot(dx, dz)
    const vu = villager.userData
    if (window.__poseFreeze) { villager.rotation.y = 0; vu.head.rotation.set(0, 0, 0) } // 検証用：正面で固定
    else if (dd > 0.3) {
      const step = Math.min(1.6 * dt, dd)
      villager.position.x += (dx / dd) * step
      villager.position.z += (dz / dd) * step
      vu.wph += dt * 8
      villager.position.y = heightAt(villager.position.x, villager.position.z) + Math.abs(Math.sin(vu.wph)) * 0.05
      villager.rotation.y = Math.atan2(dx, dz)
      const sw = Math.sin(vu.wph) * 0.5; vu.legL.rotation.x = sw; vu.legR.rotation.x = -sw
      vu.armL.rotation.x = -sw; vu.armR.rotation.x = sw // 歩くと腕を振る
      if (vu.kneeL) { vu.kneeL.rotation.x = 0.15 + Math.max(0, -sw) * 0.9; vu.kneeR.rotation.x = 0.15 + Math.max(0, sw) * 0.9 } // 膝で蹴り出す
      vu.wave = 0
      vu.head.rotation.y *= 0.85 // 歩く時は前を向く
    } else {
      villager.position.y = heightAt(villager.position.x, villager.position.z) + Math.abs(Math.sin(tsec * 1.3)) * 0.012 // 息づかい
      vu.legL.rotation.x *= 0.8; vu.legR.rotation.x *= 0.8
      const pd = Math.hypot(boy.position.x - villager.position.x, boy.position.z - villager.position.z)
      const near = pd < 4.5 && area === 'field'
      if (near) { // 近づくと気づいてこちらを向く
        let dd2 = Math.atan2(boy.position.x - villager.position.x, boy.position.z - villager.position.z) - villager.rotation.y
        while (dd2 > Math.PI) dd2 -= Math.PI * 2; while (dd2 < -Math.PI) dd2 += Math.PI * 2
        villager.rotation.y += dd2 * Math.min(1, dt * 4); vu.head.rotation.y *= 0.85
      } else vu.head.rotation.y = Math.sin(tsec * 0.4) * 0.45 // ゆっくり見回す
      npcArms(villager, near, dt, tsec)
    }
  }
  // 立っている街の人：息づかい＋ふだんは見回し、近づくと気づいてこちらを向く
  for (const n of [townLady, townKid]) {
    n.position.y = n.userData.baseY + Math.abs(Math.sin(tsec * 1.3 + n.position.x)) * 0.012
    const pd = Math.hypot(boy.position.x - n.position.x, boy.position.z - n.position.z)
    const near = pd < 4.5 && area === 'town'
    if (window.__poseFreeze) { n.rotation.y = 0; n.userData.head.rotation.set(0, 0, 0) } // 検証用：正面で固定
    else if (near) {
      let dd = Math.atan2(boy.position.x - n.position.x, boy.position.z - n.position.z) - n.rotation.y
      while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2
      n.rotation.y += dd * Math.min(1, dt * 4)
      n.userData.head.rotation.y *= 0.85
    } else {
      n.userData.head.rotation.y = Math.sin(tsec * 0.4 + n.position.x) * 0.45
    }
    npcArms(n, near, dt, tsec)
    // 店のおばさんの小芝居：暑い昼〜夕方、話していない時はうちわでパタパタあおぐ
    if (n.userData.fans) {
      const hot = tday > 0.34 && tday < 0.82
      if (!near && hot) {
        const f = Math.sin(tsec * 7) // あおぐリズム
        n.userData.armR.rotation.x += (-0.95 - n.userData.armR.rotation.x) * Math.min(1, dt * 5) // 手を顔の前へ
        n.userData.armR.rotation.z += (0.55 - n.userData.armR.rotation.z) * Math.min(1, dt * 5)
        n.userData.elbowR.rotation.x += ((-1.35 + f * 0.28) - n.userData.elbowR.rotation.x) * Math.min(1, dt * 12)
        n.userData.uchiwa.rotation.x = -0.5 + f * 0.35
      } else { // しまう（腕・肘・うちわを戻す）
        n.userData.elbowR.rotation.x += (-0.2 - n.userData.elbowR.rotation.x) * Math.min(1, dt * 5)
        n.userData.uchiwa.rotation.x += (-0.5 - n.userData.uchiwa.rotation.x) * Math.min(1, dt * 4)
      }
    }
    // 近所の子の小芝居：話していない時は 土管をのぞき込む（前かがみ＋うつむき）。話しかけると顔を上げる
    if (n === townKid) {
      const peeking = !near
      n.userData.head.rotation.x += ((peeking ? 0.42 : 0) - n.userData.head.rotation.x) * Math.min(1, dt * 3)
      n.rotation.x += ((peeking ? 0.18 : 0) - n.rotation.x) * Math.min(1, dt * 3) // 足元を軸に前かがみ
    }
  }
  // 蝶（昼に舞い、夜は消える）
  for (const b of butterflies) {
    const u = b.userData
    if (u.done) { b.visible = false; continue } // つかまえた蝶は出さない
    if (u.visitor) { // 立ち止まると ふわりと寄ってきて まわりを舞う＝“間”のごほうび
      if (u.cx0 === undefined) { u.cx0 = u.cx; u.cz0 = u.cz }
      const visiting = !moving && idleTime > 2.5 && area === 'field' && mode === 'walk'
      const tx = visiting ? boy.position.x : u.cx0, tz = visiting ? boy.position.z : u.cz0
      u.cx += (tx - u.cx) * Math.min(1, dt * 0.45); u.cz += (tz - u.cz) * Math.min(1, dt * 0.45)
    }
    const a = tsec * u.sp + u.ph
    const bx = u.cx + Math.cos(a) * u.r, bz = u.cz + Math.sin(a) * u.r
    b.position.set(bx, heightAt(bx, bz) + 1.6 + Math.sin(a * 3) * 0.3, bz)
    b.rotation.y = -a + Math.PI / 2
    const flap = Math.sin(tsec * 14 + u.ph) * 0.9
    u.wl.rotation.y = flap; u.wr.rotation.y = -flap
    u.mat.opacity = 1 - nf
    b.visible = nf < 0.96
  }
  // 赤とんぼ（夕方に飛ぶ）
  const eveningF = THREE.MathUtils.smoothstep(tday, 0.42, 0.58) * (1 - THREE.MathUtils.smoothstep(tday, 0.82, 0.92))
  for (const d of dragonflies) {
    const u = d.userData
    if (u.visitor) { // 立ち止まると ふわりと近づいて、肩先で小さく舞う＝夏の終わりの “間”
      if (u.cx0 === undefined) { u.cx0 = u.cx; u.cz0 = u.cz; u.rr = u.r }
      const visiting = !moving && idleTime > 2.0 && area === 'field' && mode === 'walk' && eveningF > 0.1
      const tx = visiting ? boy.position.x : u.cx0, tz = visiting ? boy.position.z : u.cz0
      u.cx += (tx - u.cx) * Math.min(1, dt * 0.5); u.cz += (tz - u.cz) * Math.min(1, dt * 0.5)
      u.rr += ((visiting ? 0.45 : u.r) - u.rr) * Math.min(1, dt * 0.6) // 近づくと旋回半径を小さく
    } else u.rr = u.r
    const a = tsec * u.sp + u.ph
    const close = u.visitor && u.rr < 1.4
    const dx = u.cx + Math.cos(a) * u.rr, dz = u.cz + Math.sin(a * 1.3) * u.rr
    d.position.set(dx, heightAt(dx, dz) + (close ? 1.45 : 1.9) + Math.sin(a * 2) * (close ? 0.1 : 0.4), dz)
    d.rotation.y = -a * 1.3 + Math.PI / 2
    u.body.opacity = eveningF; u.wing.opacity = eveningF * 0.5
    d.visible = eveningF > 0.02
  }
  // 夕方のカラス（夕焼け〜宵に かけて 空を横切る）
  const crowF = THREE.MathUtils.smoothstep(tday, 0.60, 0.72) * (1 - THREE.MathUtils.smoothstep(tday, 0.80, 0.90))
  for (const c of crows) {
    const u = c.userData
    c.visible = crowF > 0.02
    if (!c.visible) continue
    const span = ((tsec * u.sp + u.off) % 260) - 130 // -130→+130 で横切り、端でループ
    c.position.set(boy.position.x + span, u.alt + Math.sin(tsec * 0.3 + u.off) * 1.5, boy.position.z + u.lane)
    const f = Math.sin(tsec * u.flap + u.fph) * 0.7
    u.wl.rotation.z = f; u.wr.rotation.z = -f // はばたき
    u.mat.opacity = crowF
  }
  // メダカの群れ：池の中をゆるく回遊し、近づくと さっと散る
  {
    const mc = medakaC
    mc.x += Math.sin(tsec * 0.27) * dt * 0.5; mc.z += Math.cos(tsec * 0.21 + 1) * dt * 0.5 // 徘徊
    const pd = Math.hypot(boy.position.x - POND.x, boy.position.z - POND.z)
    if (area === 'field' && pd < POND.r + 3) { todayFlags.sawMedaka = true; const dx = mc.x - boy.position.x, dz = mc.z - boy.position.z, l = Math.hypot(dx, dz) || 1; mc.x += (dx / l) * dt * 4.5; mc.z += (dz / l) * dt * 4.5 } // 近づくと逃げる
    const cd = Math.hypot(mc.x - POND.x, mc.z - POND.z); if (cd > POND.r - 2.5) { const k = (POND.r - 2.5) / cd; mc.x = POND.x + (mc.x - POND.x) * k; mc.z = POND.z + (mc.z - POND.z) * k } // 池の中に収める
    for (const f of medaka) {
      f.visible = area === 'field'; if (!f.visible) continue
      const u = f.userData, a = tsec * 0.4 * u.sp + u.ph
      const tx = mc.x + u.ox + Math.cos(a) * 0.5, tz = mc.z + u.oz + Math.sin(a) * 0.5, px = f.position.x, pz = f.position.z
      f.position.x += (tx - px) * Math.min(1, dt * 2.6); f.position.z += (tz - pz) * Math.min(1, dt * 2.6)
      f.position.y = WATER_Y - 0.03 + Math.sin(tsec * 3 + u.ph) * 0.012
      if (Math.abs(f.position.x - px) + Math.abs(f.position.z - pz) > 0.0005) f.rotation.y = Math.atan2(f.position.x - px, f.position.z - pz)
    }
  }
  // カエル：じっとして時おり ぴょこっと跳ねる
  for (const f of frogs) {
    f.obj.visible = area === 'field'; if (!f.obj.visible) continue
    if (Math.hypot(boy.position.x - f.obj.position.x, boy.position.z - f.obj.position.z) < 3.5) todayFlags.sawFrog = true
    if (f.hopT > 0) {
      f.hopT -= dt
      f.obj.position.x += Math.sin(f.dir) * f.hopDist * (dt / 0.42); f.obj.position.z += Math.cos(f.dir) * f.hopDist * (dt / 0.42)
      f.obj.position.y = heightAt(f.obj.position.x, f.obj.position.z) + Math.sin(Math.max(0, 1 - f.hopT / 0.42) * Math.PI) * 0.45
      f.obj.rotation.y = f.dir
      if (f.hopT <= 0) f.obj.position.y = heightAt(f.obj.position.x, f.obj.position.z)
    } else {
      f.t -= dt
      f.obj.position.y = heightAt(f.obj.position.x, f.obj.position.z) + Math.abs(Math.sin(tsec * 2 + f.dir)) * 0.014 // 息づかい
      if (f.t <= 0) { f.t = 2.5 + Math.random() * 5; f.hopT = 0.42; f.dir = Math.random() * 6.28; f.hopDist = 0.6 + Math.random() * 0.9 }
    }
  }
  // すずめ：地面をついばみ、近づくと いっせいに飛び立つ（反応する世界）
  for (const s of sparrows) {
    const u = s.userData
    if (area !== 'field') { s.visible = false; continue }
    s.visible = true
    const pd = Math.hypot(boy.position.x - s.position.x, boy.position.z - s.position.z)
    if (u.state === 'ground') {
      s.position.y = heightAt(s.position.x, s.position.z) + 0.1 + Math.abs(Math.sin(tsec * 4 + u.ph)) * 0.04 // ついばむ上下
      s.rotation.y = Math.sin(tsec * 0.4 + u.ph) * 0.9
      u.wl.rotation.z = 0.12; u.wr.rotation.z = -0.12
      if (pd < 5.5) { u.state = 'fly'; u.t = 0; const dx = s.position.x - boy.position.x, dz = s.position.z - boy.position.z, l = Math.hypot(dx, dz) || 1; u.vx = dx / l; u.vz = dz / l }
    } else {
      u.t += dt
      s.position.x += u.vx * dt * 7; s.position.z += u.vz * dt * 7
      s.position.y += dt * Math.max(0, 3.2 - u.t * 1.5) // 上昇して水平飛行へ
      s.rotation.y = Math.atan2(u.vx, u.vz)
      const f = Math.sin(tsec * 32 + u.ph) * 0.7 + 0.2; u.wl.rotation.z = f; u.wr.rotation.z = -f // 羽ばたき
      if (u.t > 3 && pd > 10) { u.state = 'ground'; s.position.set(u.hx + (Math.random() - 0.5) * 8, heightAt(u.hx, u.hz) + 0.1, u.hz + (Math.random() - 0.5) * 8) } // 遠ざかったら別の所へ着地
    }
  }
  // 足元の砂ぼこり：舞い上がって ゆっくり落ち、消える
  for (let i = 0; i < DUSTN; i++) {
    if (dustLife[i] <= 0) continue
    dustLife[i] -= dt
    dustPos[i * 3] += dustVel[i * 3] * dt
    dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt
    dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt
    dustVel[i * 3 + 1] -= dt * 0.7 // 重力で失速
    if (dustLife[i] <= 0) dustPos[i * 3 + 1] = -9999
  }
  dustGeo.attributes.position.needsUpdate = true
  // 水やり：じょうろから水が落ち、作物がうれしそうに揺れる
  if (wateringT > 0) {
    wateringT -= dt
    if (Math.random() < 0.6) spawnWaterDrop(GARDEN.x + (Math.random() - 0.5) * 4, heightAt(GARDEN.x, GARDEN.z) + 1.3, GARDEN.z + (Math.random() - 0.5) * 3)
    boy.rotation.x += (0.25 - boy.rotation.x) * Math.min(1, dt * 6) // 前かがみ
    boy.userData.armR.rotation.x = -1.4 // 腕を前へ（じょうろ）
    for (const gc of gardenCrops) gc.obj.position.y = gc.baseY + Math.abs(Math.sin(tsec * 6 + gc.ph)) * 0.05
  }
  for (let i = 0; i < WDROPN; i++) {
    if (wdropLife[i] <= 0) continue
    wdropLife[i] -= dt; wdropVel[i * 3 + 1] -= dt * 3.5
    wdropPos[i * 3] += wdropVel[i * 3] * dt; wdropPos[i * 3 + 1] += wdropVel[i * 3 + 1] * dt; wdropPos[i * 3 + 2] += wdropVel[i * 3 + 2] * dt
    if (wdropLife[i] <= 0) wdropPos[i * 3 + 1] = -9999
  }
  wdropGeo.attributes.position.needsUpdate = true
  // 水の波紋：広がって うすれて消える
  for (const r of ripples) {
    if (r.life <= 0) continue
    r.life -= dt * 1.4
    r.m.scale.setScalar(0.25 + (1 - r.life) * 1.7)
    r.m.material.opacity = Math.max(0, r.life) * 0.5
    if (r.life <= 0) r.m.visible = false
  }
  if (lamuneCd > 0) lamuneCd -= dt
  // 木漏れ日：太陽の画面位置と強さ（昼に強く・画面内のときだけ）
  sunProj.copy(sunBall.position).project(camera)
  godrayPass.uniforms.lightPos.value.set(sunProj.x * 0.5 + 0.5, sunProj.y * 0.5 + 0.5)
  const sunOnScreen = sunProj.z < 1 && Math.abs(sunProj.x) < 1.15 && Math.abs(sunProj.y) < 1.15
  godrayPass.uniforms.strength.value = sunOnScreen ? (1 - nf) * 0.32 : 0 // 控えめ＝光条であって閃光事故にしない
  gradePass.uniforms.golden.value = THREE.MathUtils.smoothstep(tday, 0.6, 0.74) * (1 - THREE.MathUtils.smoothstep(tday, 0.82, 0.93)) // 夕方の黄金色
  godrayPass.enabled = godrayPass.uniforms.strength.value > 0.001 // 太陽が画面外/夜は丸ごとスキップ＝軽量化

  if (mode === 'walk') {
    // カメラ基準の前/右（地面上）。指のスライド方向を世界の向きへ変換。
    camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize()
    camRight.set(-camFwd.z, 0, camFwd.x)
    const kx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0)
    const kz = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0)
    let sx = 0, sy = 0
    if (puni.active && Math.hypot(puni.vx, puni.vy) > 0.06) { sx = puni.vx; sy = puni.vy }
    else if (kx || kz) { sx = kx; sy = kz }
    if (dialogue || diaryOpen || fishState !== 'idle') { sx = 0; sy = 0 } // 会話・絵日記・釣り中は歩かない
    const mag = Math.min(1, Math.hypot(sx, sy))
    // 目標速度（倒し量で“そろり〜小走り”）。慣性で滑らかに加減速。
    let tx = 0, tz = 0
    if (mag > 0.06) {
      const wx = camRight.x * sx + camFwd.x * (-sy)
      const wz = camRight.z * sx + camFwd.z * (-sy)
      const l = Math.hypot(wx, wz) || 1
      const speed = 7 * mag
      tx = (wx / l) * speed; tz = (wz / l) * speed
    }
    if (autoWalk) { tx = autoWalk.x * 4.4; tz = autoWalk.z * 4.4 } // 往来中は門の先へ自動で歩く
    // 加速はやや速く・減速はゆっくり（歩いてる身体の惰性）
    const k = (Math.abs(tx) + Math.abs(tz) > Math.abs(vel.x) + Math.abs(vel.z)) ? 6 : 3.5
    vel.x += (tx - vel.x) * Math.min(1, dt * k)
    vel.z += (tz - vel.z) * Math.min(1, dt * k)
    const speedNow = Math.hypot(vel.x, vel.z)
    moving = speedNow > 0.25
    boy.position.x += vel.x * dt
    boy.position.z += vel.z * dt
    // エリアの外（霧の何もない空間）へ迷い込まないように境界で止める
    if (area === 'field') {
      boy.position.x = THREE.MathUtils.clamp(boy.position.x, -92, 92)
      boy.position.z = THREE.MathUtils.clamp(boy.position.z, -92, 92)
      // 池には入らない：水ぎわでとまる（岸に沿って押し戻す）
      let pdx = boy.position.x - POND.x, pdz = boy.position.z - POND.z
      const pdist = Math.hypot(pdx, pdz), SHORE = POND.r - 0.6
      if (pdist < SHORE) {
        if (pdist < 0.001) { pdx = 1; pdz = 0 } // 中心ちょうどでも向きを決める
        const k = SHORE / (pdist || 1)
        boy.position.x = POND.x + pdx * k; boy.position.z = POND.z + pdz * k
        vel.x *= 0.15; vel.z *= 0.15 // 水際で勢いを止める
      }
    } else if (area === 'town') {
      boy.position.x = THREE.MathUtils.clamp(boy.position.x, TOWN.x - 100, TOWN.x + 78)
      boy.position.z = THREE.MathUtils.clamp(boy.position.z, TOWN.z - 30, TOWN.z + 96)
    } else { // 神社
      boy.position.x = THREE.MathUtils.clamp(boy.position.x, SHRINE.x - 38, SHRINE.x + 38)
      boy.position.z = THREE.MathUtils.clamp(boy.position.z, SHRINE.z - 30, SHRINE.z + 62)
    }
    // 建物・木の当たり判定：めり込んだら円の外へ押し戻す（すり抜け防止＝境界をはっきり）
    if (!autoWalk) for (const c of colliders) {
      const dx = boy.position.x - c.x, dz = boy.position.z - c.z, d = Math.hypot(dx, dz)
      if (d < c.r && d > 0.0001) { const k = c.r / d; boy.position.x = c.x + dx * k; boy.position.z = c.z + dz * k; vel.x *= 0.3; vel.z *= 0.3 }
    }
    boy.position.y = heightAt(boy.position.x, boy.position.z)
    if (speedNow > 0.05) facing = Math.atan2(vel.x, vel.z)
    phase += dt * 1.3 * speedNow // 歩調は実速度に連動
    // 向きをなめらかに
    let d = facing - boy.rotation.y
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2
    boy.rotation.y += d * Math.min(1, dt * 10)
    // 歩行/走行アニメ（速いほど大きく振り、前傾し、ぴょこぴょこ跳ねる）
    const run = THREE.MathUtils.clamp(speedNow / 7, 0, 1) // 0=そろり 1=全力
    const amp = 0.35 + run * 0.9
    const sw = Math.sin(phase) * amp
    // 足が着くたび：水の中なら「ぽちゃ」＋波紋、そうでなければ足音（走ると砂ぼこり）
    const inCreek = area === 'field' && distToCreek(boy.position.x, boy.position.z) < CREEK.half
    if (inCreek) todayFlags.wadedCreek = true
    if (moving && sw * lastStepS < 0 && jumpY <= 0.02 && !airborne) { // ジャンプ中(空中)は足音を出さない
      if (inCreek) { playPlop(); spawnRipple(boy.position.x, boy.position.z); spawnRipple(boy.position.x + (Math.random() - 0.5) * 0.8, boy.position.z + (Math.random() - 0.5) * 0.8) }
      else { playStep(0.04 + run * 0.06, area === 'town'); if (run > 0.4) spawnDust(boy.position.x, boy.position.y + 0.05, boy.position.z) }
    }
    lastStepS = sw
    boy.userData.legL.rotation.x = sw; boy.userData.legR.rotation.x = -sw
    // 腕：歩くと振る／止まると凍りつかず、そっと息づくように下ろす
    const armTL = moving ? (-sw - run * 0.25) : Math.sin(tsec * 1.3) * 0.05
    const armTR = moving ? (sw - run * 0.25) : Math.sin(tsec * 1.3 + 0.6) * 0.05
    boy.userData.armL.rotation.x += (armTL - boy.userData.armL.rotation.x) * Math.min(1, dt * (moving ? 20 : 6))
    boy.userData.armR.rotation.x += (armTR - boy.userData.armR.rotation.x) * Math.min(1, dt * (moving ? 20 : 6))
    // 膝・肘の曲げ＝関節のある歩行（足が前に振り出される側の膝が曲がる／肘は軽く曲げて自然に）
    const kAmp = 0.5 + run * 0.8
    const kbL = 0.12 + (moving ? Math.max(0, -sw) * kAmp : 0)
    const kbR = 0.12 + (moving ? Math.max(0, sw) * kAmp : 0)
    boy.userData.kneeL.rotation.x += (kbL - boy.userData.kneeL.rotation.x) * Math.min(1, dt * 13)
    boy.userData.kneeR.rotation.x += (kbR - boy.userData.kneeR.rotation.x) * Math.min(1, dt * 13)
    // 足首：腿＋膝の傾きを打ち消して足裏を地面と平行に保つ（接地感・スケート歩き解消）
    const akL = THREE.MathUtils.clamp(-(boy.userData.legL.rotation.x + boy.userData.kneeL.rotation.x) * 0.85, -0.7, 0.5)
    const akR = THREE.MathUtils.clamp(-(boy.userData.legR.rotation.x + boy.userData.kneeR.rotation.x) * 0.85, -0.7, 0.5)
    boy.userData.ankleL.rotation.x += (akL - boy.userData.ankleL.rotation.x) * Math.min(1, dt * 14)
    boy.userData.ankleR.rotation.x += (akR - boy.userData.ankleR.rotation.x) * Math.min(1, dt * 14)
    const eb = -(0.28 + run * 0.35) // 肘は前へ軽く曲げる
    boy.userData.elbowL.rotation.x += (eb - boy.userData.elbowL.rotation.x) * Math.min(1, dt * 10)
    boy.userData.elbowR.rotation.x += (eb - boy.userData.elbowR.rotation.x) * Math.min(1, dt * 10)
    boy.rotation.x += ((moving ? run * 0.28 : 0) - boy.rotation.x) * Math.min(1, dt * 8) // 走ると前傾

    // “間”：立ち止まると idleTime が伸び、少し空を見上げ、カメラが引いて構図化
    idleTime = moving ? 0 : idleTime + dt
    const calm = THREE.MathUtils.clamp((idleTime - 1.2) / 3, 0, 1) // 1.2秒後から3秒かけて
    lookUp += ((moving ? 0 : calm * 0.18) - lookUp) * Math.min(1, dt * 2)
    boy.userData.head.rotation.x = -lookUp * 1.6 + (moving ? Math.sin(phase * 2) * 0.03 : 0) // 見上げる＋歩くと小さくうなずく
    // 立ち止まると あたりを見回す。歩くと踏み込んだ足の方へ重心が傾く（ローリング）＝人らしい歩き
    const idleLook = moving ? 0 : calm
    boy.userData.head.rotation.y += ((Math.sin(tsec * 0.34) * 0.45 + Math.sin(tsec * 0.13) * 0.2) * idleLook - boy.userData.head.rotation.y) * Math.min(1, dt * 3)
    const targetRoll = moving ? Math.sin(phase) * (0.05 + run * 0.06) : Math.sin(tsec * 0.5) * 0.02 * idleLook
    boy.rotation.z += (targetRoll - boy.rotation.z) * Math.min(1, dt * 9)
    boy.userData.head.rotation.z = -boy.rotation.z * 0.55 // 頭は体ほど傾けず視線を水平に保つ（自然）
    boy.position.y += moving ? Math.abs(Math.sin(phase)) * (0.05 + run * 0.22) : Math.sin(tsec * 1.4) * 0.012 // ぴょこぴょこ跳ねる/立つ呼吸
    // ジャンプ：上下速度を重力で更新し、地面からの高さを足す（着地でリセット）
    if (jumpV !== 0 || jumpY > 0) {
      jumpV -= 22 * dt; jumpY += jumpV * dt
      if (jumpY <= 0) { jumpY = 0; jumpV = 0; if (airborne) { airborne = false; landSquash = 1 } } // 着地＝つぶれ開始
      boy.position.y += jumpY
      boy.rotation.x += (-0.12 * Math.min(1, jumpY) - boy.rotation.x) * Math.min(1, dt * 8) // 跳ぶと少しのけぞる
      boy.userData.legL.rotation.x = -0.5; boy.userData.legR.rotation.x = -0.3 // 足をたたむ
      boy.userData.kneeL.rotation.x = 0.7; boy.userData.kneeR.rotation.x = 0.5 // 膝をたたんで跳ぶ
    }
    // 伸び縮み（ジュース）：上昇でひゅっと伸び、着地でぽてっとつぶれる
    landSquash = Math.max(0, landSquash - dt * 5.5)
    let scaleY = 1, scaleXZ = 1
    if (jumpY > 0.04) { const st = (jumpV > 0 ? 0.12 : 0.05); scaleY = 1 + st; scaleXZ = 1 - st * 0.55 } // 上昇=伸び
    if (landSquash > 0) { scaleY = 1 - landSquash * 0.2; scaleXZ = 1 + landSquash * 0.14 } // 着地=つぶれ
    boy.scale.set(BOY_SCALE * scaleXZ, BOY_SCALE * scaleY, BOY_SCALE * scaleXZ)

    const nearBench = area === 'field' && Math.hypot(boy.position.x - SEAT.x, boy.position.z - SEAT.z) < 3.2
    const nearEngawa = area === 'field' && Math.hypot(boy.position.x - ENGAWA.x, boy.position.z - ENGAWA.z) < 3.0
    const nearMtSeat = area === 'town' && Math.hypot(boy.position.x - MOUNT_SEAT.x, boy.position.z - MOUNT_SEAT.z) < 3.4
    const nearSwing = area === 'town' && Math.hypot(boy.position.x - SWING.x, boy.position.z - (SWING.z - 2.4)) < 2.8
    // いちばん近い人を話し相手に
    talkTarget = null; let nd = 3
    for (const n of npcs) { const d = Math.hypot(boy.position.x - n.position.x, boy.position.z - n.position.z); if (d < nd) { nd = d; talkTarget = n } }
    const nearCat = area === 'field' && Math.hypot(boy.position.x - cat.position.x, boy.position.z - cat.position.z) < 2.2
    const nearVending = area === 'town' && Math.hypot(boy.position.x - VENDING.x, boy.position.z - VENDING.z) < 2.8
    const nearGarden = area === 'field' && Math.hypot(boy.position.x - GARDEN.x, boy.position.z - GARDEN.z) < 3.6
    const nearNpc = !!talkTarget
    if (talkTarget && !dialogue) { npcEl.textContent = 'はなしかける'; npcEl.dataset.act = 'talk'; npcEl.style.display = 'block' }
    else if (nearCat && !dialogue) { npcEl.textContent = 'なでる'; npcEl.dataset.act = 'pet'; npcEl.style.display = 'block' }
    else if (nearVending && !dialogue) { npcEl.textContent = 'ラムネを買う'; npcEl.dataset.act = 'buy'; npcEl.style.display = 'block' }
    else if (nearGarden && !dialogue) { npcEl.textContent = '水をやる'; npcEl.dataset.act = 'water'; npcEl.style.display = 'block' }
    else npcEl.style.display = 'none'
    if (!nearNpc && !dialogue && nearEngawa) { actBtn.textContent = '縁側にすわる'; actBtn.dataset.spot = 'engawa'; actBtn.style.display = 'block' }
    else if (!nearNpc && !dialogue && nearBench) { actBtn.textContent = 'すわる'; actBtn.dataset.spot = 'bench'; actBtn.style.display = 'block' }
    else if (!nearNpc && !dialogue && nearMtSeat) { actBtn.textContent = '街を ながめる'; actBtn.dataset.spot = 'mtview'; actBtn.style.display = 'block' }
    else if (!nearNpc && !dialogue && nearSwing) { actBtn.textContent = 'ブランコに のる'; actBtn.dataset.spot = 'swing'; actBtn.style.display = 'block' }
    else actBtn.style.display = 'none'
    lieBtn.style.display = dialogue ? 'none' : 'block'
    // 門に近づくと往来ボタン（今いるエリアの最寄りの門を選ぶ）
    activeGate = null; let gateD = 7
    for (const gt of GATES) { if (gt.area !== area) continue; const d = Math.hypot(boy.position.x - gt.x, boy.position.z - gt.z); if (d < gateD) { gateD = d; activeGate = gt } }
    if (!dialogue && activeGate) { goEl.textContent = activeGate.label; goEl.style.display = 'block'; goEl.classList.toggle('near', gateD < 3.2) }
    else { goEl.style.display = 'none'; goEl.classList.remove('near') }
    // いちばん近い虫を「つかまえる」対象に（野原のみ）
    catchTarget = null
    if (area === 'field') { let cd = 3.2; for (const c of catchables) { if (c.done) continue; const p = c.obj.position; const dd2 = Math.hypot(boy.position.x - p.x, boy.position.z - p.z); if (dd2 < cd) { cd = dd2; catchTarget = c } } }
    catchEl.style.display = (catchTarget && !dialogue) ? 'block' : 'none'
    if (catchTarget) npcEl.style.display = 'none'
    // 池のそばで「つる」（釣り中は出したまま）
    const nearPond = area === 'field' && Math.hypot(boy.position.x - POND.x, boy.position.z - POND.z) < POND.r + 3
    fishEl.style.display = ((nearPond || fishState !== 'idle') && !dialogue && !catchTarget) ? 'block' : 'none'
    if (fishState === 'bite') floatMesh.position.y = WATER_Y + 0.15 + Math.sin(tsec * 30) * 0.08

    // マリオ64/サンシャイン式の追従：歩くとカメラが進行方向の真後ろへゆっくり回り込む。
    // 指で視点を回した直後(camManualTimer)は自動追従を止めて手動を優先する。
    if (camManualTimer > 0) camManualTimer -= dt
    else if (moving && speedNow > 0.8) {
      let dyaw = (facing + Math.PI) - camCtl.yaw
      while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2
      camCtl.yaw += dyaw * Math.min(1, dt * 1.0) // ゆっくり（ラグ感＝レイクツーカメラ風）
    }
    // カメラ：今の視点で追従。立ち止まるとゆっくり引いて画角を少し締める＝一枚絵に。
    camCtl.dist += (camDistTarget * (1 + calm * 0.18) - camCtl.dist) * Math.min(1, dt * 1.2)
    camera.fov += ((BASE_FOV - calm * 4) - camera.fov) * Math.min(1, dt * 1.5)
    camera.updateProjectionMatrix()
    camGoal.copy(boy.position).add(camOffset(tmp))
    // ごく微かな“息”の揺れ（モーション軽減ONのときは止める）
    if (!reduceMotion) { camGoal.x += Math.sin(tsec * 0.6) * 0.06; camGoal.y += Math.sin(tsec * 0.8 + 1) * 0.05 }
    // カメラの遮蔽回避（マリオ式）：主人公とカメラの間に建物/木があれば手前へ寄せる
    {
      const hx = boy.position.x, hyc = boy.position.y + 1.3, hz = boy.position.z
      let ct = 1
      for (let s = 0.25; s <= 0.95; s += 0.1) {
        const px = hx + (camGoal.x - hx) * s, pz = hz + (camGoal.z - hz) * s
        let blocked = false
        for (const c of colliders) { const rr = c.r + 0.7; if ((px - c.x) ** 2 + (pz - c.z) ** 2 < rr * rr) { blocked = true; break } }
        if (blocked) { ct = Math.max(0.22, s - 0.1); break }
      }
      if (ct < 1) { camGoal.x = hx + (camGoal.x - hx) * ct; camGoal.z = hz + (camGoal.z - hz) * ct; camGoal.y = hyc + (camGoal.y - hyc) * ct }
    }
    lookGoal.copy(boy.position); lookGoal.y += 1.4 + calm * 0.5
  } else if (mode === 'lying') {
    // 「よいしょ」と その場に “必ず仰向け” で横になる所作（約1.05秒）。固定アングルでお腹が上を向くのを見せる
    lieT += dt
    const p = Math.min(1, lieT / 1.05), e = p * p * (3 - 2 * p)
    const gy = heightAt(boy.position.x, boy.position.z)
    boy.rotation.x = -1.42 * e; boy.rotation.z = 0 // 立つ→あおむけ（負の傾き＝必ず顔が上）
    boy.position.y = gy + 0.25 * e + Math.sin(p * Math.PI) * 0.05 // よいしょ（一度すこし腰を落として）
    const kb = Math.sin(p * Math.PI) * 0.9
    boy.userData.kneeL.rotation.x = kb; boy.userData.kneeR.rotation.x = kb
    boy.userData.armR.rotation.x = -Math.sin(p * Math.PI) * 0.7; boy.userData.armL.rotation.x = -Math.sin(p * Math.PI) * 0.45 // 手を後ろについて倒れる
    boy.userData.head.rotation.x = 0.5 * e // 頭を後ろへあずける（仰向けらしさ）
    camGoal.set(boy.position.x + 2.3, gy + 1.7, boy.position.z + 2.3) // 固定の3/4ハイアングル＝仰向けが必ず分かる
    lookGoal.set(boy.position.x, gy + 0.45, boy.position.z)
    if (lieT >= 1.05) enterLieView()
  } else if (mode === 'lie') {
    // 寝ころんで空を見る：目線は地面すぐ上、上を向く
    seatEye.set(boy.position.x, heightAt(boy.position.x, boy.position.z) + 0.55, boy.position.z)
    const cp = Math.cos(seatLook.pitch)
    lookTo.set(seatEye.x + Math.sin(seatLook.yaw) * cp, seatEye.y + Math.sin(seatLook.pitch), seatEye.z + Math.cos(seatLook.yaw) * cp)
    camGoal.copy(seatEye); lookGoal.copy(lookTo)
    actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  } else if (mode === 'swing') {
    // ブランコ：振り子運動。乗り手の頭の位置から前方を見る＝ブランコ視点（上下にあおられる）
    swingPhase += dt * 2.05
    swingAmp = Math.max(0.18, swingAmp - dt * 0.045) // 自然に小さくなる（タップでこぐと大きくなる）
    const th = swingAmp * Math.sin(swingPhase)
    if (swingSeat) swingSeat.rotation.x = th
    const gy = heightAt(SWING.x, SWING.z), L = SWING.L
    const seatY = gy + SWING.py - Math.cos(th) * L, seatZ = SWING.z - Math.sin(th) * L
    const eyeY = seatY + Math.cos(th) * 1.05, eyeZ = seatZ + Math.sin(th) * 1.05 // 座面から吊り元方向へ＝頭
    const fY = Math.sin(th), fZ = -Math.cos(th) // 進行接線（θ=0で-z水平、上下にあおられる）
    camGoal.set(SWING.x, eyeY, eyeZ)
    lookGoal.set(SWING.x, eyeY + fY * 4, eyeZ + fZ * 4)
    camera.fov += (54 - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix() // 少し広角で疾走感
    actBtn.textContent = 'おりる'; actBtn.dataset.spot = 'offswing'; actBtn.style.display = 'block'
    lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  } else {
    // 座って360度見回す（高台のベンチ or 縁側。目線は座る位置）
    seatEye.copy(curSitEye)
    const cp = Math.cos(seatLook.pitch)
    lookTo.set(
      seatEye.x + Math.sin(seatLook.yaw) * cp,
      seatEye.y + Math.sin(seatLook.pitch),
      seatEye.z + Math.cos(seatLook.yaw) * cp,
    )
    camGoal.copy(seatEye)
    lookGoal.copy(lookTo)
    actBtn.style.display = 'none'; lieBtn.style.display = 'none'; npcEl.style.display = 'none'; goEl.style.display = 'none'; catchEl.style.display = 'none'; fishEl.style.display = 'none'
  }
  updateBillboard() // 主人公の絵を追従＋生きた揺れ
  if (window.__freezeCam) return // 検証用：カメラ固定（顔の確認など）
  // カメラを目標へなめらかに寄せる（ブランコは追従を速く＝ぶれない視点）
  camera.position.lerp(camGoal, Math.min(1, dt * (mode === 'swing' ? 13 : mode !== 'walk' ? 6 : 5)))
  // 注視点もなめらかに
  camera.userData._look = camera.userData._look || new THREE.Vector3().copy(lookGoal)
  camera.userData._look.lerp(lookGoal, Math.min(1, dt * (mode === 'swing' ? 13 : 6)))
  camera.lookAt(camera.userData._look)
}

// 30fps上限（スマホの発熱対策）。requestAnimationFrameは60で来るが、描画は約30回/秒に間引く。
let frameAcc = 0
renderer.setAnimationLoop(() => {
  frameAcc += Math.min(clock.getDelta(), 0.1)
  if (frameAcc < 1 / 30) return
  const dt = Math.min(frameAcc, 0.05); frameAcc = 0
  update(dt)
  composer.render()
})

// 写真モード（平成レトロ画質）を起動。既存には触れず、上に乗せるだけ。
const photoMode = initPhotoMode({ renderer, getDay: () => day, playShutter })
window.__photo = photoMode // 検証用

// 横画面のおすすめ（縦持ちのスマホにだけ、やさしく一度。閉じれる/数秒で消える）
const rotateEl = document.getElementById('rotate')
function fadeRotate() {
  if (!rotateEl) return
  setTimeout(() => { rotateEl.style.opacity = '0' }, 4500)
}
fadeRotate()
// 可能なら横向きに固定（Android等。iOSは無視されるが害なし）
addEventListener('pointerdown', function lockOnce() {
  removeEventListener('pointerdown', lockOnce)
  try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}) } catch (e) {}
}, { once: true })

// タイトル画面：「はじめる」で消えて、音を立ち上げる（iOSの自動再生制限への先回り）
const titleEl = document.getElementById('title')
const startBtn = document.getElementById('t-start')
// 初回だけ「あそびかた」を出す（操作の入口をやさしく）。2回目以降は出さない。
const guideEl = document.getElementById('guide')
const guideOk = document.getElementById('guide-ok')
let seenGuide = false; try { seenGuide = localStorage.getItem('hn3d_guide') === '1' } catch (e) {}
if (guideOk) guideOk.addEventListener('click', () => { if (guideEl) guideEl.classList.remove('on'); try { localStorage.setItem('hn3d_guide', '1') } catch (e) {} })
if (startBtn) startBtn.addEventListener('click', () => {
  startAudio(); if (titleEl) titleEl.classList.add('hidden')
  if (!seenGuide && guideEl) { guideEl.classList.add('on'); seenGuide = true }
})

// ── せってい（おと・モーション軽減）。localStorage に永続化 ──
const settingsEl = document.getElementById('settings')
const setBtn = document.getElementById('set-btn')
const setSoundBtn = document.getElementById('set-sound')
const setMotionBtn = document.getElementById('set-motion')
const settings = { sound: true, motion: false }
try { Object.assign(settings, JSON.parse(localStorage.getItem('hn3d_settings') || '{}')) } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('hn3d_settings', JSON.stringify(settings)) } catch (e) {} }
function applySound() {
  if (setSoundBtn) { setSoundBtn.textContent = settings.sound ? 'ON' : 'OFF'; setSoundBtn.classList.toggle('on', settings.sound) }
  try { const ctx = listener.context; if (settings.sound) { if (audioStarted) ctx.resume() } else ctx.suspend() } catch (e) {}
}
function applyMotion() { reduceMotion = settings.motion; if (setMotionBtn) { setMotionBtn.textContent = settings.motion ? 'ON' : 'OFF'; setMotionBtn.classList.toggle('on', settings.motion) } }
window.__applySound = applySound // startAudio から呼べるように
if (setBtn) setBtn.addEventListener('click', () => settingsEl && settingsEl.classList.add('on'))
const setCloseEl = document.getElementById('set-close')
if (setCloseEl) setCloseEl.addEventListener('click', () => settingsEl && settingsEl.classList.remove('on'))
if (setSoundBtn) setSoundBtn.addEventListener('click', () => { settings.sound = !settings.sound; saveSettings(); applySound() })
if (setMotionBtn) setMotionBtn.addEventListener('click', () => { settings.motion = !settings.motion; saveSettings(); applyMotion() })
applyMotion(); applySound()

// 自己検証用の最小ハンドル
window.__proto3d = {
  THREE, scene, camera, boy, get mode() { return mode }, sitDown, standUp, lieDown,
  setDay(t) { dayAuto = false; tday = t; setTimeOfDay(t) }, // 検証用に時刻固定
  startAudio,
  placeBoy(x, z) { standUp(); boy.position.set(x, heightAt(x, z), z) }, // 検証用
  rideSwing() { rideSwing() }, // 検証用
  get modeNow() { return mode }, // 検証用
  talk() { startDialogue() }, // 検証用
  openDiary() { openDiary() }, // 検証用
  get day() { return day },
  setGameDay(d) { day = d; refreshBadge() }, // 検証用
  spawnFirework() { spawnFirework() }, // 検証用
  goArea(a) { // 検証用：エリアへ瞬間移動
    area = a
    if (a === 'town') { boy.position.set(TOWN.x - 2, 0, TOWN.z); facing = 0 }
    else if (a === 'shrine') { boy.position.set(SHRINE.x, 0, SHRINE.z - 18); facing = 0 }
    else { boy.position.set(GATE_FIELD.x, 0, GATE_FIELD.z - 3.5); facing = Math.PI }
    boy.position.y = heightAt(boy.position.x, boy.position.z); boy.rotation.y = facing
    camera.position.copy(boy.position).add(camOffset(new THREE.Vector3()))
    if (camera.userData._look) camera.userData._look.set(boy.position.x, boy.position.y + 1.4, boy.position.z)
  },
  get area() { return area },
  doCatch() { doCatch() }, // 検証用
  get caught() { return caught.count },
  villager, townLady, townKid, cat, // 検証用
  _wc(v) { gradePass.uniforms.wc.value = v }, // 検証用：水彩の効き 0=切 1=入
  _jump() { doJump() }, // 検証用
  _info() { // 検証用：シーン1回描画の実コスト
    renderer.info.autoReset = false; renderer.info.reset()
    renderer.render(scene, camera)
    const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }
    renderer.info.autoReset = true
    return r
  },
  _weather(v) { weather = v; weatherTarget = v; weatherTimer = 999 }, // 検証用：夕立 0=晴 1=雨
  get _rainVol() { return rainGain ? rainGain.gain.value : -1 }, // 検証用：雨音の音量
  get _rainStarted() { return rainStarted },
  _sceneStats() { renderer.render(scene, camera); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles } }, // 検証用：シーンのドローコール/三角形
  get _camYaw() { return camCtl.yaw }, get _facing() { return facing }, // 検証用：カメラ追従
  aimSun(t) { // 検証用：太陽の方を向いて座る（木漏れ日の確認）
    if (t !== undefined) { dayAuto = false; tday = t; setTimeOfDay(t) }
    sitDown()
    const eye = new THREE.Vector3(SEAT.x, SEAT.y + 2.3, SEAT.z - 0.9)
    const dir = sunBall.position.clone().sub(eye)
    seatLook.yaw = Math.atan2(dir.x, dir.z)
    seatLook.pitch = Math.asin(THREE.MathUtils.clamp(dir.y / dir.length(), -1, 1))
  },
  audioState() {
    const playing = Object.keys(ambients).filter((id) => ambients[id].isPlaying)
    return { started: audioStarted, ctx: listener.context.state, loaded: Object.keys(ambients).length, playing }
  },
  aimSky(t) { // 検証用：ベンチに座って空を見上げる（夕方のカラスを見る視点）
    if (t !== undefined) { dayAuto = false; tday = t; setTimeOfDay(t) }
    sitDown()
    const eye = new THREE.Vector3(SEAT.x, SEAT.y + 2.3, SEAT.z - 0.9)
    let best = null, bd = 1e9
    for (const c of crows) { const d = c.position.distanceTo(eye); if (c.visible && d < bd) { bd = d; best = c } }
    const dir = (best ? best.position.clone() : new THREE.Vector3(SEAT.x, SEAT.y + 25, SEAT.z - 60)).sub(eye)
    seatLook.yaw = Math.atan2(dir.x, dir.z)
    seatLook.pitch = Math.asin(THREE.MathUtils.clamp(dir.y / dir.length(), -1, 1))
  },
  crowsVisible() { // 検証用：画面内に見えているカラスの数
    const v = new THREE.Vector3(); let n = 0
    for (const c of crows) {
      if (!c.visible) continue
      v.copy(c.position).project(camera)
      if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) n++
    }
    return n
  },
}
