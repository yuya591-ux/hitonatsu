// 場面の管理役。今いる場面を持ち、隣の場面へ移動する。
// 移動はパッと切り替えず、短い crossfade（重ね消し）で夏の「間」を保つ。

const FADE_MS = 600 // 場面が切り替わる時間

export function createSceneManager() {
  const scenes = new Map()
  let currentId = null
  let nextId = null // 遷移先（遷移中だけ入る）
  let fade = 0 // 0..1 の遷移進み具合
  let onChange = null // 場面が確定したときに呼ぶ（場所名の表示更新など）

  function drawScene(ctx, view, frame, scene) {
    if (!scene) return
    for (const layer of scene.layers) {
      layer.draw(ctx, view, frame)
    }
  }

  // なめらかな出入り
  function ease(t) {
    return t * t * (3 - 2 * t)
  }

  return {
    register(scene) {
      scenes.set(scene.id, scene)
      if (currentId === null) {
        currentId = scene.id
      }
    },
    setStart(id) {
      if (scenes.has(id)) currentId = id
    },
    onChange(fn) {
      onChange = fn
    },
    get current() {
      return scenes.get(currentId)
    },
    get currentId() {
      return currentId
    },
    get isMoving() {
      return nextId !== null
    },
    // 今の場面から見た方向(left/right/up/down)に隣があるか
    neighbor(dir) {
      const scene = scenes.get(currentId)
      const id = scene && scene.neighbors ? scene.neighbors[dir] : null
      return id && scenes.has(id) ? id : null
    },
    // 指定方向へ移動を始める（遷移中や隣が無いときは何もしない）
    move(dir) {
      if (nextId) return
      const id = this.neighbor(dir)
      if (id) {
        nextId = id
        fade = 0
      }
    },
    // IDを直接指定して移動
    goto(id) {
      if (nextId || id === currentId || !scenes.has(id)) return
      nextId = id
      fade = 0
    },
    update(dt) {
      if (!nextId) return
      fade += dt / FADE_MS
      if (fade >= 1) {
        currentId = nextId
        nextId = null
        fade = 0
        if (onChange) onChange(scenes.get(currentId))
      }
    },
    draw(ctx, view, frame) {
      // 現在の場面
      drawScene(ctx, view, frame, scenes.get(currentId))
      // 遷移中は、次の場面を徐々に重ねて消し込む
      if (nextId) {
        ctx.globalAlpha = ease(fade)
        drawScene(ctx, view, frame, scenes.get(nextId))
        ctx.globalAlpha = 1
      }
    },
  }
}
