/**
 * What a click on a highlight or a legend chip selects, what hovering over one says a click does, and
 * what the reader is told when a selection does not happen.
 *
 * A highlight stands for every spelling of its value the highlight field holds — "reload" and "Reload"
 * when case is ignored — and a click selects all of them, by element number, in the highlight field. A
 * chip selects its category in the category field; clicking the only selected chip clears it, and
 * Ctrl or Cmd adds or removes instead of replacing. A locked field is never asked: the answer already
 * says it is locked. A click never selects nothing silently: every way it can fail has a sentence.
 *
 * Pure: the engine calls are src/qix/field-selection.js. Wording from textview.qs at df84a5e.
 */
import { SELECTION_OUTCOMES } from '../qix/field-selection';

/** What hovering over a highlight says while a click selects its value. */
export const VALUE_CLICK_HINT =
    'Click to select this value. Ctrl+click or Cmd+click adds or removes it';

/**
 * Write what hovering over a highlight says a click does.
 *
 * @param {object} answer - The highlight source's answer.
 * @returns {string} The hint, or the lock that stops it.
 */
export function valueClickHint(answer) {
    return answer?.locked?.highlight ? `${answer.field} is locked` : VALUE_CLICK_HINT;
}

/**
 * Write what hovering over a legend chip says a click does.
 *
 * @param {{label: string, selected: boolean}} entry - The chip's entry.
 * @param {object} context - The legend.
 * @param {boolean} context.locked - Whether the category field is locked.
 * @param {string} context.field - The category field.
 * @param {number} context.selectedCount - How many categories are selected.
 * @returns {string} The hint.
 */
export function categoryClickHint(entry, { locked, field, selectedCount }) {
    if (locked) return `${field} is locked`;
    if (entry.selected && selectedCount === 1) return 'Click to clear the selection';
    return `Click to select only ${entry.label}. Ctrl+click or Cmd+click adds or removes it`;
}

/**
 * Work out what a click on a highlight selects.
 *
 * @param {object} answer - The highlight source's answer, with `valueElements`.
 * @param {string[]} values - The spellings the highlight stands for.
 * @param {boolean} toggle - Whether Ctrl or Cmd was held.
 * @returns {{field: string, elemNumbers: number[], toggle: boolean, locked: boolean}} The selection;
 *     `locked` when the field refuses selections anyway.
 */
export function planValueSelection(answer, values, toggle) {
    const elements = answer?.valueElements;
    const elemNumbers = (Array.isArray(values) ? values : [])
        .map((value) => (elements instanceof Map ? elements.get(value) : undefined))
        .filter((number) => Number.isInteger(number) && number >= 0);
    return {
        field: answer?.field ?? '',
        elemNumbers,
        toggle: Boolean(toggle),
        locked: answer?.locked?.highlight === true,
    };
}

/**
 * Work out what a click on a legend chip selects.
 *
 * @param {object} answer - The highlight source's answer, with `categories`.
 * @param {string} name - The chip's category.
 * @param {boolean} toggle - Whether Ctrl or Cmd was held.
 * @returns {{field: string, elemNumbers: number[], toggle: boolean, locked: boolean}} The selection;
 *     clicking the only selected category toggles it off.
 */
export function planCategorySelection(answer, name, toggle) {
    const categories = answer?.categories ?? null;
    const list = Array.isArray(categories?.list) ? categories.list : [];
    const category = list.find((entry) => entry.name === name);
    const selectedCount = list.filter((entry) => entry.selected).length;
    const elemNumber = category?.elemNumber;
    return {
        field: categories?.field ?? '',
        elemNumbers: Number.isInteger(elemNumber) && elemNumber >= 0 ? [elemNumber] : [],
        toggle: Boolean(toggle) || (category?.selected === true && selectedCount === 1),
        locked: answer?.locked?.category === true,
    };
}

/**
 * Write what the reader is told when a selection did not happen.
 *
 * @param {string} field - The field that was to be selected in.
 * @param {{outcome: string, error?: object, stage?: string}} result - What came of it.
 * @returns {?{text: string, level: string}} The notice, or null when the values were selected.
 */
export function selectionNotice(field, result) {
    switch (result?.outcome) {
        case SELECTION_OUTCOMES.SELECTED:
            return null;
        case 'locked':
            return { level: 'warning', text: `${field} is locked` };
        case SELECTION_OUTCOMES.NOTHING:
            return { level: 'warning', text: `There is no value to select in ${field}` };
        case SELECTION_OUTCOMES.REFUSED:
            return {
                level: 'warning',
                text: `Qlik Sense did not select in ${field}; the field may be locked`,
            };
        default: {
            if (result?.stage === 'confirm') {
                return {
                    level: 'error',
                    text: `Could not select in ${field}: the selection in progress could not be confirmed`,
                };
            }
            const code = result?.error?.qErrorCode ?? result?.error?.code;
            return {
                level: 'error',
                text:
                    code === undefined || code === null
                        ? `Could not select in ${field}`
                        : `Could not select in ${field}: Qlik engine error ${code}`,
            };
        }
    }
}
