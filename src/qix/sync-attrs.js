/**
 * Copy the panel's metadata expressions into real attribute expressions.
 *
 * The property panel cannot bind directly to
 * `qHyperCubeDef.qDimensions.N.qAttributeExpressions` — doing so materialises the
 * path and manufactures an invalid dimension the moment the object is dropped.
 * So the panel writes to `chatbox.attrs.*` and this module reconciles that into
 * the cube, where the engine can actually evaluate it per row.
 *
 * Three rules keep this safe:
 *  - It only writes when something genuinely differs, so it cannot loop. The guard
 *    compares what the engine holds against what was built for it, and GetProperties
 *    leaves out a q-property whose value is the default (docs/GOTCHAS.md entry 38):
 *    an empty slot comes back with no `qExpression` at all where the build has ''.
 *    Both sides are normalised, or the guard never holds for a real object and every
 *    layout change in edit mode writes again.
 *  - It writes the two paths it owns as patches, never the whole properties object
 *    read moments earlier, so a panel edit made in between survives.
 *  - It only runs in edit mode. A consumer of a published app may have no write
 *    access, and a render that patches properties is hostile to export anyway.
 */
import logger from '../util/logger';
import { ATTR_ORDER } from '../ext/metadata-section';
import { ROLES, conversationModelOf, resolveRoles } from './column-map';
import { isSortedBy, timeSortCriteria, timestampExpressionOf } from './time-order';

/**
 * Read one value from the `chatbox.attrs` bag as the formula it holds.
 *
 * The metadata items accept an expression, so the panel stores a value typed with
 * a leading `=`, or built in the expression editor, as `{ qStringExpression: { qExpr } }`.
 * The layout then holds what that expression gives for the whole object, not the
 * formula: on Qlik Sense May 2026, `=Only(ThreadId)` was stored with the qExpr
 * `Only(ThreadId)` while the layout held '-'. Copied into the cube, '-' gives nothing
 * for any message, so every badge silently vanished. Only the properties keep the
 * formula, and the formula is what each message needs.
 *
 * @param {*} value - One value from the bag in the object properties.
 * @returns {string} The formula, or '' when there is none.
 */
export function formulaOf(value) {
    if (typeof value === 'string') return value;
    const expression = value?.qStringExpression;
    // The engine also takes the short form, `"qStringExpression": "=Only(X)"`.
    if (typeof expression === 'string') return expression;
    return typeof expression?.qExpr === 'string' ? expression.qExpr : '';
}

/**
 * Build the attribute-expression array a dimension should carry.
 *
 * @param {object} [attrs] - The `chatbox.attrs` bag from the object properties.
 * @returns {object[]} Attribute-expression definitions in canonical slot order.
 */
export function buildAttributeExpressions(attrs = {}) {
    return ATTR_ORDER.map((id) => ({
        id,
        qExpression: formulaOf(attrs?.[id]),
        qAttribute: true,
    }));
}

/**
 * Read one attribute expression's formula, however the engine chose to store it.
 *
 * GetProperties leaves out a q-property whose value is the default, so an unset slot comes back as
 * `{ id, qAttribute: true }` with no `qExpression` key, while {@link buildAttributeExpressions}
 * always writes one. Comparing the two raw makes `undefined === ''` fail for every empty slot.
 *
 * @param {object} [entry] - One entry of a qAttributeExpressions array.
 * @returns {string} Its expression, or '' when it has none.
 */
function expressionOf(entry) {
    return typeof entry?.qExpression === 'string' ? entry.qExpression : '';
}

/**
 * Report whether a dimension's attribute expressions already match the bag.
 *
 * Both sides are normalised through {@link expressionOf}: a missing `qExpression` and an empty one
 * are the same state, and the engine returns the first where the build emits the second.
 *
 * @param {object[]} [current] - The dimension's current qAttributeExpressions.
 * @param {object[]} desired - The array {@link buildAttributeExpressions} produced.
 * @returns {boolean} True when a write is unnecessary.
 */
export function isInSync(current, desired) {
    if (!Array.isArray(current) || current.length !== desired.length) return false;
    return desired.every(
        (want, i) => current[i]?.id === want.id && expressionOf(current[i]) === expressionOf(want)
    );
}

/**
 * Report whether an attribute-expression array carries any real expression.
 *
 * @param {object[]} [current] - A dimension's qAttributeExpressions.
 * @returns {boolean} True when at least one slot holds a non-empty expression.
 */
export function hasConfiguredExpressions(current) {
    return (
        Array.isArray(current) &&
        current.some((e) => typeof e?.qExpression === 'string' && e.qExpression.trim())
    );
}

