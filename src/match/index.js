/**
 * The matching engine's public surface: prepare a text once, then match highlight values and
 * find-box queries against it as often as selections and typing change.
 *
 * Every offset in a result is a UTF-16 offset into the original text, ready for slicing. Preparing is
 * the expensive step for a multi-megabyte text, which is why it is separate: the viewer keeps a
 * prepared text for as long as the text and the matching options stay the same.
 *
 * Nothing here touches the DOM or the Qlik engine, and nothing here has a limit a caller cannot see:
 * a search that stops early says so.
 *
 * A chat conversation is thousands of short texts rather than one long one, so building the search
 * automaton — a 256 KB table per build — is separated from matching a text: a matcher is built once
 * per set of values and options and then matches every message. Rebuilding it per message measured
 * 270 ms for 500 messages; building it once and matching 5,000 took 13 ms (Node 24, 2026-09-16).
 *
 * Ported from textview.qs `src/match/index.js` at df84a5e. Changed: `createValueMatcher` builds the
 * terms and automaton once, and `matchValues` is now a wrapper around it.
 */
import { buildAutomaton } from './aho-corasick';
import { isWholeValue } from './boundaries';
import { foldCase } from './fold';
import { selectLeftmostLongest } from './resolve';
import { buildTerms, normalizeTerm } from './terms';
import { collapseWhitespace, unchangedText } from './whitespace';

/** The defaults Textview.qs ships with: forgiving, but never inside a longer word. */
export const DEFAULT_MATCH_OPTIONS = Object.freeze({
    caseSensitive: false,
    wholeValues: true,
    flexibleWhitespace: true,
});

/**
 * Occurrences collected before a search gives up and reports itself truncated. A term as short as
 * one character in a multi-megabyte text would otherwise collect millions.
 */
export const DEFAULT_OCCURRENCE_LIMIT = 1_000_000;

/**
 * @typedef {object} PreparedText
 * @property {string} original - The text as given.
 * @property {string} searchable - The normalised text that is actually searched.
 * @property {function(number): number} toOriginal - Maps an offset in `searchable` to `original`.
 * @property {import('./terms').MatchOptions} options - The options it was prepared with.
 */

/**
 * @typedef {object} ValueMatch
 * @property {number} start - Offset of the match in the original text.
 * @property {number} end - Offset just past the match in the original text.
 * @property {string[]} values - The selected values that produced it, in selection order.
 * @property {string[]} categories - Their categories, in the order first seen.
 */

/**
 * Fill in any matching option the caller left out.
 *
 * @param {object} [options] - Partial matching options.
 * @returns {import('./terms').MatchOptions} Complete options.
 */
export function resolveMatchOptions(options = {}) {
    return {
        caseSensitive: options.caseSensitive ?? DEFAULT_MATCH_OPTIONS.caseSensitive,
        wholeValues: options.wholeValues ?? DEFAULT_MATCH_OPTIONS.wholeValues,
        flexibleWhitespace: options.flexibleWhitespace ?? DEFAULT_MATCH_OPTIONS.flexibleWhitespace,
    };
}

/**
 * Prepare a text for matching.
 *
 * @param {*} text - The text; null and undefined prepare as an empty text.
 * @param {object} [options] - Matching options; see {@link DEFAULT_MATCH_OPTIONS}.
 * @returns {PreparedText} The prepared text.
 */
export function prepareText(text, options) {
    const resolved = resolveMatchOptions(options);
    const original = text === null || text === undefined ? '' : String(text);
    // Collapse first, then fold: folding keeps every length, so the offset map stays valid.
    const spaced = resolved.flexibleWhitespace
        ? collapseWhitespace(original)
        : unchangedText(original);
    const searchable = resolved.caseSensitive ? spaced.text : foldCase(spaced.text);
    return { original, searchable, toOriginal: spaced.toOriginal, options: resolved };
}

/**
 * Map a searched span back to the original text.
 *
 * @param {PreparedText} prepared - The prepared text.
 * @param {number} start - Start offset in the searchable text.
 * @param {number} end - End offset in the searchable text; the span is never empty.
 * @returns {{start: number, end: number}} The same span in the original text.
 */
function originalSpan(prepared, start, end) {
    return { start: prepared.toOriginal(start), end: prepared.toOriginal(end - 1) + 1 };
}

/**
 * @typedef {object} ValueMatcher
 * @property {import('./terms').MatchOptions} options - The options its terms were normalised with.
 * @property {number} termCount - How many distinct terms it searches for.
 * @property {function(PreparedText, {occurrenceLimit?: number}=): {matches: ValueMatch[],
 *     truncated: boolean, occurrences: number}} match - Find the values in one prepared text.
 */

