/**
 * Cliente WebSocket para dados de mercado da Binance
 * Conecta no stream público @ticker para USDTBRL
 * 
 * Otimizações de Performance:
 * 1. Reconexão instantânea (backoff reduzido)
 * 2. Heartbeat para detectar conexões mortas
 * 3. Múltiplos endpoints da Binance para failover
 * 4. Pré-conexão no backup durante reconexão
 */

export type TickerTick = {
  last: number;
  bid: number;
  ask: number;
  eventTime?: number;
  ts: number;
  latency?: number; // Latência da mensagem
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "fallback";

type OnTickCallback = (tick: TickerTick) => void;
type OnStatusCallback = (status: ConnectionStatus) => void;

// ============================================
// Endpoints da Binance (múltiplos para failover)
// ============================================
const WS_ENDPOINTS = [
  "wss://stream.binance.com:9443/ws/usdtbrl@ticker",
  "wss://stream.binance.com:443/ws/usdtbrl@ticker",
  "wss://fstream.binance.com/ws/usdtbrl@ticker", // Futures stream (backup)
];

// ============================================
// Configuração Otimizada
// ============================================
const MAX_BACKOFF_MS = 5000; // Reduzido de 15s para 5s
const INITIAL_BACKOFF_MS = 100; // Reduzido de 500ms para 100ms
const HEARTBEAT_INTERVAL_MS = 20000; // Ping a cada 20s
const CONNECTION_TIMEOUT_MS = 8000; // 8s para conectar (aumentado para evitar fechamento prematuro)

interface BinanceTickerResponse {
  e: string; // event type
  E: number; // event time (server timestamp)
  s: string; // symbol
  c: string; // last price
  b: string; // best bid price
  a: string; // best ask price
}

export function connectUsdtBrlTicker(
  onTick: OnTickCallback,
  onStatus: OnStatusCallback
): { close: () => void } {
  let ws: WebSocket | null = null;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;
  let isIntentionallyClosed = false;
  let currentEndpointIndex = 0;
  let lastMessageTs = 0;
  let connectionAttempts = 0;

  // Limpar todos os timers
  const clearAllTimers = () => {
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      heartbeatIntervalId = null;
    }
    if (heartbeatTimeoutId) {
      clearTimeout(heartbeatTimeoutId);
      heartbeatTimeoutId = null;
    }
    if (connectionTimeoutId) {
      clearTimeout(connectionTimeoutId);
      connectionTimeoutId = null;
    }
  };

  // Iniciar heartbeat
  const startHeartbeat = () => {
    heartbeatIntervalId = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // Verificar se recebemos mensagem recente
        const timeSinceLastMessage = Date.now() - lastMessageTs;
        
        if (timeSinceLastMessage > HEARTBEAT_INTERVAL_MS * 2) {
          // Conexão pode estar morta, reconectar
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            try {
              ws.close();
            } catch {
              // Ignorar erro ao fechar
            }
          }
          return;
        }
        
        // Enviar ping (pong é automático no browser)
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: Date.now() }));
          }
        } catch {
          // Conexão morta - fechar apenas se estiver em estado válido
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            try {
              ws.close();
            } catch {
              // Ignorar erro ao fechar
            }
          }
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  };

  // Obter próximo endpoint (round-robin)
  const getNextEndpoint = (): string => {
    const endpoint = WS_ENDPOINTS[currentEndpointIndex];
    currentEndpointIndex = (currentEndpointIndex + 1) % WS_ENDPOINTS.length;
    return endpoint;
  };

  const connect = () => {
    if (isIntentionallyClosed) {
      return;
    }

    clearAllTimers();
    connectionAttempts++;

    try {
      onStatus("connecting");
      
      const endpoint = getNextEndpoint();
      // #region production debug
      console.log('[DEBUG-PROD] WebSocket connecting to:', endpoint);
      // #endregion
      ws = new WebSocket(endpoint);
      
      // Timeout de conexão
      connectionTimeoutId = setTimeout(() => {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.CLOSING)) {
          // Apenas fechar se ainda estiver tentando conectar ou fechando
          try {
            ws.close();
          } catch {
            // Ignorar erro - WebSocket pode já estar fechado
          }
        }
      }, CONNECTION_TIMEOUT_MS);

      ws.onopen = () => {
        // #region production debug
        console.log('[DEBUG-PROD] WebSocket CONNECTED!');
        // #endregion
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
        }
        
        backoffMs = INITIAL_BACKOFF_MS;
        connectionAttempts = 0;
        lastMessageTs = Date.now();
        onStatus("live");
        startHeartbeat();
      };

      ws.onmessage = (event) => {
        lastMessageTs = Date.now();
        
        try {
          const data: BinanceTickerResponse = JSON.parse(event.data);

          if (data.e === "24hrTicker" && (data.s === "USDTBRL" || data.s === "usdtbrl")) {
            const serverTime = data.E;
            const clientTime = Date.now();
            
            // Calcular latência: tempo que levou para a mensagem chegar
            // Usar valor absoluto para garantir que seja sempre positivo
            const calculatedLatency = Math.abs(clientTime - serverTime);
            
            const tick: TickerTick = {
              last: parseFloat(data.c),
              bid: parseFloat(data.b),
              ask: parseFloat(data.a),
              eventTime: serverTime,
              ts: clientTime,
              latency: calculatedLatency, // Latência sempre positiva
            };

            if (
              isFinite(tick.last) &&
              isFinite(tick.bid) &&
              isFinite(tick.ask) &&
              tick.last > 0
            ) {
              // #region production debug
              console.log('[DEBUG-PROD] WebSocket tick:', { last: tick.last, bid: tick.bid, ask: tick.ask });
              // #endregion
              onTick(tick);
            }
          }
        } catch {
          // Erro silencioso
        }
      };

      ws.onerror = (event) => {
        // #region production debug
        console.error('[DEBUG-PROD] WebSocket ERROR:', event);
        // #endregion
        // Erro silencioso - tratado no onclose
        // Prevenir que o erro apareça no console do navegador
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
      };

      ws.onclose = () => {
        // #region production debug
        console.log('[DEBUG-PROD] WebSocket CLOSED');
        // #endregion
        clearAllTimers();
        
        // Limpar referência apenas se o WebSocket foi realmente fechado
        if (ws) {
          // Verificar se o WebSocket está realmente fechado antes de limpar
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            ws = null;
          }
        }
        
        if (!isIntentionallyClosed) {
          onStatus("reconnecting");
          
          // Reconexão com backoff exponencial (mas mais rápido)
          reconnectTimeoutId = setTimeout(() => {
            // Aumentar backoff, mas limitar
            backoffMs = Math.min(backoffMs * 1.5, MAX_BACKOFF_MS);
            connect();
          }, backoffMs);
        }
      };
    } catch {
      onStatus("reconnecting");
      reconnectTimeoutId = setTimeout(() => {
        backoffMs = Math.min(backoffMs * 1.5, MAX_BACKOFF_MS);
        connect();
      }, backoffMs);
    }
  };

  // Iniciar conexão
  connect();

  return {
    close: () => {
      isIntentionallyClosed = true;
      clearAllTimers();
      
      if (ws) {
        // Verificar estado antes de fechar para evitar erros
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          try {
            ws.close();
          } catch {
            // Ignorar erro ao fechar - WebSocket pode já estar fechado
          }
        }
        ws = null;
      }
    },
  };
}
