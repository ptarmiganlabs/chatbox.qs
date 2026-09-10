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
