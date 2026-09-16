/**
 * Keyboard navigation policy.
 *
 * Kept as pure functions so the rules are testable without a DOM, a virtualizer
 * or a Sense client — none of which are available where this logic is easiest to
 * get wrong.
 */

/**
 * Report whether the conversation may hold a tab stop at all.
 *
 * Nebula's contract: a visualization contributes tab stops only when keyboard
 * handling is NOT managed by Sense (`enabled === false`), or when Sense has
 * explicitly handed focus to this object (`active === true`).
 *
 * This matters more here than in most charts. A conversation is a long list, and
 * making every message tabbable would put hundreds of tab stops in the sheet —
 * a 500-message chat would take 500 presses to tab past, which makes the whole
 * dashboard unnavigable rather than just this object.
 *
 * @param {object} [keyboard] - The object returned by useKeyboard().
 * @returns {boolean} True when the list may take focus.
 */
export function canReceiveTabStop(keyboard) {
    if (!keyboard) return true;
    if (keyboard.enabled === false) return true;
    return keyboard.active === true;
}

/**
 * Resolve a key press to the index that should receive focus.
 *
 * Movement is clamped rather than wrapped: arrowing off the end of a
 * conversation and reappearing at the other end reads as a glitch, and in a
 * virtualized list it also throws the reader hundreds of rows away.
 *
 * @param {string} key - The KeyboardEvent key.
 * @param {number} current - The currently focused index, or -1 for none.
 * @param {number} count - Number of messages.
 * @returns {?number} The next index, or null when the key is not a movement.
 */
export function nextFocusIndex(key, current, count) {
    if (count <= 0) return null;
    const from = current < 0 ? -1 : current;

    switch (key) {
        case 'ArrowDown':
            return Math.min(from + 1, count - 1);
        case 'ArrowUp':
            // From nowhere, Up enters at the end — the most recent message is
            // the one a reader is usually looking for.
            return from <= 0 ? (from === -1 ? count - 1 : 0) : from - 1;
        case 'Home':
            return 0;
        case 'End':
            return count - 1;
        case 'PageDown':
            return Math.min(from + 10, count - 1);
        case 'PageUp':
            return Math.max(from - 10, 0);
        default:
            return null;
    }
}

/**
 * Resolve a key press to an action on the focused message.
 *
 * @param {string} key - The KeyboardEvent key.
 * @returns {?string} 'activate', 'dismiss', or null.
 */
export function keyAction(key) {
    if (key === 'Enter' || key === ' ' || key === 'Spacebar') return 'activate';
    if (key === 'Escape' || key === 'Esc') return 'dismiss';
    return null;
}

/**
 * Resolve a key press to a step through the highlights or the search matches.
 *
 * F3 and Shift+F3, and Ctrl+G and Ctrl+Shift+G (Cmd on a Mac), as browsers step through what their
 * find found. With Alt held the keys belong to something else.
 *
 * @param {object} event - The keyboard event: `key`, `shiftKey`, `ctrlKey`, `metaKey`, `altKey`.
 * @returns {?number} 1 for the next stop, -1 for the previous one, null for any other key.
 */
export function stepDirection(event) {
    if (!event || event.altKey) return null;
    const back = event.shiftKey ? -1 : 1;
    if (event.key === 'F3') return back;
    if ((event.ctrlKey || event.metaKey) && (event.key === 'g' || event.key === 'G')) return back;
    return null;
}

/**
 * Tell whether a key press asks for the search box: Ctrl+F, or Cmd+F on a Mac.
 *
 * @param {object} event - The keyboard event.
 * @returns {boolean} True for Ctrl or Cmd with F, without Shift or Alt.
 */
export function isFindKey(event) {
    if (!event || event.altKey || event.shiftKey) return false;
    return Boolean(event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F');
}

/** The keys that move up and down a list. */
const VERTICAL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']);

/**
 * Find the message in a lane nearest a linked board's row: in the row itself, else the closest row,
 * the one above on a tie.
 *
 * @param {object} board - A linked board.
 * @param {number} row - The row.
 * @param {number} lane - The lane.
 * @returns {number} The message's board index, or -1 when the lane has none.
 */
function nearestInLane(board, row, lane) {
    const { rows, laneOf } = board;
    /**
     * Find the lane's message in one row.
     *
     * @param {number} r - The row.
     * @returns {number} Its board index, or -1.
     */
    const inRow = (r) => {
        if (r < 0 || r >= rows.count) return -1;
        for (let index = rows.start[r]; index < rows.start[r + 1]; index++) {
            if (laneOf[index] === lane) return index;
        }
        return -1;
    };
    for (let distance = 0; distance < rows.count; distance++) {
        const above = inRow(row - distance);
        if (above >= 0) return above;
        const below = distance > 0 ? inRow(row + distance) : -1;
        if (below >= 0) return below;
    }
    return -1;
}

/**
 * Resolve a key press to the message that should receive focus, with conversations side by side.
 *
 * Up, Down, Home, End and the page keys move within the lane, clamped as `nextFocusIndex` moves. Left
 * and Right go to the neighbouring lane: with linked scrolling to its message in the same row, else in
 * the nearest row; with free scrolling to where the reader is in that lane, as `anchor` tells, else its
 * first message. From nowhere, focus enters the first lane, the most recent.
 *
 * @param {string} key - The KeyboardEvent key.
 * @param {number} current - The focused message's board index, or -1 for none.
 * @param {object} board - The board, from `buildBoard`.
 * @param {object} [options] - Options.
 * @param {function(number): number} [options.anchor] - The board index where the reader is in a lane.
 * @returns {?number} The board index to focus, or null when the key is not a movement.
 */
export function laneFocusIndex(key, current, board, { anchor } = {}) {
    const lanes = board?.lanes ?? [];
    const vertical = VERTICAL_KEYS.has(key);
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
    if (lanes.length === 0 || (!vertical && !horizontal)) return null;

    if (current < 0 || current >= board.laneOf.length) {
        const first = lanes[0];
        if (!vertical) return first.indices[0];
        return first.indices[nextFocusIndex(key, -1, first.count)];
    }

    const lane = board.laneOf[current];
    if (vertical) {
        const own = lanes[lane];
        return own.indices[nextFocusIndex(key, board.posInLane[current], own.count)];
    }

    const target = Math.min(lanes.length - 1, Math.max(0, lane + (key === 'ArrowRight' ? 1 : -1)));
    if (target === lane) return current;
    if (board.rows) {
        const found = nearestInLane(board, board.rows.of[current], target);
        return found >= 0 ? found : lanes[target].indices[0];
    }
    const place = anchor?.(target);
    if (Number.isInteger(place) && place >= 0 && board.laneOf[place] === target) return place;
    return lanes[target].indices[0];
}
