/**
 * Plugin do Vite para executar serverless functions localmente
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function vitePluginApi() {
  return {
    name: 'vite-plugin-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          try {
            const apiName = req.url.replace('/api/', '').split('?')[0]
            const apiPath = resolve(__dirname, `api/${apiName}.js`)
            
            // Verificar se o arquivo existe
            if (!existsSync(apiPath)) {
              console.error(`[Vite API Plugin] Arquivo não encontrado: ${apiPath}`)
              res.writeHead(404, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'API endpoint not found' }))
              return
            }
            
            // Importar dinamicamente o módulo da API
            const apiUrl = `file://${apiPath}?t=${Date.now()}`
            const apiModule = await import(apiUrl)
            const handler = apiModule.default
            
            if (typeof handler !== 'function') {
              console.error(`[Vite API Plugin] Handler não é uma função para: ${apiName}`)
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid handler' }))
              return
            }
            
            // Criar objeto Request simulado compatível com Edge Runtime
            const url = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`)
            const mockReq = {
              method: req.method || 'GET',
              url: url.toString(),
              headers: {
                get: (name) => {
                  const headerName = name.toLowerCase()
                  return req.headers[headerName] || req.headers[headerName.replace('-', '_')] || null
                },
                origin: req.headers.origin || '',
                referer: req.headers.referer || '',
              },
            }
            
            const response = await handler(mockReq)
            
            if (!(response instanceof Response)) {
              console.error(`[Vite API Plugin] Resposta inválida de: ${apiName}`)
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Invalid response format' }))
              return
            }
            
            const body = await response.text()
            
            // Copiar headers da resposta
            if (response.headers) {
              response.headers.forEach((value, key) => {
                res.setHeader(key, value)
              })
            }
            
            res.writeHead(response.status || 200)
            res.end(body)
          } catch (error) {
            console.error('[Vite API Plugin] Error:', error)
            console.error('[Vite API Plugin] Stack:', error.stack)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ 
              error: 'Internal server error', 
              message: error.message,
              stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }))
          }
        } else {
          next()
        }
      })
    },
  }
}

