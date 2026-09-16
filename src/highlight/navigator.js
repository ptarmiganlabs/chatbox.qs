/**
 * Stepping through the stops of a conversation — its highlights, or its search matches — and what the
 * counter says.
 *
 * Stops are counted per message: `firstStop[i]` is how many stops come before message `i`, so a stop
 * anywhere in the conversation is one number, and a binary search finds its message. A step wraps
 * around at either end, as a browser's find does. A step without a current stop starts from where the
 * reader is: the first stop in or after the message at the top, or, stepping back, the last one
 * before it. Messages without stops are skipped by the arithmetic, never visited.
 *
 * Pure functions: no DOM. Adapted from textview.qs `src/render/navigator.js` at df84a5e.
 */
import { counted, formatCount } from '../util/format';

/**
 * Find the message a stop belongs to.
 *
 * @param {{firstStop: Int32Array}} stops - The stops.
 * @param {number} index - The stop's number in the conversation.
 * @returns {{messageIndex: number, ordinal: number}} Its message and its ordinal in that message.
 */
export function stopAt(stops, index) {
    const { firstStop } = stops;
    // The last message whose first stop is at or before the index.
    let low = 0;
    let high = firstStop.length - 2;
    while (low < high) {
        const middle = (low + high + 1) >>> 1;
        if (firstStop[middle] <= index) low = middle;
        else high = middle - 1;
    }
    return { messageIndex: low, ordinal: index - firstStop[low] };
}

/**
 * Work out the stop a step lands on.
 *
 * @param {object} request - The step.
 * @param {{firstStop: Int32Array, total: number}} request.stops - The stops.
 * @param {?{messageIndex: number, ordinal: number}} request.current - The current stop, or null.
 * @param {number} request.direction - 1 for the next stop, -1 for the previous one.
 * @param {number} [request.from] - The message the reader is at, for a step without a current stop.
 * @returns {?{messageIndex: number, ordinal: number, index: number}} The stop, with its number in the
 *     conversation; null when there are no stops.
 */
export function stepStop({ stops, current, direction, from = 0 }) {
    const total = stops?.total ?? 0;
    if (total <= 0) return null;
    let index;
    if (current !== null && current !== undefined) {
        const at = stops.firstStop[current.messageIndex] + current.ordinal;
        index = (at + direction + total) % total;
    } else {
        const messages = stops.firstStop.length - 1;
        const start = stops.firstStop[Math.min(Math.max(0, from), messages)];
        if (direction > 0) index = start < total ? start : 0;
        else index = start > 0 ? start - 1 : total - 1;
    }
    return { ...stopAt(stops, index), index };
}

/**
 * Write what the counter says.
 *
 * @param {object} request - What to count.
 * @param {string} request.kind - 'highlight' or 'find'.
 * @param {number} request.index - The current stop's number, or -1 for none.
 * @param {number} request.count - How many stops there are.
 * @param {boolean} [request.truncated] - Whether the search stopped before finding them all.
 * @returns {string} For example "3 of 12", "12 matches", "No matches", or '' for highlights before the
 *     first step: the summary line counts them.
 */
export function counterText({ kind, index, count, truncated = false }) {
    const more = truncated ? '+' : '';
    if (index >= 0 && index < count)
        return `${formatCount(index + 1)} of ${formatCount(count)}${more}`;
    if (kind !== 'find') return '';
    if (count === 0) return 'No matches';
    return truncated ? `${formatCount(count)}+ matches` : counted(count, 'match', 'matches');
}
