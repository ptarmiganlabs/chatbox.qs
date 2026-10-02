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
 * the object's own cube **soft-patched** into that state, which `getProperties` never sees and which
 * reverts cleanly; and a calculated dimension appended to the cube that the engine drops the
 * out-of-scope rows by.
 *
 * Nothing is ever selected in the state. A selection there pushes an undo step, so Sense's back button
 * would undo the object's own bookkeeping and the reader could never step past it (GOTCHAS 42).
 *
 * Every call here answers rather than throwing: an engine that refuses leaves the object showing the
 * strict conversation, which is wrong only in being narrower than asked for, and says so.
 */
import { CONTEXT_GATE_CID, gateDimensionExpression } from './context-gate';

/** What a widening attempt came to. */
export const WIDEN_OUTCOMES = Object.freeze({
    WIDENED: 'widened',
    UNCHANGED: 'unchanged',
    REFUSED: 'refused',
});

/** The path the state is patched onto, and the one the gate dimension is appended to. */
const STATE_PATH = '/qHyperCubeDef/qStateName';
const DIMENSIONS_PATH = '/qHyperCubeDef/qDimensions';

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
    try {
        await app.addSessionAlternateState(name);
        return name;
    } catch (error) {
        // Already there is not a failure: the state outlives one render, by design.
        if (error?.code === 7005 || /already/i.test(error?.message ?? '')) return name;
        logger?.warn?.('whole conversations: the engine refused a session state:', error);
        return null;
    }
}

/**
 * Patch the object's cube into the state, with the gate appended.
 *
 * @param {object} request - What to patch.
 * @param {object} request.model - The object's model.
 * @param {string} request.stateName - The session state.
 * @param {object} request.gate - From `buildContextGate`.
 * @param {number} request.dimensionCount - How many dimensions the cube has now.
 * @param {object} [request.logger] - Where a refusal is reported.
 * @returns {Promise<string>} A value of {@link WIDEN_OUTCOMES}.
 */
export async function widen({ model, stateName, gate, dimensionCount, logger }) {
    const dimension = gateDimension(gate);
    if (!dimension || !stateName) return WIDEN_OUTCOMES.REFUSED;
    try {
        await model.applyPatches(
            [
                { qOp: 'replace', qPath: STATE_PATH, qValue: JSON.stringify(stateName) },
                {
                    // Appended, never in place of the message id: a calculated dimension's element
                    // numbers are the Aggr's own, and every selection by element number would be wrong.
                    qOp: 'add',
                    qPath: `${DIMENSIONS_PATH}/${dimensionCount}`,
                    qValue: JSON.stringify(dimension),
                },
            ],
            true
        );
        return WIDEN_OUTCOMES.WIDENED;
    } catch (error) {
        logger?.warn?.('whole conversations: the engine refused the patch:', error);
        return WIDEN_OUTCOMES.REFUSED;
    }
}

/**
 * Put the cube back the way the object stores it.
 *
 * @param {object} request - What to restore.
 * @param {object} request.model - The object's model.
 * @param {number} request.gateIndex - Where the gate dimension sits in the cube.
 * @param {object} [request.logger] - Where a refusal is reported.
 * @returns {Promise<string>} A value of {@link WIDEN_OUTCOMES}.
 */
export async function narrow({ model, gateIndex, logger }) {
    try {
        await model.applyPatches(
            [
                { qOp: 'replace', qPath: STATE_PATH, qValue: JSON.stringify('') },
                ...(gateIndex >= 0
                    ? [{ qOp: 'remove', qPath: `${DIMENSIONS_PATH}/${gateIndex}`, qValue: '' }]
                    : []),
            ],
            true
        );
        return WIDEN_OUTCOMES.UNCHANGED;
    } catch (error) {
        logger?.warn?.('whole conversations: the engine refused to put the cube back:', error);
        return WIDEN_OUTCOMES.REFUSED;
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
