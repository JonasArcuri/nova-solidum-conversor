/**
 * Cliente de polling HTTP para dados de mercado USD/BRL
 * Simula comportamento de WebSocket usando polling frequente
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

const POLL_INTERVAL_MS = 1000; // 1 segundo - atualização mais frequente para tempo real
const MAX_BACKOFF_MS = 5000;
const INITIAL_BACKOFF_MS = 100;

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
      
      const price = parseFloat(data.price);
      const fetchLatency = Date.now() - startTime;

      if (!isFinite(price) || price <= 0) {
        throw new Error("Invalid price");
      }

      const tickTs = Date.now();
      const tick: TickerTick = {
        last: price,
        bid: data.bid ?? price,
        ask: data.ask ?? price,
        ts: tickTs,
        latency: data.latency ?? fetchLatency,
      };

      failureCount = 0;
      backoffMs = INITIAL_BACKOFF_MS;
      lastSuccessTs = tickTs;
      onStatus("live");
      onTick(tick);
    } catch {
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

