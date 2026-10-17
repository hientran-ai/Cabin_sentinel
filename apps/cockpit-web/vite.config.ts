import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/cockpit/',
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  // maplibre ships its own worker bundle; pre-bundling it breaks the worker URL in dev
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // dev only: same-origin /api like the deployed Worker; this is not part of the production bundle
  server: { port: 4177, proxy: { '/api': 'http://127.0.0.1:8000', '/health': 'http://127.0.0.1:8000' } },
  build: { chunkSizeWarningLimit: 2000, rolldownOptions: { input: { cockpit: 'index.html', tesla: 'tesla/index.html', vinfast: 'vinfast/index.html' } } },
})
