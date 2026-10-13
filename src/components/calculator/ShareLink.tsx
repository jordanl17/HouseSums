/**
 * "Copy link to these figures". STUB by the phase lead. Owner: followups teammate (Clipboard API
 * with a plain fallback that shows the link to copy by hand, the 'share-copied' event, a calm
 * confirmation in a polite live region).
 * Contract: a secondary button with data-testid "share-link", shown only when calc.status is
 * 'ready'. Get the link from calc.shareUrl() at click time.
 */
import type { CalcProps } from './types';

export default function ShareLink({ calc }: CalcProps) {
  if (calc.status !== 'ready') return null;
  return (
    <div class="share-link">
      <button
        type="button"
        class="button button--secondary"
        data-testid="share-link"
        onClick={() => void navigator.clipboard?.writeText(calc.shareUrl())}
      >
        Copy link to these figures
      </button>
    </div>
  );
}
