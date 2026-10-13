import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MINUS, formatMoney, formatPercent, formatYears, parseMoney, parsePercent } from './format';

describe('MINUS', () => {
  it('is U+2212, not a hyphen', () => {
    expect(MINUS).toBe('−');
    expect(MINUS).not.toBe('-');
  });
});

describe('formatMoney', () => {
  it('formats whole pounds with commas by default', () => {
    expect(formatMoney(300000)).toBe('£300,000');
    expect(formatMoney(1234567)).toBe('£1,234,567');
    expect(formatMoney(999)).toBe('£999');
    expect(formatMoney(0)).toBe('£0');
  });

  it('rounds to whole pounds, halves away from zero', () => {
    expect(formatMoney(1336.15)).toBe('£1,336');
    expect(formatMoney(1336.5)).toBe('£1,337');
    expect(formatMoney(-1336.5)).toBe(`${MINUS}£1,337`);
    expect(formatMoney(0.49)).toBe('£0');
  });

  it('uses a true minus sign before the pound sign for negatives', () => {
    expect(formatMoney(-1200)).toBe(`${MINUS}£1,200`);
    expect(formatMoney(-1200)).not.toContain('-');
  });

  it('never shows a negative zero', () => {
    expect(formatMoney(-0)).toBe('£0');
    expect(formatMoney(-0.4)).toBe('£0');
    expect(formatMoney(-0.004, { pence: true })).toBe('£0.00');
    expect(formatMoney(-0.4, { signed: true })).toBe('£0');
  });

  it('shows pence when asked', () => {
    expect(formatMoney(1336.15, { pence: true })).toBe('£1,336.15');
    expect(formatMoney(1615.3249, { pence: true })).toBe('£1,615.32');
    expect(formatMoney(1615.325, { pence: true })).toBe('£1,615.33');
    expect(formatMoney(4099, { pence: true })).toBe('£4,099.00');
    expect(formatMoney(-0.5, { pence: true })).toBe(`${MINUS}£0.50`);
  });

  it('rounds decimal halves as written, not as stored', () => {
    // 1.005 is stored as 1.00499999...; it should still read as £1.01.
    expect(formatMoney(1.005, { pence: true })).toBe('£1.01');
  });

  it('adds a plus sign for positive differences when signed', () => {
    expect(formatMoney(93336, { signed: true })).toBe('+£93,336');
    expect(formatMoney(-93336, { signed: true })).toBe(`${MINUS}£93,336`);
    expect(formatMoney(0, { signed: true })).toBe('£0');
    expect(formatMoney(12.5, { signed: true, pence: true })).toBe('+£12.50');
  });

  it('returns an empty string for values that are not finite numbers', () => {
    expect(formatMoney(Number.NaN)).toBe('');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatMoney(Number.NEGATIVE_INFINITY)).toBe('');
  });

  it('never throws and never contains a hyphen-minus', () => {
    fc.assert(
      fc.property(fc.double(), fc.boolean(), fc.boolean(), (value, pence, signed) => {
        const out = formatMoney(value, { pence, signed });
        expect(out).not.toContain('-');
      }),
    );
  });

  it('parses back to the rounded value', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), (pennies) => {
        const value = pennies / 100;
        expect(parseMoney(formatMoney(value, { pence: true }))).toBe(value);
        expect(parseMoney(formatMoney(value))).toBe(
          Math.sign(value) * Math.round(Math.abs(value)) || 0,
        );
      }),
    );
  });
});

