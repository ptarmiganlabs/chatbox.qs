/**
 * Whole-value boundaries: an occurrence counts only when it is not part of a longer word.
 *
 * A word character is a letter, a digit, a combining mark or connector punctuation such as "_", in
 * any script — so "å", "ä" and "ö" are letters and "Åsa" does not match inside "Åsaka", and "e"
 * followed by a combining accent is not a whole "e". A side is only checked when the value itself
 * begins or ends with a word character there: "+46 70" may follow a letter directly, because "+" is
 * not part of a word.
 *
 * It reads whole code points across surrogate pairs. It has no notion of word breaks in scripts
 * written without spaces.
 *
 * Ported from textview.qs `src/match/boundaries.js` at df84a5e, unchanged.
 */

/** Letters, digits, combining marks and connector punctuation, in any script. */
const WORD = /[\p{L}\p{N}\p{M}\p{Pc}]/u;

/** Verdicts for BMP code points: 0 not yet known, 1 a word character, 2 not one. */
const bmpVerdicts = new Uint8Array(0x10000);

/**
 * Decide whether a code point is part of a word.
 *
 * @param {number} codePoint - The code point, or -1 for "no character" (the edge of the text).
 * @returns {boolean} True for letters, digits, combining marks and connector punctuation.
 */
export function isWordCodePoint(codePoint) {
    if (codePoint < 0) return false;
    if (codePoint > 0xffff) return WORD.test(String.fromCodePoint(codePoint));
    let verdict = bmpVerdicts[codePoint];
    if (verdict === 0) {
        verdict = WORD.test(String.fromCharCode(codePoint)) ? 1 : 2;
        bmpVerdicts[codePoint] = verdict;
    }
    return verdict === 1;
}

/**
 * Read the code point that ends just before an offset.
 *
 * @param {string} text - The text.
 * @param {number} offset - The offset.
 * @returns {number} The code point, or -1 at the start of the text.
 */
export function codePointBefore(text, offset) {
    if (offset <= 0) return -1;
    const unit = text.charCodeAt(offset - 1);
    if (unit >= 0xdc00 && unit <= 0xdfff && offset >= 2) {
        const high = text.charCodeAt(offset - 2);
        if (high >= 0xd800 && high <= 0xdbff) {
            return ((high - 0xd800) << 10) + (unit - 0xdc00) + 0x10000;
        }
    }
    return unit;
}

/**
 * Read the code point that starts at an offset.
 *
 * @param {string} text - The text.
 * @param {number} offset - The offset.
 * @returns {number} The code point, or -1 at the end of the text.
 */
export function codePointAtOffset(text, offset) {
    return offset < text.length ? text.codePointAt(offset) : -1;
}

/**
 * Work out which edges of a term need a boundary check.
 *
 * @param {string} term - The normalised term.
 * @returns {{startsWithWord: boolean, endsWithWord: boolean}} Whether the term begins and ends with a
 *     word character.
 */
export function edgeFlags(term) {
    return {
        startsWithWord: isWordCodePoint(codePointAtOffset(term, 0)),
        endsWithWord: isWordCodePoint(codePointBefore(term, term.length)),
    };
}

/**
 * Decide whether an occurrence stands as a whole value in the text around it.
 *
 * @param {string} text - The text the occurrence was found in.
 * @param {number} start - Offset of the occurrence's first unit.
 * @param {number} end - Offset just past its last unit.
 * @param {{startsWithWord: boolean, endsWithWord: boolean}} edges - The term's edge flags.
 * @returns {boolean} False when the occurrence continues a word on either checked side.
 */
export function isWholeValue(text, start, end, edges) {
    if (edges.startsWithWord && isWordCodePoint(codePointBefore(text, start))) return false;
    if (edges.endsWithWord && isWordCodePoint(codePointAtOffset(text, end))) return false;
    return true;
}
