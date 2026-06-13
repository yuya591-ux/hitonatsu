// 場面の管理役。今いる場面を持ち、登録された場面を切り替える。
// P1 では縁側だけを登録。P2 で他の場面と「移動」を足していく。

export function createSceneManager() {
  const scenes = new Map()
  let currentId = null

  return {
    // 場面を登録する
    register(scene) {
      scenes.set(scene.id, scene)
      if (currentId === null) currentId = scene.id
    },
    get current() {
      return scenes.get(currentId)
    },
    get currentId() {
      return currentId
    },
    // 場面を切り替える（存在しないIDは無視）
    goto(id) {
      if (scenes.has(id)) currentId = id
    },
    // 現在の場面を、奥のレイヤーから手前へ順に描く
    draw(ctx, view, frame) {
      const scene = scenes.get(currentId)
      if (!scene) return
      for (const layer of scene.layers) {
        layer.draw(ctx, view, frame)
      }
    },
  }
}
