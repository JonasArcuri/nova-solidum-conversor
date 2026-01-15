// server.js
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsing JSON
app.use(express.json());

// Servir arquivos estáticos do build do Vite
app.use(express.static(join(__dirname, 'dist')));

// Importar e registrar rotas de API
import { GET as getUsdBrl, OPTIONS as optionsUsdBrl } from './api/usdbrl.js';
import { GET as getKlines, OPTIONS as optionsKlines } from './api/klines.js';
import { handleSSE } from './server-sse.js';

// API Routes - USD/BRL
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

// Endpoint SSE para streaming de preços (recomendado - mais eficiente)
app.get('/api/usdbrl/stream', (req, res) => {
  handleSSE(req, res);
});

// Endpoint HTTP tradicional (mantido para compatibilidade)
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

// API Routes - Klines
app.options('/api/klines', async (req, res) => {
  try {
    const response = await optionsKlines(req);
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/klines', async (req, res) => {
  try {
    const response = await getKlines(req);
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

// Fallback: servir index.html para todas as rotas não-API (SPA routing)
app.get('*', async (req, res) => {
  if (!req.path.startsWith('/api')) {
    try {
      const html = await readFile(join(__dirname, 'dist', 'index.html'), 'utf-8');
      res.send(html);
    } catch (error) {
      res.status(404).send('Not found');
    }
  }
});

app.listen(PORT, () => {
  // Servidor iniciado
});

