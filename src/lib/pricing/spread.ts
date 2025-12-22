/**
 * Módulo para aplicação de spread (markup) em preços
 */

export const SPREAD_BPS_DEFAULT = 85; // 0.85% = 85 basis points

/**
 * Aplica spread (markup) a um preço base
 * @param base - Preço base (deve ser > 0)
 * @param spreadBps - Spread em basis points (padrão: 85 = 0.85%)
 * @returns Preço com spread aplicado (base * (1 + spreadBps/10000))
 * @throws Se base <= 0, retorna NaN
 */
export function applySpread(base: number, spreadBps: number = SPREAD_BPS_DEFAULT): number {
  if (base <= 0 || !isFinite(base)) {
    return NaN;
  }

  if (spreadBps < 0 || !isFinite(spreadBps)) {
    return NaN;
  }

  return base * (1 + spreadBps / 10000);
}

