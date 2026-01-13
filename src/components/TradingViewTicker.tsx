
import { useEffect, useRef, memo } from 'react';

function TradingViewTicker() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(
    () => {
      if (container.current && !container.current.querySelector("script")) {
        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = `
        {
          "symbol": "BINANCE:USDTBRL",
          "width": "100%",
          "isTransparent": true,
          "colorTheme": "dark",
          "locale": "br"
        }`;
        container.current.appendChild(script);
      }
    },
    []
  );

  return (
    <div className="tradingview-widget-container" ref={container}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}

export default memo(TradingViewTicker);
