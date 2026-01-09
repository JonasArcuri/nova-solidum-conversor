/**
 * Cliente de polling HTTP para dados de mercado USD/BRL.
 * Ajustado para polling rápido quando a aba está visível e
 * economiza quando está oculta, com backoff e abort de requisições.
 */

export type TickerTick = {
  last: number;
  bid: number;
  ask: number;
  eventTime?: number;
  ts: number;
  latency?: number;
  isSynthetic?: boolean; // true quando bid/ask são derivados de mid
};

export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "fallback";

type OnTickCallback = (tick: TickerTick) => void;
type OnStatusCallback = (status: ConnectionStatus) => void;

// ============================================
// Configuração
// ============================================
const POLL_VISIBLE_MS = 2000; // 2s quando aba visível
const POLL_HIDDEN_MS = 15000; // 15s quando aba oculta (economia)
const MAX_BACKOFF_MS = 60000; // limite de backoff
const FAILS_BEFORE_RECONNECTING = 3;
const SPREAD_BPS_FOR_BID_ASK = 50; // 0.5% spread para calcular Bid/Ask a partir do preço médio
const FETCH_TIMEOUT_MS = 8000; // timeout de fetch para evitar pendurar em rede ruim

function getPollMs(): number {
  if (typeof document === "undefined") return POLL_VISIBLE_MS;
  return document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * 250);
}

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
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFails = 0;
  let abort: AbortController | null = null;
  let hasEverSucceeded = false;
  let hasEverBeenLive = false;
  let currentStatus: ConnectionStatus = "connecting";

  const setStatus = (s: ConnectionStatus) => {
    if (s !== currentStatus) {
      currentStatus = s;
      onStatus(s);
    }
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = null;
  };

  const scheduleNext = (delayMs: number) => {
    clearTimer();
    if (closed) return;
    timer = setTimeout(pollOnce, delayMs);
  };

  const pollOnce = async (): Promise<void> => {
    if (closed) return;

    // Evitar "piscar" de connecting: só antes do primeiro sucesso ou se está degradado
    if (!hasEverSucceeded || consecutiveFails > 0) {
      setStatus("connecting");
    }

    // Evitar overlap de requisições
    abort?.abort();
    abort = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        abort?.abort();
      } catch {
        // ignore
      }
    }, FETCH_TIMEOUT_MS);

    const startedAt = Date.now();

    try {
      const response = await fetch("/api/usdbrl", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: abort.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.error) throw new Error(data.error);

      // Calcular mid a partir de bid/ask quando disponível; fallback para price
      const bidRaw = data.bid;
      const askRaw = data.ask;

      const bidParsed = bidRaw !== undefined && bidRaw !== null ? Number(bidRaw) : NaN;
      const askParsed = askRaw !== undefined && askRaw !== null ? Number(askRaw) : NaN;

      const hasBidAsk = Number.isFinite(bidParsed) && Number.isFinite(askParsed);

      let midPrice: number;
      if (hasBidAsk) {
        midPrice = (bidParsed + askParsed) / 2;
      } else if (data.price != null && Number.isFinite(Number(data.price))) {
        midPrice = Number(data.price);
      } else {
        throw new Error("No valid price data");
      }

      const fetchLatency = Date.now() - startedAt;

      if (!isFinite(midPrice) || midPrice <= 0) {
        throw new Error("Invalid price");
      }

      // Calcular Bid e Ask a partir do preço médio
      let bid: number;
      let ask: number;

      let isSynthetic = false;

      if (hasBidAsk) {
        bid = bidParsed;
        ask = askParsed;
      } else {
        const calculated = calculateBidAsk(midPrice, SPREAD_BPS_FOR_BID_ASK);
        bid = calculated.bid;
        ask = calculated.ask;
        isSynthetic = true;
      }

      const tick: TickerTick = {
        last: midPrice, // Preço médio como "last"
        bid,
        ask,
        ts: Date.now(),
        latency: data.latency ?? fetchLatency,
        isSynthetic,
      };

      consecutiveFails = 0;
      hasEverSucceeded = true;
      hasEverBeenLive = true;
      setStatus("live");
      onTick(tick);

      scheduleNext(jitter(getPollMs()));
    } catch (error: any) {
      if (closed) return;

      // Se foi abortado (visibilidade/overlap/close), não conta como falha
      if (error?.name === "AbortError") {
        return;
      }

      consecutiveFails++;
      if (consecutiveFails >= FAILS_BEFORE_RECONNECTING) {
        setStatus("reconnecting");
      } else {
        // Não "piscamos" para connecting se já estava live e sem falhas
        if (!hasEverBeenLive) {
          setStatus("connecting");
        } else {
          setStatus("connecting");
        }
      }

      const backoff = Math.min(MAX_BACKOFF_MS, getPollMs() * Math.pow(2, consecutiveFails));
      scheduleNext(jitter(backoff));
    } finally {
      // sempre limpar timeout de fetch
      // timeoutId é block-scoped; capturamos via closure
      // (não precisa de variáveis externas)
      // clearTimeout em finally garante que não fica pendurado
      // mesmo se o fetch abortar ou falhar
      // Obs: timeoutId existe no escopo do try/catch/finally
      // então fazemos clearTimeout aqui:
      // (typescript aceita por estar no mesmo bloco lexical)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      clearTimeout(timeoutId);
    }
  };

  // Reagir à visibilidade da aba: força quando volta a ficar visível; modo econômico quando oculta
  const handleVisibility = () => {
    if (closed) return;
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      scheduleNext(0); // volta para aba: atualiza na hora
    } else {
      scheduleNext(jitter(getPollMs())); // oculta: respeita intervalo econômico
    }
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibility);
  }

  // Iniciar polling
  scheduleNext(0);

  return {
    close: () => {
      closed = true;
      clearTimer();
      abort?.abort();

      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    },
  };
}

