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

const POLL_INTERVAL_MS = 1500; // 1.5 segundos
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdBrlWs.ts:52',message:'Iniciando fetchPrice',data:{url:'/api/usdbrl',env:typeof window!=='undefined'?'browser':'server'},timestamp:Date.now(),sessionId:'debug-session',runId:'prod-debug',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const startTime = Date.now();
      const response = await fetch("/api/usdbrl", {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdBrlWs.ts:60',message:'Resposta recebida',data:{status:response.status,ok:response.ok,statusText:response.statusText,headers:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'prod-debug',hypothesisId:'B'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        // #region agent log
        const errorText = await response.text().catch(()=>'');
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdBrlWs.ts:65',message:'Erro HTTP',data:{status:response.status,statusText:response.statusText,errorText:errorText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'prod-debug',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdBrlWs.ts:72',message:'Dados parseados',data:{hasPrice:!!data.price,price:data.price,hasBid:!!data.bid,hasAsk:!!data.ask,hasError:!!data.error},timestamp:Date.now(),sessionId:'debug-session',runId:'prod-debug',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      const price = parseFloat(data.price);
      const fetchLatency = Date.now() - startTime;

      if (!isFinite(price) || price <= 0) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdBrlWs.ts:78',message:'Preço inválido',data:{price:price,isFinite:isFinite(price)},timestamp:Date.now(),sessionId:'debug-session',runId:'prod-debug',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw new Error("Invalid price");
      }

      const tickTs = Date.now();
      const tick: TickerTick = {
        last: price,
        bid: data.bid ?? price,
        ask: data.ask ?? price,
        ts: data.ts ?? tickTs, // Usar timestamp da API se disponível, senão usar timestamp atual
        latency: data.latency ?? fetchLatency,
      };

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdBrlWs.ts:90',message:'Tick criado com sucesso',data:{last:tick.last,bid:tick.bid,ask:tick.ask,ts:tick.ts,previousLast:lastSuccessTs>0?'exists':'none'},timestamp:Date.now(),sessionId:'debug-session',runId:'prod-debug',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      failureCount = 0;
      backoffMs = INITIAL_BACKOFF_MS;
      lastSuccessTs = tickTs;
      onStatus("live");
      onTick(tick);
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'usdBrlWs.ts:100',message:'Erro capturado',data:{errorMessage:error instanceof Error?error.message:String(error),errorName:error instanceof Error?error.name:'Unknown',failureCount:failureCount+1},timestamp:Date.now(),sessionId:'debug-session',runId:'prod-debug',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
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

