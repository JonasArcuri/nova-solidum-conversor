// server-sse.js
// Módulo de Server-Sent Events para broadcast de preços USD/BRL
// Faz polling uma vez e distribui para todos os clientes conectados

import { GET as fetchUsdBrlData } from './api/usdbrl.js';

// Cache compartilhado para todos os clientes
let cachedPriceData = null;
let lastFetchTime = 0;
const FETCH_INTERVAL_MS = 30000; // 30 segundos - polling no servidor
const CACHE_TTL_MS = 60000; // Cache válido por 1 minuto

// Lista de clientes SSE conectados
const sseClients = new Set();

/**
 * Busca dados de USD/BRL e atualiza o cache
 */
async function fetchAndCachePrice() {
  try {
    // Criar um Request mock para a função GET (formato Web API Request)
    // Node.js 18+ tem suporte nativo para Request
    const mockRequest = new Request('http://localhost/api/usdbrl', {
      method: 'GET',
      headers: new Headers({
        'origin': 'http://localhost',
      }),
    });

    const response = await fetchUsdBrlData(mockRequest);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    cachedPriceData = {
      price: data.price,
      bid: data.bid,
      ask: data.ask,
      ts: data.ts || Date.now(),
      latency: data.latency,
    };

    lastFetchTime = Date.now();

    // Broadcast para todos os clientes conectados
    broadcastToAllClients(cachedPriceData);

    return cachedPriceData;
  } catch (error) {
    // Se houver cache válido, usar ele
    if (cachedPriceData && Date.now() - lastFetchTime < CACHE_TTL_MS) {
      return cachedPriceData;
    }
    
    throw error;
  }
}

/**
 * Envia dados para todos os clientes SSE conectados
 */
function broadcastToAllClients(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch (error) {
      // Cliente desconectado, remover da lista
      sseClients.delete(client);
    }
  }
}

/**
 * Inicia o polling no servidor
 */
function startServerPolling() {
  // Primeira busca imediata
  fetchAndCachePrice().catch(() => {
    // Erro silencioso - será tentado novamente no próximo intervalo
  });

  // Polling periódico
  setInterval(() => {
    fetchAndCachePrice().catch(() => {
      // Erro silencioso - será tentado novamente no próximo intervalo
    });
  }, FETCH_INTERVAL_MS);
}

/**
 * Handler para endpoint SSE
 */
export function handleSSE(req, res) {
  // Configurar headers SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Desabilitar buffering do nginx

  // CORS - permitir qualquer origin para desenvolvimento e produção
  const origin = req.headers.origin || req.headers.referer || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  // Criar stream de escrita
  const clientStream = {
    write: (data) => {
      try {
        res.write(data);
      } catch (error) {
        // Cliente desconectado
        throw error;
      }
    },
  };

  // Adicionar cliente à lista
  sseClients.add(clientStream);

  // Enviar comentário inicial para estabelecer conexão
  res.write(': connected\n\n');
  
  // Enviar dados em cache imediatamente (se disponível)
  if (cachedPriceData) {
    res.write(`data: ${JSON.stringify(cachedPriceData)}\n\n`);
  } else {
    // Se não houver cache, buscar imediatamente
    fetchAndCachePrice()
      .then((data) => {
        if (data) {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      })
      .catch(() => {
        // Erro silencioso - dados serão enviados no próximo polling
      });
  }

  // Enviar heartbeat a cada 30 segundos para manter conexão viva
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      clearInterval(heartbeatInterval);
      sseClients.delete(clientStream);
    }
  }, 30000);

  // Limpar quando cliente desconectar
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients.delete(clientStream);
  });
}

// Iniciar polling quando o módulo for carregado
startServerPolling();

