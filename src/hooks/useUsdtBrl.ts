/**
 * Hook para cotação USD/BRL via polling HTTP
 * 
 * Usa polling HTTP para buscar atualizações da API
 * Compatível com Vercel (serverless functions)
 * 
 * Otimizações:
 * 1. Polling HTTP 1 vez por dia (24 horas)
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
  const lastDataTsRef = useRef<number>(Date.now());
  const lastBasePriceRef = useRef<number | null>(null);
  const lastBidRef = useRef<number | null>(null);
  const lastAskRef = useRef<number | null>(null);

  const emitPrice = useCallback((tick: TickerTick, ts: number) => {
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
    emitPrice(tick, dataTs);
  }, [emitPrice]);

  // Fallback removido - usando apenas polling HTTP direto

  const handleStatus = useCallback((newStatus: ConnectionStatus) => {
    if (newStatus === "live") {
      setStatus("live");
    } else if (newStatus === "connecting") {
      setStatus("connecting");
    } else if (newStatus === "reconnecting") {
      setStatus("reconnecting");
    }
  }, []);

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