/**
 * Tell whether a text prepared with some options can be searched for terms normalised with others.
 *
 * @param {import('./terms').MatchOptions} a - One set of options.
 * @param {import('./terms').MatchOptions} b - Another.
 * @returns {boolean} True when both normalise case and whitespace alike; whole values only affect
 *     matching, not preparation.
 */
function samePreparation(a, b) {
    return a.caseSensitive === b.caseSensitive && a.flexibleWhitespace === b.flexibleWhitespace;
}

/**
 * Build a matcher for a set of values, to match against as many texts as needed.
 *
 * @param {Array<{value: *, category?: *}>} rows - Selected values with optional categories.
 * @param {object} [options] - Matching options; see {@link DEFAULT_MATCH_OPTIONS}.
 * @returns {ValueMatcher} The matcher. Its terms and automaton are built here, once, and never when
 *     there is nothing to search for.
 */
export function createValueMatcher(rows, options) {
    const resolved = resolveMatchOptions(options);
    const terms = buildTerms(rows, resolved);
    const automaton = terms.length === 0 ? null : buildAutomaton(terms.map((term) => term.key));

    /**
     * Find where the values occur in a prepared text.
     *
     * @param {PreparedText} prepared - The text, from {@link prepareText}. A text prepared with other
     *     case or whitespace options is prepared again with the matcher's.
     * @param {object} [limits] - Search limits.
     * @param {number} [limits.occurrenceLimit] - Occurrences to collect before stopping.
     * @returns {{matches: ValueMatch[], truncated: boolean, occurrences: number}} Non-overlapping
     *     matches in text order; whether the search stopped at the limit, in which case matches after
     *     the stopping point are missing; and how many occurrences were collected, overlapping ones
     *     included, for callers that share one limit across many texts.
     */
    function match(prepared, { occurrenceLimit = DEFAULT_OCCURRENCE_LIMIT } = {}) {
        if (automaton === null) return { matches: [], truncated: false, occurrences: 0 };
        const text = samePreparation(prepared.options, resolved)
            ? prepared
            : prepareText(prepared.original, resolved);

        const { searchable } = text;
        const found = [];
        let truncated = false;
        automaton.search(searchable, (start, end, termId) => {
            const term = terms[termId];
            if (resolved.wholeValues && !isWholeValue(searchable, start, end, term)) return true;
            if (found.length >= occurrenceLimit) {
                truncated = true;
                return false;
            }
            found.push({ start, end, termId });
            return true;
        });

        const occurrences = found.length;
        const matches = selectLeftmostLongest(found).map((occurrence) => {
            const term = terms[occurrence.termId];
            return {
                ...originalSpan(text, occurrence.start, occurrence.end),
                values: term.values,
                categories: term.categories,
            };
        });
        return { matches, truncated, occurrences };
    }

    return { options: resolved, termCount: terms.length, match };
}

/**
 * Find where the selected values occur in a prepared text.
 *
 * @param {PreparedText} prepared - The text, from {@link prepareText}.
 * @param {Array<{value: *, category?: *}>} rows - Selected values with optional categories.
 * @param {object} [limits] - Search limits.
 * @param {number} [limits.occurrenceLimit] - Occurrences to collect before stopping.
 * @returns {{matches: ValueMatch[], termCount: number, truncated: boolean}} Non-overlapping matches
 *     in text order; `truncated` is true when the search stopped at the limit, in which case matches
 *     after the stopping point are missing.
 */
export function matchValues(prepared, rows, limits) {
    const matcher = createValueMatcher(rows, prepared.options);
    const { matches, truncated } = matcher.match(prepared, limits);
    return { matches, termCount: matcher.termCount, truncated };
}

/**
 * Find what was typed in the find box.
 *
 * The query is normalised like a value — case and whitespace follow the prepared text's options — but
 * it matches as a plain substring, and occurrences do not overlap. Every character is literal: there
 * are no wildcards.
 *
 * @param {PreparedText} prepared - The text, from {@link prepareText}.
 * @param {*} query - What was typed.
 * @param {object} [limits] - Search limits.
 * @param {number} [limits.occurrenceLimit] - Occurrences to collect before stopping.
 * @returns {{matches: Array<{start: number, end: number}>, truncated: boolean}} Matches in text order.
 */
export function findText(prepared, query, { occurrenceLimit = DEFAULT_OCCURRENCE_LIMIT } = {}) {
    const needle = normalizeTerm(query, prepared.options);
    const matches = [];
    if (needle === '') return { matches, truncated: false };

    const { searchable } = prepared;
    for (
        let at = searchable.indexOf(needle);
        at !== -1;
        at = searchable.indexOf(needle, at + needle.length)
    ) {
        if (matches.length >= occurrenceLimit) return { matches, truncated: true };
        matches.push(originalSpan(prepared, at, at + needle.length));
    }
    return { matches, truncated: false };
}
