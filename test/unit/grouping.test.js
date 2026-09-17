import { describe, it, expect, vi } from 'vitest';
import {
    buildDayGroups,
    dayKey,
    dayLabel,
    dayStarts,
    localWallClock,
    startsCluster,
    wallClockOf,
} from '../../src/chat/grouping';
import { resolveDensity, DENSITIES } from '../../src/ui/density';
import { ZONE_NAMES, atClock, inTimeZone } from '../helpers/time-zones';

/** A timestamp as a Qlik timestamp gives it: the milliseconds of a wall-clock time, read as UTC. */
const at = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h, min);

/** The instant the machine's clock shows as a given time, in the zone the test runs in. */
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

/** A day of this year as a day label writes it, in the test machine's locale. */
const written = (y, m, d) =>
    new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    }).format(Date.UTC(y, m - 1, d));

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
    // Regression (GOTCHAS 32): read with the local getters, a message at 23:30 went under the next day
    // east of UTC, and one at 00:30 under the day before west of it. In UTC, where CI runs, both looked right.
    it.each(ZONE_NAMES)('reads the date the data holds, not the reader’s, in %s', (zone) => {
        inTimeZone(zone, () => {
            expect(dayKey(at(2026, 9, 8, 23, 30))).toBe('2026-09-08');
            expect(dayKey(at(2026, 9, 9, 0, 30))).toBe('2026-09-09');
        });
    });

    it('starts a day exactly at midnight', () => {
        expect(dayKey(at(2026, 9, 9, 0, 0) - 1)).toBe('2026-09-08');
        expect(dayKey(at(2026, 9, 9, 0, 0))).toBe('2026-09-09');
    });

    it('zero-pads month and day', () => {
        expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05');
    });
});

describe('wallClockOf', () => {
    it('takes a Qlik timestamp as the wall-clock time it already is', () => {
        inTimeZone('America/New_York', () => {
            expect(wallClockOf({ ts: at(2026, 9, 8, 23, 30) })).toBe(at(2026, 9, 8, 23, 30));
            expect(wallClockOf({ ts: at(2026, 9, 8, 23, 30), tsInstant: false })).toBe(
                at(2026, 9, 8, 23, 30)
            );
        });
    });

    // Epoch milliseconds are a real moment: 22:30 UTC is already the next day east of Europe's midnight.
    it.each([
        ['UTC', '2026-09-08'],
        ['Europe/Stockholm', '2026-09-09'],
        ['America/New_York', '2026-09-08'],
        ['Asia/Kolkata', '2026-09-09'],
        ['Pacific/Kiritimati', '2026-09-09'],
        ['Etc/GMT+12', '2026-09-08'],
    ])('dates an instant by the reader’s clock in %s: %s', (zone, day) => {
        inTimeZone(zone, () => {
            const instant = { ts: Date.UTC(2026, 8, 8, 22, 30), tsInstant: true };
            expect(dayKey(wallClockOf(instant))).toBe(day);
        });
    });

    it('has no wall-clock time without a usable timestamp', () => {
        for (const ts of [null, undefined, Number.NaN, Infinity, '1788855124000']) {
            expect(wallClockOf({ ts })).toBeNull();
        }
        expect(wallClockOf(null)).toBeNull();
    });
});

describe('localWallClock', () => {
    it('uses the offset in force at the instant, on either side of a daylight-saving change', () => {
        inTimeZone('Europe/Stockholm', () => {
            expect(localWallClock(Date.UTC(2026, 0, 15, 12))).toBe(Date.UTC(2026, 0, 15, 13));
            expect(localWallClock(Date.UTC(2026, 6, 15, 12))).toBe(Date.UTC(2026, 6, 15, 14));
        });
    });
});

