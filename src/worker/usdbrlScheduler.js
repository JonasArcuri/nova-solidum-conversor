/**
 * Worker para atualização de cotação USD/BRL via WebSocket
 * Usa WebSocket real-time (Twelve Data) ao invés de polling
 */

import { updateCache, getCache } from '../cache/usdbrlCache.js';
import { broadcast } from '../sse/sseHub.js';
import { startWebSocket, close as closeWebSocket } from '../services/twelveDataService.js';
import { fetchQuotation } from '../services/quotationPollingService.js';

let stopWebSocket = null;
let isInitialized = false;

/**
 * Handler para atualização de cotação via WebSocket
 */
function handleUpdate(data) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:17',message:'handleUpdate chamado',data:{data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  // #endregion
  updateCache(data);
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:19',message:'Cache atualizado, fazendo broadcast',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
  // #endregion
  broadcast(data);
}

/**
 * Handler para erros do WebSocket
 */
function handleError(error) {
  // Se WebSocket falhar e não houver cache, tentar fallback uma vez
  if (!getCache()) {
    fetchQuotation()
      .then((data) => {
        handleUpdate(data);
      })
      .catch(() => {
        // Erro silencioso
      });
  }
}

/**
 * Inicia o worker de WebSocket
 */
function startWorker() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:41',message:'startWorker chamado',data:{isInitialized,hasCache:!!getCache()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (isInitialized) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:43',message:'Worker já inicializado',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return;
  }

  isInitialized = true;

  // Se cache estiver vazio, fazer primeira busca via fallback
  if (!getCache()) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:49',message:'Cache vazio, buscando fallback',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    fetchQuotation()
      .then((data) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:52',message:'Fallback bem-sucedido',data:{data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        handleUpdate(data);
      })
      .catch((err) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:55',message:'Fallback falhou',data:{error:err.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
      });
  }

  // Iniciar WebSocket real-time
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdbrlScheduler.js:60',message:'Iniciando WebSocket',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  stopWebSocket = startWebSocket(handleUpdate, handleError);
}

/**
 * Para o worker
 */
function stopWorker() {
  if (stopWebSocket) {
    stopWebSocket();
    stopWebSocket = null;
    isInitialized = false;
  }
}

/**
 * Força atualização manual (usa fallback)
 */
async function forceUpdate() {
  try {
    const data = await fetchQuotation();
    handleUpdate(data);
  } catch (error) {
    handleError(error);
  }
}

// Manter compatibilidade com código existente
const startScheduler = startWorker;

export { startScheduler, startWorker, stopWorker, forceUpdate };
