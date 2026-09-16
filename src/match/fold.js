/**
 * Case folding that keeps every character at its original position.
 *
 * Matching runs on a folded copy of the text and reports offsets into that copy, and the viewer cuts
 * the original text at those offsets. That only works if folding never changes a string's length —
 * and `String.prototype.toLowerCase()` does: 'İ' (U+0130) lowercases to two UTF-16 units, which is
 * how a sibling extension's search came to highlight the wrong characters after every "İ". So this
 * folds one code point at a time and keeps any character whose lowercase form has a different
 * length.
 *
 * It does not implement full Unicode case folding ("ß" stays "ß", not "ss") and is not
 * locale-aware: the same input folds the same way on every host.
 *
 * Ported from textview.qs `src/match/fold.js` at df84a5e; the non-ASCII range is now written
 * with escapes instead of raw, invisible characters.
 */

/** Characters whose plain lowercase form is not the one matching needs. */
const SPECIAL = new Map([
    // Dotted capital I: toLowerCase() gives "i" plus a combining dot, one unit too long.
    [0x0130, 'i'],
    // Greek final sigma, so "ΟΔΟΣ" (folded one letter at a time) and "οδος" agree.
    [0x03c2, 'σ'],
    // Long s, which reads as "s".
    [0x017f, 's'],
]);

/** Folded forms of non-ASCII code points, computed once each. */
const cache = new Map();

/** Largest slice handed to String.fromCharCode at once, well under any argument limit. */
const CHUNK = 0x2000;

/** Any code unit outside ASCII. A string without one lowercases to the same length. */
const NON_ASCII = /[\u0080-\uffff]/;

/**
 * Keep a folded form only if it is as long as the original.
 *
 * @param {string} original - The character before folding.
 * @param {string} folded - Its candidate folded form.
 * @returns {string} `folded` when the lengths agree, otherwise `original`.
 */
export function keepLength(original, folded) {
    return folded.length === original.length ? folded : original;
}

/**
 * Fold one code point.
 *
 * @param {number} codePoint - The code point to fold.
 * @returns {string} Its folded form, always the same UTF-16 length as the code point.
 */
function foldCodePoint(codePoint) {
    const special = SPECIAL.get(codePoint);
    if (special !== undefined) return special;
    let folded = cache.get(codePoint);
    if (folded === undefined) {
        const original = String.fromCodePoint(codePoint);
        folded = keepLength(original, original.toLowerCase());
        cache.set(codePoint, folded);
    }
    return folded;
}

/**
 * Turn UTF-16 code units back into a string without spreading millions of arguments at once.
 *
 * @param {Uint16Array} units - The code units.
 * @returns {string} The string they spell, lone surrogates included.
 */
function unitsToString(units) {
    let result = '';
    for (let offset = 0; offset < units.length; offset += CHUNK) {
        result += String.fromCharCode.apply(null, units.subarray(offset, offset + CHUNK));
    }
    return result;
}

/**
 * Fold a string for case-insensitive matching without moving any character.
 *
 * @param {string} text - The text to fold.
 * @returns {string} The folded text, exactly as long as `text`.
 */
export function foldCase(text) {
    if (!NON_ASCII.test(text)) return text.toLowerCase();

    const units = new Uint16Array(text.length);
    for (let i = 0; i < text.length; i++) {
        const unit = text.charCodeAt(i);
        if (unit < 0x80) {
            units[i] = unit >= 0x41 && unit <= 0x5a ? unit + 0x20 : unit;
            continue;
        }
        if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
            const low = text.charCodeAt(i + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                const folded = foldCodePoint(((unit - 0xd800) << 10) + (low - 0xdc00) + 0x10000);
                units[i] = folded.charCodeAt(0);
                units[i + 1] = folded.charCodeAt(1);
                i++;
                continue;
            }
        }
        // A BMP character, or a lone surrogate, which folds to itself.
        units[i] = foldCodePoint(unit).charCodeAt(0);
    }
    return unitsToString(units);
}
