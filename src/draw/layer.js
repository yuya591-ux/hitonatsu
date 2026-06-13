// 描画部品（レイヤー）の共通の窓口。
// CLAUDE.md の「後から画像ファイルに差し替えられる構造」を、口約束ではなくコードで保証する。
//
// ・最初は drawCode（図形・グラデで描くコード版）だけで完成させる。
// ・将来 image に画像パス（例: assets/scenes/engawa/ground.png）を渡し、
//   その画像が読み込めたら自動で「画像を貼る版」に切り替わる。
//   → 絵を描き直すのではなく「差し替えるだけ」で格上げできる。

export function createLayer({ id, drawCode, image = null }) {
  let img = null
  let ready = false

  if (image) {
    img = new Image()
    img.onload = () => {
      ready = true
    }
    img.onerror = () => {
      // 画像が無い／読めないときはコード描画版にフォールバック（黙って継続）
      ready = false
    }
    img.src = image
  }

  return {
    id,
    // view = { w, h }（CSSピクセル）, frame = { time, palette, now, ... }
    draw(ctx, view, frame) {
      if (ready && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, view.w, view.h)
      } else {
        drawCode(ctx, view, frame)
      }
    },
  }
}
