/**
 * Cliente SSE (Server-Sent Events) para dados de mercado USD/BRL
 * Substitui polling HTTP por SSE para reduzir drasticamente requisições ao servidor
 * 
 * Benefícios:
 * - Servidor faz polling uma vez (30s) e distribui para todos os clientes
 * - Reduz de 30 req/min por usuário para 1 req/min total (independente de usuários)
 * - Economia de ~99% nas requisições
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

const SPREAD_BPS_FOR_BID_ASK = 50; // 0.5% spread para calcular Bid/Ask a partir do preço médio
const RECONNECT_DELAY_MS = 3000; // 3 segundos antes de reconectar

/**
 * Calcula Bid e Ask a partir do preço médio usando spread configurável
 */
function calculateBidAsk(midPrice: number, spreadBps: number = SPREAD_BPS_FOR_BID_ASK): { bid: number; ask: number } {
  const spread = midPrice * (spreadBps / 10000);
  const bid = midPrice - spread / 2;
  const ask = midPrice + spread / 2;
  return { bid, ask };
}

/**
 * Conecta ao stream SSE de USD/BRL
 */
export function connectUsdBrlTicker(
  onTick: OnTickCallback,
  onStatus: OnStatusCallback
): { close: () => void } {
  let eventSource: EventSource | null = null;
  let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isIntentionallyClosed = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;

  const clearAllTimers = () => {
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
  };

  const connect = () => {
    if (isIntentionallyClosed) return;

    clearAllTimers();

    // Fechar conexão anterior se existir
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    onStatus("connecting");

    try {
      // Criar conexão SSE
      eventSource = new EventSource("/api/usdbrl/stream");

      // Evento: dados recebidos
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Ignorar heartbeats (mensagens vazias ou apenas ": heartbeat")
          if (!data || (!data.price && !data.bid && !data.ask)) {
            return;
          }

          // Calcular preço médio
          let midPrice: number;
          
          if (data.bid && data.ask && isFinite(parseFloat(data.bid)) && isFinite(parseFloat(data.ask))) {
            const bid = parseFloat(data.bid);
            const ask = parseFloat(data.ask);
            midPrice = (bid + ask) / 2;
          } else if (data.price && isFinite(parseFloat(data.price))) {
            midPrice = parseFloat(data.price);
          } else {
            return; // Dados inválidos
          }

          if (!isFinite(midPrice) || midPrice <= 0) {
            return; // Preço inválido
          }

          // Usar bid/ask da API ou calcular
          let bid: number;
          let ask: number;
          
          if (data.bid && data.ask && isFinite(parseFloat(data.bid)) && isFinite(parseFloat(data.ask))) {
            bid = parseFloat(data.bid);
            ask = parseFloat(data.ask);
          } else {
            const calculated = calculateBidAsk(midPrice, SPREAD_BPS_FOR_BID_ASK);
            bid = calculated.bid;
            ask = calculated.ask;
          }

          const tick: TickerTick = {
            last: midPrice,
            bid: bid,
            ask: ask,
            ts: data.ts || Date.now(),
            latency: data.latency ?? null,
          };

          reconnectAttempts = 0; // Reset contador de tentativas
          onStatus("live");
          onTick(tick);
        } catch (error) {
          // Erro silencioso - próxima mensagem será processada
        }
      };

      // Evento: conexão aberta
      eventSource.onopen = () => {
        reconnectAttempts = 0;
        onStatus("live");
      };

      // Evento: erro na conexão
      eventSource.onerror = () => {
        // Não logar erro se for apenas reconexão automática (readyState CONNECTING)
        if (eventSource?.readyState === EventSource.CONNECTING) {
          // Reconectando automaticamente, não é um erro crítico
          onStatus("reconnecting");
          return;
        }
        
        // Logar apenas erros reais (conexão fechada ou falha)
        if (eventSource?.readyState === EventSource.CLOSED) {
          if (!isIntentionallyClosed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            onStatus("reconnecting");
            
            reconnectTimeoutId = setTimeout(() => {
              connect();
            }, RECONNECT_DELAY_MS * reconnectAttempts); // Backoff exponencial
          } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            onStatus("fallback");
          }
        }
      };
    } catch (error) {
      onStatus("reconnecting");
      
      if (!isIntentionallyClosed && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        reconnectTimeoutId = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS * reconnectAttempts);
      }
    }
  };

  // Iniciar conexão
  connect();

  return {
    close: () => {
      isIntentionallyClosed = true;
      clearAllTimers();
      
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    },
  };
}

