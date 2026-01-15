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
        ws: true, // Suportar WebSocket/SSE
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            // Se o servidor Express não estiver rodando, retornar erro amigável
            if (err.code === 'ECONNREFUSED') {
              console.warn('[Vite Proxy] Servidor Express não está rodando na porta 3000');
              console.warn('[Vite Proxy] Execute: npm start (em outro terminal)');
              if (res && !res.headersSent) {
                // Para SSE, não podemos enviar JSON, apenas fechar a conexão
                if (req.url?.includes('/stream')) {
                  res.writeHead(503, { 'Content-Type': 'text/event-stream' });
                  res.write('event: error\ndata: {"error":"Servidor Express não disponível"}\n\n');
                  res.end();
                } else {
                  res.writeHead(503, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ 
                    error: 'Servidor Express não está disponível',
                    message: 'Execute "npm start" em outro terminal para iniciar o servidor'
                  }));
                }
              }
            }
          });
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
})

