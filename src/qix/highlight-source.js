/**
 * Working out which values to highlight, which categories they belong to, and why there may be none.
 *
 * It reads the companion session object and answers one of several kinds. The values are the ones
 * selected in the field and still possible, or, with nothing selected and the fallback on, every value
 * the other selections leave possible.
 * Every reason for having nothing to highlight is a kind of its own: "the field is not in the data
 * model", "nothing is selected", "the selection is excluded by other selections" and "no value is
 * possible" otherwise look identical on screen — no highlights, no explanation.
 *
 * Values are fetched only when there are some: the first rows arrive with the companion's layout, and
 * paging covers the rest up to the limit. With a category field the cube has a row per value and
 * category, and the limit still counts values: reading stops at the first value past it, and a value is
 * never kept with only some of its categories. A category field that multiplies the rows — a data
 * island pairs every value with every category — is read up to {@link MAX_CATEGORY_ROWS} rows, and the
 * answer says how many values that left. A problem with the categories is reported beside the values,
 * never instead of them: the highlights are still right without their colours.
 *
 * Along with the values it answers what selecting them by clicking needs: each value's element number,
 * whether each category is selected, and whether either field is locked.
 *
 * It does not look for the values in the messages, and it does not choose colours.
 *
 * Ported from textview.qs `src/qix/highlight-source.js` at df84a5e. Changed: it pages with chatbox's
 * own `fetchAllRows`, whose stale abort answers null here, and it reads cells with `read-cell.js`.
 */
import { COLOR_ATTRIBUTE_ID } from './companion';
import { createExpressionChecker } from './expression-check';
import { fetchAllRows } from './paging';
import { isNullDimensionCell, text as cellText } from './read-cell';

/** What the companion can say about the highlights. */
export const HIGHLIGHT_KINDS = Object.freeze({
    OFF: 'off',
    FIELD_MISSING: 'field-missing',
    NO_SELECTION: 'no-selection',
    NONE_POSSIBLE: 'none-possible',
    EXCLUDED: 'excluded',
    ERROR: 'error',
    VALUES: 'values',
});

/**
 * The most value and category rows read. Twice the highest value limit: enough for every value to
 * have a second category, and a bound on a category field that pairs every value with every category.
 */
export const MAX_CATEGORY_ROWS = 20_000;

/**
 * Read a count the engine evaluated.
 *
 * @param {*} value - The evaluated expression.
 * @returns {?number} The count, or null when the engine produced no number.
 */
