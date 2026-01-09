/**
 * Widget customizado de cotação USD/BRL - Nova Solidum
 * Atualização em tempo real a cada 2 segundos
 */

import { useEffect, useState } from "react";

interface CustomUsdBrlTickerProps {
  price: number | null;
  previousPrice?: number | null;
}

export function CustomUsdBrlTicker({ price, previousPrice }: CustomUsdBrlTickerProps) {
  const [change, setChange] = useState<number>(0);
  const [changePercent, setChangePercent] = useState<number>(0);
  const [isPositive, setIsPositive] = useState<boolean>(true);
  const [animate, setAnimate] = useState<boolean>(false);
  const [hasVariation, setHasVariation] = useState<boolean>(false);

  useEffect(() => {
    if (price !== null) {
      // Se temos preço anterior, calcular variação
      if (previousPrice !== undefined && previousPrice !== null && previousPrice > 0) {
        const diff = price - previousPrice;
        const percent = (diff / previousPrice) * 100;
        
        setChange(diff);
        setChangePercent(percent);
        setIsPositive(diff >= 0);
        setHasVariation(true);
        
        // Animação de flash quando atualiza
        setAnimate(true);
        const timer = setTimeout(() => setAnimate(false), 600);
        return () => clearTimeout(timer);
      } else {
        // Primeira carga - mostrar variação neutra
        setChange(0);
        setChangePercent(0);
        setIsPositive(true);
        setHasVariation(false);
      }
    }
  }, [price, previousPrice]);

  if (price === null) {
    return (
      <div className="custom-ticker">
        <div className="ticker-loading">
          <span className="loading-dot"></span>
          <span className="loading-dot"></span>
          <span className="loading-dot"></span>
        </div>
      </div>
    );
  }

  return (
    <div className={`custom-ticker ${animate ? 'ticker-flash' : ''}`}>
      <div className="ticker-header">
        <span className="ticker-symbol">USDBRL</span>
        <span className="ticker-badge">Nova Solidum</span>
      </div>
      
      <div className="ticker-price-section">
        <span className="ticker-price">
          {new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(price)}
        </span>
      </div>

      {/* Sempre mostrar variação, mesmo que seja 0.00% */}
      <div className={`ticker-change ${hasVariation ? (isPositive ? 'positive' : 'negative') : 'neutral'}`}>
        <span className="change-arrow">
          {hasVariation ? (isPositive ? '▲' : '▼') : '●'}
        </span>
        <span className="change-value">
          {hasVariation ? (isPositive ? '+' : '') : ''}{change.toFixed(4)}
        </span>
        <span className="change-percent">
          ({hasVariation ? (isPositive ? '+' : '') : ''}{changePercent.toFixed(2)}%)
        </span>
      </div>

      <div className="ticker-footer">
        <span className="ticker-source">🇺🇸 U.S. DOLLAR / BRAZILIAN REAL 🇧🇷</span>
        <span className="ticker-live">● AO VIVO</span>
      </div>
    </div>
  );
}
