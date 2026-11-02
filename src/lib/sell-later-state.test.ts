import { describe, expect, it } from 'vitest';
import type { SellLaterInputs } from './sell-later';
import { decodeSellLater, encodeSellLater, type SellLaterKey } from './sell-later-state';
import type { FieldSpec } from './types';

const initial: SellLaterInputs = {
  price: 293479,
  deposit: 29500,
  mortgageRate: 0.0517,
  termYears: 30,
  yearsHeld: 5,
  agentFeeRate: 0.014,
  legalSelling: 1500,
};

const spec = (min: number, max: number): FieldSpec => ({
  label: '',
  unit: 'gbp',
  level: 'simple',
  default: null,
  min,
  max,
  step: 1,
  source: '',
});
const specs: Record<SellLaterKey, FieldSpec> = {
  price: spec(10000, 10000000),
  deposit: spec(0, 10000000),
  mortgageRate: spec(0, 0.15),
  termYears: spec(5, 40),
  yearsHeld: spec(1, 40),
};

describe('Sell later links', () => {
  it('writes nothing for the starting figures', () => {
    expect(encodeSellLater(initial, initial)).toBe('');
  });

  it('writes only what changed, in the Rent v buy units', () => {
    const query = encodeSellLater({ ...initial, mortgageRate: 0.0425, yearsHeld: 10 }, initial);
    expect(query).toBe('?mr=4.25&y=10');
  });

  it('round-trips', () => {
    const changed = {
      ...initial,
      price: 320000,
      deposit: 64000,
      mortgageRate: 0.039,
      termYears: 25,
    };
    expect(decodeSellLater(encodeSellLater(changed, initial), initial, specs)).toEqual(changed);
  });

  it('clamps, ignores junk and keeps the deposit and sale year in range', () => {
    const out = decodeSellLater('?p=50000&d=90000&mr=abc&t=10&y=99', initial, specs);
    expect(out.price).toBe(50000);
    expect(out.deposit).toBe(50000);
    expect(out.mortgageRate).toBe(initial.mortgageRate);
    expect(out.termYears).toBe(10);
    expect(out.yearsHeld).toBe(10);
  });
});
