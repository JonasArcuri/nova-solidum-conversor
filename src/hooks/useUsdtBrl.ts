/**
 * Hook para cotação USD/BRL em tempo real - Alta Performance
 * 
 * Migrado de USDT/BRL (Binance WebSocket) para USD/BRL (API Fiat)
 * 
 * Otimizações:
 * 1. Atualização em tempo real via polling HTTP (2s)
 * 2. Multi-source com fallback automático
 * 3. Cálculo de Bid/Ask a partir do preço médio
 * 4. Indicador de latência
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { connectUsdBrlTicker, type TickerTick, type ConnectionStatus } from "@/lib/marketdata/usdBrlPolling";
import { applySpread, SPREAD_BPS_DEFAULT } from "@/lib/pricing/spread";

// ============================================
// Configuração (fallback desabilitado - WebSocket é fonte única)
// ============================================
const FALLBACK_POLL_INTERVAL = 2000; // Mantido para referência futura

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
    const spreadToUse = currentSpread ?? spreadBps ?? SPREAD_BPS_DEFAULT;
    
    // Preço base do Nova Solidum = Preço médio da API de câmbio fiat
    const novaSolidumBasePrice = tick.last;
    
    // Aplicar spread percentual sobre o preço base
    // O spread mínimo (0.0025) é garantido dentro da função applySpread
    const spread = applySpread(novaSolidumBasePrice, spreadToUse);

    if (isFinite(spread) && spread > 0 && isFinite(novaSolidumBasePrice) && novaSolidumBasePrice > 0) {
      setBasePrice(novaSolidumBasePrice);
      setPriceWithSpread(spread);
      setBid(tick.bid);
      setAsk(tick.ask);
      setLastUpdateTs(ts);
      setLatency(tick.latency ?? null);
      setUpdateKey(ts);

      lastEmittedPriceRef.current = tick.last;
      lastDataTsRef.current = ts;
      lastBasePriceRef.current = novaSolidumBasePrice;
      lastBidRef.current = tick.bid;
      lastAskRef.current = tick.ask;
    }
  }, [spreadBps]);

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

  // Recalcular priceWithSpread APENAS quando spreadBps mudar (não quando basePrice mudar)
  // O emitPrice já recalcula o spread quando basePrice muda via handleTick
  // Este useEffect é apenas para quando o usuário altera o spread manualmente
  useEffect(() => {
    if (basePrice !== null) {
      const currentSpreadBps = spreadBps ?? SPREAD_BPS_DEFAULT;
      const newSpread = applySpread(basePrice, currentSpreadBps);
      if (isFinite(newSpread) && newSpread > 0) {
        setPriceWithSpread(newSpread);
      }
    }
  }, [spreadBps]); // Apenas quando spreadBps mudar - emitPrice já cuida de atualizar quando basePrice muda

  // Conectar ao WebSocket
  useEffect(() => {
    let wsConnection: { close: () => void } | null = null;

    wsConnection = connectUsdBrlTicker(handleTick, handleStatus);

    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
      if (preemptiveCheckIntervalRef.current) {
        clearInterval(preemptiveCheckIntervalRef.current);
      }
    };
  }, [handleTick, handleStatus]);

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
