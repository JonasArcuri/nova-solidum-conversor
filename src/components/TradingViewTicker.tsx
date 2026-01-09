/**
 * Componente Single Quote Widget do NetDania (via TradingView)
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
    copyrightDiv.innerHTML = `<a href="https://www.tradingview.com/symbols/USDBRL/?exchange=FX_IDC" rel="noopener nofollow" target="_blank"><span class="blue-text">USDBRL rate</span></a><span class="trademark"> by NetDania</span>`;
    
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
      setLoadError("Erro ao carregar o widget do NetDania");
    };

    widgetDiv.appendChild(script);
    scriptRef.current = script;

    // Remover logo e desabilitar TODOS os links após carregar
    const startTime = Date.now();
    const intervalId = setInterval(() => {
      if (containerRef.current) {
        // Remover todos os logos/imagens do TradingView
        const images = containerRef.current.querySelectorAll('img');
        images.forEach(img => {
          if (img.src?.includes('tradingview') || img.alt?.includes('TradingView')) {
            img.style.display = 'none';
            img.style.visibility = 'hidden';
            img.remove();
          }
        });

        // Desabilitar TODOS os links (não apenas TradingView)
        const allLinks = containerRef.current.querySelectorAll('a');
        allLinks.forEach(link => {
          link.removeAttribute('href');
          link.removeAttribute('onclick');
          link.removeAttribute('target');
          link.style.pointerEvents = 'none';
          link.style.cursor = 'default';
          link.style.textDecoration = 'none';
          link.onclick = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
        });

        // Bloquear cliques em toda a área do widget
        const widgetDivs = containerRef.current.querySelectorAll('div');
        widgetDivs.forEach(div => {
          div.style.pointerEvents = 'none';
          div.onclick = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
        });

        // Bloquear iframes
        const iframes = containerRef.current.querySelectorAll('iframe');
        iframes.forEach(iframe => {
          iframe.style.pointerEvents = 'none';
        });

        // Após 5 segundos, parar de checar
        if (Date.now() - startTime > 5000) {
          clearInterval(intervalId);
        }
      }
    }, 100);

    return () => {
      clearInterval(intervalId);
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
    <div className="tradingview-single-ticker-container" style={{ position: 'relative' }}>
      <div ref={containerRef} className="tradingview-single-ticker-wrapper" />
      {/* Overlay transparente para bloquear absolutamente todos os cliques */}
      <div 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          zIndex: 9999,
          cursor: 'default',
          pointerEvents: 'auto'
        }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />
    </div>
  );
}

