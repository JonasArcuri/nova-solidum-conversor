/**
 * Cliente WebSocket Binance para ticker USDT/BRL em tempo real
 * Conecta diretamente ao WebSocket da Binance Spot API
 */

export type TickerTick = {
  last: number;
  bid: number;
  ask: number;
  eventTime?: number;
  ts: number;
  latency?: number;
  isSynthetic?: boolean;
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "fallback";

type OnTickCallback = (tick: TickerTick) => void;
type OnStatusCallback = (status: ConnectionStatus) => void;

// ============================================
// Configuração
// ============================================
const WS_URL = "wss://stream.binance.com:9443/ws/usdtbrl@ticker";
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const PING_INTERVAL_MS = 30000; // Ping a cada 30s para manter conexão viva

// ============================================
// Cliente WebSocket Binance
// ============================================
export function connectBinanceWs(
  onTick: OnTickCallback,
  onStatus: OnStatusCallback
): { close: () => void } {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let currentStatus: ConnectionStatus = "connecting";
  let hasEverConnected = false;

  const setStatus = (s: ConnectionStatus) => {
    if (s !== currentStatus) {
      currentStatus = s;
      onStatus(s);
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearPingTimer = () => {
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    
    clearReconnectTimer();
    
    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );
    
    setStatus("reconnecting");
    
    reconnectTimer = setTimeout(() => {
      if (!closed) {
        connect();
      }
    }, delay);
  };

  const startPing = () => {
    clearPingTimer();
    
    // Enviar ping periodicamente para manter conexão viva
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ method: "ping" }));
        } catch (error) {
          console.error("[Binance WS] Erro ao enviar ping:", error);
        }
      }
    }, PING_INTERVAL_MS);
  };

  const connect = () => {
    if (closed) return;

    try {
      setStatus(hasEverConnected ? "reconnecting" : "connecting");
      
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        if (closed) {
          ws?.close();
          return;
        }

        console.log("[Binance WS] Conectado ao WebSocket USDT/BRL");
        reconnectAttempts = 0;
        hasEverConnected = true;
        setStatus("live");
        startPing();
      };

      ws.onmessage = (event) => {
        if (closed) return;

        try {
          const data = JSON.parse(event.data);
          
          // Ignorar mensagens de pong
          if (data.result === null || data.method === "pong") {
            return;
          }

          // Processar dados do ticker
          // Formato Binance ticker 24hr: https://binance-docs.github.io/apidocs/spot/en/#individual-symbol-ticker-streams
          const eventTime = data.E ? Number(data.E) : Date.now();
          const lastPrice = data.c ? parseFloat(data.c) : null;
          const bidPrice = data.b ? parseFloat(data.b) : null;
          const askPrice = data.a ? parseFloat(data.a) : null;

          if (
            lastPrice !== null &&
            bidPrice !== null &&
            askPrice !== null &&
            isFinite(lastPrice) &&
            isFinite(bidPrice) &&
            isFinite(askPrice) &&
            lastPrice > 0 &&
            bidPrice > 0 &&
            askPrice > 0
          ) {
            const now = Date.now();
            const tick: TickerTick = {
              last: lastPrice,
              bid: bidPrice,
              ask: askPrice,
              eventTime,
              ts: now,
              latency: now - eventTime,
              isSynthetic: false,
            };

            onTick(tick);
          }
        } catch (error) {
          console.error("[Binance WS] Erro ao processar mensagem:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("[Binance WS] Erro no WebSocket:", error);
      };

      ws.onclose = () => {
        clearPingTimer();
        
        if (closed) return;

        console.log("[Binance WS] Conexão fechada. Tentando reconectar...");
        reconnectAttempts++;
        scheduleReconnect();
      };
    } catch (error) {
      console.error("[Binance WS] Erro ao criar WebSocket:", error);
      reconnectAttempts++;
      scheduleReconnect();
    }
  };

  // Iniciar conexão
  connect();

  return {
    close: () => {
      closed = true;
      clearReconnectTimer();
      clearPingTimer();
      
      if (ws) {
        try {
          ws.close();
        } catch (error) {
          console.error("[Binance WS] Erro ao fechar WebSocket:", error);
        }
        ws = null;
      }
    },
  };
}
