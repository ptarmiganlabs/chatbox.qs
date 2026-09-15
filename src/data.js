/**
 * Hypercube data targets (the engine-side contract).
 *
 * Kept minimal on purpose, mirroring how Qlik's own sn-table splits this: the
 * `qae.data.targets` entry states the shape, while the panel-facing callbacks
 * that mutate a dimension as it is added live here too because this extension
 * needs them to seed sort criteria and attribute expressions.
 *
 * `max` must be stated explicitly: FieldTarget.max defaults to 1000, not 1, so
 * omitting it yields an effectively unbounded "add dimension" button.
 *
 * The conversation model changes which role a new dimension gets and what each
 * slot is called, and it can only do that here: stardust hands `added()` and
 * `description()` the object properties, but calls `max` with nothing but the
 * other axis's count. So `max` is a constant that fits both models.
 */
import { defaultAttributeExpressions } from './object-properties';
import {
    CONVERSATION_MODELS,
    DEFAULT_CIDS,
    MEASURE_ROLE_ORDER,
    ROLES,
    conversationModelOf,
    dimensionRoleOrder,
    resolveRoles,
} from './qix/column-map';

/**
 * Pick the role cId a newly added column should carry.
 *
 * Assigning by slot index alone is not safe: delete a middle dimension and add
 * another, and the new one is handed a cId that a surviving column already
 * holds. resolveRoles then binds that role to whichever duplicate it finds
 * first, silently pointing "author" at the wrong field.
 *
 * stardust pushes the column BEFORE calling added(), so the column itself must
 * not count as a holder. A column that arrives already carrying a role cId no
 * other column holds — copied from another Chatbox object — keeps it.
 *
 * @param {object[]} existing - The current qDimensions or qMeasures array.
 * @param {string[]} order - Role cIds for this axis, in slot order.
 * @param {object} [self] - The column being added, when it is already in `existing`.
 * @returns {?string} The cId to use, or null when every role is taken.
 */
function freeCId(existing, order, self) {
    const taken = new Set(
        (existing ?? [])
            .filter((entry) => entry !== self)
            .map((entry) => entry?.qDef?.cId)
            .filter(Boolean)
    );
    const own = self?.qDef?.cId;
    if (own && order.includes(own) && !taken.has(own)) return own;
    return order.find((cId) => !taken.has(cId)) ?? null;
}

/**
 * Dimension role cIds in slot order, for the model the properties select.
 *
 * @param {object} [properties] - The object properties.
 * @returns {string[]} Role cIds.
 */
function dimensionCIdOrder(properties) {
    return dimensionRoleOrder(conversationModelOf(properties?.chatbox)).map(
        (role) => DEFAULT_CIDS[role]
    );
}

/**
 * Slot text for each dimension role, by conversation model.
 *
 * @param {string} role - A ROLES value.
 * @param {string} model - A CONVERSATION_MODELS value.
 * @returns {string} The description, without the "Dim N" prefix.
 */
function dimensionRoleText(role, model) {
    const fromTo = model === CONVERSATION_MODELS.FROM_TO;
    switch (role) {
        case ROLES.MESSAGE_ID:
            return (
                'Message ID — must be UNIQUE per message (e.g. a key field, RecNo() or a hash). ' +
                'Non-unique values make separate messages merge into one bubble.'
            );
        case ROLES.AUTHOR:
            return fromTo
                ? 'From — who sent the message. Spell each person exactly as the To dimension does.'
                : 'Participant — the speaker. This is the dimension selections act on.';
        case ROLES.RECIPIENT:
            return fromTo
                ? 'To — who the message went to, one person per row. A message to several people ' +
                      'collapses into one bubble.'
                : 'To (optional) — who the message went to. Switch Conversation model to From → To ' +
                      'to make this the third dimension.';
        case ROLES.THREAD:
            return 'Conversation / thread (optional) — groups messages into separate conversations.';
        default:
            return '';
    }
}

/**
 * Describe a dimension slot as the runtime will actually bind it.
 *
 * The label comes from resolving roles over the dimensions as they stand, so a
 * dragged column keeps its name and a model switch — which never rewrites an
 * existing column's role — shows each dimension for what it really is. An index
 * past the end names the role the next added dimension would get.
 *
 * @param {object} [properties] - The object properties.
 * @param {number} index - Zero-based dimension slot index.
 * @returns {string} The label for this slot.
 */
function describeDimensionSlot(properties, index) {
    const model = conversationModelOf(properties?.chatbox);
    const dimensions = properties?.qHyperCubeDef?.qDimensions ?? [];
    const prefix = `Dim ${index + 1} · `;

    if (index >= dimensions.length) {
        const taken = new Set(dimensions.map((d) => d?.qDef?.cId).filter(Boolean));
        const free = dimensionRoleOrder(model).filter((role) => !taken.has(DEFAULT_CIDS[role]));
        const role = free[index - dimensions.length];
        return role ? prefix + dimensionRoleText(role, model) : '';
    }

    const standIn = {
        qHyperCube: {
            qDimensionInfo: dimensions.map((d) => ({ cId: d?.qDef?.cId ?? null })),
            qMeasureInfo: [],
        },
    };
    const { byRole } = resolveRoles(standIn, properties?.chatbox?.roles, {
        conversationModel: model,
    });
    const role = Object.keys(byRole).find((r) => byRole[r]?.col === index);
    if (!role) {
        return (
            prefix +
            'Not used by the conversation — remove it. An unused dimension splits messages into ' +
            'extra rows.'
        );
    }
    return prefix + dimensionRoleText(role, model);
}

