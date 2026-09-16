/**
 * Turn a click on a bubble into engine selection calls.
 *
 * Pure, so every rule below is unit-testable — the lifecycle in index.js only
 * runs the steps. Each step is one `selectHyperCubeValues` call:
 * `{ dimIdx, values, toggle }`. An empty list means the click selects nothing,
 * and the view must not offer it.
 *
 * Three engine facts shape it:
 *
 *  - `values` are element numbers, and element numbers belong to a FIELD. A
 *    person is one number in the From field and another in the To field, so a
 *    step only ever uses numbers read from the field it selects in.
 *  - An empty `values` array is not "nothing": the engine reads it as every
 *    value. A step with no values is dropped, never sent.
 *  - `toggle` flips each listed value on its own. Toggling [Ada, Bob] while Ada
 *    is already selected leaves just Bob. So a single value toggles, as a click
 *    always has, and a set replaces the field's selection.
 */
import { ROLES, dimensionIndex } from './column-map';

/**
 * Collect distinct, selectable element numbers.
 *
 * @param {Array<?number>} elems - Candidate element numbers.
 * @returns {number[]} The non-negative ones, de-duplicated, in first-seen order.
 */
function selectable(elems) {
    return [...new Set(elems.filter((e) => typeof e === 'number' && e >= 0))];
}

/**
 * Build one step, or nothing when it cannot select anything.
 *
 * @param {?object} column - The column to select in.
 * @param {number[]} values - Element numbers from that column's field.
 * @param {boolean} toggle - Toggle rather than replace.
 * @returns {object[]} Zero or one step.
 */
function step(column, values, toggle) {
    const dimIdx = dimensionIndex(column);
    if (dimIdx < 0 || values.length === 0) return [];
    return [{ dimIdx, values, toggle }];
}

/**
 * Decide whether a click in the object may select at all, whatever it would select.
 *
 * nebula's `interactions.select` is not enough on its own. It is true in Sense edit mode, where a click
 * on a native chart only picks the object for editing, and in an image or PDF export, whose server
 * reports every interaction as allowed. It also stays true for an object Sense has made inactive,
 * which `interactions.active` reports. One gate serves a click on a bubble and a click on a highlight
 * or a legend chip, so they can never disagree.
 *
 * @param {object} options - Inputs.
 * @param {?{active?: boolean, select?: boolean, edit?: boolean}} [options.interactions] - From
 *     useInteractionState().
 * @param {boolean} [options.snapshot] - Whether the object renders a snapshot, as for an export.
 * @returns {boolean} True when a click may make a selection.
 */
export function clicksMaySelect({ interactions, snapshot = false } = {}) {
    return (
        !snapshot &&
        interactions?.active !== false &&
        Boolean(interactions?.select) &&
        !interactions?.edit
    );
}

/**
 * Build the selection steps for a click.
 *
 * @param {object} options - Inputs.
 * @param {string} [options.action] - The onBubbleClick setting; absent means selectAuthor.
 * @param {object} options.message - The clicked bubble.
 * @param {object} options.byRole - Role map from resolveRoles.
 * @param {Map<string, object>} [options.participants] - Authors, carrying From-field elements.
 * @param {Map<string, number>} [options.recipientElems] - Recipients' To-field elements.
 * @returns {object[]} Steps in the order they must run; empty when nothing is selectable.
 */
export function buildSelection({
    action = 'selectAuthor',
    message,
    byRole,
    participants,
    recipientElems,
}) {
    if (!message || !byRole) return [];

    switch (action) {
        case 'selectAuthor':
            return step(byRole[ROLES.AUTHOR], selectable([message.author?.elem]), true);

        case 'selectMessage':
            return step(byRole[ROLES.MESSAGE_ID], selectable([message.elem]), true);

        case 'selectRecipient': {
            const values = selectable(
                (message.recipients ?? []).filter((r) => !r.unknown).map((r) => r.elem)
            );
            return step(byRole[ROLES.RECIPIENT], values, values.length === 1);
        }

        case 'selectConversation': {
            // A thread names the conversation outright.
            if (byRole[ROLES.THREAD] && message.threadElem >= 0) {
                return step(byRole[ROLES.THREAD], [message.threadElem], true);
            }
            if (!byRole[ROLES.RECIPIENT]) return [];

            // A message with no named recipient belongs to no exchange of people.
            // Selecting its sender in both fields would narrow the view to the
            // sender's notes to self — and drop the clicked message, whose null
            // recipient no selection in the To field can ever include.
            const recipientKeys = (message.recipients ?? [])
                .filter((r) => !r.unknown)
                .map((r) => r.key);
            if (!recipientKeys.length) return [];

            // Otherwise the conversation is its people: everyone in it, in both
            // fields, each with the element number that field gives them. Someone
            // who never sent has no From number and is simply not needed there.
            const parties = [message.authorKey, ...recipientKeys];
            const from = selectable(
                parties.map((key) => {
                    const participant = participants?.get(key);
                    return participant && !participant.unknown ? participant.elem : -1;
                })
            );
            const to = selectable(parties.map((key) => recipientElems?.get(key)));
            if (!from.length || !to.length) return [];
            return [
                ...step(byRole[ROLES.AUTHOR], from, false),
                ...step(byRole[ROLES.RECIPIENT], to, false),
            ];
        }

        default:
            return [];
    }
}

export default buildSelection;
