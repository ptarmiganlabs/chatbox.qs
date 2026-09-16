/**
 * Selecting values in a field from the conversation: a legend chip's category, or a highlight's value.
 *
 * Selections go to the field itself by element number, with the engine's Field.LowLevelSelect. The
 * values the viewer shows come from the companion's hypercube, whose cells carry each value's element
 * number in its field, so there is no text to match: a number-like value loaded without Text() is
 * selected as the value it is, whatever its spelling. The field is addressed in the object's state, so
 * an object in an alternate state selects in that state. Locks are respected: a locked field refuses,
 * and the answer says so instead of looking like a click that did nothing.
 *
 * It never sends an empty list of element numbers, which the engine can read as every value. It does
 * not decide whether selecting is allowed.
 *
 * These selections bypass the object's own selection mode: nebula's `useSelections()` can only select
 * in the object's hypercube (`src/qix/selection.js`), and the highlight and category fields are not in
 * it, so a click here applies at once, like a filter-pane click.
 *
 * Ported from textview.qs `src/qix/selections.js` at df84a5e, renamed because chatbox.qs already has
 * a `selection.js` for clicks on messages.
 */

/** What a selection can come to. */
export const SELECTION_OUTCOMES = Object.freeze({
    SELECTED: 'selected',
    NOTHING: 'nothing',
    REFUSED: 'refused',
    ERROR: 'error',
});

/**
 * Find the alternate state an object's layout is in.
 *
 * @param {object} [layout] - The object's layout.
 * @returns {string} The state name, '$' for the default state.
 */
export function stateNameOf(layout) {
    const name = layout?.qHyperCube?.qStateName ?? layout?.qStateName;
    return typeof name === 'string' && name !== '' ? name : '$';
}

/**
 * Keep the element numbers that stand for real values, each once.
 *
 * @param {Array<*>} elemNumbers - Element numbers from hypercube cells.
 * @returns {number[]} The non-negative whole numbers among them, in order; negative ones are null and
 *     synthetic rows.
 */
export function selectableElements(elemNumbers) {
    const kept = [];
    for (const number of Array.isArray(elemNumbers) ? elemNumbers : []) {
        if (Number.isInteger(number) && number >= 0 && !kept.includes(number)) kept.push(number);
    }
    return kept;
}

/**
 * Select values in a field.
 *
 * @param {object} request - The selection.
 * @param {object} request.app - The enigma Doc.
 * @param {string} request.field - The field's name.
 * @param {string} [request.stateName] - The state to select in; the default state when not given.
 * @param {Array<number>} request.elemNumbers - The values' element numbers in the field.
 * @param {boolean} request.toggle - Add or remove the values rather than replace the selection.
 * @param {{warn: Function}} [request.logger] - Where failures are reported.
 * @returns {Promise<{outcome: string, error?: object}>} What came of it, one of
 *     {@link SELECTION_OUTCOMES}: nothing to select, refused by the engine (a locked field), an error,
 *     or selected.
 */
export async function selectInField({ app, field, stateName = '$', elemNumbers, toggle, logger }) {
    const values = selectableElements(elemNumbers);
    if (values.length === 0 || !field) return { outcome: SELECTION_OUTCOMES.NOTHING };
    try {
        const handle = await app.getField(field, stateName);
        const selected = await handle.lowLevelSelect(values, Boolean(toggle), false);
        return { outcome: selected ? SELECTION_OUTCOMES.SELECTED : SELECTION_OUTCOMES.REFUSED };
    } catch (error) {
        logger?.warn?.(`The selection in ${field} failed:`, error);
        return { outcome: SELECTION_OUTCOMES.ERROR, error };
    }
}

/** The engine's answer when another object holds the selection mode (LOCERR_HC_MODAL_OBJECT_ERROR). */
const MODAL_OBJECT_ERROR = 6003;

/**
 * Select values in a field while this object may be in its own selection mode.
 *
 * A click on a message selects through nebula's selection mode: a toolbar opens and the selection is
 * pending until confirmed. A click on a highlight or a chip then selects in another field at once. In
 * Sense, a click elsewhere confirms a pending selection, so that is done first: cancelling would drop
 * the reader's pick without a word, and refusing would make the click do nothing. Should the engine
 * still answer that an object holds the selection mode, the modal state is ended the way stardust
 * itself ends it, and the selection is tried once more.
 *
 * @param {object} request - The selection.
 * @param {?object} request.selections - The object's selections, from useSelections().
 * @param {object} request.app - The enigma Doc.
 * @param {string} request.field - The field's name.
 * @param {string} [request.stateName] - The state to select in.
 * @param {Array<number>} request.elemNumbers - The values' element numbers in the field.
 * @param {boolean} request.toggle - Add or remove the values rather than replace the selection.
 * @param {{warn: Function}} [request.logger] - Where failures are reported.
 * @returns {Promise<{outcome: string, error?: object, stage?: string}>} What came of it; `stage` is
 *     'confirm' when the pending selection could not be confirmed.
 */
export async function selectInFieldBesideObjectSelections({
    selections,
    app,
    field,
    stateName = '$',
    elemNumbers,
    toggle,
    logger,
}) {
    const values = selectableElements(elemNumbers);
    // Nothing to select leaves a pending selection alone.
    if (values.length === 0 || !field) return { outcome: SELECTION_OUTCOMES.NOTHING };

    if (selections?.isActive?.()) {
        try {
            await selections.confirm();
        } catch (error) {
            logger?.warn?.('The selection in progress could not be confirmed:', error);
            return { outcome: SELECTION_OUTCOMES.ERROR, error, stage: 'confirm' };
        }
    }

    const request = { app, field, stateName, elemNumbers: values, toggle, logger };
    const result = await selectInField(request);
    const code = result.error?.qErrorCode ?? result.error?.code;
    if (
        result.outcome === SELECTION_OUTCOMES.ERROR &&
        code === MODAL_OBJECT_ERROR &&
        typeof app?.abortModal === 'function'
    ) {
        try {
            await app.abortModal(true);
        } catch (error) {
            logger?.warn?.('The modal selection state could not be ended:', error);
            return result;
        }
        return selectInField(request);
    }
    return result;
}
