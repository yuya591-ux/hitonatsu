// 開発時のみ実行するテクスチャ生成スクリプト（本番のゲームはこれを読み込まない＝外部API非依存）
// Pollinations の Flux モデル（無料）でシームレステクスチャを生成し src/assets/textures/ に保存する。
// 鍵は .pollinations_key ファイル（.gitignore 済み）または環境変数 POLLINATIONS_KEY から読む。鍵はGitに上げない。
// 使い方:  node scripts/gen-textures.mjs           … 全テクスチャ生成
//          node scripts/gen-textures.mjs roof wall … 指定テクスチャのみ
import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'textures') // public/ は Vite が base 直下でそのまま配信→ランタイムで import.meta.env.BASE_URL + 'textures/...' で読む

// 共通の作風（低ポリ＋トゥーン＋水彩の世界観を保つ・継ぎ目の出ないタイル・影なし・文字なし）
const STYLE = 'seamless tileable texture, flat top-down orthographic view, soft hand-painted watercolor toon style, muted Showa-era Japanese summer palette, even flat lighting, no shadows, no text, no watermark, no border'

// テクスチャ候補（効果の大きい順）。プロンプトは人間が確認・選択する。
const TEX = {
  roof: { file: 'roof_kawara.jpg', w: 768, h: 768, seed: 71,
    prompt: `traditional Japanese kawara roof tiles in neat horizontal rows, weathered dark blue-grey ceramic, gentle highlights, ${STYLE}` },
  wall: { file: 'wall_plaster.jpg', w: 768, h: 768, seed: 88,
    prompt: `aged Showa-era sand-plaster stucco wall, uniform fine sandy grain covering the whole image evenly, gentle mottled cream-beige, faint even weathering, NO large cracks, NO single features, allover even texture, ${STYLE}` },
  ground: { file: 'ground_grass.jpg', w: 768, h: 768, seed: 73,
    prompt: `summer countryside lawn, short soft grass with small patches of dry earth, gentle low-contrast variation so it blends under terrain colors, ${STYLE}` },
  wood: { file: 'wood_plank.jpg', w: 768, h: 768, seed: 74,
    prompt: `old weathered wooden planks, warm brown vertical wood grain, faded timber boards, ${STYLE}` },
}

const KEY = (process.env.POLLINATIONS_KEY || (await readFile(join(ROOT, '.pollinations_key'), 'utf8').catch(() => ''))).trim()
if (!KEY) { console.error('鍵がありません。enter.pollinations.ai で無料の publishable key(pk_) を作り、\n  リポジトリ直下に  .pollinations_key  として保存するか、環境変数 POLLINATIONS_KEY に入れてください。'); process.exit(1) }

const pick = process.argv.slice(2)
const targets = pick.length ? pick : Object.keys(TEX)
await mkdir(OUT, { recursive: true })

async function gen(name) {
  const t = TEX[name]; if (!t) { console.log('未知のテクスチャ:', name); return }
  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(t.prompt)}?model=flux&width=${t.w}&height=${t.h}&seed=${t.seed}` // 認証付き新ホスト（sk_キーでIP制限を回避）
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } })
      const ct = res.headers.get('content-type') || ''
      if (res.ok && ct.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer())
        await writeFile(join(OUT, t.file), buf)
        console.log(`✅ ${name} → ${t.file} (${(buf.length / 1024).toFixed(0)} KB)`) ; return
      }
      const body = await res.text().catch(() => '')
      console.log(`… ${name} 試行${attempt}: HTTP ${res.status} ${ct} ${body.slice(0, 90)}`)
    } catch (e) { console.log(`… ${name} 試行${attempt}: ${e.message}`) }
    await new Promise((r) => setTimeout(r, 9000)) // キュー待ち（無料枠のレート制限を尊重）
  }
  console.log(`❌ ${name} 生成できず（レート制限/キー要確認）`)
}

for (const name of targets) await gen(name)
console.log('完了。出力先:', OUT)
