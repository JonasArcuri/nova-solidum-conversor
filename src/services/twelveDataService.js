/**
 * Serviço de WebSocket para Twelve Data
 * Conexão real-time para cotação USD/BRL
 * 
 * Documentação: https://twelvedata.com/docs#websocket
 */

import WebSocket from 'ws';

const TWELVE_DATA_WS_URL = process.env.TWELVE_DATA_WS_URL || 'wss://ws.twelvedata.com/v1/quotes/price';
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL_MS = 30000; // 30 segundos

let ws = null;
let reconnectTimeoutId = null;
let heartbeatIntervalId = null;
let reconnectAttempts = 0;
let isIntentionallyClosed = false;
let onUpdateCallback = null;
let onErrorCallback = null;
let subscriptionAttempts = 0;
const SYMBOL_FORMATS = ['USD/BRL', 'USDBRL', 'USD/BRL:FX', 'FX:USD/BRL'];

/**
 * Tenta fazer subscription com o formato atual
 */
function trySubscribe() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const symbolFormat = SYMBOL_FORMATS[subscriptionAttempts] || SYMBOL_FORMATS[0];
  const subscribeMessage = {
    action: 'subscribe',
    params: {
      symbols: symbolFormat
    }
  };
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:35',message:'Tentando subscription',data:{subscribeMessage,attempt:subscriptionAttempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  ws.send(JSON.stringify(subscribeMessage));
}

/**
 * Conecta ao WebSocket da Twelve Data
 */
function connect() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:27',message:'connect() chamado',data:{isIntentionallyClosed,hasApiKey:!!TWELVE_DATA_API_KEY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  if (isIntentionallyClosed) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:29',message:'Conexão intencionalmente fechada',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return;
  }

  if (!TWELVE_DATA_API_KEY) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:33',message:'API key não configurada',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.warn('[Twelve Data] API key não configurada. Usando fallback.');
    if (onErrorCallback) {
      onErrorCallback(new Error('API key não configurada'));
    }
    return;
  }

  try {
    // Fechar conexão anterior se existir
    if (ws) {
      ws.removeAllListeners();
      ws.close();
      ws = null;
    }

    // Criar conexão WebSocket
    const wsUrl = `${TWELVE_DATA_WS_URL}?apikey=${TWELVE_DATA_API_KEY}`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:49',message:'Criando WebSocket',data:{wsUrl:wsUrl.replace(TWELVE_DATA_API_KEY,'***')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:64',message:'WebSocket conectado',data:{reconnectAttempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      reconnectAttempts = 0;
      subscriptionAttempts = 0;
      
      // Tentar subscription com primeiro formato
      trySubscribe();
      
      // Iniciar heartbeat
      startHeartbeat();
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:70',message:'Mensagem WebSocket recebida',data:{message,hasEvent:!!message.event,hasType:!!message.type,hasSymbol:!!message.symbol,hasPrice:!!message.price},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion

        // Processar diferentes tipos de mensagem
        if (message.event === 'price' || message.type === 'price') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:88',message:'Evento de preço detectado',data:{message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          handlePriceUpdate(message);
        } else if (message.event === 'subscribe-status') {
          // Processar status de subscription
          if (message.status === 'ok' && message.success && message.success.length > 0) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:93',message:'Subscription bem-sucedida',data:{message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
          } else if (message.status === 'error' && message.fails) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:96',message:'Subscription falhou, tentando formato alternativo',data:{message,attempt:subscriptionAttempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            // Tentar próximo formato
            subscriptionAttempts++;
            if (subscriptionAttempts < SYMBOL_FORMATS.length) {
              setTimeout(() => trySubscribe(), 1000);
            } else {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:100',message:'Todos os formatos falharam',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              if (onErrorCallback) {
                onErrorCallback(new Error('Falha ao subscrever: todos os formatos de símbolo falharam'));
              }
            }
          }
        } else if (message.status === 'ok' || message.action === 'subscribe') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:107',message:'Subscription confirmada (formato antigo)',data:{message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
        } else if (message.event === 'heartbeat' || message.type === 'heartbeat') {
          // Heartbeat do servidor
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'pong' }));
          }
        } else if (message.symbol && message.price) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:114',message:'Mensagem direta com preço recebida',data:{message},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          handlePriceUpdate(message);
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:117',message:'Mensagem não processada',data:{message,keys:Object.keys(message)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
        }
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:92',message:'Erro ao processar mensagem',data:{error:error.message,rawData:data.toString().substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
      }
    });

    ws.on('error', (error) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:96',message:'Erro WebSocket',data:{error:error.message,code:error.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      if (onErrorCallback) {
        onErrorCallback(error);
      }
    });

    ws.on('close', (code, reason) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:102',message:'WebSocket fechado',data:{code,reason:reason?.toString(),isIntentionallyClosed,reconnectAttempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      stopHeartbeat();
      
      if (!isIntentionallyClosed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:107',message:'Agendando reconexão',data:{reconnectAttempts,delay:RECONNECT_DELAY_MS * reconnectAttempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        reconnectTimeoutId = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS * reconnectAttempts);
      } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:110',message:'Máximo de tentativas atingido',data:{reconnectAttempts},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (onErrorCallback) {
          onErrorCallback(new Error('Máximo de tentativas de reconexão atingido'));
        }
      }
    });

  } catch (error) {
    if (onErrorCallback) {
      onErrorCallback(error);
    }
  }
}

