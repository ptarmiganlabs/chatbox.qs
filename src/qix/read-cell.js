/**
 * Safe accessors for Qlik hypercube cells (`NxCell`).
 *
 * The engine's cell shape has several traps that are easy to get wrong and
 * silent when you do:
 *
 *  - `qNum` arrives as the JSON *string* `"NaN"` for non-numeric cells, because
 *    JSON has no NaN literal. `typeof cell.qNum === 'number'` is therefore false
 *    for exactly the cells you would expect to be numbers.
 *  - The engine uses `'-'` as a display sentinel for "no value".
 *  - `qElemNumber` is negative for synthetic rows: -1 Total, -2 Null,
 *    -3 Others, -4 empty. Those are never selectable.
 */

/** Values the engine uses to mean "nothing here". */
const NULL_SENTINELS = new Set(['', '-']);

/**
 * Read a cell's display text.
 *
 * Deliberately ignores `qIsNull`. A measure that returns a STRING — which is how
 * message bodies arrive, via `Only([MsgText])` — has a null *numeric* value, so
 * the engine sets `qIsNull` on a cell whose `qText` is perfectly good. Guarding
 * on it silently blanks every message body.
 *
 * Qlik's own sn-table and sn-pivot-table never read `qIsNull` at all; they render
 * `qText` unconditionally. This follows them. Callers that genuinely need to know
 * whether a value is absent should use {@link isNull}.
 *
 * @param {object} [cell] - The NxCell, or undefined for a missing column.
 * @returns {string} The cell text, or '' when the cell or its text is absent.
 */
export function text(cell) {
    if (!cell) return '';
    return typeof cell.qText === 'string' ? cell.qText : '';
}

/**
 * Read a cell's display text, mapping engine null sentinels to null.
 *
 * Use this for optional metadata, where "absent" and "the literal string '-'"
 * must be distinguishable from a real value.
 *
 * @param {object} [cell] - The NxCell, or undefined for a missing column.
 * @returns {?string} The text, or null when the cell is empty or a sentinel.
 */
export function optionalText(cell) {
    const value = text(cell);
    return NULL_SENTINELS.has(value) ? null : value;
}

/**
 * Read a cell's numeric value, guarding the `"NaN"` string.
 *
 * @param {object} [cell] - The NxCell, or undefined for a missing column.
 * @returns {?number} The number, or null when the cell is not numeric.
 */
export function num(cell) {
    if (!cell || cell.qIsNull) return null;
    const raw = cell.qNum;
    if (raw === null || raw === undefined) return null;
    // The engine sends the string "NaN" for non-numeric cells.
    if (typeof raw === 'string') {
        if (raw === 'NaN') return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return Number.isFinite(raw) ? raw : null;
}

/**
 * Report whether a cell holds a usable number, for alignment decisions.
 *
 * @param {object} [cell] - The NxCell.
 * @returns {boolean} True when the cell is numeric.
 */
export function isNumeric(cell) {
    return num(cell) !== null;
}

/**
 * Read a cell's element number.
 *
 * @param {object} [cell] - The NxCell.
 * @returns {number} The qElemNumber, or -1 when absent.
 */
export function elem(cell) {
    if (!cell || typeof cell.qElemNumber !== 'number') return -1;
    return cell.qElemNumber;
}

/**
 * Report whether a cell can participate in a selection.
 *
 * Synthetic rows (Total, Null, Others, empty) carry negative element numbers
 * and must never be sent to `selectHyperCubeValues`.
 *
 * @param {object} [cell] - The NxCell.
 * @returns {boolean} True when the cell is selectable.
 */
export function isSelectable(cell) {
    return elem(cell) >= 0;
}

/**
 * Read a cell's selection state.
 *
 * @param {object} [cell] - The NxCell.
 * @returns {string} One of 'S', 'A', 'X', 'O', 'L'; defaults to 'O' (optional).
 */
export function state(cell) {
    return cell?.qState || 'O';
}

/**
 * Report whether a cell is null or absent.
 *
 * @param {object} [cell] - The NxCell.
 * @returns {boolean} True when there is no usable value.
 */
export function isNull(cell) {
    if (!cell) return true;
    if (cell.qIsNull) return true;
    return NULL_SENTINELS.has(text(cell));
}

/**
 * Resolve a row's absolute engine row index from its page area.
 *
 * A data page is only a window: `qArea.qTop` is the first row it contains, so
 * a row's absolute index is the area offset plus its position in the page.
 *
 * @param {object} [area] - The page's qArea.
 * @param {number} indexInPage - Zero-based row index within the page.
 * @returns {number} The absolute row index in the hypercube.
 */
export function absoluteRow(area, indexInPage) {
    return (area?.qTop ?? 0) + indexInPage;
}

/**
 * Resolve a cell's absolute column index from its page area.
 *
 * Mirrors {@link absoluteRow} for the horizontal axis. Only matters when a page
 * is fetched with a non-zero `qLeft`, but costs one addition to get right and
 * silently misaligns every column when omitted.
 *
 * @param {object} [area] - The page's qArea.
 * @param {number} indexInRow - Zero-based cell index within the row.
 * @returns {number} The absolute column index in the hypercube.
 */
export function absoluteCol(area, indexInRow) {
    return (area?.qLeft ?? 0) + indexInRow;
}
