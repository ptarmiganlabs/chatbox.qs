import { describe, it, expect } from 'vitest';
import {
    isSnapshot,
    readLaneSnapshot,
    readSnapshot,
    shouldRenderAll,
    writeLaneSnapshot,
    writeSnapshot,
} from '../../src/ui/snapshot';
import { ZONE_NAMES, inTimeZone } from '../helpers/time-zones';

/** When the snapshots here are taken: 12:00 UTC on 16 September 2026. */
const TAKEN = Date.UTC(2026, 8, 16, 12);

describe('snapshot round trip', () => {
    it('survives write then read — the whole point', () => {
        // Sense captures the LAYOUT, re-renders from it in a backend browser and
        // photographs that. Anything not written here is gone by then.
        const layout = {};
        inTimeZone('UTC', () =>
            writeSnapshot(layout, { firstVisibleIndex: 42, openId: 'm-17' }, TAKEN)
        );
        expect(readSnapshot(layout)).toEqual({
            firstVisibleIndex: 42,
            openId: 'm-17',
            today: TAKEN,
        });
    });

    it('returns null for an ordinary layout', () => {
        expect(readSnapshot({})).toBeNull();
        expect(readSnapshot(undefined)).toBeNull();
        expect(isSnapshot({ qHyperCube: {} })).toBe(false);
    });

    it('preserves anything else already under snapshotData', () => {
        // Sense and other layers put their own data there; clobbering it would
        // break the snapshot in ways nothing here would notice.
        const layout = { snapshotData: { content: { size: { w: 100 } } } };
        writeSnapshot(layout, { firstVisibleIndex: 3, openId: null });
        expect(layout.snapshotData.content).toEqual({ size: { w: 100 } });
        expect(readSnapshot(layout).firstVisibleIndex).toBe(3);
    });

    it('normalises junk rather than writing it into the layout', () => {
        const layout = {};
        inTimeZone('UTC', () =>
            writeSnapshot(layout, { firstVisibleIndex: -5, openId: 42 }, TAKEN)
        );
        expect(readSnapshot(layout)).toEqual({ firstVisibleIndex: 0, openId: null, today: TAKEN });

        const empty = {};
        inTimeZone('UTC', () => writeSnapshot(empty, undefined, TAKEN));
        expect(readSnapshot(empty)).toEqual({ firstVisibleIndex: 0, openId: null, today: TAKEN });
    });

    it('does not throw on a layout it cannot write to', () => {
        expect(() => writeSnapshot(null, { firstVisibleIndex: 1 })).not.toThrow();
    });
});

describe('the reader’s clock in a snapshot', () => {
    // An export is drawn again on the server, whose clock may be in another time zone and on another day,
    // and a story is viewed later: Today and Yesterday must stay as the reader saw them (GOTCHAS 32).
    it.each(ZONE_NAMES)('records the wall clock of the reader in %s, as UTC fields', (zone) => {
        inTimeZone(zone, () => {
            // 00:30 on 10 September on the reader's clock.
            const now = new Date(2026, 8, 10, 0, 30).getTime();
            const layout = writeSnapshot({}, { firstVisibleIndex: 0, openId: null }, now);
            expect(readSnapshot(layout).today).toBe(Date.UTC(2026, 8, 10, 0, 30));
        });
    });

    it('reads it back the same in any time zone', () => {
        const layout = inTimeZone('Europe/Stockholm', () =>
            writeSnapshot({}, { firstVisibleIndex: 0, openId: null }, TAKEN)
        );
        for (const zone of ZONE_NAMES) {
            expect(inTimeZone(zone, () => readSnapshot(layout).today)).toBe(
                Date.UTC(2026, 8, 16, 14)
            );
        }
    });

    it('reads no clock from a snapshot taken before one was recorded, or from junk', () => {
        const without = { snapshotData: { chatbox: { firstVisibleIndex: 2, openId: null } } };
        expect(readSnapshot(without)).toEqual({ firstVisibleIndex: 2, openId: null, today: null });
        for (const today of ['2026-09-10', Number.NaN, Infinity, 1e16, null]) {
            const layout = {
                snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null, today } },
            };
            expect(readSnapshot(layout).today).toBeNull();
        }
    });

    it('takes the current clock when no time is given', () => {
        const before = Date.now();
        const layout = inTimeZone('UTC', () => writeSnapshot({}, {}));
        const { today } = readSnapshot(layout);
        expect(today).toBeGreaterThanOrEqual(before);
        expect(today).toBeLessThanOrEqual(Date.now());
    });
});

describe('shouldRenderAll', () => {
    it('renders every message for a snapshot, whatever the setting says', () => {
        // A virtualized render captures one screen and silently drops the rest,
        // which in an export looks like data loss rather than a rendering choice.
        const snap = writeSnapshot({}, { firstVisibleIndex: 0, openId: null });
        expect(shouldRenderAll(snap, { virtualize: true })).toBe(true);
    });

    it('honours the virtualize setting on a normal render', () => {
        expect(shouldRenderAll({}, { virtualize: false })).toBe(true);
        expect(shouldRenderAll({}, { virtualize: true })).toBe(false);
        expect(shouldRenderAll({}, {})).toBe(false);
    });

    it('defaults to virtualized when there are no settings', () => {
        expect(shouldRenderAll(undefined, undefined)).toBe(false);
    });
});

describe('lanes in a snapshot', () => {
    it('records the lanes shown beside the view state, which reads back unchanged', () => {
        const layout = writeLaneSnapshot(
            inTimeZone('UTC', () =>
                writeSnapshot({}, { firstVisibleIndex: 4, openId: null }, TAKEN)
            ),
            ['v:T3', 'n:-2']
        );
        expect(readLaneSnapshot(layout)).toEqual({ keys: ['v:T3', 'n:-2'] });
        expect(readSnapshot(layout)).toEqual({ firstVisibleIndex: 4, openId: null, today: TAKEN });
    });

    it('records nothing without lanes, and reads nothing from an ordinary layout', () => {
        const layout = writeSnapshot({}, { firstVisibleIndex: 0, openId: null });
        writeLaneSnapshot(layout, null);
        expect(readLaneSnapshot(layout)).toBeNull();
        expect(readLaneSnapshot({ snapshotData: { chatboxLanes: { keys: ['v:A'] } } })).toBeNull();
        expect(() => writeLaneSnapshot(null, ['v:A'])).not.toThrow();
    });

    it('keeps only keys that are text', () => {
        const layout = writeLaneSnapshot(writeSnapshot({}, {}), ['v:A', 7, null]);
        expect(readLaneSnapshot(layout)).toEqual({ keys: ['v:A'] });
    });
});
