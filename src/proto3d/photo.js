// ── 写真モード（平成レトロ画質）＝既存に「足すだけ」の独立モジュール ──
// 既存の操作・カメラ・通常時の描画(水彩NPR)には一切触れない。撮影結果のみにレトロ加工を掛ける。
// main.js から initPhotoMode({ renderer, getDay }) を呼ぶだけで動く（疎結合）。

// レトロ強度のパラメータ（ここを触れば後から簡単に微調整できる）
export const PHOTO_CFG = {
  width: 640, height: 480, // VGA級にダウンサンプル（粗さ・ドット感）
  jpegQuality: 0.8, // 圧縮感（ガラケー/デジカメ風）
  saturation: 0.82, // 彩度を少し下げる
  contrast: 0.92, // 眠い階調（強くしすぎない）
  brightness: 1.05,
  softBlurPx: 0.7, // ごくわずかなソフトフォーカス
  wbR: 1.07, wbG: 1.0, wbB: 0.9, // ホワイトバランス：曇り寄り（青を抜き暖色へ）
  warmAdd: 6, // さらに全体へ薄く黄/暖色を足す
  vignette: 0.34, // 周辺減光（軽く）
  grain: 22, // フィルムグレイン（±grain/2）
  dateStamp: true, // 右下の日付スタンプ（平成デジカメ風）
  dateColor: 'rgba(255,150,46,0.92)',
  maxPhotos: 30, // アルバム上限（古いものから消す）
  storeKey: 'hn3d_photos',
}

// レトロ強度プリセット（見た目パラメータのみ差し替え。解像度等は据え置き）
export const PHOTO_PRESETS = {
  '弱': { saturation: 0.92, contrast: 0.98, brightness: 1.04, softBlurPx: 0.4, wbR: 1.04, wbG: 1.0, wbB: 0.95, warmAdd: 3, vignette: 0.2, grain: 12 },
  '標準': { saturation: 0.82, contrast: 0.92, brightness: 1.05, softBlurPx: 0.7, wbR: 1.07, wbG: 1.0, wbB: 0.9, warmAdd: 6, vignette: 0.34, grain: 22 },
  '強': { saturation: 0.66, contrast: 0.85, brightness: 1.06, softBlurPx: 1.05, wbR: 1.1, wbG: 1.0, wbB: 0.85, warmAdd: 11, vignette: 0.46, grain: 34 },
}

