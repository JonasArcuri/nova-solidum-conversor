/**
 * Módulo para aplicação de spread (markup) em preços
 */

export const SPREAD_BPS_DEFAULT = 85; // 0.85% = 85 basis points
export const MIN_SPREAD_POINTS = 0.0025; // Spread mínimo absoluto em pontos

/**
 * Aplica spread (markup) a um preço base
 * Garante que o spread mínimo seja sempre 0,0025 pontos
 * @param base - Preço base (deve ser > 0)
 * @param spreadBps - Spread em basis points (padrão: 85 = 0.85%)
 * @returns Preço com spread aplicado, garantindo mínimo de 0,0025 pontos
 * @throws Se base <= 0, retorna NaN
 */
export function applySpread(base: number, spreadBps: number = SPREAD_BPS_DEFAULT): number {
  if (base <= 0 || !isFinite(base)) {
    return NaN;
  }

  if (spreadBps < 0 || !isFinite(spreadBps)) {
    return NaN;
  }

  // Calcular spread percentual
  const priceWithPercentSpread = base * (1 + spreadBps / 10000);
  
  // Garantir spread mínimo de 0,0025 pontos
  const priceWithMinSpread = base + MIN_SPREAD_POINTS;
  
  // Retornar o maior valor (garante o mínimo)
  return Math.max(priceWithPercentSpread, priceWithMinSpread);
}