describe('dayLabel', () => {
    // The reader's wall clock: 09:00 on 10 September.
    const today = at(2026, 9, 10, 9, 0);

    it.each(ZONE_NAMES)('names today and yesterday by the reader’s clock in %s', (zone) => {
        inTimeZone(zone, () => {
            // 09:00 on 10 September on the machine's clock, wherever the machine is.
            atClock(local(2026, 9, 10, 9, 0), () => {
                expect(dayLabel(at(2026, 9, 10, 0, 30))).toBe('Today');
                expect(dayLabel(at(2026, 9, 10, 23, 30))).toBe('Today');
                expect(dayLabel(at(2026, 9, 9, 0, 30))).toBe('Yesterday');
                expect(dayLabel(at(2026, 9, 9, 23, 30))).toBe('Yesterday');
                expect(dayLabel(at(2026, 9, 8, 23, 30))).toBe(written(2026, 9, 8));
                expect(dayLabel(at(2026, 9, 11, 0, 30))).toBe(written(2026, 9, 11));
            });
        });
    });

    // A snapshot records the reader's wall clock, and an export draws it again on a server that may be
    // in another zone, on another day.
    it.each(ZONE_NAMES)('takes today as a wall clock, whatever the machine’s zone: %s', (zone) => {
        inTimeZone(zone, () => {
            const taken = at(2026, 9, 10, 0, 30);
            expect(dayLabel(at(2026, 9, 10, 23, 30), taken)).toBe('Today');
            expect(dayLabel(at(2026, 9, 9, 0, 30), taken)).toBe('Yesterday');
            expect(dayLabel(at(2026, 9, 11, 0, 30), taken)).toBe(written(2026, 9, 11));
        });
    });

    // Regression: yesterday was the day of the instant 24 hours before now, which is still today in the
    // last hour of the day the clocks go back, and two days back in the first hour after they go forward.
    it.each([
        ['Europe/Stockholm', 'after the clocks go forward', [2026, 3, 30, 0, 30], [2026, 3, 29]],
        ['Europe/Stockholm', 'as the clocks go back', [2026, 10, 25, 23, 30], [2026, 10, 24]],
        ['America/New_York', 'after the clocks go forward', [2026, 3, 9, 0, 30], [2026, 3, 8]],
        ['America/New_York', 'as the clocks go back', [2026, 11, 1, 23, 30], [2026, 10, 31]],
    ])('names yesterday in %s on the day %s', (zone, _when, clock, yesterday) => {
        inTimeZone(zone, () => {
            atClock(local(...clock), () => {
                expect(dayLabel(at(...clock))).toBe('Today');
                expect(dayLabel(at(...yesterday))).toBe('Yesterday');
            });
        });
    });

    it.each(ZONE_NAMES)('writes the date the data holds, not the reader’s, in %s', (zone) => {
        inTimeZone(zone, () => {
            const later = at(2026, 9, 17, 12);
            expect(dayLabel(at(2026, 9, 8, 23, 30), later)).toBe(written(2026, 9, 8));
            expect(dayLabel(at(2026, 9, 9, 0, 30), later)).toBe(written(2026, 9, 9));
        });
    });

    it('formats an older day in the same year without the year', () => {
        const label = dayLabel(at(2026, 3, 12), today);
        expect(label).not.toBe('Today');
        expect(label).not.toContain('2026');
    });

    it('includes the year for a different year', () => {
        expect(dayLabel(at(2024, 3, 12), today)).toContain('2024');
    });

    it.each(ZONE_NAMES)('names a past year by the day the data holds, in %s', (zone) => {
        inTimeZone(zone, () => {
            // New Year's Eve at 23:30 is last year's, and a minute past midnight is this year's.
            const january = at(2027, 1, 5, 12);
            expect(dayLabel(at(2026, 12, 31, 23, 30), january)).toContain('2026');
            expect(dayLabel(at(2027, 1, 1, 0, 1), january)).not.toContain('2027');
        });
    });
});

