/**
 * Whitespace collapsing for flexible matching, with a map back to original offsets.
 *
 * With flexible whitespace on, any run of whitespace in a value matches any run in the text: a phone
 * number broken across a line, or two spaces where the value has one. Both sides are collapsed to
 * single spaces and matched in the collapsed text; `toOriginal` then turns an offset in the collapsed
 * text back into an offset in the original.
 *
 * The map is sparse — one entry per run that actually shrank. A single space or line break keeps its
 * length, so a 5 MB text with one line break per line costs no map at all; Windows line endings cost
 * one entry per line.
 *
 * It does not trim the text, fold case, or treat any character other than Unicode White_Space
 * specially.
 *
 * Ported from textview.qs `src/match/whitespace.js` at df84a5e, unchanged.
 */

/** Leading or trailing whitespace, by the same Unicode definition used for runs. */
const EDGES = /^\p{White_Space}+|\p{White_Space}+$/gu;

/**
 * A text that needs no mapping, for when flexible whitespace is off.
 *
 * @param {string} text - The text.
 * @returns {{text: string, toOriginal: function(number): number}} The text and an identity map.
 */
export function unchangedText(text) {
    return { text, toOriginal: identity };
}

/**
 * Map an offset to itself.
 *
 * @param {number} offset - An offset.
 * @returns {number} The same offset.
 */
function identity(offset) {
    return offset;
}

/**
 * Remove whitespace from both ends of a value.
 *
 * `String.prototype.trim` misses some Unicode whitespace (U+0085, for one), and a value must be
 * trimmed by the same definition its runs are collapsed by.
 *
 * @param {string} value - The value.
 * @returns {string} The value without leading or trailing whitespace.
 */
export function trimWhitespace(value) {
    return value.replace(EDGES, '');
}

/**
 * Collapse every run of whitespace to a single space.
 *
 * @param {string} text - The text to collapse.
 * @returns {{text: string, toOriginal: function(number): number}} The collapsed text and a function
 *     that maps an offset in it to the offset of the same character in `text`.
 */
export function collapseWhitespace(text) {
    const run = /\p{White_Space}+/gu;
    const parts = [];
    // For each run that shrank: the collapsed offset of its space, and the total characters removed
    // up to and including that run.
    const shrunkAt = [];
    const removedAfter = [];
    let removed = 0;
    let copied = 0;

    for (let found = run.exec(text); found !== null; found = run.exec(text)) {
        const length = found[0].length;
        parts.push(text.slice(copied, found.index), ' ');
        if (length > 1) {
            shrunkAt.push(found.index - removed);
            removed += length - 1;
            removedAfter.push(removed);
        }
        copied = found.index + length;
    }

    if (shrunkAt.length === 0) {
        // Nothing moved, but single whitespace characters may still have become spaces.
        return {
            text: parts.length === 0 ? text : parts.join('') + text.slice(copied),
            toOriginal: identity,
        };
    }
    parts.push(text.slice(copied));

    const starts = Int32Array.from(shrunkAt);
    const shifts = Int32Array.from(removedAfter);

    /**
     * Map an offset in the collapsed text to the original text.
     *
     * @param {number} offset - An offset in the collapsed text.
     * @returns {number} The offset of the same character in the original text. For the space that
     *     stands in for a run, that is the first character of the run.
     */
    function toOriginal(offset) {
        // The last shrunk run whose space lies before `offset` decides the shift.
        let low = 0;
        let high = starts.length - 1;
        let shift = 0;
        while (low <= high) {
            const middle = (low + high) >> 1;
            if (starts[middle] < offset) {
                shift = shifts[middle];
                low = middle + 1;
            } else {
                high = middle - 1;
            }
        }
        return offset + shift;
    }

    return { text: parts.join(''), toOriginal };
}
