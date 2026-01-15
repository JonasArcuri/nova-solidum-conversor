/**
 * Função para buscar candles históricos via API
 */

import { TimeframeConfig } from "./timeframeMap";

export interface Candle {
  time: number; // Unix timestamp em segundos
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Busca candles via endpoint serverless (protegido)
 * Nunca expõe chaves de API ou URLs sensíveis no frontend
 */
export async function fetchCandles(config: TimeframeConfig): Promise<Candle[]> {
  try {
    // Sempre usar endpoint serverless para proteger chaves de API
    const url = `/api/klines?interval=${config.interval}&limit=${config.limit}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      // Não expor detalhes do erro no console do cliente
      throw new Error(`Erro ao buscar dados: ${response.status}`);
    }

    const data = await response.json();

    // Normalizar dados (tanto da Binance quanto do endpoint)
    if (Array.isArray(data) && data.length > 0) {
      // Se já está normalizado (do endpoint)
      if (typeof data[0] === "object" && "time" in data[0] && "open" in data[0]) {
        return data as Candle[];
      }
      
      // Se vem da Binance (array de arrays)
      return data.map((kline: any[]) => ({
        time: Math.floor(kline[0] / 1000), // Converter ms para segundos
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
      }));
    }

    throw new Error("Invalid data format");
  } catch (error) {
    // Não expor detalhes do erro no console do cliente
    throw new Error("Erro ao processar dados do gráfico");
  }
}