describe('formatPercent', () => {
  it('shows rates to 2 decimal places by default', () => {
    expect(formatPercent(0.043)).toBe('4.30%');
    expect(formatPercent(0.0425)).toBe('4.25%');
    expect(formatPercent(0.05)).toBe('5.00%');
    expect(formatPercent(0)).toBe('0.00%');
  });

  it('takes the number of decimals', () => {
    expect(formatPercent(0.03, { decimals: 1 })).toBe('3.0%');
    expect(formatPercent(0.014, { decimals: 1 })).toBe('1.4%');
    expect(formatPercent(0.025, { decimals: 0 })).toBe('3%');
    expect(formatPercent(0.0435, { decimals: 1 })).toBe('4.4%');
  });

  it('appends "a year" when asked', () => {
    expect(formatPercent(0.03, { decimals: 1, perYear: true })).toBe('3.0% a year');
    expect(formatPercent(0.05, { perYear: true })).toBe('5.00% a year');
  });

  it('uses a true minus sign and never shows a negative zero', () => {
    expect(formatPercent(-0.005, { decimals: 1 })).toBe(`${MINUS}0.5%`);
    expect(formatPercent(-0.00001, { decimals: 1 })).toBe('0.0%');
    expect(formatPercent(-0, { decimals: 1 })).toBe('0.0%');
  });

  it('adds a plus sign when signed', () => {
    expect(formatPercent(0.01, { decimals: 0, signed: true })).toBe('+1%');
    expect(formatPercent(-0.01, { decimals: 0, signed: true })).toBe(`${MINUS}1%`);
    expect(formatPercent(0, { decimals: 0, signed: true })).toBe('0%');
  });

  it('uses commas for large percentages', () => {
    expect(formatPercent(12.5, { decimals: 0 })).toBe('1,250%');
  });

  it('copes with silly decimals without throwing', () => {
    expect(formatPercent(0.043, { decimals: -3 })).toBe('4%');
    expect(formatPercent(0.043, { decimals: 1.6 })).toBe('4.30%');
    expect(formatPercent(0.043, { decimals: 99 })).toBe('4.3000000000%');
    expect(formatPercent(0.043, { decimals: Number.NaN })).toBe('4.30%');
  });

  it('returns an empty string for values that are not finite numbers', () => {
    expect(formatPercent(Number.NaN)).toBe('');
    expect(formatPercent(Number.POSITIVE_INFINITY, { perYear: true })).toBe('');
  });

  it('parses back to the same rate at 2 decimal places', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: 100000 }), (basisPoints) => {
        const rate = basisPoints / 10000;
        const text = formatPercent(rate);
        expect(text).not.toContain('-');
        expect(parsePercent(text)).toBe(rate);
      }),
    );
  });
});

describe('formatYears', () => {
  it('uses the singular only for exactly one year', () => {
    expect(formatYears(1)).toBe('1 year');
    expect(formatYears(6)).toBe('6 years');
    expect(formatYears(0)).toBe('0 years');
    expect(formatYears(25)).toBe('25 years');
  });

  it('shows at most one decimal place', () => {
    expect(formatYears(2.5)).toBe('2.5 years');
    expect(formatYears(1.04)).toBe('1 year');
    expect(formatYears(1.06)).toBe('1.1 years');
  });

  it('uses a true minus sign', () => {
    expect(formatYears(-2)).toBe(`${MINUS}2 years`);
    expect(formatYears(-1)).toBe(`${MINUS}1 year`);
  });

  it('returns an empty string for values that are not finite numbers', () => {
    expect(formatYears(Number.NaN)).toBe('');
  });
});

