/**
 * Cliente WebSocket para klines (candlesticks) da Binance
 * Conecta no stream público @kline_<interval> para USDTBRL
 */

export interface KlineCandle {
  time: number; // Unix timestamp em segundos
  open: number;
  high: number;
  low: number;
  close: number;
  isClosed: boolean;
}

type OnCandleUpdateCallback = (candle: KlineCandle, isClosed: boolean) => void;
type OnStatusCallback = (status: "connecting" | "live" | "reconnecting") => void;

const MAX_BACKOFF_MS = 15000;
const INITIAL_BACKOFF_MS = 500;

interface BinanceKlineResponse {
  e: string; // event type
  E: number; // event time
  s: string; // symbol
  k: {
    t: number; // kline start time (ms)
    T: number; // kline close time (ms)
    s: string; // symbol
    i: string; // interval
    o: string; // open price
    c: string; // close price
    h: string; // high price
    l: string; // low price
    v: string; // volume
    n: number; // number of trades
    x: boolean; // is this kline closed?
    q: string; // quote volume
    V: string; // taker buy base volume
    Q: string; // taker buy quote volume
  };
}

export function connectKlineStream(
  interval: string,
  onCandleUpdate: OnCandleUpdateCallback,
  onStatus: OnStatusCallback
): { close: () => void } {
  let ws: WebSocket | null = null;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;
  let isIntentionallyClosed = false;

  const WS_URL = `wss://stream.binance.com:9443/ws/usdtbrl@kline_${interval}`;

  const connect = () => {
    if (isIntentionallyClosed) {
      return;
    }

    try {
      onStatus("connecting");
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        backoffMs = INITIAL_BACKOFF_MS;
        onStatus("live");
      };

      ws.onmessage = (event) => {
        try {
          const data: BinanceKlineResponse = JSON.parse(event.data);

          if (data.e === "kline" && data.s === "USDTBRL") {
            const k = data.k;
            const candle: KlineCandle = {
              time: Math.floor(k.t / 1000), // Converter ms para segundos
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              isClosed: k.x,
            };

            // Validar valores
            if (
              isFinite(candle.open) &&
              isFinite(candle.high) &&
              isFinite(candle.low) &&
              isFinite(candle.close) &&
              candle.open > 0
            ) {
              onCandleUpdate(candle, k.x);
            }
          }
                } catch (error) {
                  // Erro silencioso - não expor detalhes no console do cliente
                }
              };

              ws.onerror = () => {
                // Erro silencioso - não expor detalhes no console do cliente
              };

      ws.onclose = () => {
        ws = null;
        if (!isIntentionallyClosed) {
          onStatus("reconnecting");
          reconnectTimeoutId = setTimeout(() => {
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            connect();
          }, backoffMs);
        }
      };
            } catch (error) {
              // Erro silencioso - não expor detalhes no console do cliente
              onStatus("reconnecting");
      reconnectTimeoutId = setTimeout(() => {
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        connect();
      }, backoffMs);
    }
  };

  connect();

  return {
    close: () => {
      isIntentionallyClosed = true;
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}

