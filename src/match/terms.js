/**
 * Turn highlight rows into the distinct terms the matcher searches for.
 *
 * Each row is one value with an optional category, the way the highlight hypercube delivers them.
 * Values that normalise to the same term — "İSTANBUL" and "istanbul" when case is ignored — become one
 * term that keeps every original spelling and every category, so a match can report all of them.
 *
 * It does not order categories for display or choose colours; that is the viewer's job.
 *
 * Ported from textview.qs `src/match/terms.js` at df84a5e; only the import paths changed.
 */
import { edgeFlags } from './boundaries';
import { foldCase } from './fold';
import { collapseWhitespace, trimWhitespace } from './whitespace';

/**
 * @typedef {object} MatchOptions
 * @property {boolean} caseSensitive - Match letter case exactly.
 * @property {boolean} wholeValues - Only count occurrences that are not part of a longer word.
 * @property {boolean} flexibleWhitespace - Let any run of whitespace match any other run.
 */

/**
 * @typedef {object} Term
 * @property {string} key - The normalised form searched for.
 * @property {string[]} values - Every original spelling that normalised to `key`, in input order.
 * @property {string[]} categories - Every category those spellings carry, in input order.
 * @property {boolean} startsWithWord - Whether `key` begins with a word character.
 * @property {boolean} endsWithWord - Whether `key` ends with a word character.
 */

/**
 * Normalise a value or a find-box query the same way the text is normalised.
 *
 * @param {*} value - The value; numbers and other non-strings are converted to text.
 * @param {MatchOptions} options - The matching options.
 * @returns {string} The normalised term, or '' when nothing searchable is left.
 */
export function normalizeTerm(value, options) {
    let term = value === null || value === undefined ? '' : String(value);
    if (options.flexibleWhitespace) term = collapseWhitespace(trimWhitespace(term)).text;
    if (!options.caseSensitive) term = foldCase(term);
    return term;
}

/**
 * Build the distinct search terms for a set of highlight rows.
 *
 * @param {Array<{value: *, category?: *}>} rows - Highlight values with optional categories.
 * @param {MatchOptions} options - The matching options.
 * @returns {Term[]} One term per distinct normalised value, in order of first appearance. Rows whose
 *     value is missing or normalises to nothing are skipped.
 */
export function buildTerms(rows, options) {
    const byKey = new Map();
    const terms = [];
    for (const row of rows) {
        const key = normalizeTerm(row?.value, options);
        if (key === '') continue;

        let term = byKey.get(key);
        if (term === undefined) {
            term = { key, values: [], categories: [], ...edgeFlags(key) };
            byKey.set(key, term);
            terms.push(term);
        }

        const spelling = String(row.value);
        if (!term.values.includes(spelling)) term.values.push(spelling);

        const category = row.category;
        if (category !== null && category !== undefined && category !== '') {
            const name = String(category);
            if (!term.categories.includes(name)) term.categories.push(name);
        }
    }
    return terms;
}
