import { useState } from "react";
import { useUsdtBrl } from "./hooks/useUsdtBrl";
import { SPREAD_BPS_DEFAULT } from "./lib/pricing/spread";
import { UsdtBrlCandlesChart } from "./components/UsdtBrlCandlesChart";
import { TradingViewTicker } from "./components/TradingViewTicker";
import { type Timeframe } from "./lib/marketdata/timeframeMap";
import logoImage from "./Nova-Solidum.png";
import "./App.css";

type TabType = "quote" | "spread" | "chart";

function App() {
  const [activeTab, setActiveTab] = useState<TabType>("quote");
  const [spreadBps, setSpreadBps] = useState<number>(SPREAD_BPS_DEFAULT);
  const [spreadInputValue, setSpreadInputValue] = useState<string>((SPREAD_BPS_DEFAULT / 100).toFixed(2));
  const [timeframe, setTimeframe] = useState<Timeframe>("24H");
  const { priceWithSpread, basePrice, bid, ask, lastUpdateTs } = useUsdtBrl(spreadBps);

  const formatPrice = (price: number | null): string => {
    if (price === null || !isFinite(price)) {
      return "Carregando...";
    }
    // Formatar com até 4 casas decimais (ex: 5,4698)
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(price);
  };

  const formatSpreadBps = (bps: number): string => {
    return (bps / 100).toFixed(2);
  };

  const handleSpreadInputChange = (value: string) => {
    // Permitir digitação livre - aceitar números, ponto e vírgula
    const cleanedValue = value.replace(/[^0-9,.]/g, '').replace(',', '.');
    setSpreadInputValue(cleanedValue);
    
    // Validar e atualizar spreadBps se for um número válido
    const numValue = parseFloat(cleanedValue);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setSpreadBps(numValue * 100);
    }
  };

  const handleSpreadBlur = () => {
    // Ao sair do campo, garantir que o valor está formatado corretamente
    const numValue = parseFloat(spreadInputValue);
    if (isNaN(numValue) || numValue < 0) {
      setSpreadInputValue((spreadBps / 100).toFixed(2));
    } else if (numValue > 100) {
      setSpreadInputValue("100.00");
      setSpreadBps(10000);
    } else {
      setSpreadInputValue(numValue.toFixed(2));
      setSpreadBps(numValue * 100);
    }
  };

  const formatTimestamp = (ts: number | null): string => {
    if (ts === null) {
      return "";
    }
    return new Date(ts).toLocaleTimeString("pt-BR");
  };

  return (
    <div className="app">
      <header className="main-header">
        <div className="header-content">
          <div className="logo-section">
            <img src={logoImage} alt="Nova Solidum Finances" className="logo-image" />
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="hero-section">
          <h2 className="hero-title">NOVA SOLIDUM</h2>
          <p className="hero-tagline">
            Somos a ponte entre o real e o digital. Transformando ativos digitais em<br />
            soluções reais para o seu dia a dia.
          </p>
        </div>

        <div className="quote-card">
        <h2 className="quote-title">Cotação USD/BRL</h2>
        
        {/* Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === "quote" ? "active" : ""}`}
            onClick={() => setActiveTab("quote")}
          >
            Cotação
          </button>
          <button
            className={`tab ${activeTab === "spread" ? "active" : ""}`}
            onClick={() => setActiveTab("spread")}
          >
            Spread
          </button>
          <button
            className={`tab ${activeTab === "chart" ? "active" : ""}`}
            onClick={() => setActiveTab("chart")}
          >
            Gráfico
          </button>
        </div>

        {/* Tab Content: Cotação */}
        {activeTab === "quote" && (
          <>
            <div className="quote-price">
              <span className="price-value">{formatPrice(priceWithSpread)}</span>
              <p className="price-info">Valor com spread aplicado</p>
            </div>

            {basePrice !== null && (
              <div className="quote-details">
                <div className="detail-row">
                  <span className="detail-label">Preço base:</span>
                  <div className="detail-value-ticker">
                    <TradingViewTicker symbol="FX_IDC:USDBRL" locale="pt_BR" colorTheme="light" />
                  </div>
                </div>
                {bid !== null && (
                  <div className="detail-row">
                    <span className="detail-label">Bid:</span>
                    <span className="detail-value">{formatPrice(bid)}</span>
                  </div>
                )}
                {ask !== null && (
                  <div className="detail-row">
                    <span className="detail-label">Ask:</span>
                    <span className="detail-value">{formatPrice(ask)}</span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="detail-label">Spread aplicado:</span>
                  <span className="detail-value">{formatSpreadBps(spreadBps)}%</span>
                </div>
                {lastUpdateTs !== null && (
                  <div className="detail-row">
                    <span className="detail-label">Última atualização:</span>
                    <span className="detail-value">{formatTimestamp(lastUpdateTs)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="quote-status">
              <span className="status-indicator status-live pulse"></span>
              <span className="status-text">Conectado</span>
            </div>

            {/* Gráfico na aba principal */}
            <div className="chart-section-main">
              <div className="timeframe-buttons">
                {(["1H", "24H", "7D", "30D", "90D", "1Y", "MAX"] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    className={`timeframe-btn ${timeframe === tf ? "active" : ""}`}
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
              <UsdtBrlCandlesChart
                timeframe={timeframe}
                applySpread={true}
                spreadBps={spreadBps}
              />
            </div>
          </>
        )}

        {/* Tab Content: Spread */}
        {activeTab === "spread" && (
          <div className="spread-settings">
            <div className="spread-form">
              <label htmlFor="spread-input" className="spread-label">
                Spread (%)
              </label>
              <div className="spread-input-group">
                <input
                  id="spread-input"
                  type="text"
                  inputMode="decimal"
                  className="spread-input"
                  value={spreadInputValue}
                  onChange={(e) => handleSpreadInputChange(e.target.value)}
                  onBlur={handleSpreadBlur}
                  placeholder="0.85"
                />
                <span className="spread-suffix">%</span>
              </div>
              <div className="spread-info">
                <p className="spread-description">
                  O spread atual é de <strong>{formatSpreadBps(spreadBps)}%</strong> ({spreadBps} basis points).
                </p>
                <p className="spread-example">
                  {basePrice !== null && (
                    <>
                      Exemplo: Preço base {formatPrice(basePrice)} → Com spread {formatPrice(priceWithSpread)}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Gráfico */}
        {activeTab === "chart" && (
          <div className="chart-settings">
            <div className="timeframe-buttons">
              {(["1H", "24H", "7D", "30D", "90D", "1Y", "MAX"] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  className={`timeframe-btn ${timeframe === tf ? "active" : ""}`}
                  onClick={() => setTimeframe(tf)}
                >
                  {tf}
                </button>
              ))}
            </div>
            <UsdtBrlCandlesChart
              timeframe={timeframe}
              applySpread={true}
              spreadBps={spreadBps}
            />
          </div>
        )}
      </div>
      </main>

      <footer className="main-footer">
        <div className="footer-content">
          <div className="footer-top">
            <p className="footer-copyright">
              © 2025 Nova Solidum Finances LTDA. Todos os direitos reservados | 
              <a href="#" className="footer-link">Termos de Uso</a> | 
              <a href="#" className="footer-link">Políticas de Compliance</a> | 
              <a href="#" className="footer-link">Suporte</a>
            </p>
          </div>
          
          <div className="footer-disclaimer">
            <p>
              <strong>Disclaimer</strong> - A Nova Solidum Finances é uma Prestadora de Serviços de Ativos Virtuais (PSAV), constituída no território brasileiro, inscrita no CNPJ sob o nº 63.010.454/0001-63, com a finalidade de prestar serviços de intermediação em operações com ativos virtuais — compreendendo compra e/ou venda de criptoativos. A empresa é classificada como intermediária, nos termos da Consulta Pública nº 109/2024 do Banco Central do Brasil. O licenciamento junto ao Banco Central será requerido tão logo o regulador inicie a fase de adequação legal, etapa que, até o presente momento, ainda não foi formalmente implementada. Não há necessidade de registro da CVM, uma vez que não se trata de operações/serviços com valores mobiliários.
            </p>
          </div>

          <div className="footer-logo">
            <img src={logoImage} alt="Nova Solidum Finances" className="footer-logo-image" />
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

