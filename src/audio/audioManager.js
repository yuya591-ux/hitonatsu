// 環境音の管理役。各音をループ再生し、アクティブな音だけを音量クロスフェードで鳴らす。
// ・最初のユーザー操作（「はじめる」）の後に立ち上げる（ブラウザの自動再生制限に先回り）
// ・音が使えない環境・素材が無い場合は黙って無音（エラーにしない）
// ・音量／ミュートに対応

export function createAudioManager(soundUrls) {
  const ids = Object.keys(soundUrls)
  let ctx = null
  let master = null
  let started = false
  let muted = false
  let volume = 0.8
  const layers = {} // 音ID -> { gain, target, current }

  function applyMaster() {
    if (master) master.gain.value = muted ? 0 : volume
  }

  async function start() {
    if (started) return
    started = true
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      ctx = new AC()
      master = ctx.createGain()
      applyMaster()
      master.connect(ctx.destination)

      // 再生の開始(resume)は待たない。音の読み込み(decode)は再生状態に依存しないので先に進める。
      // 実際の発音はユーザー操作後に resume されたタイミングで始まる（iOS等の自動再生制限に準拠）。
      ctx.resume().catch(() => {})

      // 各音を読み込み、gain=0 でループ再生を開始しておく（あとは音量で出し入れする）
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(soundUrls[id])
            const buf = await ctx.decodeAudioData(await res.arrayBuffer())
            const gain = ctx.createGain()
            gain.gain.value = 0
            gain.connect(master)
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.loop = true
            src.connect(gain)
            src.start()
            layers[id] = { gain, target: 0, current: 0 }
          } catch {
            // この音は読み込めなかった（無音のまま継続）
          }
        }),
      )
    } catch {
      // 音が使えない環境では黙って無音
    }
  }

  // アクティブにする音IDを指定（指定外は徐々に消える）
  function setActive(activeIds) {
    for (const id in layers) {
      layers[id].target = activeIds.includes(id) ? 1 : 0
    }
  }

  // 毎フレーム、各音の音量を目標へなめらかに近づける（クロスフェード）
  function update(dt) {
    const k = Math.min(1, dt / 1500) // 約1.5秒でなじむ
    for (const id in layers) {
      const L = layers[id]
      L.current += (L.target - L.current) * k
      L.gain.gain.value = L.current
    }
  }

  return {
    start,
    setActive,
    update,
    get started() {
      return started
    },
    // 読み込めた音の数（自己検証用）
    get loadedCount() {
      return Object.keys(layers).length
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v))
      applyMaster()
    },
    get volume() {
      return volume
    },
    toggleMute() {
      muted = !muted
      applyMaster()
      return muted
    },
    get muted() {
      return muted
    },
  }
}
