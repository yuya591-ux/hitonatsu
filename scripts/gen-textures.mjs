// 開発時のみ実行するテクスチャ生成スクリプト（本番のゲームはこれを読み込まない＝外部API非依存）
// Pollinations の Flux モデルでシームレステクスチャを生成し public/textures/ に保存する。
// 既定＝無料レガシーEP（image.pollinations.ai・鍵不要・Pollenを1ポレンも消費しない）。
//   ただしレート制限が厳しいIPでは時間がかかる/失敗することがある（その場合は時間を空けて再実行）。
//   --api …… 認証ホスト(gen.pollinations.ai)を使う。レート制限を回避できるが flux でも微量のPollen
//            （カード未登録なら無料の日次付与分のみ・購入残高には食い込まない）を消費。鍵が必要。
// 鍵（--api時のみ）は .pollinations_key（.gitignore済）か 環境変数 POLLINATIONS_KEY。鍵はGitに上げない。
// 使い方:  node scripts/gen-textures.mjs            … 全部（無料EP・Pollen非消費）
//          node scripts/gen-textures.mjs roof wood  … 指定のみ（無料EP）
//          node scripts/gen-textures.mjs --api roof … 認証ホスト（微量Pollen消費・要鍵）
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
  ground: { file: 'ground_grass.jpg', w: 768, h: 768, seed: 91,
    prompt: `subtle fine short grass blade detail, NEARLY GREYSCALE desaturated soft grey-green, very low contrast, even allover fine grass texture only, NO rocks NO flowers NO features NO color patches, gentle, ${STYLE}` },
  wood: { file: 'wood_plank.jpg', w: 768, h: 768, seed: 74,
    prompt: `old weathered wooden planks, warm brown vertical wood grain, faded timber boards, ${STYLE}` },
  dirt: { file: 'dirt_road.jpg', w: 768, h: 768, seed: 118,
    prompt: `countryside packed-earth ground, uniform warm muted brown soil with a fine even scatter of tiny pebbles and grains spread evenly all over, NO cracks NO ruts NO lines NO large rocks, very low contrast, allover even texture, ${STYLE}` },
  concrete: { file: 'concrete_road.jpg', w: 768, h: 768, seed: 119,
    prompt: `old Showa-era concrete surface, uniform pale weathered grey with a fine even speckle spread evenly all over, NO prominent cracks NO lines NO seams, very low contrast, allover even texture, ${STYLE}` },
}

const PAID = process.argv.includes('--api') || process.env.POLLINATIONS_PAID === '1' // 既定 false ＝ 無料EP（Pollen非消費）
const KEY = (process.env.POLLINATIONS_KEY || (await readFile(join(ROOT, '.pollinations_key'), 'utf8').catch(() => ''))).trim()
if (PAID && !KEY) { console.error('--api には鍵が必要です。enter.pollinations.ai で鍵(sk_推奨)を作り .pollinations_key に保存するか POLLINATIONS_KEY に入れてください。'); process.exit(1) }
console.log(PAID ? '◆ 認証ホスト（gen.pollinations.ai・微量Pollen消費）' : '◆ 無料レガシーEP（image.pollinations.ai・Pollen非消費／レート制限あり）')

const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const list = targets.length ? targets : Object.keys(TEX)
await mkdir(OUT, { recursive: true })

async function gen(name) {
  const t = TEX[name]; if (!t) { console.log('未知のテクスチャ:', name); return }
  const host = PAID ? 'https://gen.pollinations.ai/image/' : 'https://image.pollinations.ai/prompt/' // 既定は無料レガシーEP
  const url = `${host}${encodeURIComponent(t.prompt)}?model=flux&width=${t.w}&height=${t.h}&seed=${t.seed}${PAID ? '' : '&nologo=true'}`
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(url, PAID ? { headers: { Authorization: `Bearer ${KEY}` } } : {})
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

for (const name of list) await gen(name)
console.log('完了。出力先:', OUT)
