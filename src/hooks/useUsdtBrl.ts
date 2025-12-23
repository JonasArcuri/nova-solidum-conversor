/**
 * Hook para cotação USDT/BRL em tempo real - Alta Performance
 * 
 * Otimizações:
 * 1. Atualização em tempo real (sem throttle)
 * 2. Fallback HTTP ultra-rápido (2s polling)
 * 3. Preemptive fallback durante reconexão
 * 4. Indicador de latência
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { connectUsdtBrlTicker, type TickerTick, type ConnectionStatus } from "@/lib/marketdata/binanceWs";
import { applySpread, SPREAD_BPS_DEFAULT, MIN_SPREAD_POINTS } from "@/lib/pricing/spread";

// ============================================
// Configuração de Fallback Otimizada
// ============================================
const MAX_WS_FAILURES = 2;        // Reduzido para 2 para ativar fallback mais rapidamente
const FALLBACK_POLL_INTERVAL = 2000; // 2 segundos (era 5s)
const PREEMPTIVE_FALLBACK_MS = 3000; // Ativar fallback após 3s sem dados (reduzido de 5s)

export interface UseUsdtBrlReturn {
  basePrice: number | null;
  priceWithSpread: number | null;
  bid: number | null;
  ask: number | null;
  lastUpdateTs: number | null;
  status: ConnectionStatus;
  latency: number | null;
}

export function useUsdtBrl(spreadBps?: number): UseUsdtBrlReturn {
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [priceWithSpread, setPriceWithSpread] = useState<number | null>(null);
  const [bid, setBid] = useState<number | null>(null);
  const [ask, setAsk] = useState<number | null>(null);
  const [lastUpdateTs, setLastUpdateTs] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [latency, setLatency] = useState<number | null>(null);

  const lastEmittedPriceRef = useRef<number | null>(null);
  const wsFailureCountRef = useRef<number>(0);
  const lastWsSuccessTsRef = useRef<number>(0);
  const lastDataTsRef = useRef<number>(Date.now());
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preemptiveCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUsingFallbackRef = useRef<boolean>(false);

  const emitPrice = useCallback((tick: TickerTick, ts: number, currentSpread?: number) => {
    const spreadToUse = currentSpread ?? spreadBps ?? SPREAD_BPS_DEFAULT;
    
    // Preço base do Nova Solidum = Preço TradingView + spread mínimo (0.0035)
    const novaSolidumBasePrice = tick.last + MIN_SPREAD_POINTS;
    
    // Aplicar spread percentual sobre o preço base do Nova Solidum
    const spread = applySpread(novaSolidumBasePrice, spreadToUse);

    if (isFinite(spread) && spread > 0 && isFinite(novaSolidumBasePrice) && novaSolidumBasePrice > 0) {
      setBasePrice(novaSolidumBasePrice);
      setPriceWithSpread(spread);
      setBid(tick.bid);
      setAsk(tick.ask);
      setLastUpdateTs(ts);
      setLatency(tick.latency ?? null);

      lastEmittedPriceRef.current = tick.last;
      lastDataTsRef.current = ts;
    }
  }, [spreadBps]);

  const handleTick = useCallback((tick: TickerTick) => {
    const now = Date.now();
    const currentSpreadBps = spreadBps ?? SPREAD_BPS_DEFAULT;

    // Sempre atualizar latência em tempo real
    if (tick.latency !== undefined) {
      setLatency(tick.latency);
    }
    
    // Sempre atualizar timestamp de dados recebidos
    lastDataTsRef.current = now;

    // Atualizar imediatamente em tempo real (sem throttle)
    emitPrice(tick, now, currentSpreadBps);
  }, [emitPrice, spreadBps]);

  // Função para buscar preço via HTTP (fallback otimizado)
  const fetchPriceFromFallback = useCallback(async (): Promise<void> => {
    try {
      const startTime = Date.now();
      const response = await fetch("/api/usdtbrl", {
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

  // Parar fallback
  const stopFallback = useCallback(() => {
    if (!isUsingFallbackRef.current) return;
    
    isUsingFallbackRef.current = false;
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);

  const handleStatus = useCallback((newStatus: ConnectionStatus) => {
    // Sempre mostrar "live" para o usuário (UX suave)
    // Internamente gerenciamos reconexão e fallback silenciosamente
    if (newStatus === "live") {
      setStatus("live");
      lastWsSuccessTsRef.current = Date.now();
      wsFailureCountRef.current = 0;
      stopFallback();
    } else if (newStatus === "connecting") {
      // Primeira conexão - mostrar conectando
      if (lastWsSuccessTsRef.current === 0) {
        setStatus("connecting");
      }
      // Reconexões subsequentes - manter "live" visualmente
    } else if (newStatus === "reconnecting") {
      // Não notificar usuário sobre reconexão - manter "live"
      // Apenas gerenciar fallback silenciosamente
      const timeSinceLastSuccess = Date.now() - lastWsSuccessTsRef.current;
      
      // Incrementar contador de falhas mais rapidamente
      if (timeSinceLastSuccess > 3000 || lastWsSuccessTsRef.current === 0) {
        wsFailureCountRef.current += 1;
      }

      // Ativar fallback silenciosamente para manter dados fluindo
      // Ativar mais rapidamente se nunca teve sucesso ou após poucas falhas
      if (wsFailureCountRef.current >= MAX_WS_FAILURES || lastWsSuccessTsRef.current === 0) {
        startFallback();
      }
    }
  }, [startFallback, stopFallback]);

  // Verificação preemptiva: se não receber dados por X segundos, ativar fallback silenciosamente
  // Usar refs para evitar dependências instáveis que causam recriações
  const startFallbackRef = useRef(startFallback);
  const statusRef = useRef(status);
  
  // Atualizar refs quando valores mudam
  useEffect(() => {
    startFallbackRef.current = startFallback;
    statusRef.current = status;
  }, [startFallback, status]);

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

  // Recalcular priceWithSpread APENAS quando spreadBps mudar (não quando basePrice mudar)
  // O emitPrice já atualiza priceWithSpread quando basePrice muda, então não precisamos recalcular aqui
  useEffect(() => {
    if (basePrice !== null) {
      const currentSpreadBps = spreadBps ?? SPREAD_BPS_DEFAULT;
      const newSpread = applySpread(basePrice, currentSpreadBps);
      if (isFinite(newSpread) && newSpread > 0) {
        setPriceWithSpread(newSpread);
      }
    }
  }, [spreadBps]); // Removido basePrice das dependências - emitPrice já cuida disso

  // Conectar ao WebSocket
  useEffect(() => {
    let wsConnection: { close: () => void } | null = null;

    wsConnection = connectUsdtBrlTicker(handleTick, handleStatus);

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
  };
}
