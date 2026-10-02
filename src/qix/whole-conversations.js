/**
 * Widening a selection to the whole conversations it touches.
 *
 * Selecting a participant narrows the conversation to their own lines. Reading the whole exchange back
 * means evaluating the object's cube under a different selection, and the message body is the user's
 * own measure — `Only([MsgText])` — into which no set expression can be injected without parsing it.
 * An alternate state is the only thing that re-evaluates somebody else's expressions at once.
 *
 * So: a **session** alternate state, one per object, which is never persisted and never appears in the
 * app layout's `qStateNames`, so nothing is written to the app and the selection bar never shows it;
 * a **session object** holding a copy of the object's cube read in that state; and a calculated
 * dimension appended to the copy that the engine drops the out-of-scope rows by.
 *
 * The object's own cube is never touched. A soft patch of it looked session-only and was not: in edit
 * mode the property panel round-trips the effective properties into the stored ones, and the gate was
 * saved with the object (GOTCHAS 44). A patched cube also reads in the alternate state, so the
 * object's own selections went there instead of into the app.
 *
 * Nothing is ever selected in the state. A selection there pushes an undo step, so Sense's back button
 * would undo the object's own bookkeeping and the reader could never step past it (GOTCHAS 42).
 *
 * Every call here answers rather than throwing: an engine that refuses leaves the object showing the
 * strict conversation, which is wrong only in being narrower than asked for, and says so.
 */
import { CONTEXT_GATE_CID, gateDimensionExpression } from './context-gate';

/** The session object's type, visible in engine logs. */
export const WIDENED_TYPE = 'chatbox-widened';

/**
 * The session states already made in this browsing context.
 *
 * A session alternate state belongs to the engine session, which outlives the component that asked
 * for it: nebula remounts a supernova for reasons of its own, and the state is still there when it
 * does. Asking twice is refused — "Invalid parameters", parameter "Used state name", code 8 — and a
 * refused engine call reaches the reader as Qlik Sense's own error dialog, whether or not the
 * promise was caught. So the asking is remembered here, outside any component, and done once.
 */
const statesMade = new Set();

/**
 * Tell whether a refusal means the state is already there.
 *
 * The engine does not say so in words a caller can rely on: there is no dedicated error code, the
 * message is the generic "Invalid parameters", and only the parameter names what went wrong.
 *
 * @param {object} [error] - The engine's error.
 * @returns {boolean} True when the name is taken, which is the outcome asked for.
 */
export function stateAlreadyExists(error) {
    const text = `${error?.parameter ?? ''} ${error?.message ?? ''}`;
    if (/already/i.test(text)) return true;
    return error?.code === 8 && /state name/i.test(text);
}

/**
 * Name the session state for an object.
 *
 * One per object, so two chatboxes on a sheet never bound each other's cube.
 *
 * @param {string} objectId - The object's id.
 * @returns {string} The state name.
 */
export function stateNameFor(objectId) {
    return `cqs_${String(objectId ?? '').replace(/[^A-Za-z0-9_]/g, '') || 'object'}`;
}

/**
 * Build the dimension that bounds a widened cube.
 *
 * @param {object} gate - From `buildContextGate`.
 * @returns {?object} The dimension to append, or null when the gate has a problem.
 */
export function gateDimension(gate) {
    const expression = gateDimensionExpression(gate);
    if (expression === '') return null;
    return {
        qDef: {
            cId: CONTEXT_GATE_CID,
            qFieldDefs: [expression],
            qFieldLabels: [''],
            qSortCriterias: [{ qSortByLoadOrder: 1 }],
        },
        // The whole point: a row the gate answers null for never leaves the engine.
        qNullSuppression: true,
        qIncludeElemValue: false,
    };
}

/**
 * Create the object's session alternate state, once per session.
 *
 * @param {object} request - What to create it on.
 * @param {object} request.app - The app handle.
 * @param {string} request.objectId - The object's id.
 * @param {object} [request.logger] - Where a refusal is reported.
 * @returns {Promise<?string>} The state's name, or null when the engine refused.
 */
export async function ensureState({ app, objectId, logger }) {
    const name = stateNameFor(objectId);
    if (statesMade.has(name)) return name;
    try {
        await app.addSessionAlternateState(name);
        statesMade.add(name);
        return name;
    } catch (error) {
        // The name being taken is the outcome asked for, however the engine phrases it.
        if (stateAlreadyExists(error)) {
            statesMade.add(name);
            return name;
        }
        logger?.warn?.('whole conversations: the engine refused a session state:', error);
        return null;
    }
}

/**
 * Forget which states were made, for tests that must start from nothing.
 *
 * @returns {void}
 */