/**
 * Processa atualização de preço
 * Formato esperado da Twelve Data:
 * {
 *   "event": "price",
 *   "symbol": "USD/BRL:FX",
 *   "price": "5.1234",
 *   "timestamp": 1234567890
 * }
 */
function handlePriceUpdate(message) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:134',message:'handlePriceUpdate chamado',data:{message,hasCallback:!!onUpdateCallback},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  if (!onUpdateCallback) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:136',message:'Callback não configurado',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    return;
  }

  try {
    // Twelve Data pode enviar price diretamente ou em message.data
    const priceStr = message.price || message.data?.price || message.close;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:141',message:'Extraindo preço',data:{priceStr,hasPrice:!!message.price,hasDataPrice:!!message.data?.price,hasClose:!!message.close},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    if (!priceStr) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:143',message:'Preço não encontrado',data:{message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return;
    }

    const price = parseFloat(priceStr);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:146',message:'Preço parseado',data:{price,isFinite:isFinite(price),isValid:isFinite(price) && price > 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    if (!isFinite(price) || price <= 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:149',message:'Preço inválido',data:{price},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return;
    }

    // Calcular bid/ask a partir do preço (spread de 0.5%)
    const spread = price * 0.005; // 0.5%
    const bid = price - spread / 2;
    const ask = price + spread / 2;

    // Converter timestamp se necessário
    let timestamp = message.timestamp || message.time;
    if (timestamp && typeof timestamp === 'number' && timestamp < 10000000000) {
      // Timestamp em segundos, converter para ISO
      timestamp = new Date(timestamp * 1000).toISOString();
    } else if (timestamp) {
      timestamp = new Date(timestamp).toISOString();
    } else {
      timestamp = new Date().toISOString();
    }

    const data = {
      bid,
      ask,
      spread: ask - bid,
      timestamp,
      source: 'Twelve Data',
    };

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:176',message:'Chamando callback de atualização',data:{data},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    onUpdateCallback(data);
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:178',message:'Erro em handlePriceUpdate',data:{error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
  }
}

/**
 * Inicia heartbeat para manter conexão viva
 */
function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatIntervalId = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: 'ping' }));
    }
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Para o heartbeat
 */
function stopHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

/**
 * Inicia conexão WebSocket
 * @param {Function} onUpdate - Callback chamado a cada atualização
 * @param {Function} onError - Callback chamado em caso de erro
 * @returns {Function} Função para fechar a conexão
 */
function startWebSocket(onUpdate, onError) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'twelveDataService.js:211',message:'startWebSocket chamado',data:{hasOnUpdate:!!onUpdate,hasOnError:!!onError},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  onUpdateCallback = onUpdate;
  onErrorCallback = onError;
  isIntentionallyClosed = false;
  
  connect();
  
  return () => {
    close();
  };
}

/**
 * Fecha conexão WebSocket
 */
function close() {
  isIntentionallyClosed = true;
  
  if (reconnectTimeoutId) {
    clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
  
  stopHeartbeat();
  
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }
  
  onUpdateCallback = null;
  onErrorCallback = null;
}

/**
 * Verifica se está conectado
 */
function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

export { startWebSocket, close, isConnected };

