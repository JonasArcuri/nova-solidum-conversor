/**
 * SSE Hub - Gerencia conexões Server-Sent Events
 * Broadcast único para múltiplos clientes
 */

import { getCache } from '../cache/usdbrlCache.js';

const clients = new Set();
const clientIps = new Map(); // Rastrear IPs para rate limit

/**
 * Adiciona um cliente SSE
 * @param {Object} req - Request do Express
 * @param {Object} res - Response do Express
 */
function addClient(req, res) {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Verificar se já existe conexão para este IP
  if (clientIps.has(clientIp)) {
    // Remover conexão anterior
    const oldClient = clientIps.get(clientIp);
    if (oldClient && clients.has(oldClient)) {
      removeClient(oldClient);
    }
  }

  // Configurar headers SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // CORS
  const origin = req.headers.origin || req.headers.referer || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  const client = {
    res,
    ip: clientIp,
    write: (data) => {
      try {
        res.write(data);
      } catch (error) {
        // Cliente desconectado
        removeClient(client);
        throw error;
      }
    },
  };

  clients.add(client);
  clientIps.set(clientIp, client);

  // Enviar dados em cache imediatamente
  const cached = getCache();
  if (cached) {
    res.write(`data: ${JSON.stringify(cached.data)}\n\n`);
  } else {
    res.write(`: waiting\n\n`);
  }

  // Heartbeat a cada 60 segundos
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      clearInterval(heartbeatInterval);
      removeClient(client);
    }
  }, 60000);

  // Limpar ao desconectar
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    removeClient(client);
  });

  return client;
}

/**
 * Remove um cliente
 * @param {Object} client - Cliente a remover
 */
function removeClient(client) {
  clients.delete(client);
  if (client?.ip) {
    clientIps.delete(client.ip);
  }
}

/**
 * Faz broadcast para todos os clientes conectados
 * @param {Object} data - Dados para enviar
 */
function broadcast(data) {
  if (clients.size === 0) {
    return;
  }

  const message = `data: ${JSON.stringify(data)}\n\n`;
  const clientsToRemove = [];

  for (const client of clients) {
    try {
      client.write(message);
    } catch (error) {
      clientsToRemove.push(client);
    }
  }

  // Remover clientes desconectados
  clientsToRemove.forEach(client => removeClient(client));
}

/**
 * Obtém número de clientes conectados
 * @returns {number}
 */
function getClientCount() {
  return clients.size;
}

export { addClient, removeClient, broadcast, getClientCount };

