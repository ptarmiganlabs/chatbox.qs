import { describe, it, expect } from 'vitest';
import { resolveRevealMode } from '../../src/ui/DetailReveal';
import { buildPath } from '../../src/ui/Sparkline';
import { buildColumns, resolveRoles, kpiColumns } from '../../src/qix/column-map';

describe('resolveRevealMode', () => {
    it('picks a side pane only when there is real width', () => {
        expect(resolveRevealMode({ width: 900, height: 600 }, 'auto')).toBe('pane');
        expect(resolveRevealMode({ width: 720, height: 400 }, 'auto')).toBe('pane');
    });

    it('falls back to an overlay at medium size', () => {
        expect(resolveRevealMode({ width: 500, height: 400 }, 'auto')).toBe('overlay');
    });

    it('falls back to inline when the object is small in either axis', () => {
        // A side pane is unusable at 320px wide, and an overlay has nowhere to
        // sit in a short object. Both degrade to expanding the bubble itself.
        expect(resolveRevealMode({ width: 320, height: 600 }, 'auto')).toBe('inline');
        expect(resolveRevealMode({ width: 500, height: 180 }, 'auto')).toBe('inline');
    });

    it('honours an explicit choice over the measured size', () => {
        expect(resolveRevealMode({ width: 320, height: 200 }, 'pane')).toBe('pane');
        expect(resolveRevealMode({ width: 2000, height: 900 }, 'inline')).toBe('inline');
    });

    it('degrades safely when there is no rect yet', () => {
        // useRect() returns zeros before the first measurement.
        expect(resolveRevealMode(undefined, 'auto')).toBe('inline');
        expect(resolveRevealMode({ width: 0, height: 0 }, undefined)).toBe('inline');
    });
});

describe('Sparkline buildPath', () => {
    it('returns null when there is not enough to draw', () => {
        expect(buildPath([], 0)).toBeNull();
        expect(buildPath([5], 0)).toBeNull();
        expect(buildPath([null, null], 0)).toBeNull();
    });

    it('does not divide by zero on a flat series', () => {
        const shape = buildPath([7, 7, 7], 1);
        expect(shape).not.toBeNull();
        expect(shape.path).not.toContain('NaN');
        expect(shape.cy).not.toBeNaN();
    });

    it('marks the active point', () => {
        const shape = buildPath([1, 5, 3], 1);
        expect(shape.cx).not.toBeNull();
        expect(shape.cy).not.toBeNull();
    });

    it('skips gaps rather than emitting NaN coordinates', () => {
        const shape = buildPath([1, null, 3], 2);
        expect(shape.path).not.toContain('NaN');
        expect(shape.cx).not.toBeNull();
    });

    it('leaves the marker null when the active point has no value', () => {
        const shape = buildPath([1, null, 3], 1);
        expect(shape.cx).toBeNull();
    });
});

describe('kpiColumns', () => {
    const layout = {
        qHyperCube: {
            qDimensionInfo: [{ cId: 'd_msgid' }, { cId: 'd_author' }],
            qMeasureInfo: [
                { cId: 'm_text', qFallbackTitle: 'Message text' },
                { cId: 'm_dupcheck', qFallbackTitle: '_rows' },
                { cId: 'm_x', qFallbackTitle: 'Sentiment' },
                { cId: 'm_y', qFallbackTitle: 'Length' },
            ],
        },
    };

    it('treats measures beyond the named roles as KPIs', () => {
        const { byRole } = resolveRoles(layout);
        const kpis = kpiColumns(buildColumns(layout), byRole);
        expect(kpis.map((c) => c.label)).toEqual(['Sentiment', 'Length']);
    });

    it('identifies KPIs by exclusion, not by position', () => {
        // The integrity probe moved to the end. Anything positional would call
        // it a KPI and show "_rows" to the user.
        const moved = {
            qHyperCube: {
                qDimensionInfo: [{ cId: 'd_msgid' }, { cId: 'd_author' }],
                qMeasureInfo: [
                    { cId: 'm_text', qFallbackTitle: 'Message text' },
                    { cId: 'm_x', qFallbackTitle: 'Sentiment' },
                    { cId: 'm_dupcheck', qFallbackTitle: '_rows' },
                ],
            },
        };
        const { byRole } = resolveRoles(moved);
        expect(kpiColumns(buildColumns(moved), byRole).map((c) => c.label)).toEqual(['Sentiment']);
    });

    it('returns nothing when only the role measures exist', () => {
        const minimal = {
            qHyperCube: {
                qDimensionInfo: [{ cId: 'd_msgid' }, { cId: 'd_author' }],
                qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
            },
        };
        const { byRole } = resolveRoles(minimal);
        expect(kpiColumns(buildColumns(minimal), byRole)).toEqual([]);
    });
});
