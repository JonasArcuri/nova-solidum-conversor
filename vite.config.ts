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
  test: {
    globals: true,
    environment: 'jsdom',
  },
})