describe('buildDayGroups', () => {
    const today = at(2026, 9, 10, 9, 0);
    const m = (ts) => ({ ts });

    it('returns null when nothing can be dated', () => {
        expect(buildDayGroups([], today)).toBeNull();
        expect(buildDayGroups([m(null), m(null)], today)).toBeNull();
        expect(buildDayGroups([m(Number.NaN)], today)).toBeNull();
    });

    it.each(ZONE_NAMES)('keeps 23:30 and 00:30 on the days the data holds in %s', (zone) => {
        inTimeZone(zone, () => {
            const late = m(at(2026, 9, 8, 23, 30));
            const early = m(at(2026, 9, 9, 0, 30));
            const out = buildDayGroups([late, early], at(2026, 9, 17, 12));
            expect(out).toEqual({
                groupCounts: [1, 1],
                labels: [written(2026, 9, 8), written(2026, 9, 9)],
            });
        });
    });

    it.each([
        ['Europe/Stockholm', [1, 1]],
        ['America/New_York', [2]],
    ])('groups instants by the reader’s day in %s', (zone, groupCounts) => {
        inTimeZone(zone, () => {
            // 21:30 and 22:30 UTC: 23:30 and 00:30 in Stockholm, the same evening in New York.
            const instants = [Date.UTC(2026, 8, 8, 21, 30), Date.UTC(2026, 8, 8, 22, 30)];
            const messages = instants.map((ts) => ({ ts, tsInstant: true }));
            expect(buildDayGroups(messages, today).groupCounts).toEqual(groupCounts);
        });
    });

    it('groups consecutive messages by the day the data holds', () => {
        const out = buildDayGroups(
            [
                m(at(2026, 9, 8, 9, 0)),
                m(at(2026, 9, 8, 17, 0)),
                m(at(2026, 9, 9, 9, 0)),
                m(at(2026, 9, 10, 8, 0)),
            ],
            today
        );
        expect(out.groupCounts).toEqual([2, 1, 1]);
        expect(out.labels[2]).toBe('Today');
        expect(out.labels[1]).toBe('Yesterday');
    });

    it('group counts always sum to the message count', () => {
        const messages = [m(at(2026, 9, 8)), m(null), m(at(2026, 9, 9)), m(null)];
        const out = buildDayGroups(messages, today);
        // GroupedVirtuoso renders exactly sum(groupCounts) items; a mismatch
        // silently drops messages off the end of the list.
        expect(out.groupCounts.reduce((a, b) => a + b, 0)).toBe(messages.length);
    });

    it('folds an undated leading message into the first group', () => {
        const out = buildDayGroups([m(null), m(at(2026, 9, 8))], today);
        expect(out.groupCounts.reduce((a, b) => a + b, 0)).toBe(2);
    });

    it('starts a new group when the day changes back and forth', () => {
        const out = buildDayGroups(
            [m(at(2026, 9, 8)), m(at(2026, 9, 9)), m(at(2026, 9, 8))],
            today
        );
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

describe('startsCluster with recipients', () => {
    const to = (...names) => names.map((name) => ({ key: name, label: name, unknown: false }));
    const msg = (recipients) => ({ authorKey: 'Ada', ts: null, recipients });

    it('starts a new cluster when the same author writes to someone else', () => {
        // Otherwise "Ada → Bob" silently heads a message Ada sent to Cy.
        expect(startsCluster(msg(to('Cy')), msg(to('Bob')), 120)).toBe(true);
    });

    it('continues a cluster to the same recipients in any order', () => {
        expect(startsCluster(msg(to('Cy', 'Bob')), msg(to('Bob', 'Cy')), 120)).toBe(false);
    });

    it('is unaffected in the participant model, where there are no recipients', () => {
        expect(startsCluster(msg(null), msg(null), 120)).toBe(false);
    });
});

describe('startsCluster across sides', () => {
    it('starts a new cluster when the same author switches sides', () => {
        // A side attribute, or Own in one conversation and not another, can put
        // one author on both sides; the moved bubble needs its own header.
        const previous = { authorKey: 'Ada', ts: null, recipients: null, side: 'left' };
        const message = { authorKey: 'Ada', ts: null, recipients: null, side: 'right' };
        expect(startsCluster(message, previous, 120)).toBe(true);
    });
});

describe('day label formatters', () => {
    it('labels days with a formatter made once, not once a label', () => {
        const made = vi.spyOn(Intl, 'DateTimeFormat');
        const today = at(2026, 9, 16);
        const labels = [];
        for (let day = 1; day <= 40; day += 1) labels.push(dayLabel(at(2026, 3, day), today));
        for (let day = 1; day <= 5; day += 1) labels.push(dayLabel(at(2024, 3, day), today));
        // One formatter for this year's days and one naming the year, at most, and none if earlier
        // labels in this file already made them.
        expect(made.mock.calls.length).toBeLessThanOrEqual(2);
        made.mockRestore();
        expect(new Set(labels).size).toBe(45);
        expect(labels[40]).toContain('2024');
    });
});

describe('dayStarts', () => {
    const at = (d, h = 12) => Date.UTC(2026, 8, d, h);
    const m = (ts) => ({ ts });

    it('marks exactly where buildDayGroups starts a group', () => {
        const cases = [
            [m(at(7)), m(at(7, 13)), m(at(8)), m(null), m(at(8, 14)), m(at(9))],
            [m(null), m(null), m(at(7)), m(null), m(at(8))],
            [m(at(7))],
        ];
        for (const messages of cases) {
            const starts = dayStarts(messages);
            const groups = buildDayGroups(messages);
            const sizes = [];
            messages.forEach((_, i) => {
                if (starts[i] === 1) sizes.push(0);
                sizes[sizes.length - 1] += 1;
            });
            expect(sizes).toEqual(groups.groupCounts);
        }
    });

    it('marks nothing when nothing can be dated', () => {
        expect([...dayStarts([m(null), m(null)])]).toEqual([0, 0]);
        expect(dayStarts(undefined)).toHaveLength(0);
    });

    it('folds a timestamp that is not a finite number into the day before it, as if undated', () => {
        const starts = dayStarts([m(at(7)), m(Number.NaN), m(at(7, 13)), m(at(8))]);
        expect([...starts]).toEqual([1, 0, 0, 1]);
    });
});
