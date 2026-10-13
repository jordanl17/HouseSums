/**
 * Buy v rent chart: what you'd walk away with if you sold at each year-end. Owner: results
 * teammate. A port of src/components/ui/ExampleChart.astro (same classes, src/styles/ui/chart.css)
 * drawn from the model's series, with no charting library.
 *
 * - The SVG draws only lines and fills in a 0-100 box stretched to the plot; text is HTML laid
 *   over it, so it stays at its real size at 360px and 1280px. Geometry: src/lib/chart.ts.
 * - Buy: line over a 14% fill. Rent: plain line. Both labelled directly, in ink.
 * - Break-even: dashed hi-vis line with an ink edge and an ink-on-hi-vis "Year N" label.
 * - Inspecting a year: the plot is one focusable control (role slider over the years). Arrow
 *   keys, Home, End, Page Up and Page Down move the year; hover and touch pick the year under the
 *   pointer. A guide line, two dots and a small tooltip show that year's figures, and the
 *   slider's value text announces them. Escape or leaving the chart hides the tooltip.
 * - Screen readers get a one-sentence summary and a visually hidden table with every year
 *   (data-testid "chart-table"). The year-by-year table in the breakdown shows the same figures.
 * - The plot height is fixed in CSS, so the card never changes size with the figures.
 */
import { useRef, useState } from 'preact/hooks';
import {
  areaPath,
  formatK,
  labelPlacement,
  polylinePoints,
  responsiveXTicks,
  xPercent,
  xTickLabel,
  yearAt,
  yPercent,
  yScale,
} from '../../lib/chart';
import { chartSummary } from '../../lib/copy';
import { formatMoney } from '../../lib/format';
import { DataTable } from './ui';
import type { CalcProps } from './types';

const yearName = (year: number) => (year === 0 ? 'Now' : `Year ${year}`);