/**
 * Describe a measure slot.
 *
 * The probe advice differs by model. Count([MsgId]) works when the message id is
 * a plain field, but a From -> To model usually links messages to a recipients
 * table by that id — and counting a key field counts the linked table's rows, so
 * every group message would be reported as merged.
 *
 * @param {object} [properties] - The object properties.
 * @param {number} index - Zero-based measure slot index.
 * @returns {string} The label for this slot.
 */
function describeMeasureSlot(properties, index) {
    const fromTo = conversationModelOf(properties?.chatbox) === CONVERSATION_MODELS.FROM_TO;
    if (index === 0) {
        return (
            'Msr 1 · Message text — e.g. Only([MsgText]). A measure, not a dimension, so long ' +
            'bodies never become selectable field values.'
        );
    }
    if (index === 1) {
        return fromTo
            ? 'Msr 2 · Integrity probe — count a field only the messages table has, e.g. ' +
                  'Count([MsgText]). Detects merged bubbles. Count([MsgId]) miscounts when the id ' +
                  'also keys a recipients table.'
            : 'Msr 2 · Integrity probe — Count([MsgId]). Detects merged bubbles. Keep this.';
    }
    return 'Msr 3+ · Optional KPIs shown in the bubble footer or detail view.';
}

export default {
    targets: [
        {
            path: '/qHyperCubeDef',
            dimensions: {
                // min MUST be 0. Sense manufactures a placeholder column to
                // satisfy a non-zero minimum, and that placeholder renders as
                // "Invalid dimension" the instant the object is dropped on a
                // sheet — before the user has done anything wrong. It also
                // shifts every subsequent slot index by one, which silently
                // sent the message-id seeding to the wrong dimension.
                // Qlik's own sn-table uses 0 here. The extension guides the
                // user with its own not-configured state instead.
                min: 0,
                // Message ID, author, recipient and thread. A constant, because
                // stardust gives a max() function only the measure count.
                max: 4,
                description: describeDimensionSlot,
                /**
                 * Seed a newly added dimension with the role conventions this
                 * extension depends on.
                 *
                 * Two things matter here. `autoSort` must be pinned false or the
                 * Sense property panel overwrites the deliberate sort criteria,
                 * which is the "why is my chat in random order" bug. And the
                 * message-id dimension carries every per-message attribute
                 * expression, seeded empty so the property panel can bind to
                 * stable refs without needing an applyPatches round trip.
                 *
                 * @param {object} dimension - The NxDimension being added.
                 * @param {object} properties - The object's current properties.
                 * @param {number} _index - Zero-based dimension slot index (unused).
                 * @returns {object} The mutated dimension.
                 */
                added(dimension, properties, _index) {
                    dimension.qDef = dimension.qDef || {};
                    dimension.qDef.autoSort = false;
                    dimension.qNullSuppression = false;

                    const cId = freeCId(
                        properties?.qHyperCubeDef?.qDimensions,
                        dimensionCIdOrder(properties),
                        dimension
                    );
                    if (cId) dimension.qDef.cId = cId;

                    // Keyed on the ROLE, never on the slot index. The index is
                    // whatever position Sense happened to insert at, so seeding on
                    // it puts the message-id sort and the entire metadata block on
                    // the wrong dimension the moment anything shifts the slots —
                    // which a placeholder column silently did.
                    if (cId === DEFAULT_CIDS[ROLES.MESSAGE_ID]) {
                        // Sorted numerically by default; the property panel can
                        // switch this to an expression over a timestamp field.
                        dimension.qDef.qSortCriterias = [{ qSortByNumeric: 1, qSortByAscii: 0 }];
                        dimension.qAttributeExpressions = defaultAttributeExpressions();
                    } else {
                        dimension.qDef.qSortCriterias = [{ qSortByAscii: 1 }];
                    }
                    return dimension;
                },
            },
            measures: {
                // 0 for the same reason as dimensions above.
                min: 0,
                max: 10,
                description: describeMeasureSlot,
                /**
                 * Seed a newly added measure with its role cId.
                 *
                 * @param {object} measure - The NxMeasure being added.
                 * @param {object} properties - The object's current properties.
                 * @param {number} _index - Zero-based measure slot index (unused).
                 * @returns {object} The mutated measure.
                 */
                added(measure, properties, _index) {
                    measure.qDef = measure.qDef || {};
                    const cId = freeCId(
                        properties?.qHyperCubeDef?.qMeasures,
                        MEASURE_ROLE_ORDER.map((role) => DEFAULT_CIDS[role]),
                        measure
                    );
                    if (cId) measure.qDef.cId = cId;
                    return measure;
                },
            },
        },
    ],
};
