/**
 * Rotas para cotação USD/BRL
 * Cache-first: retorna apenas do cache (nunca faz fetch externo)
 */

import express from 'express';
import { getCache } from '../cache/usdbrlCache.js';
import { addClient } from '../sse/sseHub.js';
import { forceUpdate } from '../worker/usdbrlScheduler.js';
import { restRateLimit } from '../middlewares/rateLimit.js';

const router = express.Router();

/**
 * GET /api/usdbrl
 * Retorna cotação do cache (nunca faz fetch externo)
 */
router.get('/', restRateLimit, (req, res) => {
  const cache = getCache();

  if (!cache) {
    return res.status(503).json({
      error: 'Cotação não disponível',
      message: 'Aguardando primeira atualização',
    });
  }

  res.json({
    symbol: 'USD/BRL',
    bid: cache.data.bid,
    ask: cache.data.ask,
    spread: cache.data.spread,
    timestamp: cache.data.timestamp,
    source: cache.data.source,
    lastUpdate: cache.lastUpdate,
  });
});

/**
 * GET /api/usdbrl/stream
 * Server-Sent Events para broadcast de atualizações
 */
router.get('/stream', (req, res) => {
  addClient(req, res);
});

/**
 * POST /api/usdbrl/force-refresh
 * Força atualização manual (protegido por header secreto)
 */
router.post('/force-refresh', (req, res) => {
  const secretHeader = req.headers['x-force-refresh-secret'];
  const expectedSecret = process.env.FORCE_REFRESH_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return res.status(403).json({
      error: 'Acesso negado',
    });
  }

  forceUpdate()
    .then(() => {
      res.json({
        success: true,
        message: 'Atualização forçada iniciada',
        timestamp: new Date().toISOString(),
      });
    })
    .catch((error) => {
      res.status(500).json({
        error: 'Erro ao forçar atualização',
      });
    });
});

export default router;
