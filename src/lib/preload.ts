/**
 * A <link rel="preload"> for Base.astro's `preloads` prop (phase 6, perf). Fetches and fonts get
 * `crossorigin` (anonymous), which they need to be reused by the request that wants them.
 */
export interface Preload {
  href: string;
  as: 'fetch' | 'font' | 'style' | 'script' | 'image';
  /** MIME type, e.g. 'font/woff2'. */
  type?: string;
}
