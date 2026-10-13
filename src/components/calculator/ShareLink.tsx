/**
 * "Copy link to these figures" (followups teammate).
 *
 * A secondary button, shown only when calc.status is 'ready'. On press it asks the island for the
 * link (calc.shareUrl(), at click time, so the link is always for what is on screen) and copies it
 * with the Clipboard API. Where that is missing or refused (an insecure origin, a browser
 * setting, an old browser), it shows the link in a read-only field, selected, so it can be copied
 * by hand. A calm line in a polite live region says what happened; it is always rendered, one
 * line tall, so nothing below it moves when it fills.
 *
 * 'share-copied' is sent only when the Clipboard API reports success. The line goes back to
 * empty as soon as any figure changes, because the copied link would no longer match.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { track } from '../../lib/analytics';
import type { CalcProps } from './types';

type Outcome =
  { kind: 'idle' } | { kind: 'copied'; key: string } | { kind: 'manual'; key: string; url: string };

export const SHARE_COPY = {
  button: 'Copy link to these figures',
  copied: 'Link copied. Anyone who opens it sees these figures.',
  manual: "Your browser didn't let us copy it. The link is below, ready to copy.",
  field: 'Link to these figures',
} as const;

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ShareLink({ calc }: CalcProps) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const field = useRef<HTMLInputElement>(null);
  // What the link encodes. A change means a copied link is out of date.
  const key = JSON.stringify([calc.area?.slug ?? null, calc.selection, calc.overrides]);
  const current = outcome.kind !== 'idle' && outcome.key === key ? outcome : null;

  useEffect(() => {
    if (current?.kind === 'manual') field.current?.select();
  }, [current?.kind, current?.kind === 'manual' ? current.url : null]);

  if (calc.status !== 'ready') return null;

  const copy = async () => {
    const url = calc.shareUrl();
    const ok = await copyText(url);
    if (ok) {
      setOutcome({ kind: 'copied', key });
      track('share-copied');
    } else {
      setOutcome({ kind: 'manual', key, url });
    }
  };

  return (
    <div class="share-link">
      <div class="share-link__row">
        <button
          type="button"
          class="button button--secondary share-link__button"
          data-testid="share-link"
          onClick={() => void copy()}
        >
          {SHARE_COPY.button}
        </button>
        <p class="share-link__status" role="status" data-testid="share-status">
          {current?.kind === 'copied' && SHARE_COPY.copied}
          {current?.kind === 'manual' && SHARE_COPY.manual}
        </p>
      </div>
      {current?.kind === 'manual' && (
        <div class="field share-link__manual">
          <div class="field__head">
            <label class="field__label" for="calc-share-url">
              {SHARE_COPY.field}
            </label>
          </div>
          <div class="field__control">
            <input
              ref={field}
              class="field__input field__input--text"
              id="calc-share-url"
              data-testid="share-url"
              type="text"
              readOnly
              value={current.url}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
