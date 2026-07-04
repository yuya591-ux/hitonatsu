// ── 写真モード（平成レトロ画質）＝既存に「足すだけ」の独立モジュール ──
// 既存の操作・カメラ・通常時の描画(水彩NPR)には一切触れない。撮影結果のみにレトロ加工を掛ける。
// main.js から initPhotoMode({ renderer, getDay }) を呼ぶだけで動く（疎結合）。

// レトロ強度のパラメータ（ここを触れば後から簡単に微調整できる）
export const PHOTO_CFG = {
  width: 640, height: 480, // VGA級にダウンサンプル（粗さ・ドット感）
  jpegQuality: 0.8, // 圧縮感（ガラケー/デジカメ風）
  saturation: 0.82, // 彩度を少し下げる
  contrast: 0.94, // 眠い階調（強くしすぎない・眠くしすぎてモヤにしない）
  brightness: 1.02,
  softBlurPx: 0.7, // ごくわずかなソフトフォーカス
  wbR: 1.07, wbG: 1.0, wbB: 0.9, // ホワイトバランス：曇り寄り（青を抜き暖色へ）
  warmAdd: 6, // さらに全体へ薄く黄/暖色を足す
  vignette: 0.34, // 周辺減光（軽く）
  grain: 20, // フィルムグレイン（±grain/2）
  // ── ここから“エモさ”の核（褪せた技術写真→あたたかい記憶へ）。控えめに＝白飛び/モヤにしない ──
  halation: 0.3, // ハレーション＝空/灯りだけが暖色にふわっと滲む（夏の光の記憶・いちばん効く）
  blackLift: 0.055, // 黒をほんの少し暖かいグレーへ＝褪せたプリントの影（真っ黒に沈めない・持ち上げすぎない）
  splitWarm: 10, // スプリットトーン：ハイライトを琥珀へ（夕日/白熱灯の記憶）
  splitCool: 7, // スプリットトーン：シャドウをほのかに青緑へ（フィルムのやさしい色ずれ）
  lightLeak: 0.09, // 光もれ＝隅からの暖かい光線（フィルムの光線・夏の日ざしの気配・ごく淡く）
  dateStamp: true, // 右下の日付スタンプ（平成デジカメ風）
  dateColor: 'rgba(255,150,46,0.92)',
  maxPhotos: 80, // アルバム上限（古いものから消す）。J5でIndexedDB化＝localStorageの5MB制限から解放したので30→80へ
  storeKey: 'hn3d_photos', // 旧localStorageのキー（IndexedDBへ移行＝後方互換のため残す）
}

// ── J5：写真をIndexedDBへ（localStorageの5MB制限/無言失敗/同期ブロックを解消）。外部依存なしの極小ラッパ。──
const IDB = { name: 'hn3d', store: 'photos', v: 1 }
function idbOpen() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open(IDB.name, IDB.v)
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(IDB.store)) db.createObjectStore(IDB.store, { keyPath: 'id', autoIncrement: true }) }
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('idb open失敗'))
    } catch (e) { rej(e) }
  })
}
async function idbAll() { const db = await idbOpen(); return new Promise((res) => { const tx = db.transaction(IDB.store, 'readonly'); const rq = tx.objectStore(IDB.store).getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]) }) }
async function idbAdd(rec) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB.store, 'readwrite'); const rq = tx.objectStore(IDB.store).add(rec); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error) }) }
async function idbDel(id) { const db = await idbOpen(); return new Promise((res) => { const tx = db.transaction(IDB.store, 'readwrite'); tx.objectStore(IDB.store).delete(id); tx.oncomplete = () => res(); tx.onerror = () => res() }) }

