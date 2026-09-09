/**
 * Copy the panel's metadata expressions into real attribute expressions.
 *
 * The property panel cannot bind directly to
 * `qHyperCubeDef.qDimensions.N.qAttributeExpressions` — doing so materialises the
 * path and manufactures an invalid dimension the moment the object is dropped.
 * So the panel writes to `chatbox.attrs.*` and this module reconciles that into
 * the cube, where the engine can actually evaluate it per row.
 *
 * Two rules keep this safe:
 *  - It only writes when something genuinely differs, so it cannot loop.
 *  - It only runs in edit mode. A consumer of a published app may have no write
 *    access, and a render that patches properties is hostile to export anyway.
 */
import logger from '../util/logger';
import { ATTR_ORDER } from '../ext/metadata-section';
import { ROLES, resolveRoles } from './column-map';

/**
 * Build the attribute-expression array a dimension should carry.
 *
 * @param {object} [attrs] - The `chatbox.attrs` bag from the object properties.
 * @returns {object[]} Attribute-expression definitions in canonical slot order.
 */
export function buildAttributeExpressions(attrs = {}) {
    return ATTR_ORDER.map((id) => ({
        id,
        qExpression: typeof attrs?.[id] === 'string' ? attrs[id] : '',
        qAttribute: true,
    }));
}

/**
 * Report whether a dimension's attribute expressions already match the bag.
 *
 * @param {object[]} [current] - The dimension's current qAttributeExpressions.
 * @param {object[]} desired - The array {@link buildAttributeExpressions} produced.
 * @returns {boolean} True when a write is unnecessary.
 */
export function isInSync(current, desired) {
    if (!Array.isArray(current) || current.length !== desired.length) return false;
    return desired.every(
        (want, i) => current[i]?.id === want.id && current[i]?.qExpression === want.qExpression
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
 * Report whether the panel's metadata bag is entirely empty.
 *
 * @param {object} [attrs] - The `chatbox.attrs` bag.
 * @returns {boolean} True when nothing has been configured in the panel.
 */
export function isBagEmpty(attrs) {
    if (!attrs || typeof attrs !== 'object') return true;
    return !Object.values(attrs).some((v) => typeof v === 'string' && v.trim());
}

/**
 * Reconcile `chatbox.attrs` into the message-id dimension's attribute expressions.
 *
 * @param {object} options - Inputs.
 * @param {object} options.model - The enigma GenericObject model.
 * @param {object} options.layout - The current layout, for role resolution.
 * @param {boolean} options.canEdit - Whether the session may write properties.
 * @returns {Promise<boolean>} True when a write was performed.
 */
export async function syncAttributeExpressions({ model, layout, canEdit }) {
    if (!model || !canEdit) return false;

    const { byRole } = resolveRoles(layout, layout?.chatbox?.roles);
    const idColumn = byRole[ROLES.MESSAGE_ID];
    if (!idColumn || idColumn.kind !== 'dim') return false;

    const desired = buildAttributeExpressions(layout?.chatbox?.attrs);

    try {
        const properties = await model.getProperties();
        const dimension = properties?.qHyperCubeDef?.qDimensions?.[idColumn.col];
        if (!dimension) return false;

        if (isInSync(dimension.qAttributeExpressions, desired)) return false;

        // Never let an empty panel wipe expressions that are already working.
        // An object configured outside the panel — seeded by added(), set by an
        // API call, or imported — must not be blanked just because the bag it
        // syncs from has not been filled in.
        if (
            isBagEmpty(layout?.chatbox?.attrs) &&
            hasConfiguredExpressions(dimension.qAttributeExpressions)
        ) {
            return false;
        }

        dimension.qAttributeExpressions = desired;
        await model.setProperties(properties);
        logger.debug('synced attribute expressions onto the message-id dimension');
        return true;
    } catch (err) {
        // A consumer without write access is an expected outcome, not a failure
        // worth blanking the chart over.
        logger.warn('could not sync attribute expressions:', err);
        return false;
    }
}

export default syncAttributeExpressions;
