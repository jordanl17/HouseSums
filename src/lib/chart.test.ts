import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  areaPath,
  formatK,
  labelPlacement,
  labelSides,
  LOW_LABEL_LIMIT,
  niceStep,
  polylinePoints,
  responsiveXTicks,
  xPercent,
  xTickLabel,
  xTicks,
  yearAt,
  yPercent,
  yScale,
} from './chart';

describe('y axis', () => {
  it('uses round steps in whole £k', () => {
    expect(niceStep(250000)).toBe(50000);
    expect(niceStep(180000)).toBe(50000);
    expect(niceStep(90000)).toBe(20000);
    expect(niceStep(1200)).toBe(1000);
    expect(niceStep(0)).toBe(1000);
  });

  it('always includes £0 and rounds out to whole steps', () => {
    const scale = yScale([16000, 230000, 40000]);
    expect(scale).toMatchObject({ min: 0, max: 250000, step: 50000 });
    expect(scale.ticks).toEqual([0, 50000, 100000, 150000, 200000, 250000]);
  });

  it('goes below £0 when a value does', () => {
    const scale = yScale([-12000, 80000]);
    expect(scale.min).toBeLessThan(0);
    expect(scale.ticks).toContain(0);
    expect(yPercent(-12000, scale)).toBeLessThanOrEqual(100);
  });

  it('every value fits in the plot, for any series', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -2e6, max: 2e7, noNaN: true }), { minLength: 1, maxLength: 41 }),
        (values) => {
          const scale = yScale(values);
          expect(scale.ticks.length).toBeGreaterThanOrEqual(2);
          expect(scale.ticks.length).toBeLessThanOrEqual(7);
          for (const value of values) {
            const y = yPercent(value, scale);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(100);
          }
        },
      ),
    );
  });

  it('labels in £ thousands with a true minus', () => {
    expect(formatK(250000)).toBe('£250k');
    expect(formatK(2500)).toBe('£2.5k');
    expect(formatK(0)).toBe('£0k');
    expect(formatK(-20000)).toBe('−£20k');
    expect(formatK(1250000)).toBe('£1,250k');
  });
});

