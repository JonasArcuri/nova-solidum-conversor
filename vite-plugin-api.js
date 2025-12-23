/**
 * Plugin do Vite para executar serverless functions localmente
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { readFileSync } from 'fs'

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
            
            // Importar dinamicamente o módulo da API usando import absoluto
            const apiUrl = `file://${apiPath}?t=${Date.now()}`
            const apiModule = await import(apiUrl)
            const handler = apiModule.default
            
            if (typeof handler !== 'function') {
              return next()
            }
            
            // Criar objeto Request simulado compatível com Edge Runtime
            const url = new URL(req.url, `http://${req.headers.host}`)
            const mockReq = {
              method: req.method || 'GET',
              url: url.toString(),
              headers: {
                get: (name) => {
                  const headerName = name.toLowerCase()
                  return req.headers[headerName] || req.headers[headerName.replace('-', '_')]
                },
                origin: req.headers.origin || '',
              },
            }
            
            const response = await handler(mockReq)
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
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Internal server error', message: error.message }))
          }
        } else {
          next()
        }
      })
    },
  }
}

