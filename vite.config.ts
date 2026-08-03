import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// GitHub Pages: https://airpocket-soundman.github.io/head-tracked-vr-web-app/
export default defineConfig({
  base: '/head-tracked-vr-web-app/',
  plugins: [basicSsl()],
  server: {
    host: true, // allow access from phones on the same LAN (HTTPS via basicSsl)
  },
  build: {
    target: 'es2022',
  },
})
