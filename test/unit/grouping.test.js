import { describe, it, expect } from 'vitest';
import { buildDayGroups, dayKey, dayLabel, startsCluster } from '../../src/chat/grouping';
import { resolveDensity, DENSITIES } from '../../src/ui/density';

/** Local-time epoch ms for a given calendar moment. */
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('startsCluster', () => {
    const msg = (authorKey, ts) => ({ authorKey, ts });

    it('always starts a cluster on the first message', () => {
        expect(startsCluster(msg('Ada', 1), null, 120)).toBe(true);
    });

    it('starts a cluster when the author changes', () => {
        expect(startsCluster(msg('Bob', 1000), msg('Ada', 0), 120)).toBe(true);
    });

    it('continues a cluster for the same author within the gap', () => {
        const t = at(2026, 9, 8, 10, 0);
        expect(startsCluster(msg('Ada', t + 60_000), msg('Ada', t), 120)).toBe(false);
    });

    it('starts a new cluster once the gap is exceeded', () => {
        // Regression guard: this only works because ts is epoch MILLISECONDS.
        // With the raw Qlik day serial the delta is ~0.001 and never exceeds
        // gapSec * 1000, so clustering by time silently never fired.
        const t = at(2026, 9, 8, 10, 0);
        expect(startsCluster(msg('Ada', t + 5 * 60_000), msg('Ada', t), 120)).toBe(true);
    });

    it('falls back to author-only when timestamps are missing', () => {
        expect(startsCluster(msg('Ada', null), msg('Ada', null), 120)).toBe(false);
        expect(startsCluster(msg('Bob', null), msg('Ada', null), 120)).toBe(true);
    });
});

describe('dayKey', () => {
    it('uses LOCAL calendar days, not UTC', () => {
        // A message at 23:30 local belongs to that local day even where UTC has
        // already rolled over — the conversation reads by the viewer's clock.
        const late = at(2026, 9, 8, 23, 30);
        expect(dayKey(late)).toBe('2026-09-08');
    });

    it('zero-pads month and day', () => {
        expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
    });
});

describe('dayLabel', () => {
    const now = at(2026, 9, 10, 9, 0);

    it('names today and yesterday relatively', () => {
        expect(dayLabel(at(2026, 9, 10, 8, 0), now)).toBe('Today');
        expect(dayLabel(at(2026, 9, 9, 23, 0), now)).toBe('Yesterday');
    });

    it('formats an older day in the same year without the year', () => {
        const label = dayLabel(at(2026, 3, 12), now);
        expect(label).not.toBe('Today');
        expect(label).not.toContain('2026');
    });

    it('includes the year for a different year', () => {
        expect(dayLabel(at(2024, 3, 12), now)).toContain('2024');
    });
});

describe('buildDayGroups', () => {
    const now = at(2026, 9, 10, 9, 0);
    const m = (ts) => ({ ts });

    it('returns null when nothing can be dated', () => {
        expect(buildDayGroups([], now)).toBeNull();
        expect(buildDayGroups([m(null), m(null)], now)).toBeNull();
    });

    it('groups consecutive messages by local day', () => {
        const out = buildDayGroups(
            [
                m(at(2026, 9, 8, 9, 0)),
                m(at(2026, 9, 8, 17, 0)),
                m(at(2026, 9, 9, 9, 0)),
                m(at(2026, 9, 10, 8, 0)),
            ],
            now
        );
        expect(out.groupCounts).toEqual([2, 1, 1]);
        expect(out.labels[2]).toBe('Today');
        expect(out.labels[1]).toBe('Yesterday');
    });

    it('group counts always sum to the message count', () => {
        const messages = [m(at(2026, 9, 8)), m(null), m(at(2026, 9, 9)), m(null)];
        const out = buildDayGroups(messages, now);
        // GroupedVirtuoso renders exactly sum(groupCounts) items; a mismatch
        // silently drops messages off the end of the list.
        expect(out.groupCounts.reduce((a, b) => a + b, 0)).toBe(messages.length);
    });

    it('folds an undated leading message into the first group', () => {
        const out = buildDayGroups([m(null), m(at(2026, 9, 8))], now);
        expect(out.groupCounts.reduce((a, b) => a + b, 0)).toBe(2);
    });

    it('starts a new group when the day changes back and forth', () => {
        const out = buildDayGroups([m(at(2026, 9, 8)), m(at(2026, 9, 9)), m(at(2026, 9, 8))], now);
        expect(out.groupCounts).toEqual([1, 1, 1]);
    });
});

describe('resolveDensity', () => {
    it('tightens as the object narrows', () => {
        expect(resolveDensity({ width: 900, height: 600 }, 'auto')).toBe('comfortable');
        expect(resolveDensity({ width: 480, height: 600 }, 'auto')).toBe('compact');
        expect(resolveDensity({ width: 300, height: 600 }, 'auto')).toBe('ultra');
    });

    it('tightens for a short object even when it is wide', () => {
        expect(resolveDensity({ width: 900, height: 200 }, 'auto')).toBe('compact');
    });

    it('honours an explicit choice', () => {
        expect(resolveDensity({ width: 2000, height: 900 }, 'ultra')).toBe('ultra');
        expect(resolveDensity({ width: 200, height: 100 }, 'comfortable')).toBe('comfortable');
    });

    it('falls back to comfortable for an unknown value', () => {
        expect(resolveDensity({ width: 900, height: 600 }, 'nonsense')).toBe('comfortable');
    });

    it('assumes the tightest layout before the first measurement', () => {
        // useRect reports zeros initially. Starting tight and loosening on
        // measure is less visible than starting loose and reflowing.
        expect(resolveDensity(undefined, 'auto')).toBe('ultra');
        expect(resolveDensity({ width: 0, height: 0 }, 'auto')).toBe('ultra');
    });

    it('only ever returns a known density', () => {
        for (const w of [0, 100, 320, 321, 520, 521, 4000]) {
            expect(DENSITIES).toContain(resolveDensity({ width: w, height: 400 }, 'auto'));
        }
    });
});
