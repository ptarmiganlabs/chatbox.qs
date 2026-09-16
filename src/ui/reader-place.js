/**
 * Where the reader is in a conversation, and where to put them back once other messages are shown.
 *
 * Shared by every list that shows messages: the single conversation, and each lane or row of
 * conversations shown side by side. Moved here unchanged from ChatLog, which still re-exports them.
 */

/**
 * The key that identifies a bubble within the conversation.
 *
 * Message ids can repeat — two authors sharing one, or two messages that only
 * share an id — so the open detail, the React row key and the snapshot state all
 * key on this instead. normalize() sets it; the id is the fallback for a message
 * built by hand.
 *
 * @param {object} message - A normalized Message.
 * @returns {string} A key unique within the conversation.
 */
export function bubbleKey(message) {
    return message.key ?? message.id;
}

/** How far a row must reach below the top of the view to count as shown, in pixels. */
const SHOWN_BELOW_TOP_PX = 2;

/**
 * Find the message the reader is at: the first one whose bottom is below the top of the view.
 *
 * Read from the rows on screen rather than from the virtualizer's range, which also counts the rows it
 * draws beyond the view. The day header the virtualizer holds at the top of the view covers the rows
 * under it, so the view starts below it; a row reaching a fraction of a pixel further is not shown.
 *
 * @param {?HTMLElement} view - The element that scrolls.
 * @param {?HTMLElement} list - The element the rows are in.
 * @returns {number} The message's index, or -1 when no row is laid out below the top of the view.
 */
export function messageAtTop(view, list) {
    const viewTop = view?.getBoundingClientRect?.().top;
    if (typeof viewTop !== 'number') return -1;
    const held = view.querySelector?.('[data-testid="virtuoso-top-item-list"]');
    const top = Math.max(viewTop, held?.getBoundingClientRect().bottom ?? viewTop);
    for (const node of list?.querySelectorAll?.('[data-message-index]') ?? []) {
        if (node.getBoundingClientRect().bottom > top + SHOWN_BELOW_TOP_PX) {
            return Number(node.getAttribute('data-message-index'));
        }
    }
    return -1;
}

/**
 * Find where to put the reader back once other messages are shown.
 *
 * @param {{messages: Array<object>, index: number}} place - The messages that were shown, and the index
 *     of the one the reader was at.
 * @param {Array<object>} messages - The messages shown now.
 * @returns {number} The index of the reader's message among `messages`; when a selection removed it, of
 *     the first message after it that is still shown, else of the last one before it; -1 when none is.
 */
export function returnIndex(place, messages) {
    const before = place?.messages ?? [];
    const from = Math.min(Math.max(place?.index ?? 0, 0), before.length);
    // A render that rebuilt the same messages leaves the reader's message where it was.
    if (from < messages.length && from < before.length) {
        if (bubbleKey(messages[from]) === bubbleKey(before[from])) return from;
    }
    const at = new Map(messages.map((message, index) => [bubbleKey(message), index]));
    for (let i = from; i < before.length; i++) {
        const index = at.get(bubbleKey(before[i]));
        if (index !== undefined) return index;
    }
    for (let i = from - 1; i >= 0; i--) {
        const index = at.get(bubbleKey(before[i]));
        if (index !== undefined) return index;
    }
    return -1;
}
