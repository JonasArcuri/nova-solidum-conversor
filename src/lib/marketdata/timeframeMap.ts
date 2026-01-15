/**
 * Mapeamento de timeframes para intervals e limits da Binance
 */

export type Timeframe = "1H" | "24H" | "7D" | "30D" | "90D" | "1Y" | "MAX";

export interface TimeframeConfig {
  interval: string;
  limit: number;
}

/**
 * Mapeia timeframe para configuração de interval e limit
 * Garante que limit <= 1000 (máximo da Binance)
 */
export function mapTimeframe(timeframe: Timeframe): TimeframeConfig {
  switch (timeframe) {
    case "1H":
      return { interval: "1m", limit: 60 };
    case "24H":
      return { interval: "5m", limit: 288 }; // 24h * 60min / 5min = 288
    case "7D":
      return { interval: "15m", limit: 672 }; // 7d * 24h * 4 = 672
    case "30D":
      return { interval: "1h", limit: 720 }; // 30d * 24h = 720
    case "90D":
      return { interval: "4h", limit: 540 }; // 90d * 24h / 4h = 540
    case "1Y":
      return { interval: "1d", limit: 365 };
    case "MAX":
      return { interval: "1w", limit: 1000 };
    default:
      return { interval: "1h", limit: 720 };
  }
}

/**
 * Whitelist de intervals válidos
 */
export const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