export default function Chart({ calc }: CalcProps) {
  /** The year being inspected (hover, touch or keyboard), or null when none is. */
  const [active, setActive] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const { result } = calc;
  if (!result || calc.status !== 'ready') return null;

  const series = result.series;
  const years = series.length - 1;
  const buy = series.map((point) => point.buyWealth);
  const rent = series.map((point) => point.rentWealth);
  const scale = yScale([...buy, ...rent]);
  const breakEven = result.breakEvenYear;
  const labels = labelPlacement(buy, rent, breakEven);
  const zero = yPercent(0, scale);
  const fromBottom = (value: number) => 100 - yPercent(value, scale);

  const defaultYear = breakEven ?? Math.min(10, years);
  const year = active === null ? null : Math.min(active, years);
  const shownYear = year ?? defaultYear;
  const point = year === null ? null : series[year];
  const shown = series[shownYear];
  const valueText = shown
    ? `${yearName(shownYear)}: if you buy ${formatMoney(shown.buyWealth)}, if you rent ${formatMoney(shown.rentWealth)}`
    : '';

  const clampYear = (value: number) => Math.min(years, Math.max(0, value));
  const yearFromPointer = (event: PointerEvent) => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setActive(yearAt((event.clientX - box.left) / box.width, years));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const from = year ?? defaultYear;
    const moves: Record<string, number> = {
      ArrowRight: from + 1,
      ArrowUp: from + 1,
      ArrowLeft: from - 1,
      ArrowDown: from - 1,
      PageUp: from + 5,
      PageDown: from - 5,
      Home: 0,
      End: years,
    };
    if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(clampYear(next));
  };

  const markerX = breakEven === null ? null : xPercent(breakEven, years);
  const activeX = year === null ? 0 : xPercent(year, years);
  const labelX = xPercent(labels.year, years);
  const buyLabel = labels.buyOnTop ? 'above' : 'below';
  const rentLabel = labels.buyOnTop ? 'below' : 'above';

  return (
    <figure class="chart chart--live" data-testid="chart">
      <figcaption class="chart__caption">
        What you'd walk away with if you sold, in £&nbsp;thousands
      </figcaption>
      <p class="visually-hidden" id="calc-chart-summary">
        {chartSummary(result)}
      </p>
      <div class="chart__frame">
        <div class="chart__y-axis" aria-hidden="true">
          {scale.ticks.map((value) => (
            <span
              key={value}
              class="chart__tick chart__tick--y"
              style={`--y: ${fromBottom(value)}%`}
            >
              {formatK(value)}
            </span>
          ))}
        </div>
        <div
          ref={plotRef}
          class="chart__plot chart__plot--interactive"
          tabIndex={0}
          role="slider"
          aria-label="Year shown on the chart"
          aria-describedby="calc-chart-summary"
          aria-valuemin={0}
          aria-valuemax={years}
          aria-valuenow={shownYear}
          aria-valuetext={valueText}
          onKeyDown={onKeyDown}
          onFocus={() => setActive((current) => current ?? defaultYear)}
          onBlur={() => setActive(null)}
          onPointerDown={yearFromPointer}
          onPointerMove={yearFromPointer}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse' && document.activeElement !== plotRef.current) {
              setActive(null);
            }
          }}
        >
          <svg
            class="chart__svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            focusable="false"
            aria-hidden="true"
          >
            <g class="chart__grid">
              {scale.ticks
                .filter((value) => value !== 0)
                .map((value) => (
                  <line
                    key={value}
                    x1="0"
                    x2="100"
                    y1={yPercent(value, scale)}
                    y2={yPercent(value, scale)}
                    vector-effect="non-scaling-stroke"
                  />
                ))}
            </g>
            <path class="chart__area chart__area--buy" d={areaPath(buy, scale)} />
            <polyline
              class="chart__line chart__line--rent"
              points={polylinePoints(rent, scale)}
              vector-effect="non-scaling-stroke"
            />
            <polyline
              class="chart__line chart__line--buy"
              points={polylinePoints(buy, scale)}
              vector-effect="non-scaling-stroke"
            />
            <line
              class="chart__baseline"
              x1="0"
              x2="100"
              y1={zero}
              y2={zero}
              vector-effect="non-scaling-stroke"
            />
            {markerX !== null && (
              <>
                <line
                  class="chart__marker-edge"
                  x1={markerX}
                  x2={markerX}
                  y1="0"
                  y2="100"
                  vector-effect="non-scaling-stroke"
                />
                <line
                  class="chart__marker"
                  x1={markerX}
                  x2={markerX}
                  y1="0"
                  y2="100"
                  vector-effect="non-scaling-stroke"
                />
              </>
            )}
          </svg>
          <div aria-hidden="true">
            {markerX !== null && (
              <span
                class={
                  markerX > 85
                    ? 'chart__marker-label chart__marker-label--end'
                    : 'chart__marker-label'
                }
                style={`--x: ${markerX}%`}
                data-testid="chart-marker"
              >
                Year {breakEven}
              </span>
            )}
            <span
              class={`chart__series-label chart__series-label--buy chart__series-label--${buyLabel}`}
              style={`--x: ${labelX}%; --y: ${fromBottom(buy[labels.year] ?? 0)}%`}
            >
              Buy
            </span>
            <span
              class={`chart__series-label chart__series-label--rent chart__series-label--${rentLabel}`}
              style={`--x: ${labelX}%; --y: ${fromBottom(rent[labels.year] ?? 0)}%`}
            >
              Rent
            </span>
            {point && (
              <>
                <span class="chart__cursor" style={`--x: ${activeX}%`} />
                <span
                  class="chart__dot chart__dot--rent"
                  style={`--x: ${activeX}%; --y: ${fromBottom(point.rentWealth)}%`}
                />
                <span
                  class="chart__dot chart__dot--buy"
                  style={`--x: ${activeX}%; --y: ${fromBottom(point.buyWealth)}%`}
                />
                <div
                  class={activeX > 55 ? 'chart__tooltip chart__tooltip--left' : 'chart__tooltip'}
                  style={`--x: ${activeX}%`}
                  data-testid="chart-tooltip"
                >
                  <p class="chart__tooltip-year">{yearName(point.year)}</p>
                  <p class="chart__tooltip-row chart__tooltip-row--buy">
                    <span>Buy</span> <span>{formatMoney(point.buyWealth)}</span>
                  </p>
                  <p class="chart__tooltip-row chart__tooltip-row--rent">
                    <span>Rent</span> <span>{formatMoney(point.rentWealth)}</span>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
        <div class="chart__x-axis" aria-hidden="true">
          {responsiveXTicks(years).map((tick) => (
            <span
              key={tick.year}
              class={`chart__tick chart__tick--x chart__tick--${tick.show}`}
              style={`--x: ${xPercent(tick.year, years)}%`}
            >
              {xTickLabel(tick.year)}
            </span>
          ))}
        </div>
      </div>
      <div class="visually-hidden">
        <DataTable
          caption="What you'd walk away with if you sold, by year"
          columns={[
            { key: 'year', label: 'Year' },
            { key: 'buy', label: 'If you buy', numeric: true },
            { key: 'rent', label: 'If you rent', numeric: true },
          ]}
          rows={series.map((row) => ({
            year: yearName(row.year),
            buy: formatMoney(row.buyWealth),
            rent: formatMoney(row.rentWealth),
          }))}
          rowHeader
          testId="chart-table"
        />
      </div>
    </figure>
  );
}
