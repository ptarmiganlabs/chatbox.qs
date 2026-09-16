// Ported from textview.qs test/unit/qix/selections.test.js at df84a5e.
import { describe, it, expect, vi } from 'vitest';
import {
    SELECTION_OUTCOMES,
    selectInField,
    selectableElements,
    stateNameOf,
} from '../../src/qix/field-selection';

/** An enigma Doc whose fields answer lowLevelSelect with the given result. */
function appSelecting(result) {
    const field = { lowLevelSelect: vi.fn(async () => result) };
    return { field, getField: vi.fn(async () => field) };
}

describe('stateNameOf', () => {
    it("reads the object's alternate state, from the cube or the layout", () => {
        expect(stateNameOf({ qHyperCube: { qStateName: 'Compare' } })).toBe('Compare');
        expect(stateNameOf({ qStateName: 'Other' })).toBe('Other');
    });

    it('answers the default state otherwise', () => {
        expect(stateNameOf({ qHyperCube: {} })).toBe('$');
        expect(stateNameOf({ qStateName: '' })).toBe('$');
        expect(stateNameOf(undefined)).toBe('$');
    });
});

describe('selectableElements', () => {
    it('keeps real values once, in order, and drops nulls and synthetic rows', () => {
        expect(selectableElements([4, -2, 4, 0, 1.5, 'NaN', null, 9])).toEqual([4, 0, 9]);
        expect(selectableElements(undefined)).toEqual([]);
    });
});

describe('selectInField', () => {
    it('selects by element number in the given state, replacing the selection', async () => {
        const app = appSelecting(true);
        await expect(
            selectInField({
                app,
                field: 'pattern',
                stateName: 'Compare',
                elemNumbers: [0, 0, -2],
                toggle: false,
            })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.SELECTED });
        expect(app.getField).toHaveBeenCalledWith('pattern', 'Compare');
        // Captured on the test server: lowLevelSelect([0], false, false) selected pattern = email.
        expect(app.field.lowLevelSelect).toHaveBeenCalledWith([0], false, false);
    });

    it('adds or removes values when toggling, never overriding a lock', async () => {
        const app = appSelecting(true);
        await selectInField({ app, field: 'pattern', elemNumbers: [3], toggle: true });
        expect(app.getField).toHaveBeenCalledWith('pattern', '$');
        expect(app.field.lowLevelSelect).toHaveBeenCalledWith([3], true, false);
    });

    it('says the engine refused, as it does for a locked field', async () => {
        // Captured on the test server: lowLevelSelect on a locked field answered false.
        const app = appSelecting(false);
        await expect(
            selectInField({ app, field: 'pattern', elemNumbers: [4], toggle: false })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.REFUSED });
    });

    it('never sends an empty list, which the engine can read as every value', async () => {
        const app = appSelecting(true);
        await expect(
            selectInField({ app, field: 'pattern', elemNumbers: [-2], toggle: false })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.NOTHING });
        await expect(
            selectInField({ app, field: '', elemNumbers: [1], toggle: false })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.NOTHING });
        expect(app.getField).not.toHaveBeenCalled();
    });

    it('reports an engine error, and logs it', async () => {
        const logger = { warn: vi.fn() };
        const failure = Object.assign(new Error('Field not found'), { code: 7000 });
        const app = { getField: vi.fn(async () => Promise.reject(failure)) };
        await expect(
            selectInField({ app, field: 'nope', elemNumbers: [1], toggle: false, logger })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.ERROR, error: failure });
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('nope'), failure);
    });
});
