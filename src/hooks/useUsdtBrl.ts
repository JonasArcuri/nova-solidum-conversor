/**
 * Hook para cotação USD/BRL em tempo real - Alta Performance
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
    
    // Preço base do Nova Solidum = Preço TradingView + spread mínimo (0.0025)
    const novaSolidumBasePrice = tick.last + MIN_SPREAD_POINTS;
    
    // SEMPRE recalcular spread baseado no novo preço da API
    // O spread é recalculado a cada tick, garantindo que atualiza conforme a variação da moeda
    // Mesmo mudanças pequenas no preço resultam em mudanças proporcionais no spread
    const spread = applySpread(novaSolidumBasePrice, spreadToUse);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUsdtBrl.ts:emitPrice',message:'emitPrice called',data:{tickLast:tick.last,tickBid:tick.bid,tickAsk:tick.ask,novaSolidumBasePrice,spread,isValid:isFinite(spread)&&spread>0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    // #region production debug
    console.log('[DEBUG-PROD] emitPrice called', { tickBid: tick.bid, tickAsk: tick.ask, novaSolidumBasePrice, spread, isValid: isFinite(spread) && spread > 0 });
    // #endregion

    if (isFinite(spread) && spread > 0 && isFinite(novaSolidumBasePrice) && novaSolidumBasePrice > 0) {
      // SEMPRE atualizar todos os valores e o updateKey para forçar re-render
      // O updateKey sempre muda (baseado no timestamp), garantindo que o React detecta a mudança
      // mesmo quando os valores numéricos são iguais
      setBasePrice(novaSolidumBasePrice);
      setPriceWithSpread(spread);
      setBid(tick.bid);
      setAsk(tick.ask);
      setLastUpdateTs(ts);
      setLatency(tick.latency ?? null);
      setUpdateKey(ts); // Usar timestamp como chave de atualização - sempre muda

      // #region production debug
      console.log('[DEBUG-PROD] State updated', { basePrice: novaSolidumBasePrice, bid: tick.bid, ask: tick.ask, updateKey: ts });
      // #endregion

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

  // Função para buscar preço via HTTP (fallback otimizado)
  const fetchPriceFromFallback = useCallback(async (): Promise<void> => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUsdtBrl.ts:fetchPriceFromFallback',message:'fetchPriceFromFallback START',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    try {
      const startTime = Date.now();
      const response = await fetch("/api/usdbrl", {
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });
      
      if (!response.ok) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUsdtBrl.ts:fetchPriceFromFallback',message:'HTTP response NOT OK',data:{status:response.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      const price = parseFloat(data.price);
      const fetchLatency = Date.now() - startTime;

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUsdtBrl.ts:fetchPriceFromFallback',message:'API response received',data:{price,bid:data.bid,ask:data.ask,rawData:data,isValidPrice:isFinite(price)&&price>0},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

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
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUsdtBrl.ts:fetchPriceFromFallback',message:'Fetch ERROR',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/1dd75be7-d846-4b5f-a704-c8ee3a50d84e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useUsdtBrl.ts:handleStatus',message:'Status changed',data:{newStatus,wsFailureCount:wsFailureCountRef.current,lastWsSuccessTs:lastWsSuccessTsRef.current},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
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
    updateKey,
  };
}
