/**
 * Servidor principal da API USD/BRL
 * Arquitetura cache-first com atualização agendada 2x ao dia
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';
import cors from 'cors';
import usdbrlRoutes from './routes/usdbrl.routes.js';
import { startScheduler } from './worker/usdbrlScheduler.js';
import { GET as getUsdBrl, OPTIONS as optionsUsdBrl } from '../api/usdbrl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy para obter IP real (importante para rate limiting)
app.set('trust proxy', 1);

// Servir arquivos estáticos do build do Vite (se existir)
app.use(express.static(join(__dirname, '../dist')));

// API direta (para o worker usar internamente)
app.options('/api/usdbrl', async (req, res) => {
  try {
    const response = await optionsUsdBrl(req);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/usdbrl', async (req, res) => {
  try {
    const response = await getUsdBrl(req);
    const data = await response.json();
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rotas da API com cache
app.use('/api/usdbrl', usdbrlRoutes);

// Health check
app.get('/health', async (req, res) => {
  try {
    const { getCacheStatus } = await import('./cache/usdbrlCache.js');
    const { getClientCount } = await import('./sse/sseHub.js');
    
    const cacheStatus = getCacheStatus();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      cache: {
        hasData: cacheStatus.hasData,
        lastUpdate: cacheStatus.lastUpdate,
      },
      sse: {
        connectedClients: getClientCount(),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
    });
  }
});

// Fallback: servir index.html para SPA (se dist existir)
app.get('*', async (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
    try {
      const html = await readFile(join(__dirname, '../dist', 'index.html'), 'utf-8');
      res.send(html);
    } catch (error) {
      res.status(404).json({ error: 'Not found' });
    }
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  // Iniciar scheduler de atualização
  startScheduler();
});
