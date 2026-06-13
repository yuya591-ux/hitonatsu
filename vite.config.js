import { defineConfig } from 'vite'

// GitHub Pages はリポジトリ名のサブパス（例: https://ユーザー名.github.io/hitonatsu/）で配信されるため、
// 公開ビルド時のみ base をリポジトリ名にそろえる。ローカル開発（dev）では '/' のまま。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/hitonatsu/' : '/',
}))
