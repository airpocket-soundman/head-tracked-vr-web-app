import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// GitHub Pages: https://airpocket-soundman.github.io/head-tracked-vr-web-app/
// スマホ実機でカメラを使う開発時は HTTPS が必要:
//   HTTPS_DEV=1 npm run dev   (PowerShell: $env:HTTPS_DEV='1'; npm run dev)
export default defineConfig({
  base: '/head-tracked-vr-web-app/',
  plugins: process.env.HTTPS_DEV ? [basicSsl()] : [],
  server: {
    host: true, // allow access from phones on the same LAN
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900, // three.js + mediapipe bundle
  },
})
