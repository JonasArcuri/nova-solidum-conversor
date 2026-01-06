/**
 * Worker/Scheduler para atualização de cotação USD/BRL
 * Atualiza EXATAMENTE 2 vezes ao dia: 09:00 e 15:00 (horário de Brasília)
 * Usa API existente (Banco Central / AwesomeAPI)
 */

import cron from 'node-cron';
import { updateCache, getCache } from '../cache/usdbrlCache.js';
import { broadcast } from '../sse/sseHub.js';

let isRunning = false;

/**
 * Busca cotação da API existente
 */
async function fetchQuotation() {
  try {
    // Importar função diretamente da API para evitar chamada HTTP interna
    const { GET } = await import('../../api/usdbrl.js');
    const mockRequest = new Request('http://localhost/api/usdbrl', {
      method: 'GET',
      headers: new Headers({
        'Accept': 'application/json',
      }),
    });

    const response = await GET(mockRequest);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // Converter formato da API para formato do cache

    return {
      bid: data.bid || data.price,
      ask: data.ask || data.price,
      spread: (data.ask || data.price) - (data.bid || data.price),
      timestamp: data.ts ? new Date(data.ts).toISOString() : new Date().toISOString(),
      source: 'Banco Central / AwesomeAPI',
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Executa atualização da cotação
 */
async function updateQuotation() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const data = await fetchQuotation();
    updateCache(data);
    broadcast(data);
  } catch (error) {
    // Manter último valor válido do cache
  } finally {
    isRunning = false;
  }
}

/**
 * Inicia o scheduler
 */
function startScheduler() {
  // Atualização às 09:00 BRT
  cron.schedule('0 0 9 * * *', () => {
    updateQuotation();
  }, {
    timezone: 'America/Sao_Paulo',
  });

  // Atualização às 15:00 BRT
  cron.schedule('0 0 15 * * *', () => {
    updateQuotation();
  }, {
    timezone: 'America/Sao_Paulo',
  });

  // Atualização inicial imediata (apenas se cache estiver vazio)
  if (!getCache()) {
    updateQuotation();
  }
}

/**
 * Força atualização manual
 */
async function forceUpdate() {
  await updateQuotation();
}

export { startScheduler, forceUpdate, updateQuotation };
