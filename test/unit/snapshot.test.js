import { describe, it, expect } from 'vitest';
import { isSnapshot, readSnapshot, shouldRenderAll, writeSnapshot } from '../../src/ui/snapshot';

describe('snapshot round trip', () => {
    it('survives write then read — the whole point', () => {
        // Sense captures the LAYOUT, re-renders from it in a backend browser and
        // photographs that. Anything not written here is gone by then.
        const layout = {};
        writeSnapshot(layout, { firstVisibleIndex: 42, openId: 'm-17' });
        expect(readSnapshot(layout)).toEqual({ firstVisibleIndex: 42, openId: 'm-17' });
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
        writeSnapshot(layout, { firstVisibleIndex: -5, openId: 42 });
        expect(readSnapshot(layout)).toEqual({ firstVisibleIndex: 0, openId: null });

        const empty = {};
        writeSnapshot(empty, undefined);
        expect(readSnapshot(empty)).toEqual({ firstVisibleIndex: 0, openId: null });
    });

    it('does not throw on a layout it cannot write to', () => {
        expect(() => writeSnapshot(null, { firstVisibleIndex: 1 })).not.toThrow();
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
