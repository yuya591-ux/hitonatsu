import './style.css'

// ── 土台（配管）段階 ──
// いまは「空のキャンバスを1枚、画面いっぱいに表示する」だけ。
// 風景・キャラ・時間進行は今後のフェーズでここに足していく。

const canvas = document.getElementById('scene')
const ctx = canvas.getContext('2d')

// 高解像度ディスプレイでもぼやけないよう、実ピクセル数を合わせる
function resize() {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(window.innerWidth * dpr)
  canvas.height = Math.floor(window.innerHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
}

// 動作確認用の最小描画：下地を一色で塗るだけ
function draw() {
  ctx.fillStyle = '#1b1d24'
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
}

window.addEventListener('resize', resize)
resize()
