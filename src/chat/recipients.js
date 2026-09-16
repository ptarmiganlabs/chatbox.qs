/**
 * Recipient lists: identity, de-duplication and display.
 *
 * A recipient is `{ key, label, elem, unknown }`. People are identified by their
 * exact text, never by element number: element numbers belong to a field, so the
 * same person has one number in the From field and a different one in the To
 * field. An unknown recipient — the engine's null or Others row — has no key and
 * is identified by its label instead.
 */

/** Separator for composite keys. It cannot occur in engine text. */
const SEP = String.fromCharCode(0);

/** Prefix that keeps an unknown recipient's label from matching a real name. */
const UNKNOWN = String.fromCharCode(1);

/**
 * Identify a recipient for de-duplication and comparison.
 *
 * @param {object} recipient - A recipient.
 * @returns {string} A string equal for the same recipient.
 */
export function recipientIdentity(recipient) {
    if (recipient?.unknown) return UNKNOWN + recipient.label;
    return recipient?.key ?? '';
}

/**
 * Build an order-independent key for a recipient list.
 *
 * @param {?object[]} list - Recipients, or null when there is no recipient role.
 * @returns {string} The key; '' for no list or an empty one.
 */
export function recipientsKey(list) {
    if (!Array.isArray(list) || list.length === 0) return '';
    return list.map(recipientIdentity).sort().join(SEP);
}

/**
 * Append recipients to a list, skipping ones it already holds.
 *
 * @param {object[]} target - The list to extend, mutated; first-seen order is kept.
 * @param {?object[]} more - Recipients to add.
 * @returns {object[]} The same target list.
 */
export function addRecipients(target, more) {
    const seen = new Set(target.map(recipientIdentity));
    for (const recipient of Array.isArray(more) ? more : []) {
        const identity = recipientIdentity(recipient);
        if (seen.has(identity)) continue;
        seen.add(identity);
        target.push(recipient);
    }
    return target;
}

/**
 * Format a recipient list for display.
 *
 * @param {?object[]} list - Recipients.
 * @param {object} [options] - Formatting options.
 * @param {number} [options.max] - Names to show before summarising the rest.
 * @param {boolean} [options.partial] - Whether the list may be incomplete because
 *   the load was truncated part-way through this message's rows, at either end.
 * @returns {string} e.g. "Bob, Cy, Dan and 2 more"; '' for an empty list.
 */
export function formatRecipients(list, { max = 3, partial = false } = {}) {
    const labels = (Array.isArray(list) ? list : []).map((r) => r.label);
    if (!labels.length) return '';
    let text = labels.slice(0, max).join(', ');
    if (labels.length > max) text += ` and ${labels.length - max} more`;
    if (partial) text += '…';
    return text;
}
