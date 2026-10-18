import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The demo is VinFast only: the SU7 root page and the Tesla page are not built and, in dev, their URLs land on the VinFast demo.
const vinfastOnly = (): Plugin => ({
  name: 'vinfast-only',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (/^\/cockpit(?:\/|\/index\.html)?$/.test(url.pathname) || /^\/cockpit\/tesla(?:-[a-z]+)?(?:\/|$)/.test(url.pathname)) {
        res.statusCode = 302; res.setHeader('Location', `/cockpit/vinfast/${url.search}`); res.end(); return
      }
      next()
    })
  },
})

export default defineConfig({
  base: '/cockpit/',
  plugins: [vinfastOnly(), react(), tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom', 'three'] },
  // maplibre ships its own worker bundle; pre-bundling it breaks the worker URL in dev
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // dev only: same-origin /api like the deployed Worker; this is not part of the production bundle
  server: { port: 4177, proxy: { '/api': 'http://127.0.0.1:8000', '/health': 'http://127.0.0.1:8000' } },
  build: { chunkSizeWarningLimit: 2000, rolldownOptions: { input: { vinfast: 'vinfast/index.html' } } },
})
