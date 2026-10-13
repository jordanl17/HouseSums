import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { getArea, typicalAnswer } from './areas';
import {
  areaPath,
  crosses,
  formatK,
  LABEL_BOX,
  labelBox,
  labelPlacement,
  labelSides,
  lineRange,
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
  type LabelSide,
  type Rect,
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

  it('does not spend a whole step on a small dip below £0', () => {
    const scale = yScale([-1000, 20000, 480000]);
    expect(scale.step).toBe(100000);
    expect(scale.min).toBeLessThan(-1000);
    expect(scale.min).toBeGreaterThan(-10000);
    expect(scale.ticks[0]).toBe(0);
    expect(yPercent(-1000, scale)).toBeLessThanOrEqual(100);
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

  it('sit between 55% and 70% along, off the break-even year, on the right sides', () => {
    const placement = labelPlacement(buy, rent, 5);
    expect(placement.year).toBeGreaterThanOrEqual(14);
    expect(placement.year).toBeLessThanOrEqual(17);
    expect(placement.buy).toBe(buy[placement.year]);
    expect(placement.rent).toBe(rent[placement.year]);
    expect(placement.buyOnTop).toBe(true);
  });

  it('keep away from a break-even year inside the range', () => {
    const placement = labelPlacement(buy, rent, 19);
    expect(Math.abs(placement.year - 19)).toBeGreaterThanOrEqual(2);
  });

  it('put rent on top when renting is ahead', () => {
    expect(labelPlacement(rent, buy, null).buyOnTop).toBe(false);
  });

  it('sit half way along a one-year horizon, on the line joining the two year-ends', () => {
    for (const breakEven of [null, 1]) {
      const placement = labelPlacement([-10000, 30000], [20000, 24000], breakEven);
      expect(placement.year).toBe(0.5);
      expect(placement.buy).toBe(10000);
      expect(placement.rent).toBe(22000);
      expect(placement.buyOnTop).toBe(false);
    }
  });

  it('never sit at the right edge of a two-year horizon, nor on its break-even marker', () => {
    const twoBuy = [-10000, 50000, 80000];
    const twoRent = [20000, 24000, 28000];
    expect(labelPlacement(twoBuy, twoRent, 1).year).toBe(0.5);
    expect(labelPlacement(twoBuy, twoRent, 2).year).toBe(1);
    expect(labelPlacement(twoBuy, twoRent, null).year).toBe(1);
  });

  it('never sit past 70% of the horizon or on the break-even year, for any horizon', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.option(fc.integer({ min: 1, max: 40 }), { nil: null }),
        (years, breakEvenRaw) => {
          const breakEven = breakEvenRaw === null ? null : Math.min(breakEvenRaw, years);
          const b = Array.from({ length: years + 1 }, (_, year) => -5000 + year * 9000);
          const r = Array.from({ length: years + 1 }, (_, year) => 20000 + year * 4000);
          const { year } = labelPlacement(b, r, breakEven);
          expect(year).toBeGreaterThan(0);
          expect(year / years).toBeLessThanOrEqual(0.7 + 1e-9);
          if (breakEven !== null) expect(year).not.toBe(breakEven);
        },
      ),
    );
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

describe('direct labels off the lines (polish)', () => {
  const SIDES: readonly LabelSide[] = ['above', 'above-right', 'below'];
  type Sides = { buy: LabelSide; rent: LabelSide };

  /** Placement and lines for a chart, built as Chart.tsx builds them. */
  function layout(buy: readonly number[], rent: readonly number[], breakEven: number | null) {
    const scale = yScale([...buy, ...rent]);
    const fromBottom = (value: number) => 100 - yPercent(value, scale);
    const placement = labelPlacement(buy, rent, breakEven, scale);
    const lines = {
      x: xPercent(placement.year, buy.length - 1),
      buy: buy.map(fromBottom),
      rent: rent.map(fromBottom),
      floor: fromBottom(0),
    };
    return { placement, lines, buyY: fromBottom(placement.buy), rentY: fromBottom(placement.rent) };
  }
  type Layout = ReturnType<typeof layout>;

  const boxesOf = (sides: Sides, l: Layout) => ({
    buy: labelBox(sides.buy, l.lines.x, l.buyY, LABEL_BOX.width.buy),
    rent: labelBox(sides.rent, l.lines.x, l.rentY, LABEL_BOX.width.rent),
  });
  const onALine = (sides: Sides, l: Layout) => {
    const { buy, rent } = boxesOf(sides, l);
    return [l.lines.buy, l.lines.rent].some((ys) => crosses(ys, buy) || crosses(ys, rent));
  };
  /** Clear of both lines, of each other and of the £0 line, inside the plot. */
  const fits = (sides: Sides, l: Layout) => {
    const { buy, rent } = boxesOf(sides, l);
    const inside = (r: Rect) =>
      r.x0 >= 0 && r.x1 <= 100 && r.y0 >= l.lines.floor + 2 && r.y1 <= 100;
    const apart = !(buy.x0 < rent.x1 && rent.x0 < buy.x1 && buy.y0 < rent.y1 && rent.y0 < buy.y1);
    return inside(buy) && inside(rent) && apart && !onALine(sides, l);
  };
  const sidesOf = (l: Layout, withLines: boolean) =>
    labelSides(l.placement.buyOnTop, l.buyY, l.rentY, withLines ? l.lines : undefined);

  it('measures where a line runs through a box', () => {
    // A line from 0 to 100 across: between 25% and 75% along, it spans 25 to 75.
    expect(lineRange([0, 50, 100], 25, 75)).toEqual([25, 75]);
    // A peak inside the range counts.
    expect(lineRange([0, 80, 0], 10, 90)).toEqual([16, 80]);
    expect(crosses([0, 50, 100], { x0: 40, x1: 60, y0: 55, y1: 70 })).toBe(true);
    expect(crosses([0, 50, 100], { x0: 10, x1: 30, y0: 60, y1: 70 })).toBe(false);
    // Above hangs left of the point; below and above-right hang right of it.
    expect(labelBox('above', 50, 20, 10)).toEqual({ x0: 38.4, x1: 48.4, y0: 24.5, y1: 32.5 });
    expect(labelBox('below', 50, 20, 10)).toEqual({ x0: 51.6, x1: 61.6, y0: 7.5, y1: 15.5 });
    expect(labelBox('above-right', 50, 20, 10).x0).toBe(51.6);
  });

  it("keep Cardiff's rent label off the buy line where the lines cross", () => {
    const area = getArea('cardiff');
    if (!area) throw new Error('Cardiff missing');
    const { result } = typicalAnswer(area);
    const buy = result.series.map((point) => point.buyWealth);
    const rent = result.series.map((point) => point.rentWealth);
    const l = layout(buy, rent, result.breakEvenYear);
    expect(onALine(sidesOf(l, true), l)).toBe(false);
    // The old placement (no axis, no lines): the rent label sat on the buy line.
    const old = labelPlacement(buy, rent, result.breakEvenYear);
    const scale = yScale([...buy, ...rent]);
    const fromBottom = (value: number) => 100 - yPercent(value, scale);
    const oldLayout = {
      ...l,
      placement: old,
      lines: { ...l.lines, x: xPercent(old.year, buy.length - 1) },
      buyY: fromBottom(old.buy),
      rentY: fromBottom(old.rent),
    };
    expect(onALine(sidesOf(oldLayout, false), oldLayout)).toBe(true);
  });

  it('move a label only to a clear place, and leave one on a line only when none is clear', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 40 }),
        fc.integer({ min: -20000, max: 60000 }),
        fc.integer({ min: 1000, max: 30000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 80000 }),
        fc.integer({ min: 0, max: 15000 }),
        fc.option(fc.integer({ min: 1, max: 40 }), { nil: null }),
        (years, buyStart, buySlope, curve, rentStart, rentSlope, breakEvenRaw) => {
          // Buying starts anywhere and climbs, maybe faster each year; renting climbs steadily.
          const buy = Array.from({ length: years + 1 }, (_, t) =>
            Math.round(buyStart + buySlope * t * (1 + curve * t * 0.1)),
          );
          const rent = Array.from({ length: years + 1 }, (_, t) => rentStart + rentSlope * t);
          const breakEven = breakEvenRaw === null ? null : Math.min(breakEvenRaw, years);
          const l = layout(buy, rent, breakEven);
          expect(l.placement.year).toBeGreaterThan(0);
          expect(l.placement.year / years).toBeLessThanOrEqual(0.8 + 1e-9);
          if (breakEven !== null) expect(l.placement.year).not.toBe(breakEven);
          const preferred = sidesOf(l, false);
          const sides = sidesOf(l, true);
          if (sides.buy !== preferred.buy || sides.rent !== preferred.rent) {
            expect(fits(sides, l)).toBe(true);
          } else if (onALine(sides, l)) {
            const all = SIDES.flatMap((buySide) =>
              SIDES.map((rentSide) => ({ buy: buySide, rent: rentSide })),
            );
            expect(all.some((option) => fits(option, l))).toBe(false);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
