import { describe, it, expect } from 'vitest';
import { PROPINA_RATE, IVA_RATE, TAX_MULTIPLIER } from '../ecuador-tax';

describe('Ecuador tax constants', () => {
  it('TAX_MULTIPLIER should equal 1.25', () => {
    expect(TAX_MULTIPLIER).toBe(1.25);
  });

  it('TAX_MULTIPLIER should equal 1 + PROPINA_RATE + IVA_RATE', () => {
    expect(TAX_MULTIPLIER).toBe(1 + PROPINA_RATE + IVA_RATE);
  });

  it('100 * TAX_MULTIPLIER should equal 125', () => {
    expect(100 * TAX_MULTIPLIER).toBe(125);
  });
});
