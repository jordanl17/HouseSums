/**
 * "Copy link to these figures" for Sell later: the same button, wording and classes as the Rent
 * v buy share row (src/components/calculator/ShareLink.tsx), without its waiting state or
 * analytics. When the browser won't copy, the link is shown in a read-only field instead.
 */
import { useEffect, useRef, useState } from 'preact/hooks';

const COPY = {
  button: 'Copy link to these figures',
  copied: 'Link copied. Anyone who opens it sees these figures.',
  manual: "Your browser didn't let us copy it. The link is below, ready to copy.",
  field: 'Link to these figures',
} as const;

interface CopyLinkProps {
  /** The link to copy, worked out on click. */
  url: () => string;
  /** Changes whenever the figures do, so an old "copied" message goes away. */
  version: string;
}

type Outcome = { kind: 'copied' | 'manual'; version: string; url: string } | null;

export function CopyLink({ url, version }: CopyLinkProps) {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const field = useRef<HTMLInputElement>(null);
  const current = outcome?.version === version ? outcome : null;

  useEffect(() => {
    if (current?.kind === 'manual') field.current?.select();
  }, [current?.kind, current?.url]);

  const copy = async () => {
    const link = url();
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setOutcome({ kind: ok ? 'copied' : 'manual', version, url: link });
  };

  return (
    <div class="share-link">
      <div class="share-link__row">
        <button
          type="button"
          class="button button--secondary share-link__button"
          data-testid="sl-share-link"
          onClick={() => void copy()}
        >
          {COPY.button}
        </button>
        <p class="share-link__status" role="status" data-testid="sl-share-status">
          {current?.kind === 'copied' && COPY.copied}
          {current?.kind === 'manual' && COPY.manual}
        </p>
      </div>
      {current?.kind === 'manual' && (
        <div class="field share-link__manual">
          <div class="field__head">
            <label class="field__label" for="sl-share-url">
              {COPY.field}
            </label>
          </div>
          <div class="field__control">
            <input
              ref={field}
              class="field__input field__input--text"
              id="sl-share-url"
              data-testid="sl-share-url"
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
