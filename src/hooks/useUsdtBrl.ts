/**
 * Hook para cotação USD/BRL em tempo real via polling HTTP
 * 
 * Usa polling HTTP para buscar atualizações da API
 * Compatível com Vercel (serverless functions)
 * 
 * Otimizações:
 * 1. Polling HTTP a cada 2 segundos
 * 2. Cálculo de Bid/Ask a partir do preço médio
 * 3. Indicador de latência
 * 4. Recalculo automático do spread quando o input mudar
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { connectUsdBrlTicker, type TickerTick, type ConnectionStatus } from "@/lib/marketdata/usdBrlPolling";
import { applySpread, SPREAD_BPS_DEFAULT } from "@/lib/pricing/spread";

// ============================================
// Configuração - SSE é a única fonte de dados
// ============================================

export interface UseUsdtBrlReturn {
  basePrice: number | null;
  priceWithSpread: number | null;
  bid: number | null;
  ask: number | null;
  lastUpdateTs: number | null;
  status: ConnectionStatus;
  latency: number | null;
  updateKey: number; // Chave de atualização para forçar re-render mesmo quando valores são iguais
}

export function useUsdtBrl(spreadBps?: number): UseUsdtBrlReturn {
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [priceWithSpread, setPriceWithSpread] = useState<number | null>(null);
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [lastUpdateTs, setLastUpdateTs] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [latency, setLatency] = useState<number | null>(null);
  const [updateKey, setUpdateKey] = useState<number>(0);

  const lastEmittedPriceRef = useRef<number | null>(null);
  const wsFailureCountRef = useRef<number>(0);
  const lastWsSuccessTsRef = useRef<number>(0);
  const lastDataTsRef = useRef<number>(Date.now());
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preemptiveCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUsingFallbackRef = useRef<boolean>(false);
  const lastBasePriceRef = useRef<number | null>(null);
  const lastBidRef = useRef<number | null>(null);
  const lastAskRef = useRef<number | null>(null);

  const emitPrice = useCallback((tick: TickerTick, ts: number, currentSpread?: number) => {
    // Preço base do Nova Solidum = Preço médio da API de câmbio fiat
    const novaSolidumBasePrice = tick.last;

    if (isFinite(novaSolidumBasePrice) && novaSolidumBasePrice > 0) {
      // Atualizar apenas o preço base e dados de mercado
      // O spread será recalculado pelo useEffect quando basePrice ou spreadBps mudar
      setBasePrice(novaSolidumBasePrice);
      setBid(tick.bid);
      setAsk(tick.ask);
      setLastUpdateTs(ts);
      setLatency(tick.latency ?? null);
      // Usar timestamp único para forçar re-render mesmo com valores similares
      setUpdateKey(ts);

      lastEmittedPriceRef.current = tick.last;
      lastDataTsRef.current = ts;
      lastBasePriceRef.current = novaSolidumBasePrice;
      lastBidRef.current = tick.bid;
      lastAskRef.current = tick.ask;
    }
  }, []);

  const handleTick = useCallback((tick: TickerTick) => {
    const now = Date.now();
    const currentSpreadBps = spreadBps ?? SPREAD_BPS_DEFAULT;

    // Sempre atualizar latência em tempo real
    if (tick.latency !== undefined) {
      setLatency(tick.latency);
    }
    
    // Sempre atualizar timestamp de dados recebidos (usar timestamp do tick se disponível)
    const dataTs = tick.ts ?? now;
    lastDataTsRef.current = dataTs;

    // SEMPRE chamar emitPrice para garantir que o spread seja recalculado
    // mesmo que o preço seja muito similar, o spread deve ser recalculado
    // Isso garante que o valor com spread atualiza conforme a variação da moeda
    // E que Bid/Ask sejam atualizados a cada 30s via SSE
    emitPrice(tick, dataTs, currentSpreadBps);
  }, [emitPrice, spreadBps]);

  // Função para buscar preço via HTTP (fallback - não utilizado atualmente)
  const fetchPriceFromFallback = useCallback(async (): Promise<void> => {
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
      const price = parseFloat(data.price);
      const fetchLatency = Date.now() - startTime;

      if (isFinite(price) && price > 0) {
        const tick: TickerTick = {
          last: price,
          bid: data.bid ?? price,
          ask: data.ask ?? price,
          ts: data.ts || Date.now(),
          latency: data.latency ?? fetchLatency,
        };
        handleTick(tick);
        wsFailureCountRef.current = 0;
      }
    } catch {
      // Erro silencioso
    }
  }, [handleTick]);

  // Iniciar fallback (silencioso - não muda status visual)
  const startFallback = useCallback(() => {
    if (isUsingFallbackRef.current) return;
    
    // Limpar intervalo anterior se existir (evitar vazamento)
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    
    isUsingFallbackRef.current = true;
    // Não mudar status - manter "live" para UX suave
    
    // Primeira chamada imediata
    fetchPriceFromFallback();
    
    // Polling rápido
    fallbackIntervalRef.current = setInterval(() => {
      fetchPriceFromFallback();
    }, FALLBACK_POLL_INTERVAL);
  }, [fetchPriceFromFallback]);

  // Parar fallback (mantido para uso futuro se necessário)
  const _stopFallback = useCallback(() => {
    if (!isUsingFallbackRef.current) return;
    
    isUsingFallbackRef.current = false;
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);
  void _stopFallback; // Silenciar warning de variável não utilizada

  const handleStatus = useCallback((newStatus: ConnectionStatus) => {
    if (newStatus === "live") {
      setStatus("live");
      lastWsSuccessTsRef.current = Date.now();
      wsFailureCountRef.current = 0;
    } else if (newStatus === "connecting") {
      setStatus("connecting");
    } else if (newStatus === "reconnecting") {
      setStatus("reconnecting");
    }
  }, []);

  // Verificação preemptiva: se não receber dados por X segundos, ativar fallback silenciosamente
  // Usar refs para evitar dependências instáveis que causam recriações
  const startFallbackRef = useRef(startFallback);
  const statusRef = useRef(status);
  
  // Atualizar refs quando valores mudam
  useEffect(() => {
    startFallbackRef.current = startFallback;
    statusRef.current = status;
  }, [startFallback, status]);

  // DESABILITADO: O fallback preemptivo estava interferindo com o WebSocket
  // O WebSocket da Binance é a fonte principal e não precisa de fallback
  // Se o WebSocket falhar, o handleStatus vai gerenciar a reconexão
  /*
  useEffect(() => {
    // Limpar intervalo anterior antes de criar novo (evitar vazamento)
    if (preemptiveCheckIntervalRef.current) {
      clearInterval(preemptiveCheckIntervalRef.current);
      preemptiveCheckIntervalRef.current = null;
    }
    preemptiveCheckIntervalRef.current = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTsRef.current;
      
      // Ativar fallback silenciosamente para manter dados fluindo (usar ref)
      if (timeSinceLastData > PREEMPTIVE_FALLBACK_MS && !isUsingFallbackRef.current) {
        startFallbackRef.current();
      }
      
      // Se temos dados recentes, garantir que status é "live" (usar ref)
      if (timeSinceLastData < 3000 && statusRef.current !== "live" && statusRef.current !== "connecting") {
        setStatus("live");
      }
    }, 2000);

    return () => {
      if (preemptiveCheckIntervalRef.current) {
        clearInterval(preemptiveCheckIntervalRef.current);
        preemptiveCheckIntervalRef.current = null;
      }
    };
  }, []); // Sem dependências - usa refs para valores atualizados
  */

  // Recalcular priceWithSpread quando spreadBps OU basePrice mudar
  // Isso garante que quando o usuário alterar o input do spread, o valor seja recalculado imediatamente
  useEffect(() => {
    if (basePrice !== null) {
      const currentSpreadBps = spreadBps ?? SPREAD_BPS_DEFAULT;
      const newSpread = applySpread(basePrice, currentSpreadBps);
      if (isFinite(newSpread) && newSpread > 0) {
        setPriceWithSpread(newSpread);
      }
    }
  }, [spreadBps, basePrice]); // Recalcular quando spreadBps OU basePrice mudar

  // Usar refs para estabilizar callbacks e evitar recriação do polling
  const handleTickRef = useRef(handleTick);
  const handleStatusRef = useRef(handleStatus);
  
  useEffect(() => {
    handleTickRef.current = handleTick;
    handleStatusRef.current = handleStatus;
  }, [handleTick, handleStatus]);

  // Conectar ao polling HTTP (substitui WebSocket)
  useEffect(() => {
    let connection: { close: () => void } | null = null;

    // Criar wrappers estáveis que usam as refs atualizadas
    const stableHandleTick = (tick: TickerTick) => {
      handleTickRef.current(tick);
    };
    
    const stableHandleStatus = (status: ConnectionStatus) => {
      handleStatusRef.current(status);
    };

    connection = connectUsdBrlTicker(stableHandleTick, stableHandleStatus);

    return () => {
      if (connection) {
        connection.close();
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
      if (preemptiveCheckIntervalRef.current) {
        clearInterval(preemptiveCheckIntervalRef.current);
      }
    };
  }, []); // Sem dependências - usa refs para valores atualizados

  return {
    basePrice,
    priceWithSpread,
    bid,
    ask,
    lastUpdateTs,
    status,
    latency,
    updateKey,
  };
}