/**
 * Report whether the panel has never held a metadata value.
 *
 * On Qlik Sense May 2026, an object whose metadata fields were never typed into
 * has no `chatbox.attrs` at all — not when the section is opened, and not when
 * other settings are saved through the panel — while clearing a field leaves its
 * key behind as ''. So a bag of blanks is a panel that was emptied, and its blanks
 * are meant. Taking it for an unset panel kept the last expression cleared from
 * the panel on every message.
 *
 * @param {object} [attrs] - The `chatbox.attrs` bag from the object properties.
 * @returns {boolean} True when no field has ever held a value.
 */
export function isBagUnset(attrs) {
    if (!attrs || typeof attrs !== 'object') return true;
    return !Object.values(attrs).some(
        (value) => typeof value === 'string' || (value !== null && typeof value === 'object')
    );
}

/**
 * Build a patch that replaces the value at one property path.
 *
 * A hard patch, not the soft one `createTimeOrder` applies: this is an edit-mode change, and it
 * belongs in the saved object like any other property-panel edit.
 *
 * @param {string} qPath - The property path to replace.
 * @param {*} value - The value to put there; the engine takes it as JSON text.
 * @returns {object} One patch, as applyPatches wants it.
 */
function replacePatch(qPath, value) {
    return { qOp: 'replace', qPath, qValue: JSON.stringify(value) };
}

/**
 * Reconcile `chatbox.attrs` into the message-id dimension's attribute expressions, and save the sort that
 * puts the messages in time order.
 *
 * The sort follows the timestamp the dimension ends up with, whether the panel set it or it was set
 * outside the panel (src/qix/time-order.js). Without a timestamp the sort is left as it is.
 *
 * Both go in as patches on the two paths this owns. Writing back the whole properties object would
 * make every render in edit mode an authority on every property, and send one read moments earlier —
 * so a panel edit made between the read and the write would be undone by it, the more easily the
 * further away the server is.
 *
 * @param {object} options - Inputs.
 * @param {object} options.model - The enigma GenericObject model.
 * @param {object} options.layout - The current layout, for role resolution.
 * @param {boolean} options.canEdit - Whether the session may write properties.
 * @returns {Promise<boolean>} True when a write was performed.
 */
export async function syncAttributeExpressions({ model, layout, canEdit }) {
    if (!model || !canEdit) return false;

    const { byRole } = resolveRoles(layout, layout?.chatbox?.roles, {
        conversationModel: conversationModelOf(layout?.chatbox),
    });
    const idColumn = byRole[ROLES.MESSAGE_ID];
    if (!idColumn || idColumn.kind !== 'dim') return false;

    try {
        const properties = await model.getProperties();
        const dimension = properties?.qHyperCubeDef?.qDimensions?.[idColumn.col];
        if (!dimension) return false;

        // From the properties, never the layout: see formulaOf.
        const attrs = properties?.chatbox?.attrs;
        const desired = buildAttributeExpressions(attrs);
        const inSync = isInSync(dimension.qAttributeExpressions, desired);

        // Never let a panel that was never filled in wipe expressions that are
        // already working. An object configured outside the panel — set by an API
        // call, or imported — must not be blanked just because it has no bag to
        // sync from. A panel whose fields were all cleared has one.
        const keep =
            inSync ||
            (isBagUnset(attrs) && hasConfiguredExpressions(dimension.qAttributeExpressions));

        // The sort follows the expressions this run leaves behind, so a timestamp typed into the
        // panel and the sort by it are one write rather than two renders.
        const expression = timestampExpressionOf({
            qAttributeExpressions: keep ? dimension.qAttributeExpressions : desired,
        });
        const resort = Boolean(expression) && !isSortedBy(dimension, expression);

        const dimensionPath = `/qHyperCubeDef/qDimensions/${idColumn.col}`;
        const patches = [];
        if (!keep) patches.push(replacePatch(`${dimensionPath}/qAttributeExpressions`, desired));
        if (resort) {
            patches.push(
                replacePatch(`${dimensionPath}/qDef/qSortCriterias`, timeSortCriteria(expression))
            );
        }
        if (!patches.length) return false;

        await model.applyPatches(patches, false);
        logger.debug('synced attribute expressions and time order onto the message-id dimension');
        return true;
    } catch (err) {
        // A consumer without write access is an expected outcome, not a failure
        // worth blanking the chart over.
        logger.warn('could not sync attribute expressions:', err);
        return false;
    }
}

export default syncAttributeExpressions;
