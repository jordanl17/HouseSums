/**
 * Preact port of DataTable.astro: thin rules, right-aligned tabular numbers.
 *
 * Additions for the calculator:
 * - `currentRow`: marks one body row with aria-current="true" and .data-table__row--current
 *   (bold plus a text marker in CSS, never colour alone).
 * - `scroll`: wraps the table in a focusable, labelled region that scrolls sideways when the
 *   table is wider than the screen (the year-by-year table at 360px), so the page never does.
 */
import type { ComponentChildren } from 'preact';

export interface DataTableColumn {
  key: string;
  label: ComponentChildren;
  numeric?: boolean;
}

export interface DataTableProps {
  caption: ComponentChildren;
  captionHidden?: boolean;
  columns: readonly DataTableColumn[];
  /** Rows keyed by column key, values pre-formatted. */
  rows: readonly Record<string, ComponentChildren>[];
  rowHeader?: boolean;
  currentRow?: number | null;
  /** Wrap in a sideways-scrolling region named by this label. */
  scroll?: string;
  class?: string;
  testId?: string;
}

export function DataTable(props: DataTableProps) {
  const { columns, rowHeader = false } = props;
  const numClass = (numeric: boolean | undefined) => (numeric ? 'data-table__num' : undefined);
  const table = (
    <table
      class={props.class ? `data-table ${props.class}` : 'data-table'}
      data-testid={props.scroll ? undefined : props.testId}
    >
      <caption
        class={props.captionHidden ? 'data-table__caption visually-hidden' : 'data-table__caption'}
      >
        {props.caption}
      </caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th scope="col" class={numClass(column.numeric)} key={column.key}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, rowIndex) => {
          const current = props.currentRow === rowIndex;
          return (
            <tr
              key={rowIndex}
              class={current ? 'data-table__row--current' : undefined}
              aria-current={current ? 'true' : undefined}
            >
              {columns.map((column, index) =>
                rowHeader && index === 0 ? (
                  <th scope="row" class={numClass(column.numeric)} key={column.key}>
                    {row[column.key] ?? ''}
                  </th>
                ) : (
                  <td class={numClass(column.numeric)} key={column.key}>
                    {row[column.key] ?? ''}
                  </td>
                ),
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  if (!props.scroll) return table;
  return (
    <div
      class="data-table-scroll"
      role="region"
      aria-label={props.scroll}
      tabIndex={0}
      data-testid={props.testId}
    >
      {table}
    </div>
  );
}
