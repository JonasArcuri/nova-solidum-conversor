import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { vitePluginApi } from './vite-plugin-api.js'

export default defineConfig({
  plugins: [react(), vitePluginApi()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Proxy para rotas SSE e outras rotas do Express
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true, // Suportar WebSocket para SSE
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})

