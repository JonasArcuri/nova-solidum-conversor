import { describe, it, expect } from "vitest";
import { applySpread, SPREAD_BPS_DEFAULT } from "./spread";

describe("applySpread", () => {
  it("deve aplicar spread padrão de 0.7% (70 bps)", () => {
    const base = 100;
    const expected = base * 1.007; // 100.7
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
    const expected = 5.25 * 1.007;
    expect(result).toBeCloseTo(expected, 4);
  });
});

