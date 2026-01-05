/**
 * Componente Mini Chart Widget do TradingView
 * Usa tv-mini-chart widget do TradingView
 */

import { useEffect, useRef, useState } from "react";

interface TradingViewTickerProps {
  symbol?: string;
  locale?: string;
  colorTheme?: "light" | "dark";
}

export function TradingViewTicker({
  symbol = "FX_IDC:USDBRL",
}: TradingViewTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const widgetRef = useRef<HTMLElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setLoadError(null);

    // Limpar widget anterior
    if (widgetRef.current) {
      widgetRef.current.remove();
      widgetRef.current = null;
    }

    // Verificar se script já existe no DOM
    let existingScript = document.getElementById("tradingview-mini-chart-script") as HTMLScriptElement;
    
    if (!existingScript) {
      // Criar script do TradingView Mini Chart
      const script = document.createElement("script");
      script.id = "tradingview-mini-chart-script";
      script.src = "https://widgets.tradingview-widget.com/w/en/tv-mini-chart.js";
      script.type = "module";
      script.async = true;
      
      script.onerror = () => {
        setLoadError("Erro ao carregar o widget do TradingView");
      };

      document.head.appendChild(script);
      scriptRef.current = script;
    }

    // Criar elemento tv-mini-chart
    const widget = document.createElement("tv-mini-chart");
    widget.setAttribute("symbol", symbol);
    
    // Aguardar script carregar se necessário
    const checkAndAppend = () => {
      if (containerRef.current && widget) {
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(widget);
        widgetRef.current = widget;
      }
    };

    // Verificar se script já está carregado (verificando se o módulo está disponível)
    if (existingScript && (window as any).TradingView) {
      checkAndAppend();
    } else {
      // Aguardar carregamento do script
      const timeout = setTimeout(() => {
        checkAndAppend();
      }, 100);
      
      if (existingScript) {
        existingScript.onload = () => {
          clearTimeout(timeout);
          checkAndAppend();
        };
      } else if (scriptRef.current) {
        scriptRef.current.onload = () => {
          clearTimeout(timeout);
          checkAndAppend();
        };
      } else {
        // Se não há script, apenas anexar o widget
        checkAndAppend();
      }
    }

    return () => {
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol]);

  if (loadError) {
    return (
      <div className="ticker-error" style={{ padding: "8px", color: "#6c757d", fontSize: "14px" }}>
        {loadError}
      </div>
    );
  }

  return (
    <div className="tradingview-single-ticker-container">
      <div ref={containerRef} className="tradingview-single-ticker-wrapper" />
    </div>
  );
}

