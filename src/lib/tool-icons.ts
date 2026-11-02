/**
 * The calculator icons' shapes (24-unit grid), shared by src/components/ToolIcon.astro and the
 * Open Graph cards (scripts/og/card.ts), so there is one drawing of each. Classes, not colours:
 * src/styles/home.css colours them from tokens.
 */
export type ToolKind = 'rent-v-buy' | 'sell-later';

export const TOOL_ICON_SHAPES: Readonly<Record<ToolKind, string>> = {
  'rent-v-buy': [
    '<path class="tool-icon__ink" d="M2.5 11 12 3l9.5 8" />',
    '<path class="tool-icon__ink" d="M5 9.5V21h14V9.5" />',
    '<path class="tool-icon__rent" d="M7.5 13.5 16.5 18.5" />',
    '<path class="tool-icon__buy" d="M7.5 18.5 16.5 13.5" />',
    '<circle class="tool-icon__hi-vis" cx="12" cy="16" r="2" />',
  ].join(''),
  'sell-later': [
    '<path class="tool-icon__ink" d="M2 21h20" />',
    '<path class="tool-icon__ink" d="M6 21V3M6 5h13" />',
    '<path class="tool-icon__ink tool-icon__thin" d="M10 5v3M18 5v3" />',
    '<rect class="tool-icon__hi-vis" x="8.5" y="8" width="11" height="8" rx="1" />',
    '<path class="tool-icon__on-hi-vis tool-icon__thin" d="M11.5 13.5 14 11l2.5 2.5M14 11v3.5" />',
  ].join(''),
};