// レトロ強度プリセット（見た目パラメータのみ差し替え。解像度等は据え置き）
export const PHOTO_PRESETS = {
  '弱': { saturation: 0.9, contrast: 0.98, brightness: 1.02, softBlurPx: 0.45, wbR: 1.05, wbG: 1.0, wbB: 0.94, warmAdd: 4, vignette: 0.22, grain: 12, halation: 0.2, blackLift: 0.035, splitWarm: 7, splitCool: 4, lightLeak: 0.06 },
  '標準': { saturation: 0.82, contrast: 0.94, brightness: 1.02, softBlurPx: 0.7, wbR: 1.07, wbG: 1.0, wbB: 0.9, warmAdd: 6, vignette: 0.34, grain: 20, halation: 0.3, blackLift: 0.055, splitWarm: 10, splitCool: 7, lightLeak: 0.09 },
  '強': { saturation: 0.68, contrast: 0.88, brightness: 1.03, softBlurPx: 1.0, wbR: 1.11, wbG: 1.0, wbB: 0.84, warmAdd: 11, vignette: 0.46, grain: 30, halation: 0.46, blackLift: 0.1, splitWarm: 16, splitCool: 11, lightLeak: 0.16 },
}

export function initPhotoMode({ renderer, getDay, playShutter, getCaption }) {
  const cfg = PHOTO_CFG
  const $ = (tag, css, parent) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (parent) parent.appendChild(e); return e }

  // ── スタイル（注入。既存CSSは触らない）──
  const style = document.createElement('style')
  style.textContent = `
    #pm-btn{position:fixed;left:calc(3% + env(safe-area-inset-left));top:calc(3.5% + 104px + env(safe-area-inset-top));z-index:38;appearance:none;border:none;cursor:pointer;
      width:44px;height:44px;border-radius:50%;font-size:21px;background:rgba(120,92,58,0.72);
      box-shadow:0 3px 10px rgba(20,24,40,0.3);}
    /* 写真ボタンは「とれる」と気づけるよう、ほかのボタンより少し あたたかい茶＋初回だけ数回そっとパルス（やりすぎない） */
    #pm-btn.pm-firsttime{animation:pmbtnpulse 1.6s ease-in-out 4;}
    @keyframes pmbtnpulse{0%,100%{transform:scale(1);box-shadow:0 3px 10px rgba(20,24,40,0.3);}50%{transform:scale(1.12);box-shadow:0 0 0 5px rgba(230,180,120,0.35),0 3px 12px rgba(20,24,40,0.34);}}
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
    /* 撮った瞬間の手応え：撮れた一枚が小さくなりながらアルバム(🖼)へ吸い込まれる（思い出が1枚 増える実感） */
    .pm-pop{position:fixed;z-index:42;border:3px solid #fff;border-radius:2px;box-shadow:0 5px 16px rgba(0,0,0,0.45);pointer-events:none;
      transition:left 0.55s cubic-bezier(.35,0,.2,1),top 0.55s cubic-bezier(.35,0,.2,1),width 0.55s cubic-bezier(.35,0,.2,1),opacity 0.5s ease,transform 0.55s ease;}
    #pm-bar.pm-got #pm-album-side,.pm-got{animation:pmgot 0.5s ease;}
    @keyframes pmgot{0%,100%{transform:scale(1);}45%{transform:scale(1.22);}}
    #pm-album{position:fixed;inset:0;z-index:44;display:none;overflow:auto;padding:6vh 5vw;
      background:radial-gradient(120% 85% at 50% 0%,#4c3a26,#2e2416);backdrop-filter:blur(2px);}
    #pm-album.on{display:block;}
    #pm-album h3{color:#f1e3c6;text-align:center;font-weight:600;letter-spacing:0.14em;margin:0 0 4vh;font-family:"KleeOne","Hiragino Mincho ProN","Yu Mincho",serif;}
    #pm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:22px 16px;max-width:900px;margin:0 auto;}
    #pm-grid figure{position:relative;margin:0;background:#fbf3e2;padding:9px 9px 26px;border-radius:2px;box-shadow:0 7px 18px rgba(0,0,0,0.42);transform:rotate(-1deg);}
    #pm-grid figure:nth-child(even){transform:rotate(1.3deg);}
    #pm-grid figure:nth-child(3n){transform:rotate(0.5deg);}
    #pm-grid img{width:100%;display:block;cursor:pointer;border-radius:1px;}
    #pm-grid figcaption{font-size:11.5px;color:#6a5a3c;text-align:center;margin-top:7px;font-family:"KleeOne","Hiragino Mincho ProN","Yu Mincho",serif;letter-spacing:0.02em;line-height:1.3;}
    #pm-empty{color:#e4d6b8;text-align:center;font-size:15px;line-height:2;font-family:"KleeOne","Hiragino Mincho ProN","Yu Mincho",serif;}
    #pm-empty .slots{display:flex;justify-content:center;gap:16px;margin:2.4vh 0;}
    #pm-empty .slots span{width:82px;height:62px;border:2px dashed rgba(228,214,184,0.42);border-radius:2px;}
    #pm-close-album{display:block;margin:5vh auto 0;appearance:none;border:none;cursor:pointer;padding:0.55em 2.2em;
      font-size:17px;font-family:inherit;color:#fdf7ec;background:#bd8a4e;border-radius:999px;box-shadow:0 3px 10px rgba(0,0,0,0.3);}
    #pm-view{position:fixed;inset:0;z-index:48;display:none;align-items:center;justify-content:center;
      background:radial-gradient(120% 120% at 50% 42%, rgba(38,27,19,0.9), rgba(18,13,10,0.95));padding:4vw;}
    #pm-view.on{display:flex;}
    /* 写真＝クリーム色のフチの“プリント”。白×黒の画廊でなく、あたたかい暗がりに一枚だけ置いた思い出に */
    #pm-view img{max-width:94vw;max-height:80vh;border:7px solid #f4ecda;border-bottom-width:15px;border-radius:2px;
      box-shadow:0 12px 34px rgba(0,0,0,0.5),0 2px 10px rgba(70,46,26,0.45);transform:rotate(-0.7deg);}
    /* 写真の下にそっと一行＝アルバムを“絵の束”から“思い出”へ（いつ・どこで撮ったか） */
    #pm-view-cap{position:fixed;bottom:13vh;left:0;right:0;text-align:center;color:#fdf3e0;font-size:15px;letter-spacing:0.06em;text-shadow:0 1px 4px rgba(0,0,0,0.7);font-family:inherit;pointer-events:none;}
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
  const albumBtn = $('button', '', bar); albumBtn.className = 'pm-side'; albumBtn.id = 'pm-album-side'; albumBtn.textContent = '🖼'; albumBtn.title = 'アルバム'
  const flash = $('div', '', document.body); flash.id = 'pm-flash'
  const album = $('div', '', document.body); album.id = 'pm-album'
  album.innerHTML = '<h3>なつやすみの しゃしん</h3><div id="pm-grid"></div><button id="pm-close-album">とじる</button>'
  const grid = album.querySelector('#pm-grid')
  const view = $('div', '', document.body); view.id = 'pm-view'
  const viewImg = $('img', '', view)
  const viewCap = $('div', '', view); viewCap.id = 'pm-view-cap' // 写真の下の一行（いつ・どこで）
  const viewBar = $('div', '', document.body); viewBar.id = 'pm-view-bar'; view.appendChild(viewBar)
  const viewClose = $('button', '', viewBar); viewClose.textContent = 'とじる'
  const viewDel = $('button', '', viewBar); viewDel.textContent = 'けす'

  // ── アルバム（J5：IndexedDBに永続化。photosは{id,url,day}の配列＝表示は従来どおりurl(dataURL)）──
  let photos = [], idbOk = true
  // 起動時：IndexedDBから読み込み＋旧localStorageからの一度きりの移行
  ;(async () => {
    try {
      let rows = await idbAll()
      if (!rows.length) { // 旧localStorageに写真があればIndexedDBへ移行（古い順に）
        let old = []
        try { old = JSON.parse(localStorage.getItem(cfg.storeKey) || '[]') } catch (e) {}
        if (old.length) { for (const u of old) { const url = typeof u === 'string' ? u : (u && u.url); if (url) try { await idbAdd({ url, day: 0, t: Date.now() }) } catch (e) {} }
          try { localStorage.removeItem(cfg.storeKey) } catch (e) {} // 移行済みのlocalStorageは消す（5MBを占有しない）
          rows = await idbAll() }
      }
      photos = rows.sort((a, b) => (a.t || 0) - (b.t || 0)) // 古い順
      if (album.classList.contains('on')) openAlbum() // 読み込み中にアルバムを開いていたら描き直す
    } catch (e) { idbOk = false; // IndexedDB不可（プライベートモード等）：セッション内のメモリ保持にフォールバック
      try { const old = JSON.parse(localStorage.getItem(cfg.storeKey) || '[]'); photos = old.map((u) => ({ url: typeof u === 'string' ? u : u.url, day: 0 })) } catch (e2) {} }
  })()

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
    // 画素処理：WB(曇り寄り)＋スプリットトーン(暖ハイライト/寒シャドウ)＋黒の持ち上げ(ミルキー)＋グレイン＋ヴィネット
    const img = x.getImageData(0, 0, W, H), d = img.data
    const cxp = W / 2, cyp = H / 2, maxd = Math.hypot(cxp, cyp)
    const bl = cfg.blackLift || 0, sw2 = cfg.splitWarm || 0, sc = cfg.splitCool || 0
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * cfg.wbR + cfg.warmAdd, g = d[i + 1] * cfg.wbG + cfg.warmAdd * 0.6, b = d[i + 2] * cfg.wbB
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255, sh = 1 - lum // 明るさ0..1／影の重み
      // スプリットトーン：ハイライト＝琥珀、シャドウ＝ほのかに青緑（フィルムのやさしい色ずれ＝記憶の色）
      r += lum * sw2 - sh * sc * 0.35
      g += lum * sw2 * 0.42 + sh * sc * 0.12
      b += -lum * sw2 * 0.55 + sh * sc
      // 黒を暖かいグレーへ持ち上げ＝褪せたプリントのミルキーな影（真っ黒に沈まず、やわらかい）
      r = r * (1 - bl) + 48 * bl; g = g * (1 - bl) + 43 * bl; b = b * (1 - bl) + 40 * bl
      const n = (Math.random() - 0.5) * cfg.grain
      r += n; g += n; b += n
      const px = (i >> 2) % W, py = (i >> 2) / W | 0
      const dd = Math.hypot(px - cxp, py - cyp) / maxd
      const v = 1 - cfg.vignette * dd * dd
      r *= v; g *= v; b *= v
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
    }
    x.putImageData(img, 0, 0)
    // ハレーション：本当に明るい所（空・灯り・白い雲）だけが暖色にふわっと滲む（夏の光/白熱灯の記憶）＝しきい値でハイライトのみ抽出→暖色に染め→大きくぼかして加算。閾値方式なので淡いトゥーンの壁までは滲ませず白飛びしない
    if (cfg.halation > 0) {
      const hc = document.createElement('canvas'); hc.width = W; hc.height = H; const hx = hc.getContext('2d')
      const hi = x.getImageData(0, 0, W, H), hd = hi.data
      for (let i = 0; i < hd.length; i += 4) { const l = hd[i] * 0.299 + hd[i + 1] * 0.587 + hd[i + 2] * 0.114
        const m = Math.min(1, Math.max(0, l - 206) / 44) // 明度206以上だけ（空/灯り）＝壁(≈180)は滲まない
        hd[i] = hd[i] * m; hd[i + 1] = hd[i + 1] * m * 0.82; hd[i + 2] = hd[i + 2] * m * 0.52 } // 琥珀に寄せる
      hx.putImageData(hi, 0, 0)
      x.globalCompositeOperation = 'lighter'; x.globalAlpha = cfg.halation; x.filter = `blur(${Math.max(4, Math.round(W * 0.02))}px)`; x.drawImage(hc, 0, 0); x.filter = 'none'; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'
    }
    // 光もれ：右上の隅から暖かい光線がにじむ（フィルムの光もれ・夏の日ざしの気配）＝ごく淡く加算
    if (cfg.lightLeak > 0) {
      const g1 = x.createRadialGradient(W * 0.97, H * 0.05, 0, W * 0.97, H * 0.05, W * 0.62)
      g1.addColorStop(0, `rgba(255,158,74,${cfg.lightLeak})`); g1.addColorStop(0.5, `rgba(255,122,86,${cfg.lightLeak * 0.34})`); g1.addColorStop(1, 'rgba(255,122,86,0)')
      x.globalCompositeOperation = 'lighter'; x.fillStyle = g1; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'
    }
    if (cfg.dateStamp) {
      x.font = 'bold 22px "Courier New", monospace'; x.textAlign = 'right'
      x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 3
      x.fillStyle = cfg.dateColor; x.fillText(dateLabel(), W - 14, H - 16)
      x.shadowBlur = 0
    }
    return c.toDataURL('image/jpeg', cfg.jpegQuality)
  }

  // 撮った瞬間の手応え：撮れた一枚が小さくなりながらアルバム(🖼)へ吸い込まれ、アルバムボタンがぽよんと弾む
  function popThumb(url) {
    try {
      const r = albumBtn.getBoundingClientRect()
      const im = document.createElement('img'); im.className = 'pm-pop'; im.src = url
      im.style.left = (innerWidth / 2 - 64) + 'px'; im.style.top = (innerHeight / 2 - 48) + 'px'; im.style.width = '128px'; im.style.transform = 'rotate(0deg)'
      document.body.appendChild(im)
      void im.offsetWidth // レイアウト確定→遷移が走る
      im.style.left = (r.left + r.width / 2 - 13) + 'px'; im.style.top = (r.top + r.height / 2 - 10) + 'px'; im.style.width = '26px'; im.style.opacity = '0.15'; im.style.transform = 'rotate(-10deg)'
      setTimeout(() => { im.remove(); albumBtn.classList.add('pm-got'); setTimeout(() => albumBtn.classList.remove('pm-got'), 520) }, 540)
    } catch (e) {}
  }
  function takePhoto() {
    try { playShutter && playShutter() } catch (e) {} // カシャッ（自前合成）
    flash.classList.add('on'); setTimeout(() => flash.classList.remove('on'), 30) // 一瞬の白フラッシュ
    // 次フレームの描画結果を参照キャプチャ（preserveDrawingBuffer により可能）。ゲーム状態は無改変。
    requestAnimationFrame(() => {
      const url = processRetro(renderer.domElement)
      if (!url) return
      const rec = { url, day: (getDay && getDay()) || 1, t: Date.now(), caption: (getCaption && getCaption()) || '' } // J:いつ・どこで撮ったかの一行（思い出装置）
      if (idbOk) idbAdd(rec).then((id) => { rec.id = id }).catch(() => { idbOk = false }) // IndexedDBへ非同期保存（同期ブロックしない・失敗してもメモリには残る）
      photos.push(rec); while (photos.length > cfg.maxPhotos) { const old = photos.shift(); if (old && old.id != null && idbOk) idbDel(old.id) } // 上限超過は古いものから消す（IDBからも）
      newCount++ // その日の絵日記に使えるよう「新しく撮った枚数」を数える
      popThumb(url) // 思い出が1枚 増える手応え
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
    if (!photos.length) { grid.innerHTML = '<div id="pm-empty"><div class="slots"><span></span><span></span><span></span></div>まだ しゃしんが ありません。<br>📷で ひと夏を のこそう。</div>' }
    else for (let i = photos.length - 1; i >= 0; i--) { const fig = document.createElement('figure'); const im = document.createElement('img'); im.src = photos[i].url; im.dataset.idx = i; im.addEventListener('click', () => openView(i)); fig.appendChild(im); if (photos[i].caption) { const cap = document.createElement('figcaption'); cap.textContent = photos[i].caption; fig.appendChild(cap) } grid.appendChild(fig) }
    album.classList.add('on')
  }
  let viewIdx = -1
  function openView(i) { viewIdx = i; viewImg.src = photos[i].url; viewCap.textContent = photos[i].caption || ''; view.classList.add('on') }

  // ── モード切替 ──
  let on = false
  function enter() { on = true; document.body.classList.add('pm-on'); finder.classList.add('on'); bar.classList.add('on') }
  function exit() { on = false; document.body.classList.remove('pm-on'); finder.classList.remove('on'); bar.classList.remove('on') }

  // 初回だけ：写真ボタンに そっとパルス（数回で自然に止まる・一度でも触れたら以降は出さない）
  let pmSeen = true; try { pmSeen = localStorage.getItem('hn3d_pmbtn_seen') === '1' } catch (e) {}
  if (!pmSeen) { btn.classList.add('pm-firsttime'); btn.addEventListener('animationend', () => btn.classList.remove('pm-firsttime')) }
  const markPmSeen = () => { btn.classList.remove('pm-firsttime'); try { localStorage.setItem('hn3d_pmbtn_seen', '1') } catch (e) {} }
  btn.addEventListener('click', () => { markPmSeen(); enter() })
  closeBtn.addEventListener('click', exit)
  shutter.addEventListener('click', takePhoto)
  finder.querySelector('#pm-quality').addEventListener('click', () => applyPreset(presetIdx + 1))
  finder.querySelector('#pm-date').addEventListener('click', (e) => { cfg.dateStamp = !cfg.dateStamp; e.currentTarget.textContent = '日付:' + (cfg.dateStamp ? 'ON' : 'OFF') })
  albumBtn.addEventListener('click', openAlbum)
  album.querySelector('#pm-close-album').addEventListener('click', () => album.classList.remove('on'))
  album.addEventListener('click', (e) => { if (e.target === album) album.classList.remove('on') }) // 背景タップで閉じる（他レイヤーと操作統一）
  viewClose.addEventListener('click', () => view.classList.remove('on'))
  viewDel.addEventListener('click', () => { if (viewIdx >= 0) { const rec = photos[viewIdx]; if (rec && rec.id != null && idbOk) idbDel(rec.id); photos.splice(viewIdx, 1); view.classList.remove('on'); openAlbum() } })
  addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if (k === 'p') { on ? exit() : enter() } else if (on && k === ' ') takePhoto() })

  return {
    enter, exit, takePhoto, openAlbum, // I1：おもいで帳から写真アルバムを開けるよう公開
    get count() { return photos.length },
    get newCount() { return newCount }, // その日 新しく撮った枚数（絵日記用）
    clearNew() { newCount = 0 },
    latestPhoto() { return photos.length ? photos[photos.length - 1].url : null },
    list() { return photos.map((p) => ({ url: p.url, day: p.day, caption: p.caption })) }, // I1改：おもいで帳「しゃしん」タブがサムネイルを直に並べるため一覧を公開（古い順）
    viewPhoto(i) { if (i >= 0 && i < photos.length) openView(i) }, // タブのサムネから拡大ビューを開く
    _process(over) { const keys = over ? Object.keys(over) : [], bak = {}; for (const k of keys) bak[k] = cfg[k]; if (over) Object.assign(cfg, over); const url = processRetro(renderer.domElement); for (const k of keys) cfg[k] = bak[k]; return url }, // 検証用：今の画面を指定設定で現像（旧/新のA/B比較）
  }
}