describe('x axis', () => {
  it('labels Now, then round years, ending at the horizon', () => {
    expect(xTicks(15)).toEqual([0, 5, 10, 15]);
    expect(xTicks(25)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(xTicks(40)).toEqual([0, 10, 20, 30, 40]);
    expect(xTicks(5)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(xTicks(9)).toEqual([0, 2, 4, 6, 9]);
    expect(xTicks(17)).toEqual([0, 5, 10, 17]);
    expect(xTicks(23)).toEqual([0, 5, 10, 15, 23]);
    expect(xTicks(1)).toEqual([0, 1]);
    // At most four labels on a phone.
    expect(xTicks(25, 4)).toEqual([0, 10, 25]);
    expect(xTicks(15, 4)).toEqual([0, 5, 10, 15]);
    expect(xTicks(40, 4)).toEqual([0, 20, 40]);
    expect(xTickLabel(0)).toBe('Now');
    expect(xTickLabel(5)).toBe('Yr 5');
  });

  it('merges the phone and wider tick sets, marking which width shows each', () => {
    expect(responsiveXTicks(25)).toEqual([
      { year: 0, show: 'all' },
      { year: 5, show: 'wide' },
      { year: 10, show: 'all' },
      { year: 15, show: 'wide' },
      { year: 20, show: 'wide' },
      { year: 25, show: 'all' },
    ]);
    for (const years of [1, 2, 5, 9, 12, 17, 25, 33, 40]) {
      const ticks = responsiveXTicks(years);
      expect(ticks[0]).toEqual({ year: 0, show: 'all' });
      expect(ticks[ticks.length - 1]).toEqual({ year: years, show: 'all' });
      expect(ticks.filter((tick) => tick.show !== 'wide').length).toBeLessThanOrEqual(4);
      expect(ticks.filter((tick) => tick.show !== 'narrow').length).toBeLessThanOrEqual(6);
    }
  });

  it('maps years to positions and back', () => {
    expect(xPercent(0, 25)).toBe(0);
    expect(xPercent(25, 25)).toBe(100);
    expect(xPercent(6, 15)).toBe(40);
    expect(yearAt(0.4, 15)).toBe(6);
    expect(yearAt(-1, 15)).toBe(0);
    expect(yearAt(2, 15)).toBe(15);
    expect(yearAt(Number.NaN, 15)).toBe(0);
  });
});

describe('paths', () => {
  const scale = yScale([0, 100000]);

  it('draws one point per year', () => {
    expect(polylinePoints([0, 50000, 100000], scale)).toBe('0,100 50,50 100,0');
  });

  it('closes the fill along £0', () => {
    expect(areaPath([0, 50000, 100000], scale)).toBe('M0,100 L0,100 L50,50 L100,0 L100,100 Z');
  });
});

describe('direct labels', () => {
  const buy = Array.from({ length: 26 }, (_, year) => 10000 + year * 9000);
  const rent = Array.from({ length: 26 }, (_, year) => 30000 + year * 5000);

  it('sit between 55% and 75% along, off the break-even year, on the right sides', () => {
    const placement = labelPlacement(buy, rent, 5);
    expect(placement.year).toBeGreaterThanOrEqual(14);
    expect(placement.year).toBeLessThanOrEqual(19);
    expect(placement.buyOnTop).toBe(true);
  });

  it('keep away from a break-even year inside the range', () => {
    const placement = labelPlacement(buy, rent, 19);
    expect(Math.abs(placement.year - 19)).toBeGreaterThanOrEqual(2);
  });

  it('put rent on top when renting is ahead', () => {
    expect(labelPlacement(rent, buy, null).buyOnTop).toBe(false);
  });

  it('handle a one-year horizon', () => {
    expect(labelPlacement([1, 2], [3, 4], null).year).toBe(1);
  });
});

describe('direct label sides', () => {
  it('put the upper label above and the lower one below when there is room', () => {
    expect(labelSides(true, 80, 40)).toEqual({ buy: 'above', rent: 'below' });
    expect(labelSides(false, 30, 70)).toEqual({ buy: 'below', rent: 'above' });
  });

  it('never hang the rent label onto the axis when rent stays near £0', () => {
    // Buying pulls ahead early and rent wealth stays small next to the axis maximum.
    const buy = Array.from({ length: 26 }, (_, year) => 20000 + year * 30000);
    const rent = Array.from({ length: 26 }, (_, year) => 5000 + year * 400);
    const scale = yScale([...buy, ...rent]);
    const placement = labelPlacement(buy, rent, 2);
    const fromBottom = (value: number) => 100 - yPercent(value, scale);
    const rentY = fromBottom(rent[placement.year] ?? 0);
    expect(rentY).toBeLessThan(LOW_LABEL_LIMIT);
    const sides = labelSides(placement.buyOnTop, fromBottom(buy[placement.year] ?? 0), rentY);
    expect(sides).toEqual({ buy: 'above', rent: 'above' });
    // Lines too close to stack the labels: rent's goes to the other side of the point.
    expect(labelSides(true, 20, 10)).toEqual({ buy: 'above', rent: 'above-right' });
  });

  it('do the same for buy when buying stays near the bottom', () => {
    expect(labelSides(false, 3, 60)).toEqual({ buy: 'above', rent: 'above' });
    expect(labelSides(false, 3, 12)).toEqual({ buy: 'above-right', rent: 'above' });
  });

  it('never put a lower label below its line under the limit', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (buyOnTop, buyY, rentY) => {
          const sides = labelSides(buyOnTop, buyY, rentY);
          const lowerSide = buyOnTop ? sides.rent : sides.buy;
          const lowerY = buyOnTop ? rentY : buyY;
          const upperY = buyOnTop ? buyY : rentY;
          if (lowerY < LOW_LABEL_LIMIT) expect(lowerSide).not.toBe('below');
          // Two labels on the same side of the point only when they can stack.
          if (lowerSide === 'above') expect(upperY - lowerY).toBeGreaterThanOrEqual(16);
          expect(buyOnTop ? sides.buy : sides.rent).toBe('above');
        },
      ),
    );
  });
});