describe('parseMoney', () => {
  it('reads plain numbers', () => {
    expect(parseMoney('300000')).toBe(300000);
    expect(parseMoney(' 300000 ')).toBe(300000);
    expect(parseMoney('0')).toBe(0);
    expect(parseMoney('1336.15')).toBe(1336.15);
    expect(parseMoney('300.')).toBe(300);
    expect(parseMoney('.5')).toBe(0.5);
  });

  it('reads pounds signs and commas', () => {
    expect(parseMoney('£300,000')).toBe(300000);
    expect(parseMoney('300,000')).toBe(300000);
    expect(parseMoney('£1,336.15')).toBe(1336.15);
    expect(parseMoney('£ 1,234,567')).toBe(1234567);
    expect(parseMoney('\t£300000\n')).toBe(300000);
  });

  it('reads k and m suffixes', () => {
    expect(parseMoney('£300k')).toBe(300000);
    expect(parseMoney('300K')).toBe(300000);
    expect(parseMoney('300 k')).toBe(300000);
    expect(parseMoney('1.2m')).toBe(1200000);
    expect(parseMoney('£1.2M')).toBe(1200000);
    expect(parseMoney('1.15k')).toBe(1150);
    expect(parseMoney('2.675k')).toBe(2675);
    expect(parseMoney('0.1m')).toBe(100000);
    expect(parseMoney('1,250k')).toBe(1250000);
  });

  it('reads negatives with a hyphen or a true minus sign', () => {
    expect(parseMoney('-1200')).toBe(-1200);
    expect(parseMoney(`${MINUS}£1,200`)).toBe(-1200);
    expect(parseMoney('-£1,200')).toBe(-1200);
    expect(parseMoney('£-1,200')).toBe(-1200);
    expect(parseMoney('+£1,200')).toBe(1200);
  });

  it('returns 0, not a negative zero', () => {
    expect(Object.is(parseMoney('-0'), 0)).toBe(true);
    expect(Object.is(parseMoney(`${MINUS}£0.00`), 0)).toBe(true);
  });

  it('rejects garbage', () => {
    for (const text of [
      '',
      '   ',
      '£',
      'k',
      '£k',
      'abc',
      '300abc',
      '300kk',
      '300km',
      '3,00,000',
      '300,00',
      ',300',
      '300,',
      '1.2.3',
      '1e5',
      '0x10',
      'Infinity',
      'NaN',
      '--5',
      '£300£',
      '12 34',
      '300 pcm',
      '£300k!',
      '.',
      '1 000',
    ]) {
      expect(parseMoney(text), JSON.stringify(text)).toBeNull();
    }
  });

  it('rejects numbers too large to be finite', () => {
    expect(parseMoney('9'.repeat(400))).toBeNull();
  });

  it('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = parseMoney(text);
        expect(result === null || Number.isFinite(result)).toBe(true);
      }),
    );
    expect(parseMoney(undefined as unknown as string)).toBeNull();
    expect(parseMoney(300 as unknown as string)).toBeNull();
  });

  it('reads back every whole-pound amount it formats', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e12, max: 1e12 }), (pounds) => {
        expect(parseMoney(formatMoney(pounds))).toBe(pounds === 0 ? 0 : pounds);
        expect(parseMoney(String(pounds))).toBe(pounds === 0 ? 0 : pounds);
      }),
    );
  });
});

describe('parsePercent', () => {
  it('reads percentages as decimals', () => {
    expect(parsePercent('4.3')).toBe(0.043);
    expect(parsePercent('4.3%')).toBe(0.043);
    expect(parsePercent(' 4.30 % ')).toBe(0.043);
    expect(parsePercent('5')).toBe(0.05);
    expect(parsePercent('0')).toBe(0);
    expect(parsePercent('.5')).toBe(0.005);
    expect(parsePercent('1.4')).toBe(0.014);
    expect(parsePercent('12.5%')).toBe(0.125);
    expect(parsePercent('1,250%')).toBe(12.5);
  });

  it('reads negatives with a hyphen or a true minus sign', () => {
    expect(parsePercent('-0.5')).toBe(-0.005);
    expect(parsePercent(`${MINUS}0.5%`)).toBe(-0.005);
    expect(parsePercent('+1%')).toBe(0.01);
    expect(Object.is(parsePercent('-0'), 0)).toBe(true);
  });

  it('reads "a year" after the number', () => {
    expect(parsePercent('3.0% a year')).toBe(0.03);
  });

  it('rejects garbage', () => {
    for (const text of [
      '',
      ' ',
      '%',
      'abc',
      '4.3.1',
      '4,3',
      '4.3%%',
      '%4.3',
      '1e2',
      '4.3 a month',
      'NaN',
      '£4',
    ]) {
      expect(parsePercent(text), JSON.stringify(text)).toBeNull();
    }
  });

  it('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = parsePercent(text);
        expect(result === null || Number.isFinite(result)).toBe(true);
      }),
    );
    expect(parsePercent(null as unknown as string)).toBeNull();
  });

  it('reads back what formatPercent writes', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), fc.boolean(), (tenths, perYear) => {
        const rate = tenths / 1000;
        expect(parsePercent(formatPercent(rate, { decimals: 1, perYear }))).toBe(rate);
      }),
    );
  });
});
