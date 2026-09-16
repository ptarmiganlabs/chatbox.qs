/**
 * The companion session object: the highlight field's values and categories, evaluated beside the
 * conversation's own hypercube.
 *
 * It counts the highlight field's selected values (-1 when the field is not in the data model) and
 * holds a hypercube of the field's possible values: the selected ones still possible, or, with nothing
 * selected, every value the other selections leave possible. The first rows of that cube arrive with
 * the layout, so counts and values always come from the same answer. When only selected values are
 * highlighted, a calculation condition keeps the engine from computing the cube while nothing is
 * selected.
 *
 * Its changes are passed on to subscribers. A selection in a highlight field that is not associated
 * with the messages changes nothing in the object's own layout, so without them the highlights would
 * never update.
 *
 * With a category field set too, the cube gets a second column: each value's categories, one row per
 * value and category, with the colour expression evaluated for each as an attribute. The column keeps
 * its nulls, so a value without a category is still highlighted. Rows then no longer count values, so
 * the companion counts the possible values itself, and it tells a category field that is not in the
 * data model apart the same way as the highlight field.
 *
 * The object lives only in the current session, is recreated when its definition changes or the
 * engine closes it, and is released when highlighting is switched off or the object leaves the sheet.
 * Reading never throws. A companion that cannot be created or read yields null, and callers must treat
 * null as "unknown", never as "unchanged".
 *
 * Ported from textview.qs `src/qix/companion.js` at df84a5e. Changed: no text key, since the
 * conversation has its own cube; no definition at all without a highlight field; and `release()`,
 * which destroys the object but keeps the subscribers, for a field that is cleared and set again.
 */
import { fieldRef } from './field-ref';

/** The session object's type, visible in engine logs. */
export const COMPANION_TYPE = 'chatbox-companion';

/**
 * Highlight rows fetched with the companion's layout. Half the per-call cell budget, so a category
 * column can join the value column without exceeding it.
 */
export const HIGHLIGHT_ROWS_IN_LAYOUT = 5000;

/** The id of the category column's colour attribute. Attributes are found by id, never by position. */
export const COLOR_ATTRIBUTE_ID = 'color';

/**
 * Build an expression counting a field's selected values.
 *
 * @param {string} field - The field name.
 * @param {boolean} includeExcluded - Whether selected values excluded by other selections count.
 * @param {string} [stateName] - The alternate state to count in.
 * @returns {string} The expression, without a leading "=".
 */
function selectedCount(field, includeExcluded, stateName) {
    const state = stateName && stateName !== '$' ? `, '${stateName.replaceAll("'", "''")}'` : '';
    return `GetSelectedCount(${fieldRef(field)}, ${includeExcluded ? 'True()' : 'False()'}${state})`;
}

/**
 * Build the companion's definition.
 *
 * @param {object} options - What the companion should evaluate.
 * @param {string} [options.stateName] - The object's alternate state, if any.
 * @param {?{field: string, limit: number, possibleWhenNoneSelected?: boolean}} [options.highlight] -
 *     The highlight settings; possible values are used when nothing is selected unless the switch is
 *     false.
 * @param {?{field: string, colorExpression?: string}} [options.category] - The category settings;
 *     used only together with a highlight field.
 * @returns {?object} The generic object properties for the session object, or null without a
 *     highlight field: there is then nothing for the engine to evaluate.
 */
export function companionDefinition({ stateName, highlight, category }) {
    if (!highlight?.field) return null;
    const definition = { qInfo: { qType: COMPANION_TYPE } };
    const alternate = Boolean(stateName) && stateName !== '$';
    // Follow the object's alternate state, so the companion describes what the object shows.
    if (alternate) definition.qStateName = stateName;
    const selected = selectedCount(highlight.field, false, stateName);
    // Alt: GetSelectedCount answers null for a field that is not in the data model, and -1 is
    // how the viewer tells that apart from a field with nothing selected.
    definition.highlightSelected = { qValueExpression: { qExpr: `=Alt(${selected}, -1)` } };
    definition.highlightSelectedAll = {
        qValueExpression: {
            qExpr: `=Alt(${selectedCount(highlight.field, true, stateName)}, -1)`,
        },
    };
    const dimensions = [
        {
            qDef: { qFieldDefs: [highlight.field], qSortCriterias: [{ qSortByAscii: 1 }] },
            qNullSuppression: true,
        },
    ];
    if (category?.field) {
        definition.categorySelectedAll = {
            qValueExpression: {
                qExpr: `=Alt(${selectedCount(category.field, true, stateName)}, -1)`,
            },
        };
        // One row per value and category, so the rows no longer count the values.
        definition.highlightPossible = {
            qValueExpression: { qExpr: `=GetPossibleCount(${fieldRef(highlight.field)})` },
        };
        // Nulls stay: a value without a category must still be highlighted.
        const categoryDimension = {
            qDef: { qFieldDefs: [category.field], qSortCriterias: [{ qSortByAscii: 1 }] },
            qNullSuppression: false,
        };
        if (category.colorExpression) {
            categoryDimension.qAttributeExpressions = [
                { qExpression: category.colorExpression, id: COLOR_ATTRIBUTE_ID },
            ];
        }
        dimensions.push(categoryDimension);
    }
    definition.qHyperCubeDef = {
        qDimensions: dimensions,
        qMeasures: [],
        qMode: 'S',
        qInitialDataFetch: [
            {
                qTop: 0,
                qLeft: 0,
                qWidth: dimensions.length,
                qHeight: Math.min(highlight.limit, HIGHLIGHT_ROWS_IN_LAYOUT),
            },
        ],
    };
    if (alternate) definition.qHyperCubeDef.qStateName = stateName;
    // Without the fallback to possible values, the cube is of no use until something is selected.
    if (highlight.possibleWhenNoneSelected === false) {
        definition.qHyperCubeDef.qCalcCondition = { qCond: { qv: `=${selected} > 0` } };
    }
    return definition;
}

