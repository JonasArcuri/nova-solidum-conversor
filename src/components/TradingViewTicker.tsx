/**
 * Componente Single Quote Widget do TradingView
 * Usa embed-widget-single-quote.js do TradingView
 */

import { useEffect, useRef, useState } from "react";

interface TradingViewTickerProps {
  symbol?: string;
  locale?: string;
  colorTheme?: "light" | "dark";
}

export function TradingViewTicker({
  symbol = "FX_IDC:USDBRL",
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
      const oldScript = document.getElementById("tradingview-single-quote-script");
      if (oldScript) {
        oldScript.remove();
      }
      containerRef.current.innerHTML = "";
    }

    // Criar container com estrutura do widget
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    
    const copyrightDiv = document.createElement("div");
    copyrightDiv.className = "tradingview-widget-copyright";
    copyrightDiv.innerHTML = `<a href="https://www.tradingview.com/symbols/USDBRL/?exchange=FX_IDC" rel="noopener nofollow" target="_blank"><span class="blue-text">USDBRL rate</span></a><span class="trademark"> by TradingView</span>`;
    
    widgetContainer.appendChild(widgetDiv);
    widgetContainer.appendChild(copyrightDiv);
    
    containerRef.current.appendChild(widgetContainer);

    // Criar script do TradingView Single Quote
    const script = document.createElement("script");
    script.id = "tradingview-single-quote-script";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      symbol: symbol,
      colorTheme: colorTheme,
      isTransparent: false,
      locale: locale,
      width: 350,
    });

    script.onerror = () => {
      setLoadError("Erro ao carregar o widget do TradingView");
    };

    widgetDiv.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (scriptRef.current) {
        const scriptElement = document.getElementById("tradingview-single-quote-script");
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

