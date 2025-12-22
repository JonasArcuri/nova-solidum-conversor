/**
 * Hook para cotação USDT/BRL em tempo real - Alta Performance
 * 
 * Otimizações:
 * 1. Throttle adaptativo baseado em volatilidade
 * 2. Fallback HTTP ultra-rápido (2s polling)
 * 3. Preemptive fallback durante reconexão
 * 4. Indicador de latência
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { connectUsdtBrlTicker, type TickerTick, type ConnectionStatus } from "@/lib/marketdata/binanceWs";
import { applySpread, SPREAD_BPS_DEFAULT } from "@/lib/pricing/spread";

// ============================================
// Configuração de Throttle Otimizada
// ============================================
const THROTTLE_UP_MS = 1000;    // 1 segundo para subida (era 3s)
const THROTTLE_DOWN_MS = 3000;  // 3 segundos para descida (era 10s)
const THROTTLE_VOLATILE_MS = 500; // 500ms quando volátil

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
  const lastEmitTsRef = useRef<number>(0);
  const wsFailureCountRef = useRef<number>(0);
  const lastWsSuccessTsRef = useRef<number>(0);
  const lastDataTsRef = useRef<number>(Date.now());
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preemptiveCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUsingFallbackRef = useRef<boolean>(false);
  const priceHistoryRef = useRef<number[]>([]);

  // Calcular volatilidade baseada nos últimos preços
  const calculateVolatility = useCallback((): number => {
    const history = priceHistoryRef.current;
    if (history.length < 3) return 0;
    
    const recent = history.slice(-10);
    const avg = recent.reduce((a: number, b: number) => a + b, 0) / recent.length;
    const variance = recent.reduce((sum: number, p: number) => sum + Math.pow(p - avg, 2), 0) / recent.length;
    return Math.sqrt(variance) / avg * 100; // Volatilidade em %
  }, []);

  // Determinar throttle baseado em volatilidade
  const getThrottleInterval = useCallback((isUp: boolean): number => {
    const volatility = calculateVolatility();
    
    // Alta volatilidade = atualizações mais frequentes
    if (volatility > 0.5) {
      return THROTTLE_VOLATILE_MS;
    }
    
    return isUp ? THROTTLE_UP_MS : THROTTLE_DOWN_MS;
  }, [calculateVolatility]);

  const emitPrice = useCallback((tick: TickerTick, ts: number, currentSpread?: number) => {
    const spreadToUse = currentSpread ?? spreadBps ?? SPREAD_BPS_DEFAULT;
    const spread = applySpread(tick.last, spreadToUse);

    if (isFinite(spread) && spread > 0) {
      setBasePrice(tick.last);
      setPriceWithSpread(spread);
      setBid(tick.bid);
      setAsk(tick.ask);
      setLastUpdateTs(ts);
      setLatency(tick.latency ?? null);

      lastEmittedPriceRef.current = tick.last;
      lastEmitTsRef.current = ts;
      lastDataTsRef.current = ts;

      // Manter histórico de preços para cálculo de volatilidade
      priceHistoryRef.current.push(tick.last);
      if (priceHistoryRef.current.length > 20) {
        priceHistoryRef.current.shift();
      }
    }
  }, [spreadBps]);

  const handleTick = useCallback((tick: TickerTick) => {
    const now = Date.now();
    const lastEmittedPrice = lastEmittedPriceRef.current;
    const lastEmitTs = lastEmitTsRef.current;
    const currentSpreadBps = spreadBps ?? SPREAD_BPS_DEFAULT;

    // Sempre atualizar latência em tempo real (sem throttle)
    if (tick.latency !== undefined) {
      setLatency(tick.latency);
    }
    
    // Sempre atualizar timestamp de dados recebidos
    lastDataTsRef.current = now;

    // Primeira emissão: publicar imediatamente
    if (lastEmittedPrice === null) {
      emitPrice(tick, now, currentSpreadBps);
      return;
    }

    // Determinar intervalo mínimo baseado na direção e volatilidade
    const isUp = tick.last > lastEmittedPrice;
    const minInterval = getThrottleInterval(isUp);

    // Verificar se passou tempo suficiente
    if (now - lastEmitTs >= minInterval) {
      emitPrice(tick, now, currentSpreadBps);
    }
  }, [emitPrice, spreadBps, getThrottleInterval]);

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
  useEffect(() => {
    preemptiveCheckIntervalRef.current = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTsRef.current;
      
      // Ativar fallback silenciosamente para manter dados fluindo
      if (timeSinceLastData > PREEMPTIVE_FALLBACK_MS && !isUsingFallbackRef.current) {
        startFallback();
      }
      
      // Se temos dados recentes, garantir que status é "live"
      if (timeSinceLastData < 3000 && status !== "live" && status !== "connecting") {
        setStatus("live");
      }
    }, 2000);

    return () => {
      if (preemptiveCheckIntervalRef.current) {
        clearInterval(preemptiveCheckIntervalRef.current);
      }
    };
  }, [startFallback, status]);

  // Recalcular priceWithSpread quando spreadBps mudar
  useEffect(() => {
    if (basePrice !== null) {
      const currentSpreadBps = spreadBps ?? SPREAD_BPS_DEFAULT;
      const newSpread = applySpread(basePrice, currentSpreadBps);
      if (isFinite(newSpread) && newSpread > 0) {
        setPriceWithSpread(newSpread);
      }
    }
  }, [basePrice, spreadBps]);

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
