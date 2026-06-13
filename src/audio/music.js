// オリジナルの控えめな音楽（既存曲は一切使わない・完全自作）。
// Web Audio で、やさしい音色のペンタトニック旋律をゆっくり奏でる。
// 環境音を主役にしたいので、音量は薄め・音数は少なめ。
//
// 時間帯ごとに「調・テンポ・音数・高さ」を変えて、朝はさわやか、夜は静かに。

// ペンタトニック（半音オフセット）。素朴で郷愁のある響きで、特定の曲に寄らない。
const PENTA = [0, 2, 4, 7, 9]

const PRESETS = {
  morning: { root: 64, beat: 0.62, density: 0.55, octave: 0 },
  noon: { root: 62, beat: 0.7, density: 0.5, octave: 0 },
  evening: { root: 57, beat: 0.86, density: 0.46, octave: 0 },
  night: { root: 53, beat: 1.05, density: 0.34, octave: 0 },
  diary: { root: 55, beat: 1.0, density: 0.4, octave: 0 },
  title: { root: 60, beat: 0.72, density: 0.5, octave: 0 },
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export function createMusic(ctx, destination) {
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.connect(destination)

  let running = false
  let timer = null
  let nextTime = 0
  let beatCount = 0
  let degree = 0
  let params = { ...PRESETS.morning }
  const NOTE_VOL = 0.09 // 控えめ

  // 1音を鳴らす（やわらかい音色：三角波＋オクターブ上のサイン、ゆるい減衰）
  function note(midi, time, dur, vol) {
    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.value = midiToFreq(midi)
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = midiToFreq(midi + 12)
    o2.detune.value = 5
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(vol, time + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur)
    o1.connect(g)
    o2.connect(g)
    g.connect(gain)
    o1.start(time)
    o2.start(time)
    o1.stop(time + dur + 0.05)
    o2.stop(time + dur + 0.05)
  }

  function scheduler() {
    const ahead = 0.35
    let guard = 0
    while (nextTime < ctx.currentTime + ahead && guard++ < 32) {
      // メロディ：ペンタトニックをゆっくりさまよう（休符あり）
      if (Math.random() < params.density) {
        degree += (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.7 ? 1 : 2)
        degree = ((degree % PENTA.length) + PENTA.length) % PENTA.length
        const oct = Math.random() < 0.18 ? 12 : 0
        const midi = params.root + PENTA[degree] + params.octave * 12 + oct
        note(midi, nextTime, params.beat * 1.7, NOTE_VOL)
      }
      // ときどき低い根音をそっと（土台のあたたかみ）
      if (beatCount % 4 === 0 && Math.random() < 0.5) {
        note(params.root - 12, nextTime, params.beat * 3, NOTE_VOL * 0.6)
      }
      beatCount++
      nextTime += params.beat
    }
  }

  return {
    start() {
      if (running) return
      running = true
      nextTime = ctx.currentTime + 0.15
      gain.gain.cancelScheduledValues(ctx.currentTime)
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 3)
      timer = setInterval(scheduler, 60)
    },
    setPhase(key) {
      if (PRESETS[key]) params = { ...PRESETS[key] }
    },
    stop() {
      running = false
      if (timer) clearInterval(timer)
    },
  }
}
