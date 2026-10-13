import { describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_EVENTS,
  EVENT_PARAM_KEYS,
  EVENT_TITLES,
  createTracker,
  eventUrl,
  siteCode,
  track,
  type AnalyticsEvent,
} from './analytics';

const HOST = 'jordanl17.github.io';

/** A tracker with a recording send. Pass `code` or `hostname` (even undefined) to change them. */
function recorder(options: { code?: unknown; hostname?: string | undefined } = {}) {
  const sent: string[] = [];
  const fire = createTracker({
    code: 'code' in options ? options.code : 'housesums',
    hostname: 'hostname' in options ? options.hostname : HOST,
    send: (url) => sent.push(url),
    random: () => 'r4nd0m',
  });
  return { fire, sent };
}

describe('the event list', () => {
  it("is exactly the brief's four events", () => {
    expect([...ANALYTICS_EVENTS]).toEqual([
      'area-selected',
      'advanced-opened',
      'share-copied',
      'sensitivity-viewed',
    ]);
    expect(Object.keys(EVENT_TITLES).sort()).toEqual([...ANALYTICS_EVENTS].sort());
  });

  it('takes no payload argument', () => {
    expect(track).toHaveLength(1);
    expect(createTracker({ code: 'housesums', hostname: HOST })).toHaveLength(1);
  });
});

describe('payload shape', () => {
  it.each(ANALYTICS_EVENTS)(
    '%s sends only the event name, its fixed title and the event flag',
    (event) => {
      const { fire, sent } = recorder();
      fire(event);
      expect(sent).toHaveLength(1);
      const url = new URL(sent[0]!);
      expect(url.origin).toBe('https://housesums.goatcounter.com');
      expect(url.pathname).toBe('/count');
      expect([...url.searchParams.keys()]).toEqual([...EVENT_PARAM_KEYS]);
      expect(url.searchParams.get('p')).toBe(event);
      expect(url.searchParams.get('t')).toBe(EVENT_TITLES[event]);
      expect(url.searchParams.get('e')).toBe('true');
      expect(url.searchParams.get('rnd')).toBe('r4nd0m');
      // No figures of any kind: no digits outside the cache buster, no referrer, no page URL.
      for (const key of ['p', 't', 'e'] as const) {
        expect(url.searchParams.get(key)).not.toMatch(/\d|£|%/);
      }
      expect(url.hash).toBe('');
    },
  );

  it('never carries input values, even when the page URL is full of them', () => {
    const { fire, sent } = recorder();
    // The page URL holds every input (a=leeds&p=300000...); the tracker never reads it.
    vi.stubGlobal('location', { hostname: HOST, href: `https://${HOST}/?a=leeds&p=300000` });
    try {
      for (const event of ANALYTICS_EVENTS) fire(event);
    } finally {
      vi.unstubAllGlobals();
    }
    for (const url of sent) {
      expect(url).not.toMatch(/leeds|300000/);
      expect(new URL(url).searchParams.has('r')).toBe(false);
      expect(new URL(url).searchParams.has('s')).toBe(false);
      expect(new URL(url).searchParams.has('q')).toBe(false);
    }
  });

  it('eventUrl refuses an event that is not one of the four', () => {
    expect(eventUrl('housesums', 'price-300000' as AnalyticsEvent, 'x')).toBeNull();
    const { fire, sent } = recorder();
    fire('price-300000' as AnalyticsEvent);
    expect(sent).toEqual([]);
  });
});

describe('off unless configured', () => {
  it.each([undefined, null, '', '   ', 42, 'evil.com/x', 'a.b', 'https://x.goatcounter.com'])(
    'is a no-op for code %j',
    (code) => {
      const { fire, sent } = recorder({ code });
      for (const event of ANALYTICS_EVENTS) fire(event);
      expect(sent).toEqual([]);
    },
  );

  it('accepts a plain site code, trimmed and lowercased', () => {
    expect(siteCode(' HouseSums ')).toBe('housesums');
    expect(siteCode('house-sums-2')).toBe('house-sums-2');
  });

  it('never sends from a local preview or during the server render', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]', undefined]) {
      const { fire, sent } = recorder({ hostname });
      fire('area-selected');
      expect(sent).toEqual([]);
    }
  });

  it('the real track() is a no-op here, because PUBLIC_GOATCOUNTER_CODE is not set', () => {
    const beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    vi.stubGlobal('location', { hostname: HOST });
    try {
      expect(import.meta.env.PUBLIC_GOATCOUNTER_CODE).toBeUndefined();
      for (const event of ANALYTICS_EVENTS) track(event);
      expect(beacon).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('never throws', () => {
  it('swallows a failing send', () => {
    const fire = createTracker({
      code: 'housesums',
      hostname: HOST,
      send: () => {
        throw new Error('blocked by an extension');
      },
    });
    expect(() => fire('share-copied')).not.toThrow();
  });

  it('track() survives missing browser globals', () => {
    expect(() => track('advanced-opened')).not.toThrow();
  });
});
