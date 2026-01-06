/**
 * Cliente de polling HTTP para dados de mercado USD/BRL
 * Substitui WebSocket da Binance por API de câmbio fiat
 * Simula comportamento de WebSocket usando polling frequente
 * 
 * Migração de USDT/BRL (Binance) para USD/BRL (API Fiat)
 */

export type TickerTick = {
  last: number;
  bid: number;
  ask: number;
  eventTime?: number;
  ts: number;
  latency?: number;
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "fallback";

type OnTickCallback = (tick: TickerTick) => void;
type OnStatusCallback = (status: ConnectionStatus) => void;

// ============================================
// Configuração
// ============================================
const POLL_INTERVAL_MS = 2000; // 2 segundos - atualização frequente para tempo real
const MAX_BACKOFF_MS = 5000;
const INITIAL_BACKOFF_MS = 100;
const SPREAD_BPS_FOR_BID_ASK = 50; // 0.5% spread para calcular Bid/Ask a partir do preço médio

/**
 * Calcula Bid e Ask a partir do preço médio usando spread configurável
 * @param midPrice - Preço médio (mid price) da API
 * @param spreadBps - Spread em basis points (padrão: 50 = 0.5%)
 * @returns Objeto com bid e ask calculados
 */
function calculateBidAsk(midPrice: number, spreadBps: number = SPREAD_BPS_FOR_BID_ASK): { bid: number; ask: number } {
  const spread = midPrice * (spreadBps / 10000);
  const bid = midPrice - spread / 2;
  const ask = midPrice + spread / 2;
  return { bid, ask };
}

export function connectUsdBrlTicker(
  onTick: OnTickCallback,
  onStatus: OnStatusCallback
): { close: () => void } {
  let pollIntervalId: ReturnType<typeof setInterval> | null = null;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;
  let isIntentionallyClosed = false;
  let failureCount = 0;
  let lastSuccessTs = 0;
  let healthCheckIntervalId: ReturnType<typeof setInterval> | null = null;

  const clearAllTimers = () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    if (healthCheckIntervalId) {
      clearInterval(healthCheckIntervalId);
      healthCheckIntervalId = null;
    }
  };

  const fetchPrice = async (): Promise<void> => {
    try {
      const startTime = Date.now();
      
      const response = await fetch("/api/usdbrl", {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }
      
      // SEMPRE calcular o preço médio a partir de bid/ask para garantir precisão
      // Não confiar apenas no data.price que pode estar incorreto ou ser o bid
      let midPrice: number;
      let calculatedFrom: string;
      
      if (data.bid && data.ask && isFinite(parseFloat(data.bid)) && isFinite(parseFloat(data.ask))) {
        // FORÇAR cálculo do preço médio a partir de bid/ask (fonte mais confiável)
        // IGNORAR data.price mesmo se existir, pois pode estar incorreto
        const bid = parseFloat(data.bid);
        const ask = parseFloat(data.ask);
        midPrice = (bid + ask) / 2;
        calculatedFrom = 'bid+ask/2 (FORCED)';
      } else if (data.price && isFinite(parseFloat(data.price))) {
        // Fallback: usar price se bid/ask não estiverem disponíveis
        midPrice = parseFloat(data.price);
        calculatedFrom = 'API price (fallback)';
      } else {
        throw new Error("No valid price data");
      }
      
      const fetchLatency = Date.now() - startTime;

      if (!isFinite(midPrice) || midPrice <= 0) {
        throw new Error("Invalid price");
      }

      // Calcular Bid e Ask a partir do preço médio
      // Se a API já retornar bid/ask, usar esses valores, senão calcular
      let bid: number;
      let ask: number;
      
      if (data.bid && data.ask && isFinite(parseFloat(data.bid)) && isFinite(parseFloat(data.ask))) {
        // API retornou bid/ask válidos, usar esses valores
        bid = parseFloat(data.bid);
        ask = parseFloat(data.ask);
      } else {
        // Calcular bid/ask a partir do preço médio com spread
        const calculated = calculateBidAsk(midPrice, SPREAD_BPS_FOR_BID_ASK);
        bid = calculated.bid;
        ask = calculated.ask;
      }

      const tickTs = Date.now();
      const tick: TickerTick = {
        last: midPrice, // Preço médio como "last"
        bid: bid,
        ask: ask,
        ts: tickTs,
        latency: data.latency ?? fetchLatency,
      };

      failureCount = 0;
      backoffMs = INITIAL_BACKOFF_MS;
      lastSuccessTs = tickTs;
      onStatus("live");
      onTick(tick);
    } catch (error) {
      failureCount++;
      if (failureCount >= 3) {
        onStatus("reconnecting");
      }
    }
  };

  const startPolling = () => {
    if (isIntentionallyClosed) return;

    clearAllTimers();
    onStatus("connecting");

    fetchPrice();
    pollIntervalId = setInterval(() => {
      fetchPrice();
    }, POLL_INTERVAL_MS);
  };

  const reconnect = () => {
    if (isIntentionallyClosed) return;

    clearAllTimers();
    onStatus("reconnecting");
    backoffMs = Math.min(backoffMs * 1.5, MAX_BACKOFF_MS);

    reconnectTimeoutId = setTimeout(() => {
      startPolling();
    }, backoffMs);
  };

  startPolling();

  healthCheckIntervalId = setInterval(() => {
    if (isIntentionallyClosed) return;
    const timeSinceLastSuccess = Date.now() - lastSuccessTs;
    if (timeSinceLastSuccess > 10000 && !reconnectTimeoutId) {
      reconnect();
    }
  }, 5000);

  return {
    close: () => {
      isIntentionallyClosed = true;
      clearAllTimers();
    },
  };
}

