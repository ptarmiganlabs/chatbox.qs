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

describe('selectInFieldBesideObjectSelections', () => {
    /** The object's selections, from useSelections(). */
    const selectionsActive = (active) => ({
        isActive: vi.fn(() => active),
        confirm: vi.fn(async () => true),
    });

    it('confirms a selection pending in the object before selecting in the field', async () => {
        const { selectInFieldBesideObjectSelections } =
            await import('../../src/qix/field-selection');
        const app = appSelecting(true);
        const selections = selectionsActive(true);
        const order = [];
        selections.confirm.mockImplementation(async () => order.push('confirm'));
        app.field.lowLevelSelect.mockImplementation(async () => order.push('select') && true);
        await expect(
            selectInFieldBesideObjectSelections({
                selections,
                app,
                field: 'match',
                elemNumbers: [3],
                toggle: false,
            })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.SELECTED });
        expect(order).toEqual(['confirm', 'select']);
    });

    it('confirms nothing when no selection is pending', async () => {
        const { selectInFieldBesideObjectSelections } =
            await import('../../src/qix/field-selection');
        const app = appSelecting(true);
        const selections = selectionsActive(false);
        await selectInFieldBesideObjectSelections({
            selections,
            app,
            field: 'match',
            elemNumbers: [3],
            toggle: true,
        });
        expect(selections.confirm).not.toHaveBeenCalled();
        expect(app.field.lowLevelSelect).toHaveBeenCalledWith([3], true, false);
    });

    it('leaves a pending selection alone when there is nothing to select', async () => {
        const { selectInFieldBesideObjectSelections } =
            await import('../../src/qix/field-selection');
        const app = appSelecting(true);
        const selections = selectionsActive(true);
        await expect(
            selectInFieldBesideObjectSelections({
                selections,
                app,
                field: 'match',
                elemNumbers: [-2],
                toggle: false,
            })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.NOTHING });
        expect(selections.confirm).not.toHaveBeenCalled();
        expect(app.getField).not.toHaveBeenCalled();
    });

    it('selects nothing, and says so, when the pending selection cannot be confirmed', async () => {
        const { selectInFieldBesideObjectSelections } =
            await import('../../src/qix/field-selection');
        const app = appSelecting(true);
        const selections = selectionsActive(true);
        const failure = new Error('Selection mode ended');
        selections.confirm.mockRejectedValue(failure);
        await expect(
            selectInFieldBesideObjectSelections({
                selections,
                app,
                field: 'match',
                elemNumbers: [3],
                toggle: false,
            })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.ERROR, error: failure, stage: 'confirm' });
        expect(app.getField).not.toHaveBeenCalled();
    });

    it('ends a modal state another object holds, once, and selects again', async () => {
        const { selectInFieldBesideObjectSelections } =
            await import('../../src/qix/field-selection');
        const modal = Object.assign(new Error('Modal object'), { code: 6003 });
        const field = {
            lowLevelSelect: vi.fn().mockRejectedValueOnce(modal).mockResolvedValue(true),
        };
        const app = {
            getField: vi.fn(async () => field),
            abortModal: vi.fn(async () => undefined),
        };
        await expect(
            selectInFieldBesideObjectSelections({
                selections: null,
                app,
                field: 'match',
                elemNumbers: [3],
                toggle: false,
            })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.SELECTED });
        expect(app.abortModal).toHaveBeenCalledWith(true);
        expect(field.lowLevelSelect).toHaveBeenCalledTimes(2);
    });

    it('does not retry other engine errors', async () => {
        const { selectInFieldBesideObjectSelections } =
            await import('../../src/qix/field-selection');
        const other = Object.assign(new Error('Field not found'), { code: 7000 });
        const field = { lowLevelSelect: vi.fn().mockRejectedValue(other) };
        const app = { getField: vi.fn(async () => field), abortModal: vi.fn() };
        await expect(
            selectInFieldBesideObjectSelections({
                selections: null,
                app,
                field: 'match',
                elemNumbers: [3],
                toggle: false,
            })
        ).resolves.toEqual({ outcome: SELECTION_OUTCOMES.ERROR, error: other });
        expect(app.abortModal).not.toHaveBeenCalled();
        expect(field.lowLevelSelect).toHaveBeenCalledTimes(1);
    });
});
