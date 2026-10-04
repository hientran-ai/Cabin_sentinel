import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 4174 },
})
