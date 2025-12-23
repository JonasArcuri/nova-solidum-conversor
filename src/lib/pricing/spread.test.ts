import { describe, it, expect } from "vitest";
import { applySpread, SPREAD_BPS_DEFAULT, MIN_SPREAD_POINTS } from "./spread";

describe("applySpread", () => {
  it("deve aplicar spread padrão de 0.85% (85 bps)", () => {
    const base = 100;
    const expected = base * 1.0085; // 100.85
    const result = applySpread(base);
    expect(result).toBeCloseTo(expected, 2);
  });

  it("deve aplicar spread customizado", () => {
    const base = 100;
    const spreadBps = 100; // 1%
    const expected = base * 1.01; // 101
    const result = applySpread(base, spreadBps);
    expect(result).toBeCloseTo(expected, 2);
  });

  it("deve garantir spread mínimo de 0,0025 pontos", () => {
    const base = 5.25;
    const spreadBps = 0; // 0% - spread mínimo deve ser aplicado
    const result = applySpread(base, spreadBps);
    const expected = base + MIN_SPREAD_POINTS; // 5.2525
    expect(result).toBeCloseTo(expected, 4);
  });

  it("deve usar spread percentual quando maior que o mínimo", () => {
    const base = 5.25;
    const spreadBps = 100; // 1% = 0.0525 pontos (maior que 0.0025)
    const result = applySpread(base, spreadBps);
    const expected = base * 1.01; // 5.3025
    expect(result).toBeCloseTo(expected, 4);
  });

  it("deve retornar NaN para base <= 0", () => {
    expect(applySpread(0)).toBeNaN();
    expect(applySpread(-10)).toBeNaN();
  });

  it("deve retornar NaN para spreadBps inválido", () => {
    expect(applySpread(100, -10)).toBeNaN();
    expect(applySpread(100, Infinity)).toBeNaN();
  });

  it("deve funcionar com valores reais de mercado", () => {
    const base = 5.25; // Exemplo de preço USDT/BRL
    const result = applySpread(base, SPREAD_BPS_DEFAULT);
    const expected = 5.25 * 1.0085;
    expect(result).toBeCloseTo(expected, 4);
  });
});

