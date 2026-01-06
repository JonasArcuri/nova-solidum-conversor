/**
 * Middleware de Rate Limiting
 * REST: 30 req/min por IP
 * SSE: 1 conexão ativa por IP
 */

import rateLimit from 'express-rate-limit';

/**
 * Rate limit para endpoints REST
 */
export const restRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 requisições por minuto
  message: {
    error: 'Muitas requisições. Limite: 30 req/min por IP.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Middleware para verificar conexões SSE duplicadas por IP
 */
export function sseConnectionLimit(req, res, next) {
  // Este middleware será usado no handler SSE
  // A lógica de 1 conexão por IP está implementada no sseHub.js
  next();
}