function countOf(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Decide what the companion says about the highlights, without fetching anything.
 *
 * @param {object} request - What to describe.
 * @param {string} request.field - The highlight field; '' when none is set.
 * @param {?object} request.companionLayout - The companion's layout; null when it is unavailable.
 * @param {boolean} [request.possibleWhenNoneSelected] - Whether possible values stand in when nothing
 *     is selected.
 * @returns {object} A description with `kind` (one of {@link HIGHLIGHT_KINDS}) and, depending on the
 *     kind, `field`, `error`, `excluded`, `source` ('selected' or 'possible') and `total`.
 */
export function describeHighlights({ field, companionLayout, possibleWhenNoneSelected = true }) {
    if (!field) return { kind: HIGHLIGHT_KINDS.OFF };
    if (!companionLayout) return { kind: HIGHLIGHT_KINDS.ERROR, field, error: null };

    const selected = countOf(companionLayout.highlightSelected);
    const selectedAll = countOf(companionLayout.highlightSelectedAll);
    if (selected === -1 || selectedAll === -1) {
        return { kind: HIGHLIGHT_KINDS.FIELD_MISSING, field };
    }
    if (selected === null || selectedAll === null) {
        return { kind: HIGHLIGHT_KINDS.ERROR, field, error: null };
    }
    if (selectedAll === 0 && !possibleWhenNoneSelected) {
        return { kind: HIGHLIGHT_KINDS.NO_SELECTION, field };
    }
    if (selectedAll > 0 && selected === 0) {
        return { kind: HIGHLIGHT_KINDS.EXCLUDED, field, excluded: selectedAll };
    }

    const cube = companionLayout.qHyperCube;
    // Only the value column's own error counts here: a broken category column leaves the values usable.
    const error = cube?.qError ?? cube?.qDimensionInfo?.[0]?.qError;
    if (error) return { kind: HIGHLIGHT_KINDS.ERROR, field, error };
    const rows = Number(cube?.qSize?.qcy) || 0;
    if (selectedAll === 0 && rows === 0) return { kind: HIGHLIGHT_KINDS.NONE_POSSIBLE, field };
    // With a category column there is a row per value and category, so the engine counts the values.
    const possible = countOf(companionLayout.highlightPossible);
    const total = (Number(cube?.qSize?.qcx) || 1) >= 2 && possible !== null ? possible : rows;
    const source = selectedAll > 0 ? 'selected' : 'possible';
    return { kind: HIGHLIGHT_KINDS.VALUES, field, source, total };
}

/**
 * Find what is wrong with the category column, if anything.
 *
 * @param {?object} companionLayout - The companion's layout, read with a category field.
 * @returns {?{kind: string, error?: ?object}} `{kind: 'field-missing'}` for a field that is not in the
 *     data model, `{kind: 'error', error}` when the engine could not compute the column or its check,
 *     or null when the categories are sound.
 */
export function categoryProblem(companionLayout) {
    const count = countOf(companionLayout?.categorySelectedAll);
    // The engine drops the column of a field it does not know and lists an error for it; -1 says why.
    if (count === -1) return { kind: 'field-missing' };
    const error = companionLayout?.qHyperCube?.qDimensionInfo?.[1]?.qError;
    if (error) return { kind: 'error', error };
    return count === null ? { kind: 'error', error: null } : null;
}

/**
 * Tell one value's rows from the next value's.
 *
 * @param {object} cell - The value cell.
 * @returns {string} A key that is the same for every row of one value.
 */
function valueKey(cell) {
    return typeof cell.qElemNumber === 'number' ? `#${cell.qElemNumber}` : `=${cellText(cell)}`;
}

/**
 * Count the values in rows read so far.
 *
 * @param {Array<Array<object>>} rows - Value and category rows.
 * @returns {number} How many values they hold.
 */
function countValues(rows) {
    const keys = new Set();
    for (const row of rows) {
        if (!isNullDimensionCell(row?.[0])) keys.add(valueKey(row[0]));
    }
    return keys.size;
}

/**
 * Read a category's colour attribute.
 *
 * @param {object} cell - The category cell.
 * @param {number} index - Where the colour attribute sits among the cell's attributes; -1 for none.
 * @returns {?{text: string, number: ?number}} What the colour expression returned, or null when it
 *     returned nothing. The engine answers a missing number with the string "NaN".
 */
function colorOf(cell, index) {
    const attribute = index < 0 ? undefined : cell.qAttrExps?.qValues?.[index];
    const text = typeof attribute?.qText === 'string' ? attribute.qText : '';
    const number = typeof attribute?.qNum === 'number' && Number.isFinite(attribute.qNum);
    if (text === '' && !number) return null;
    return { text, number: number ? attribute.qNum : null };
}

/**
 * Group value and category rows into values, their categories, and the categories seen.
 *
 * Rows arrive sorted by value, so the rows of one value are next to each other.
 *
 * @param {Array<Array<object>>} matrix - The rows: a value cell, then a category cell when the column
 *     exists.
 * @param {object} options - How to group.
 * @param {number} options.limit - The most values to keep.
 * @param {boolean} options.complete - Whether these are all of the cube's rows. When they are not, the
 *     last value may have more categories in rows not read, so it is left out.
 * @param {number} [options.colorIndex] - Where the colour attribute sits; -1 for none.
 * @returns {{values: string[], valueElements: Map<string, number>,
 *     rows: Array<{value: string, category: ?string}>,
 *     categories: Array<{name: string, elemNumber: number, color: ?object, selected: boolean}>,
 *     truncated: boolean, limited: boolean}} The distinct values in order and each value's element
 *     number, one row per value and category (a null category for none), each category once in order of
 *     first appearance with whether it is selected, whether values were left out, and whether it was
 *     the limit that left them out.
 */
export function groupValueRows(matrix, { limit, complete, colorIndex = -1 }) {
    const kept = [];
    let count = 0;
    let lastKey = null;
    let lastStart = 0;
    let truncated = false;
    let limited = false;
    for (const row of matrix) {
        const cell = row?.[0];
        if (isNullDimensionCell(cell)) continue;
        const key = valueKey(cell);
        if (key !== lastKey) {
            if (count === limit) {
                truncated = true;
                limited = true;
                break;
            }
            count += 1;
            lastKey = key;
            lastStart = kept.length;
        }
        kept.push(row);
    }
    if (!truncated && !complete && count > 0) {
        kept.length = lastStart;
        truncated = true;
    }

    const values = [];
    const valueElements = new Map();
    const rows = [];
    const categories = new Map();
    let previous = null;
    for (const row of kept) {
        const value = cellText(row[0]);
        const key = valueKey(row[0]);
        if (key !== previous) values.push(value);
        previous = key;
        if (!valueElements.has(value)) valueElements.set(value, row[0].qElemNumber);

        const cell = row[1];
        if (isNullDimensionCell(cell)) {
            rows.push({ value, category: null });
            continue;
        }
        const name = cellText(cell);
        rows.push({ value, category: name });
        if (!categories.has(name)) {
            categories.set(name, {
                name,
                elemNumber: cell.qElemNumber,
                color: colorOf(cell, colorIndex),
                // S: selected; L: selected and locked.
                selected: cell.qState === 'S' || cell.qState === 'L',
            });
        }
    }
    return {
        values,
        valueElements,
        rows,
        categories: [...categories.values()],
        truncated,
        limited,
    };
}

/**
 * Create the highlight source for one chatbox object.
 *
 * @param {object} options - Collaborators.
 * @param {{session: Function}} options.companion - The companion manager.
 * @param {{warn: Function}} [options.logger] - Where failures are reported.
 * @returns {{load: function(object): Promise<?object>}} The source.
 */
export function createHighlightSource({ companion, logger }) {
    const checker = createExpressionChecker({ logger });

    /**
     * Work out the highlights, fetching the values when there are some.
     *
     * @param {object} request - The request.
     * @param {object} request.app - The enigma Doc.
     * @param {object} request.definition - The companion definition.
     * @param {?{field: string, limit: number}} request.highlight - The highlight settings.
     * @param {?{field: string, colorExpression?: string}} [request.category] - The category settings,
     *     when a category field is set.
     * @param {function(): boolean} [request.isStale] - True once a newer request has started.
     * @returns {Promise<?object>} The description from {@link describeHighlights}. With values, it adds
     *     `values`, `valueElements` (each value's element number in the highlight field), `rows` (each
     *     value with one category, or null), `truncated`, `limit`, `rowsFull` (true when
     *     {@link MAX_CATEGORY_ROWS} rather than the limit left values out), `locked` (whether the
     *     highlight and the category field are locked) and `categories`: null without a category field,
     *     otherwise the field, its `problem`, the colour expression's `expression` problem and the
     *     `list` of categories. Null when the request went stale.
     */
    async function load({ app, definition, highlight, category = null, isStale = () => false }) {
        if (!highlight?.field) return { kind: HIGHLIGHT_KINDS.OFF };

        const categorized = Boolean(category?.field);
        const [session, expressionProblem] = await Promise.all([
            companion.session(app, definition),
            categorized && category.colorExpression
                ? checker.check(app, category.colorExpression)
                : null,
        ]);
        if (isStale()) return null;
        const described = describeHighlights({
            field: highlight.field,
            companionLayout: session?.layout ?? null,
            possibleWhenNoneSelected: highlight.possibleWhenNoneSelected !== false,
        });
        if (described.kind !== HIGHLIGHT_KINDS.VALUES) return described;

        const cube = session.layout.qHyperCube;
        // The engine leaves out the column of a category field it does not know.
        const grouped = categorized && (Number(cube?.qSize?.qcx) || 1) >= 2;
        let fetched;
        try {
            fetched = await fetchAllRows({
                model: session.model,
                layout: { qHyperCube: cube },
                maxRows: grouped ? MAX_CATEGORY_ROWS : highlight.limit,
                isStale,
                isEnough: grouped ? (rows) => countValues(rows) > highlight.limit : undefined,
            });
        } catch (error) {
            // A newer request took over while paging: its answer is the one that counts.
            if (error?.name === 'AbortError') return null;
            // The messages are still worth showing; the highlights say why they are missing.
            logger?.warn?.('The highlight values could not be fetched:', error);
            return { kind: HIGHLIGHT_KINDS.ERROR, field: highlight.field, error };
        }

        // A missing category column is never presented as values without categories: without a
        // reason from the engine, it is a column that could not be read.
        const problem = categorized
            ? (categoryProblem(session.layout) ?? (grouped ? null : { kind: 'error', error: null }))
            : null;
        const categories = categorized
            ? {
                  field: category.field,
                  problem,
                  expression: grouped ? expressionProblem : null,
                  list: [],
              }
            : null;

        const locked = {
            highlight: cube?.qDimensionInfo?.[0]?.qLocked === true,
            category: cube?.qDimensionInfo?.[1]?.qLocked === true,
        };

        if (!grouped) {
            const values = [];
            const valueElements = new Map();
            for (const row of fetched.rows) {
                const cell = row?.[0];
                if (isNullDimensionCell(cell)) continue;
                const value = cellText(cell);
                values.push(value);
                if (!valueElements.has(value)) valueElements.set(value, cell.qElemNumber);
            }
            return {
                ...described,
                values,
                valueElements,
                rows: values.map((value) => ({ value, category: null })),
                truncated: fetched.truncated,
                limit: highlight.limit,
                rowsFull: false,
                locked,
                categories,
            };
        }

        const attributes = cube?.qDimensionInfo?.[1]?.qAttrExprInfo;
        const group = groupValueRows(fetched.rows, {
            limit: highlight.limit,
            complete: fetched.rows.length >= fetched.total,
            colorIndex: Array.isArray(attributes)
                ? attributes.findIndex((info) => info?.id === COLOR_ATTRIBUTE_ID)
                : -1,
        });
        categories.list = group.categories;
        return {
            ...described,
            values: group.values,
            valueElements: group.valueElements,
            rows: group.rows,
            truncated: group.truncated,
            limit: highlight.limit,
            // Rows ran out before the limit did: the categories multiplied the rows.
            rowsFull: !group.limited && fetched.rows.length >= MAX_CATEGORY_ROWS,
            locked,
            categories,
        };
    }

    return { load };
}