/**
 * Create a companion manager for one viewer.
 *
 * @param {object} [options] - Options.
 * @param {{warn: Function}} [options.logger] - Where failures are reported.
 * @returns {{read: Function, session: Function, subscribe: Function, release: Function,
 *     destroy: Function}} The manager.
 *     `session(app, definition)` resolves to `{model, layout}`, or null when the companion is
 *     unavailable; `read` resolves to the layout alone. `subscribe(listener)` calls the listener
 *     whenever the engine says the companion changed or closed, and returns an unsubscribe function.
 */
export function createCompanion({ logger } = {}) {
    let current = null;
    let destroyed = false;
    const listeners = new Set();

    /**
     * Tell every subscriber that the companion's values may have changed.
     *
     * @returns {void}
     */
    function notify() {
        for (const listener of [...listeners]) {
            try {
                listener();
            } catch (error) {
                logger?.warn?.('A companion change listener failed:', error);
            }
        }
    }

    /**
     * Destroy a companion object, once it exists.
     *
     * @param {object} entry - The companion to release.
     * @returns {void}
     */
    function releaseEntry(entry) {
        entry.released = true;
        entry.model
            .then((model) => {
                model.removeListener?.('closed', entry.onClosed);
                model.removeListener?.('changed', entry.onChanged);
                return entry.app.destroySessionObject(model.id);
            })
            // Creation failed, or the engine already dropped it: nothing is left to destroy.
            .catch(() => {});
    }

    /**
     * Create a companion object for a definition.
     *
     * @param {object} app - The enigma Doc.
     * @param {object} definition - The generic object properties.
     * @param {string} signature - The definition, serialised, to detect changes.
     * @returns {object} The companion entry.
     */
    function create(app, definition, signature) {
        const entry = { app, signature, closed: false, released: false };
        /**
         * Mark the companion unusable when the engine closes it, for example after a reconnect, and
         * let the viewer read again so it is recreated.
         *
         * @returns {void}
         */
        entry.onClosed = () => {
            entry.closed = true;
            if (!entry.released) notify();
        };
        /**
         * Pass on a change the engine reported.
         *
         * @returns {void}
         */
        entry.onChanged = () => {
            if (!entry.released) notify();
        };
        entry.model = app.createSessionObject(definition).then((model) => {
            model.on?.('closed', entry.onClosed);
            model.on?.('changed', entry.onChanged);
            return model;
        });
        return entry;
    }

    /**
     * Read the companion, creating or recreating the object when needed.
     *
     * @param {object} app - The enigma Doc.
     * @param {object} definition - The companion definition.
     * @returns {Promise<?{model: object, layout: object}>} The model and its layout, or null when the
     *     companion is unavailable.
     */
    async function session(app, definition) {
        if (destroyed || !definition || typeof app?.createSessionObject !== 'function') return null;

        const signature = JSON.stringify(definition);
        if (
            current === null ||
            current.app !== app ||
            current.signature !== signature ||
            current.closed
        ) {
            if (current !== null) releaseEntry(current);
            current = create(app, definition, signature);
        }

        const entry = current;
        try {
            const model = await entry.model;
            if (entry.released) return null;
            const layout = await model.getLayout();
            return entry.released ? null : { model, layout };
        } catch (error) {
            logger?.warn?.('The companion object could not be read:', error);
            // Recreate it on the next read rather than failing the same way forever.
            entry.closed = true;
            return null;
        }
    }

    /**
     * Read the companion's layout.
     *
     * @param {object} app - The enigma Doc.
     * @param {object} definition - The companion definition.
     * @returns {Promise<?object>} The layout, or null when the companion is unavailable.
     */
    async function read(app, definition) {
        return (await session(app, definition))?.layout ?? null;
    }

    /**
     * Subscribe to the companion's changes.
     *
     * @param {function(): void} listener - Called after each change.
     * @returns {function(): void} Stops the subscription.
     */
    function subscribe(listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    /**
     * Destroy the companion object, keeping the subscribers and allowing later sessions.
     *
     * Clearing the highlight field must stop the engine from computing the cube and from sending
     * changes for it; setting a field again creates a new object.
     *
     * @returns {void}
     */
    function release() {
        if (current !== null) releaseEntry(current);
        current = null;
    }

    /**
     * Destroy the companion object and refuse further reads.
     *
     * @returns {void}
     */
    function destroy() {
        destroyed = true;
        listeners.clear();
        if (current !== null) releaseEntry(current);
        current = null;
    }

    return { read, session, subscribe, release, destroy };
}
