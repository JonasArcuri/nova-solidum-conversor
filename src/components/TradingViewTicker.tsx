/**
 * Componente Single Ticker Widget do TradingView
 * Usa script do TradingView para carregar o widget
 */

import { useEffect, useRef, useState } from "react";

interface TradingViewTickerProps {
  symbol?: string;
  locale?: string;
  colorTheme?: "light" | "dark";
}

export function TradingViewTicker({
  symbol = "BINANCE:USDTBRL",
  locale = "pt_BR",
  colorTheme = "light",
}: TradingViewTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    setLoadError(null);

    // Limpar script anterior
    if (scriptRef.current) {
      const oldScript = document.getElementById("tradingview-single-ticker-script");
      if (oldScript) {
        oldScript.remove();
      }
      containerRef.current.innerHTML = "";
    }

    // Criar container com ID único
    const containerId = `tradingview_single_ticker_${Date.now()}`;
    containerRef.current.id = containerId;
    containerRef.current.innerHTML = "";

    // Criar script do TradingView
    const script = document.createElement("script");
    script.id = "tradingview-single-ticker-script";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: symbol,
      locale: locale,
      colorTheme: colorTheme,
      isTransparent: false,
      displayMode: "regular",
      noTimeframe: false,
      container_id: containerId,
    });

    script.onerror = () => {
      setLoadError("Erro ao carregar o widget do TradingView");
    };

    containerRef.current.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (scriptRef.current) {
        const scriptElement = document.getElementById("tradingview-single-ticker-script");
        if (scriptElement) {
          scriptElement.remove();
        }
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [symbol, locale, colorTheme]);

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

