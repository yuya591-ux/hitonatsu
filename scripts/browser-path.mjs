// 検証スクリプト共通：ヘッドレスブラウザ実行ファイルを解決する「唯一の場所」。
// CI(GitHub Actions/Linux)は環境変数 PUPPETEER_EXECUTABLE_PATH / CHROME_PATH で渡す。無ければローカル同梱chrome→Windows Edge。
// ★重要（2026-07-04の事故の再発防止）：verify-*.mjs は必ずこれを import すること。
//   個別にこの解決を書くと、環境変数を読み忘れた版がCI(Linux)でWindowsのEdgeパスを見に行き、
//   build→deploy が全て失敗し、push毎に失敗メールが届く（＝実際に7連続で起きた）。分岐させない。
// ※このファイルはアンダースコアを付けない＝.gitignore(scripts/_*.mjs)の対象外＝CIにも含める。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
export function resolveBrowser(root) {
  const env = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH
  if (env) return env
  const c = join(root, 'chrome')
  if (existsSync(c)) for (const d of readdirSync(c)) { const p = join(c, d, 'chrome-win64', 'chrome.exe'); if (existsSync(p)) return p }
  return 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
}