export function forgetStates() {
    statesMade.clear();
}

/**
 * Build the definition of the widened cube.
 *
 * A copy of the cube the object stores, read in the alternate state, with the gate appended. The
 * object's own cube is not touched at all: it stays in the default state, so a click still selects
 * through the object's selection mode, the selection bar still shows what was selected, and nothing
 * the property panel writes back can carry any of this with it.
 *
 * @param {object} request - What to build it from.
 * @param {?object} request.cube - The object's stored `qHyperCubeDef`.
 * @param {?string} request.stateName - The session alternate state.
 * @param {object} request.gate - From `buildContextGate`.
 * @returns {?object} The session object's definition, or null when it cannot be built.
 */
export function widenedDefinition({ cube, stateName, gate }) {
    const dimension = gateDimension(gate);
    if (!cube || !dimension || !stateName) return null;
    // An object already read in an alternate state is left alone: the gate frees fields from the
    // default state, and widening relative to another one would answer a question nobody asked.
    if (typeof cube.qStateName === 'string' && cube.qStateName !== '') return null;
    return {
        qInfo: { qType: WIDENED_TYPE },
        qHyperCubeDef: {
            ...cube,
            qStateName: stateName,
            // Any gate an earlier build left in the object's own cube is dropped: one is enough,
            // and a stale one would gate against the wrong fields.
            qDimensions: [
                ...(cube.qDimensions ?? []).filter((d) => d?.qDef?.cId !== CONTEXT_GATE_CID),
                dimension,
            ],
        },
    };
}

/**
 * Create the widened cube beside the object.
 *
 * @param {object} request - What to create it from.
 * @param {object} request.app - The app handle.
 * @param {object} request.model - The object's model.
 * @param {?string} request.stateName - The session alternate state.
 * @param {object} request.gate - From `buildContextGate`.
 * @param {object} [request.logger] - Where a refusal is reported.
 * @returns {Promise<?object>} The session object, or null when it could not be created.
 */
export async function createWidened({ app, model, stateName, gate, logger }) {
    try {
        // Effective, not stored: the time order is a soft patch in an app nobody can edit, and a
        // copy made from the stored cube would show the messages in the message id's order.
        const props = await model.getEffectiveProperties();
        const definition = widenedDefinition({ cube: props?.qHyperCubeDef, stateName, gate });
        if (!definition) return null;
        return await app.createSessionObject(definition);
    } catch (error) {
        logger?.warn?.('whole conversations: the widened cube could not be created:', error);
        return null;
    }
}

/**
 * Destroy a widened cube.
 *
 * @param {object} request - What to release.
 * @param {object} request.app - The app handle.
 * @param {?object} request.object - The session object, or null.
 * @param {object} [request.logger] - Where a refusal is reported.
 * @returns {Promise<void>} Resolves once it is gone, whether or not the engine obliged.
 */
export async function releaseWidened({ app, object, logger }) {
    if (!object) return;
    try {
        await app.destroySessionObject(object.id);
    } catch (error) {
        logger?.warn?.('whole conversations: the widened cube could not be released:', error);
    }
}

/**
 * Find the gate dimension in a layout, by its cId and never by position.
 *
 * @param {object} layout - The object's layout.
 * @returns {number} Its index among the dimensions, or -1 when it is not there.
 */
export function gateIndexOf(layout) {
    const dims = layout?.qHyperCube?.qDimensionInfo ?? [];
    return dims.findIndex((info) => info?.cId === CONTEXT_GATE_CID);
}

/**
 * Take a gate out of an object's stored properties.
 *
 * Version 0.6.0 patched the cube while the sheet was being edited, and the property panel saved the
 * patch with the object: a dimension nobody added, which the positional role fallback then handed to
 * whichever role was missing. An object that carries one is repaired the next time it is edited,
 * which is the only time its properties may be written at all.
 *
 * @param {object} request - What to repair.
 * @param {object} request.model - The object's model.
 * @param {object} [request.logger] - Where a refusal is reported.
 * @returns {Promise<boolean>} True when something was repaired.
 */
export async function repairStoredGate({ model, logger }) {
    try {
        const props = await model.getProperties();
        const cube = props?.qHyperCubeDef;
        const dimensions = cube?.qDimensions ?? [];
        const kept = dimensions.filter((d) => d?.qDef?.cId !== CONTEXT_GATE_CID);
        const state = cube?.qStateName ?? '';
        if (kept.length === dimensions.length && state === '') return false;
        cube.qDimensions = kept;
        cube.qStateName = '';
        await model.setProperties(props);
        return true;
    } catch (error) {
        logger?.warn?.('whole conversations: could not repair the stored cube:', error);
        return false;
    }
}
