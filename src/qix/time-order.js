/**
 * Messages in time order: the message id sorted by the timestamp.
 *
 * A straight cube lists its rows in its sort order, and everything reads that order as time: Oldest first
 * reads from the first row, Newest first and lanes from the last, and the day headers and linked rows
 * follow the rows as read. The message id was only ever sorted numerically, which is time order only
 * while ids rise with time. Ids numbered per thread, per source system, or as text gave a conversation
 * whose days jumped back and forth — Feb 3, Feb 5, Feb 3 — and a "newest" that was only the highest ids.
 *
 * So when a Timestamp (numeric) expression is set, the message id sorts by it, and by the id only where
 * two messages share a timestamp. The engine sorts, so the rows read, the message limit and paging all
 * follow time; a sort in the browser could only reorder the rows the limit had already chosen.
 *
 * Two writers, never both at once. In edit mode, `syncAttributeExpressions` saves the sort with the
 * metadata. Anywhere else, {@link createTimeOrder} applies it as a soft patch — for this session only, and
 * allowed without edit rights — so a published app that nobody edits is in time order for every reader.
 * A snapshot is never patched: its layout was taken from a session that already had the sort.
 */
import logger from '../util/logger';
import { ROLES, conversationModelOf, resolveRoles } from './column-map';
import { ATTR_IDS } from './attr-map';

/** Separator for memo signatures. It cannot occur in engine text. */
const SEP = String.fromCharCode(0);

/**
 * Read a dimension's timestamp attribute expression, as a sort can use it.
 *
 * @param {object} [dimension] - An NxDimension from the object properties.
 * @returns {string} The expression, trimmed and without a leading `=`; '' when there is none.
 */
export function timestampExpressionOf(dimension) {
    const entry = (dimension?.qAttributeExpressions ?? []).find((e) => e?.id === ATTR_IDS.TS);
    const text = typeof entry?.qExpression === 'string' ? entry.qExpression.trim() : '';
    return text.startsWith('=') ? text.slice(1).trim() : text;
}

/**
 * Build the sort that puts messages in time order.
 *
 * One criteria entry: in it the engine applies the expression before the numeric sort, so the id only
 * breaks ties between messages with the same timestamp, and keeps them in the order they always had.
 *
 * @param {string} expression - The timestamp expression, from {@link timestampExpressionOf}.
 * @returns {object[]} The dimension's `qSortCriterias`.
 */
export function timeSortCriteria(expression) {
    return [{ qSortByExpression: 1, qExpression: { qv: expression }, qSortByNumeric: 1 }];
}

/**
 * Report whether a dimension already sorts by a timestamp expression, earliest first.
 *
 * Saved properties give every field of the criteria; a soft patch shows only the ones it set. Both are
 * read the same way.
 *
 * @param {object} [dimension] - An NxDimension, from saved or effective properties.
 * @param {string} expression - The timestamp expression, from {@link timestampExpressionOf}.
 * @returns {boolean} True when its first sort criteria sorts ascending by that expression.
 */
export function isSortedBy(dimension, expression) {
    const criteria = dimension?.qDef?.qSortCriterias?.[0];
    const qv = typeof criteria?.qExpression?.qv === 'string' ? criteria.qExpression.qv.trim() : '';
    return Boolean(expression) && criteria?.qSortByExpression === 1 && qv === expression;
}

/**
 * Find the message id column of a layout.
 *
 * @param {object} layout - The object layout.
 * @returns {?object} Its column descriptor, or null when the message id is not a dimension.
 */
export function messageIdColumnOf(layout) {
    const { byRole } = resolveRoles(layout, layout?.chatbox?.roles, {
        conversationModel: conversationModelOf(layout?.chatbox),
    });
    const column = byRole[ROLES.MESSAGE_ID];
    return column && column.kind === 'dim' ? column : null;
}

/**
 * Create the reader-side time order: a soft patch, tried once for each object and message id column.
 *
 * Tried once, whatever happens: a patch changes the layout, and the render that brings must read the rows
 * rather than patch again. A patch the engine refuses is logged, and the rows are read in the order the
 * cube has.
 *
 * @returns {{ensure: function(object): Promise<boolean>}} `ensure` resolves true when it applied a patch,
 *     after which the rows must not be read against the layout it was given: that layout is sorted the
 *     old way, and the new one is on its way.
 */
export function createTimeOrder() {
    const tried = new Set();
    return {
        /**
         * Sort the messages by their timestamp for this session, when they are not already.
         *
         * @param {object} options - Inputs.
         * @param {object} options.model - The enigma GenericObject model.
         * @param {object} options.layout - The layout the rows would be read against.
         * @param {boolean} [options.edit] - Whether the sheet is in edit mode, where the sort is saved instead.
         * @param {boolean} [options.snapshot] - Whether this render is of a snapshot.
         * @returns {Promise<boolean>} True when a patch was applied.
         */
        async ensure({ model, layout, edit = false, snapshot = false }) {
            if (!model || !layout?.qHyperCube || edit || snapshot) return false;
            const column = messageIdColumnOf(layout);
            if (!column) return false;
            const signature = [layout.qInfo?.qId ?? '', column.col, column.cId ?? ''].join(SEP);
            if (tried.has(signature)) return false;
            tried.add(signature);

            try {
                const read = model.getEffectiveProperties ?? model.getProperties;
                const properties = await read.call(model);
                const dimension = properties?.qHyperCubeDef?.qDimensions?.[column.col];
                const expression = timestampExpressionOf(dimension);
                if (!expression || isSortedBy(dimension, expression)) return false;
                await model.applyPatches(
                    [
                        {
                            qOp: 'replace',
                            qPath: `/qHyperCubeDef/qDimensions/${column.col}/qDef/qSortCriterias`,
                            qValue: JSON.stringify(timeSortCriteria(expression)),
                        },
                    ],
                    true
                );
                logger.debug('sorted the messages by their timestamp for this session');
                return true;
            } catch (err) {
                logger.warn('could not sort the messages by their timestamp:', err);
                return false;
            }
        },
    };
}

export default createTimeOrder;
