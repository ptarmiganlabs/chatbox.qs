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
 */
import { defaultAttributeExpressions } from './object-properties';
import { DEFAULT_CIDS, ROLES } from './qix/column-map';

/** Labels for each dimension slot, shown in the property panel. */
const DIMENSION_SLOTS = [
    'Dim 1 · Message ID — must be UNIQUE per message (e.g. a key field, RecNo() or a hash). ' +
        'Non-unique values make separate messages merge into one bubble.',
    'Dim 2 · Participant — the speaker. This is the dimension selections act on.',
    'Dim 3 · Conversation / thread (optional) — groups messages into separate conversations.',
];

/** Labels for each measure slot. */
const MEASURE_SLOTS = [
    'Msr 1 · Message text — e.g. Only([MsgText]). A measure, not a dimension, so long ' +
        'bodies never become selectable field values.',
    'Msr 2 · Integrity probe — Count([MsgId]). Detects merged bubbles. Keep this.',
    'Msr 3+ · Optional KPIs shown in the bubble footer or detail view.',
];

/**
 * Pick the first role cId not already claimed by an existing column.
 *
 * Assigning by slot index alone is not safe: delete a middle dimension and add
 * another, and the new one is handed a cId that a surviving column already
 * holds. resolveRoles then binds that role to whichever duplicate it finds
 * first, silently pointing "author" at the wrong field.
 *
 * @param {object[]} existing - The current qDimensions or qMeasures array.
 * @param {string[]} order - Role cIds for this axis, in slot order.
 * @returns {?string} An unclaimed cId, or null when every role is taken.
 */
function freeCId(existing, order) {
    const taken = new Set((existing ?? []).map((entry) => entry?.qDef?.cId).filter(Boolean));
    return order.find((cId) => !taken.has(cId)) ?? null;
}

/** Role cIds by dimension slot. */
const DIMENSION_CIDS = [
    DEFAULT_CIDS[ROLES.MESSAGE_ID],
    DEFAULT_CIDS[ROLES.AUTHOR],
    DEFAULT_CIDS[ROLES.THREAD],
];

/** Role cIds by measure slot. */
const MEASURE_CIDS = [DEFAULT_CIDS[ROLES.TEXT], DEFAULT_CIDS[ROLES.DUP_CHECK]];

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
                max: 3,
                /**
                 * Slot description shown in the property panel's dimension list.
                 *
                 * @param {object} _properties - The object properties (unused).
                 * @param {number} index - Zero-based dimension slot index.
                 * @returns {string} The label for this slot.
                 */
                description(_properties, index) {
                    return DIMENSION_SLOTS[index] ?? '';
                },
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

                    const cId = freeCId(properties?.qHyperCubeDef?.qDimensions, DIMENSION_CIDS);
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
                /**
                 * Slot description shown in the property panel's measure list.
                 *
                 * @param {object} _properties - The object properties (unused).
                 * @param {number} index - Zero-based measure slot index.
                 * @returns {string} The label for this slot.
                 */
                description(_properties, index) {
                    return MEASURE_SLOTS[Math.min(index, MEASURE_SLOTS.length - 1)] ?? '';
                },
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
                    const cId = freeCId(properties?.qHyperCubeDef?.qMeasures, MEASURE_CIDS);
                    if (cId) measure.qDef.cId = cId;
                    return measure;
                },
            },
        },
    ],
};
