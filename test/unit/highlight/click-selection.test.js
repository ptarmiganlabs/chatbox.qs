import { describe, it, expect } from 'vitest';
import { SELECTION_OUTCOMES } from '../../../src/qix/field-selection';
import {
    VALUE_CLICK_HINT,
    categoryClickHint,
    planCategorySelection,
    planValueSelection,
    selectionNotice,
    valueClickHint,
} from '../../../src/highlight/click-selection';

const answer = {
    field: 'match',
    valueElements: new Map([
        ['reload', 4],
        ['Reload', 9],
        ['-', 0],
    ]),
    locked: { highlight: false, category: false },
    categories: {
        field: 'pattern',
        list: [
            { name: 'ops', elemNumber: 2, selected: true },
            { name: 'script', elemNumber: 5, selected: false },
        ],
    },
};

describe('what a click on a highlight selects', () => {
    it('selects every spelling the highlight stands for, by element number', () => {
        expect(planValueSelection(answer, ['reload', 'Reload'], false)).toEqual({
            field: 'match',
            elemNumbers: [4, 9],
            toggle: false,
            locked: false,
        });
        expect(planValueSelection(answer, ['-'], true).elemNumbers).toEqual([0]);
    });

    it('leaves out spellings it has no element number for, rather than selecting everything', () => {
        expect(planValueSelection(answer, ['unknown'], false).elemNumbers).toEqual([]);
        expect(planValueSelection({ field: 'match' }, ['reload'], false).elemNumbers).toEqual([]);
    });

    it('knows a locked field refuses before asking the engine', () => {
        const locked = { ...answer, locked: { highlight: true, category: false } };
        expect(planValueSelection(locked, ['reload'], false).locked).toBe(true);
        expect(valueClickHint(locked)).toBe('match is locked');
        expect(valueClickHint(answer)).toBe(VALUE_CLICK_HINT);
    });
});

describe('what a click on a legend chip selects', () => {
    it('replaces the category selection, or adds and removes with Ctrl or Cmd', () => {
        expect(planCategorySelection(answer, 'script', false)).toEqual({
            field: 'pattern',
            elemNumbers: [5],
            toggle: false,
            locked: false,
        });
        expect(planCategorySelection(answer, 'script', true).toggle).toBe(true);
    });

    it('clears the selection when the only selected category is clicked', () => {
        expect(planCategorySelection(answer, 'ops', false).toggle).toBe(true);
        const two = {
            ...answer,
            categories: {
                ...answer.categories,
                list: answer.categories.list.map((c) => ({ ...c, selected: true })),
            },
        };
        expect(planCategorySelection(two, 'ops', false).toggle).toBe(false);
    });

    it('selects nothing for a category it does not know, and knows a locked field', () => {
        expect(planCategorySelection(answer, 'nope', false).elemNumbers).toEqual([]);
        const locked = { ...answer, locked: { highlight: false, category: true } };
        expect(planCategorySelection(locked, 'ops', false).locked).toBe(true);
    });

    it('says what a click on a chip does', () => {
        const context = { locked: false, field: 'pattern', selectedCount: 1 };
        expect(categoryClickHint({ label: 'script', selected: false }, context)).toBe(
            'Click to select only script. Ctrl+click or Cmd+click adds or removes it'
        );
        expect(categoryClickHint({ label: 'ops', selected: true }, context)).toBe(
            'Click to clear the selection'
        );
        expect(
            categoryClickHint({ label: 'ops', selected: true }, { ...context, locked: true })
        ).toBe('pattern is locked');
    });
});

describe('selectionNotice', () => {
    it('says nothing when the values were selected', () => {
        expect(selectionNotice('match', { outcome: SELECTION_OUTCOMES.SELECTED })).toBeNull();
    });

    it('says why a selection did not happen, for every way it can fail', () => {
        expect(selectionNotice('match', { outcome: 'locked' })).toEqual({
            level: 'warning',
            text: 'match is locked',
        });
        expect(selectionNotice('match', { outcome: SELECTION_OUTCOMES.NOTHING })).toEqual({
            level: 'warning',
            text: 'There is no value to select in match',
        });
        expect(selectionNotice('match', { outcome: SELECTION_OUTCOMES.REFUSED })).toEqual({
            level: 'warning',
            text: 'Qlik Sense did not select in match; the field may be locked',
        });
        expect(
            selectionNotice('match', { outcome: SELECTION_OUTCOMES.ERROR, error: { code: 7000 } })
        ).toEqual({ level: 'error', text: 'Could not select in match: Qlik engine error 7000' });
        expect(
            selectionNotice('match', { outcome: SELECTION_OUTCOMES.ERROR, error: new Error('x') })
        ).toEqual({ level: 'error', text: 'Could not select in match' });
        expect(
            selectionNotice('match', { outcome: SELECTION_OUTCOMES.ERROR, stage: 'confirm' })
        ).toEqual({
            level: 'error',
            text: 'Could not select in match: the selection in progress could not be confirmed',
        });
    });
});