export function initPhotoMode({ renderer, getDay, playShutter }) {
  const cfg = PHOTO_CFG
  const $ = (tag, css, parent) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (parent) parent.appendChild(e); return e }

  // ── スタイル（注入。既存CSSは触らない）──
  const style = document.createElement('style')
  style.textContent = `
    #pm-btn{position:fixed;left:calc(3% + env(safe-area-inset-left));top:calc(3.5% + 104px + env(safe-area-inset-top));z-index:38;appearance:none;border:none;cursor:pointer;
      width:44px;height:44px;border-radius:50%;font-size:21px;background:rgba(74,64,50,0.7);
      box-shadow:0 3px 10px rgba(20,24,40,0.3);}
    body.titling #pm-btn{display:none !important;}
    body.pm-on #act,body.pm-on #jump,body.pm-on #zin,body.pm-on #zout,body.pm-on #npc,body.pm-on #catch,
    body.pm-on #fish,body.pm-on #go,body.pm-on #look,body.pm-on #lie,body.pm-on #hint,body.pm-on #badge,
    body.pm-on #sleep,body.pm-on #pm-btn{display:none !important;}
    #pm-finder{position:fixed;inset:0;z-index:36;display:none;pointer-events:none;}
    #pm-finder.on{display:block;}
    .pm-corner{position:absolute;width:34px;height:34px;border:3px solid rgba(255,255,255,0.92);}
    .pm-tl{left:7%;top:9%;border-right:none;border-bottom:none;}
    .pm-tr{right:7%;top:9%;border-left:none;border-bottom:none;}
    .pm-bl{left:7%;bottom:13%;border-right:none;border-top:none;}
    .pm-br{right:7%;bottom:13%;border-left:none;border-top:none;}
    #pm-rec{position:absolute;left:8%;top:5.5%;color:#ff5a4a;font-size:13px;letter-spacing:0.12em;
      font-family:monospace;text-shadow:0 1px 3px rgba(0,0,0,0.5);}
    #pm-rec::before{content:'●';margin-right:6px;animation:pmblink 1.4s infinite;}
    @keyframes pmblink{0%,100%{opacity:1}50%{opacity:0.2}}
    #pm-tools{position:absolute;right:7%;top:5.5%;display:flex;gap:8px;pointer-events:auto;}
    .pm-tool{appearance:none;border:1px solid rgba(255,255,255,0.55);cursor:pointer;border-radius:999px;
      padding:0.28em 0.85em;font-size:12px;font-family:monospace;letter-spacing:0.04em;color:#fff;
      background:rgba(30,34,50,0.55);}
    #pm-bar{position:fixed;left:0;right:0;bottom:0;z-index:39;display:none;align-items:center;justify-content:center;
      gap:7vw;padding:3.5% 0 5%;}
    #pm-bar.on{display:flex;}
    #pm-shutter{appearance:none;border:5px solid rgba(255,255,255,0.92);cursor:pointer;width:74px;height:74px;
      border-radius:50%;background:rgba(255,255,255,0.32);box-shadow:0 4px 14px rgba(0,0,0,0.3);}
    #pm-shutter:active{transform:scale(0.92);background:rgba(255,255,255,0.6);}
    .pm-side{appearance:none;border:none;cursor:pointer;width:50px;height:50px;border-radius:50%;font-size:22px;
      color:#fff;background:rgba(40,44,60,0.7);box-shadow:0 3px 10px rgba(0,0,0,0.3);font-family:inherit;}
    #pm-flash{position:fixed;inset:0;z-index:41;background:#fff;opacity:0;pointer-events:none;transition:opacity 0.5s ease;}
    #pm-flash.on{opacity:0.85;transition:none;}
    #pm-album{position:fixed;inset:0;z-index:44;display:none;background:rgba(20,24,40,0.86);backdrop-filter:blur(2px);
      overflow:auto;padding:5vh 4vw;}
    #pm-album.on{display:block;}
    #pm-album h3{color:#fdf6e8;text-align:center;font-weight:600;letter-spacing:0.1em;margin:0 0 4vh;}
    #pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;max-width:880px;margin:0 auto;}
    #pm-grid img{width:100%;display:block;border:4px solid #fff;border-radius:3px;box-shadow:0 4px 12px rgba(0,0,0,0.4);
      cursor:pointer;transform:rotate(-1deg);}
    #pm-grid img:nth-child(even){transform:rotate(1.2deg);}
    #pm-empty{color:#cdbfa6;text-align:center;font-size:15px;}
    #pm-close-album{display:block;margin:5vh auto 0;appearance:none;border:none;cursor:pointer;padding:0.55em 2.2em;
      font-size:17px;font-family:inherit;color:#fdf7ec;background:#6a7088;border-radius:999px;}
    #pm-view{position:fixed;inset:0;z-index:48;display:none;align-items:center;justify-content:center;
      background:rgba(10,12,20,0.92);padding:4vw;}
    #pm-view.on{display:flex;}
    #pm-view img{max-width:94vw;max-height:80vh;border:6px solid #fff;border-radius:3px;box-shadow:0 8px 30px rgba(0,0,0,0.6);}
    #pm-view-bar{position:fixed;bottom:5vh;left:0;right:0;display:flex;justify-content:center;gap:6vw;}
    #pm-view-bar button{appearance:none;border:none;cursor:pointer;padding:0.5em 1.6em;font-size:16px;font-family:inherit;
      color:#3b3024;background:rgba(255,250,240,0.92);border-radius:999px;}
  `
  document.head.appendChild(style)

  // ── DOM（すべてJSで生成＝proto3d.htmlは無改変）──
  const btn = $('button', '', document.body); btn.id = 'pm-btn'; btn.textContent = '📷'; btn.title = 'しゃしん'
  const finder = $('div', '', document.body); finder.id = 'pm-finder'
  finder.innerHTML = '<div id="pm-rec">PHOTO</div><div id="pm-tools"><button class="pm-tool" id="pm-quality">画質:標準</button><button class="pm-tool" id="pm-date">日付:ON</button></div><div class="pm-corner pm-tl"></div><div class="pm-corner pm-tr"></div><div class="pm-corner pm-bl"></div><div class="pm-corner pm-br"></div>'
  const bar = $('div', '', document.body); bar.id = 'pm-bar'
  const closeBtn = $('button', '', bar); closeBtn.className = 'pm-side'; closeBtn.textContent = '×'; closeBtn.title = 'もどる'
  const shutter = $('button', '', bar); shutter.id = 'pm-shutter'
  const albumBtn = $('button', '', bar); albumBtn.className = 'pm-side'; albumBtn.textContent = '🖼'; albumBtn.title = 'アルバム'
  const flash = $('div', '', document.body); flash.id = 'pm-flash'
  const album = $('div', '', document.body); album.id = 'pm-album'
  album.innerHTML = '<h3>なつやすみの しゃしん</h3><div id="pm-grid"></div><button id="pm-close-album">とじる</button>'
  const grid = album.querySelector('#pm-grid')
  const view = $('div', '', document.body); view.id = 'pm-view'
  const viewImg = $('img', '', view)
  const viewBar = $('div', '', document.body); viewBar.id = 'pm-view-bar'; view.appendChild(viewBar)
  const viewClose = $('button', '', viewBar); viewClose.textContent = 'とじる'
  const viewDel = $('button', '', viewBar); viewDel.textContent = 'けす'

  // ── アルバム（localStorageに永続化）──
  let photos = []
  try { photos = JSON.parse(localStorage.getItem(cfg.storeKey) || '[]') } catch (e) { photos = [] }
  const saveAlbum = () => { try { localStorage.setItem(cfg.storeKey, JSON.stringify(photos)) } catch (e) {} }

  // ── 平成レトロ加工（撮影画像のみ・別レイヤー）──
  function dateLabel() { const d = (getDay && getDay()) || 1; return `'08  8 ${14 + d}` }
  function processRetro(src) {
    const W = cfg.width, H = cfg.height
    const sw = src.width, sh = src.height
    if (!sw || !sh) return null
    // 中央を 4:3 にクロップしてから VGA へ縮小
    const ar = W / H; let cw = sw, ch = sw / ar
    if (ch > sh) { ch = sh; cw = sh * ar }
    const cx = (sw - cw) / 2, cy = (sh - ch) / 2
    const c = document.createElement('canvas'); c.width = W; c.height = H
    const x = c.getContext('2d')
    x.imageSmoothingEnabled = true
    x.filter = `blur(${cfg.softBlurPx}px) saturate(${cfg.saturation}) contrast(${cfg.contrast}) brightness(${cfg.brightness})`
    x.drawImage(src, cx, cy, cw, ch, 0, 0, W, H)
    x.filter = 'none'
    // 画素処理：WB(曇り寄り)＋グレイン＋ヴィネット
    const img = x.getImageData(0, 0, W, H), d = img.data
    const cxp = W / 2, cyp = H / 2, maxd = Math.hypot(cxp, cyp)
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * cfg.wbR + cfg.warmAdd, g = d[i + 1] * cfg.wbG + cfg.warmAdd * 0.6, b = d[i + 2] * cfg.wbB
      const n = (Math.random() - 0.5) * cfg.grain
      r += n; g += n; b += n
      const px = (i >> 2) % W, py = (i >> 2) / W | 0
      const dd = Math.hypot(px - cxp, py - cyp) / maxd
      const v = 1 - cfg.vignette * dd * dd
      r *= v; g *= v; b *= v
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
    }
    x.putImageData(img, 0, 0)
    if (cfg.dateStamp) {
      x.font = 'bold 22px "Courier New", monospace'; x.textAlign = 'right'
      x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 3
      x.fillStyle = cfg.dateColor; x.fillText(dateLabel(), W - 14, H - 16)
      x.shadowBlur = 0
    }
    return c.toDataURL('image/jpeg', cfg.jpegQuality)
  }

  function takePhoto() {
    try { playShutter && playShutter() } catch (e) {} // カシャッ（自前合成）
    flash.classList.add('on'); setTimeout(() => flash.classList.remove('on'), 30) // 一瞬の白フラッシュ
    // 次フレームの描画結果を参照キャプチャ（preserveDrawingBuffer により可能）。ゲーム状態は無改変。
    requestAnimationFrame(() => {
      const url = processRetro(renderer.domElement)
      if (!url) return
      photos.push(url); while (photos.length > cfg.maxPhotos) photos.shift(); saveAlbum()
      newCount++ // その日の絵日記に使えるよう「新しく撮った枚数」を数える
    })
  }
  let newCount = 0
  // レトロ強度プリセット切替＆日付スタンプON/OFF
  const presetNames = Object.keys(PHOTO_PRESETS)
  let presetIdx = 1 // 標準
  function applyPreset(i) { presetIdx = (i + presetNames.length) % presetNames.length; const name = presetNames[presetIdx]; Object.assign(cfg, PHOTO_PRESETS[name]); finder.querySelector('#pm-quality').textContent = '画質:' + name }
  applyPreset(1)

  // ── アルバム表示 ──
  function openAlbum() {
    grid.innerHTML = ''
    if (!photos.length) { grid.innerHTML = '<div id="pm-empty">まだ しゃしんが ありません。<br>📷で とってみよう。</div>' }
    else for (let i = photos.length - 1; i >= 0; i--) { const im = document.createElement('img'); im.src = photos[i]; im.dataset.idx = i; im.addEventListener('click', () => openView(i)); grid.appendChild(im) }
    album.classList.add('on')
  }
  let viewIdx = -1
  function openView(i) { viewIdx = i; viewImg.src = photos[i]; view.classList.add('on') }

  // ── モード切替 ──
  let on = false
  function enter() { on = true; document.body.classList.add('pm-on'); finder.classList.add('on'); bar.classList.add('on') }
  function exit() { on = false; document.body.classList.remove('pm-on'); finder.classList.remove('on'); bar.classList.remove('on') }

  btn.addEventListener('click', enter)
  closeBtn.addEventListener('click', exit)
  shutter.addEventListener('click', takePhoto)
  finder.querySelector('#pm-quality').addEventListener('click', () => applyPreset(presetIdx + 1))
  finder.querySelector('#pm-date').addEventListener('click', (e) => { cfg.dateStamp = !cfg.dateStamp; e.currentTarget.textContent = '日付:' + (cfg.dateStamp ? 'ON' : 'OFF') })
  albumBtn.addEventListener('click', openAlbum)
  album.querySelector('#pm-close-album').addEventListener('click', () => album.classList.remove('on'))
  viewClose.addEventListener('click', () => view.classList.remove('on'))
  viewDel.addEventListener('click', () => { if (viewIdx >= 0) { photos.splice(viewIdx, 1); saveAlbum(); view.classList.remove('on'); openAlbum() } })
  addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (k === 'p') { on ? exit() : enter() } else if (on && k === ' ') takePhoto() })

  return {
    enter, exit, takePhoto,
    get count() { return photos.length },
    get newCount() { return newCount }, // その日 新しく撮った枚数（絵日記用）
    clearNew() { newCount = 0 },
    latestPhoto() { return photos.length ? photos[photos.length - 1] : null },
  }
}
