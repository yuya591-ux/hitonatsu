import { defineConfig } from 'vite'
import { resolve } from 'path'

// GitHub Pages はリポジトリ名のサブパス（例: https://ユーザー名.github.io/hitonatsu/）で配信されるため、
// 公開ビルド時のみ base をリポジトリ名にそろえる。ローカル開発（dev）では '/' のまま。
//
// マルチページ：本編(index.html)と、3Dの試作(proto3d.html)を並べてビルドする。
// 既存の2Dゲームは壊さず、試作だけ別URL（/hitonatsu/proto3d.html）で確認できる。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/hitonatsu/' : '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        proto3d: resolve(__dirname, 'proto3d.html'),
      },
    },
  },
}))
