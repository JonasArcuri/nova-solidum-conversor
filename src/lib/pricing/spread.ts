/**
 * Módulo para aplicação de spread (markup) em preços
 */

export const SPREAD_BPS_DEFAULT = 150; // 1.50% = 150 basis points
export const MIN_SPREAD_POINTS = 0.0025; // Spread mínimo absoluto em pontos

/**
 * Aplica spread (markup) a um preço base
 * Se spread for 0%, retorna o preço base sem modificação
 * Se spread > 0%, garante que o spread mínimo seja sempre 0,0025 pontos
 * @param base - Preço base (deve ser > 0)
 * @param spreadBps - Spread em basis points (padrão: 100 = 1.00%)
 * @returns Preço com spread aplicado, ou preço base se spread for 0%
 * @throws Se base <= 0, retorna NaN
 */
export function applySpread(base: number, spreadBps: number = SPREAD_BPS_DEFAULT): number {
  if (base <= 0 || !isFinite(base)) {
    return NaN;
  }

  if (spreadBps < 0 || !isFinite(spreadBps)) {
    return NaN;
  }

  // Se spread for 0%, retornar preço base sem modificação
  if (spreadBps === 0) {
    return base;
  }

  // Calcular spread percentual
  const priceWithPercentSpread = base * (1 + spreadBps / 10000);
  
  // Garantir spread mínimo de 0,0025 pontos apenas se o spread percentual for menor que o mínimo
  // Se o spread percentual já for maior que o mínimo, usar apenas o spread percentual
  const spreadAmount = priceWithPercentSpread - base;
  const minSpreadAmount = MIN_SPREAD_POINTS;
  
  // Se o spread percentual for menor que o mínimo, usar o mínimo
  if (spreadAmount < minSpreadAmount) {
    return base + minSpreadAmount;
  }
  
  // Caso contrário, retornar o spread percentual
  return priceWithPercentSpread;
}

