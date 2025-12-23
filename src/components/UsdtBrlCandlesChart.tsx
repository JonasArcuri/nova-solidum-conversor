/**
 * Componente de gráfico candlestick para USDT/BRL
 * Usa TradingView Advanced Chart Widget
 * 
 * Segurança:
 * - Script carregado apenas de domínio confiável (s3.tradingview.com)
 * - Validação de origem do script antes do carregamento
 * - Fallback para mensagem de erro se script falhar
 */

import { useEffect, useRef, useState } from "react";
import { type Timeframe } from "@/lib/marketdata/timeframeMap";

interface UsdtBrlCandlesChartProps {
  timeframe: Timeframe;
  applySpread?: boolean;
  spreadBps?: number;
}

// URL confiável do TradingView (única fonte permitida)
const TRADINGVIEW_SCRIPT_URL = "https://s3.tradingview.com/tv.js";
const TRADINGVIEW_TRUSTED_DOMAIN = "s3.tradingview.com";

// Mapear timeframe para intervalo do TradingView
function mapTimeframeToTradingView(timeframe: Timeframe): string {
  const mapping: Record<Timeframe, string> = {
    "1H": "60",   // 1 hora
    "24H": "240", // 4 horas (mais próximo de 24h)
    "7D": "1D",   // 1 dia
    "30D": "1D",  // 1 dia
    "90D": "1W",  // 1 semana
    "1Y": "1M",   // 1 mês
    "MAX": "1M",  // 1 mês
  };
  return mapping[timeframe] || "240";
}

/**
 * Valida se a URL do script é de um domínio confiável
 */
function isScriptUrlTrusted(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === TRADINGVIEW_TRUSTED_DOMAIN && parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

export function UsdtBrlCandlesChart({
  timeframe,
  applySpread: _shouldApplySpread = false,
  spreadBps: _spreadBps = 0,
}: UsdtBrlCandlesChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Resetar estado de erro
    setLoadError(null);

    // Validar URL do script antes de carregar (segurança)
    if (!isScriptUrlTrusted(TRADINGVIEW_SCRIPT_URL)) {
      setLoadError("Erro de segurança: fonte do gráfico não confiável");
      return;
    }

    // Limpar container antes de criar novo widget
    while (containerRef.current.firstChild) {
      containerRef.current.removeChild(containerRef.current.firstChild);
    }

    // Criar container para o widget
    const containerId = `tradingview_${Date.now()}`;
    containerRef.current.id = containerId;

    // Verificar se TradingView já está carregado (reutilizar script existente)
    if ((window as any).TradingView) {
      createWidget();
      return;
    }

    // Verificar se script já existe no DOM (evitar duplicação)
    let existingScript = document.getElementById("tradingview-widget-script") as HTMLScriptElement;
    
    if (existingScript) {
      // Script já existe, aguardar carregamento
      if (existingScript.onload) {
        // Já tem handler, adicionar nosso handler também
        const originalOnload = existingScript.onload;
        existingScript.onload = function (e) {
          if (typeof originalOnload === "function") {
            originalOnload.call(this, e);
          }
          createWidget();
        };
      } else {
        existingScript.onload = () => createWidget();
      }
      scriptRef.current = existingScript;
      return;
    }

    // Criar script do TradingView com validações de segurança
    const script = document.createElement("script");
    script.id = "tradingview-widget-script";
    script.src = TRADINGVIEW_SCRIPT_URL;
    script.async = true;
    
    // Timeout para detectar falha de carregamento
    const loadTimeout = setTimeout(() => {
      setLoadError("Tempo esgotado ao carregar o gráfico");
    }, 15000);

    script.onload = () => {
      clearTimeout(loadTimeout);
      createWidget();
    };

    script.onerror = () => {
      clearTimeout(loadTimeout);
      setLoadError("Falha ao carregar recursos do gráfico");
    };

    // Adicionar script ao documento apenas se não existir
    document.head.appendChild(script);
    scriptRef.current = script;

    // Função auxiliar para criar widget
    function createWidget() {
      if (!containerRef.current || !(window as any).TradingView) {
        setLoadError("Erro ao inicializar o gráfico");
        return;
      }

      const interval = mapTimeframeToTradingView(timeframe);
      
      // Criar widget do TradingView com configurações seguras
      try {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: "BINANCE:USDTBRL", // Símbolo USDT/BRL na Binance
          interval: interval,
          timezone: "America/Sao_Paulo",
          theme: "light",
          style: "1", // Estilo candlestick
          locale: "pt_BR",
          toolbar_bg: "#f1f3f6",
          enable_publishing: false,
          allow_symbol_change: false, // Desabilitar mudança de símbolo (segurança)
          hide_top_toolbar: true, // Ocultar barra superior (remove links externos)
          hide_legend: false,
          save_image: false,
          container_id: containerRef.current.id,
          height: 650,
          width: "100%",
          studies: [
            "Volume@tv-basicstudies",
          ],
        });
      } catch {
        setLoadError("Erro ao criar o gráfico");
      }
    }

    return () => {
      clearTimeout(loadTimeout);
      // Limpar apenas o container, não remover o script (pode ser usado por outros componentes)
      if (containerRef.current) {
        while (containerRef.current.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild);
        }
      }
      // Não remover o script do DOM - pode ser reutilizado
      // O script só será removido quando o componente for desmontado pela última vez
      scriptRef.current = null;
    };
  }, [timeframe]);

  // Renderizar mensagem de erro se houver falha
  if (loadError) {
    return (
      <div className="chart-container">
        <div 
          className="chart-error" 
          style={{ 
            width: "100%", 
            height: "650px", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            backgroundColor: "#f8f9fa",
            borderRadius: "8px",
            color: "#6c757d"
          }}
        >
          <p>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div ref={containerRef} className="chart-wrapper" style={{ width: "100%", height: "650px" }} />
    </div>
  );
}

