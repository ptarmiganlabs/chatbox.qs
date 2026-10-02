/**
 * Running a click's steps through the object's own selection mode.
 *
 * A lane header selects the way a filter pane does: the object goes modal, picks accumulate, and the
 * reader confirms or cancels them together. The steps themselves are built in `src/qix/selection.js`;
 * this runs them and answers what came of it, in the same words a field selection answers with
 * (`SELECTION_OUTCOMES`), so the notice the reader gets is written once.
 *
 * One stardust behaviour decides most of it. When the engine refuses a step, stardust's `select` calls
 * `resetMadeSelections()` before answering false: **every** selection made in the session is gone, not
 * only the one refused, while the session itself stays open. Left like that, the object wears a
 * confirm bar with nothing behind it, and any header already drawn as picked is drawn over a selection
 * that no longer exists. So a refusal ends the session — there is nothing left in it to confirm — and
 * the picks drawn from it go with it.
 *
 * A step that throws is different: stardust resets nothing then, so picks already made are still
 * real and are left alone. Only a session this click opened, and that holds nothing, is let go.
 *
 * Nothing here throws. Every engine refusal is an answer.
 */
import { SELECTION_OUTCOMES } from './field-selection';

/** The hypercube path every step selects in. */
const CUBE_PATH = '/qHyperCubeDef';

/**
 * End the selection session without confirming it, if there is one.
 *
 * @param {object} selections - The object's selections, from useSelections().
 * @param {{warn: Function}} [logger] - Where a failure is reported.
 * @returns {Promise<void>} Resolves once the session is over, or could not be ended.
 */
async function letGo(selections, logger) {
    try {
        if (selections.isActive()) await selections.cancel();
    } catch (error) {
        logger?.warn?.('The selection in progress could not be cancelled:', error);
    }
}

/**
 * Run a click's steps in the object's selection mode, opening it if it is not open already.
 *
 * The steps succeed or fail together: a step after a refused one is never sent, because the refusal
 * has already taken the earlier ones away.
 *
 * @param {object} request - The selection.
 * @param {object} request.selections - The object's selections, from useSelections().
 * @param {Array<{dimIdx: number, values: number[], toggle: boolean}>} request.steps - From
 *     `buildLaneSelection` or `buildSelection`; at least one.
 * @param {{warn: Function}} [request.logger] - Where failures are reported.
 * @returns {Promise<{outcome: string, error?: object, step?: object}>} `selected` when every step
 *     was taken; `refused` when the engine refused one, after which the session is over; `error` when
 *     a call threw. A refusal or an error carries the `step` it happened on — null when the session
 *     itself could not be opened — so the reader can be told which field it was.
 */
export async function selectInObjectSession({ selections, steps, logger }) {
    const began = !selections.isActive();
    let step = null;
    try {
        if (began) await selections.begin([CUBE_PATH]);
        for (step of steps) {
            const ok = await selections.select({
                method: 'selectHyperCubeValues',
                params: [CUBE_PATH, step.dimIdx, step.values, step.toggle],
            });
            if (ok === false) {
                await letGo(selections, logger);
                return { outcome: SELECTION_OUTCOMES.REFUSED, step };
            }
        }
        return { outcome: SELECTION_OUTCOMES.SELECTED };
    } catch (error) {
        logger?.warn?.('The selection failed:', error);
        if (began) await letGo(selections, logger);
        return { outcome: SELECTION_OUTCOMES.ERROR, error, step };
    }
}

export default selectInObjectSession;
