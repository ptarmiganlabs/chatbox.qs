/**
 * Finding the highlight values in every message of a conversation, once.
 *
 * The legend counts highlights across the whole conversation, the ruler shows where they are, and
 * stepping reaches every one — also in messages the virtualized list has not drawn — so every message is
 * matched, not only the mounted ones. That has to stay cheap: the object renders again on every layout
 * change and every step of a resize, and each render builds new message objects for the same
 * conversation. So:
 *
 * - The matcher (terms and automaton) is built only when the values, their categories or the matching
 *   options change.
 * - A message's result is kept by what it is matched on — its format and its body — never by object
 *   identity, and reused while the matcher is the same.
 * - A call with the same messages as the last one returns the very same result, so nothing downstream
 *   renders again for a resize.
 *
 * Stops are not listed one by one: each message keeps its own highlights, and `firstStop` counts the
 * highlights before each message, so a stop anywhere in the conversation is found by a binary search.
 * One occurrence budget covers the whole conversation; a search that spends it says so. At most
 * {@link MAX_DRAWN_HIGHLIGHTS} highlights are drawn where every message is rendered at once; the counts,
 * the ruler and stepping always cover all of them.
 *
 * A plain-text body is matched as it is; a markdown body in the text it renders, its projection, which
 * is worked out once per body and shared with search (`src/highlight/markdown-projection.js`). It
 * builds no DOM.
 */
import { createValueMatcher, prepareText } from '../match/index';
import { createProjections } from './markdown-projection';

/** The most highlights drawn when every message is rendered at once, as for `virtualize: false`. */
export const MAX_DRAWN_HIGHLIGHTS = 20_000;

/** Occurrences collected across a conversation before the search stops and says so. */
export const OCCURRENCE_BUDGET = 1_000_000;

/** A message without highlights. Shared: never change it. */
export const NO_MESSAGE_HIGHLIGHTS = Object.freeze({
    text: '',
    spans: Object.freeze([]),
    byCategory: new Map(),
    none: 0,
    occurrences: 0,
});

/** The block separator of the markdown projection, which no engine text contains. */
const SEPARATOR = String.fromCharCode(0);

/**
 * Build a conversation result with nothing in it.
 *
 * @param {number} count - How many messages it covers.
 * @returns {object} A result in which every message has no highlights.
 */
function emptyResult(count) {
    return {
        byMessage: Array.from({ length: count }, () => NO_MESSAGE_HIGHLIGHTS),
        firstStop: new Int32Array(count + 1),
        total: 0,
        messagesWith: 0,
        counts: { byCategory: new Map(), none: 0 },
        messageCounts: { byCategory: new Map(), none: 0 },
        searchTruncated: false,
        indexByKey: new Map(),
    };
}

/**
 * Find the text a message is matched in.
 *
 * @param {object} message - A normalized message.
 * @param {{get: function(string): string}} projections - The markdown projections.
 * @returns {string} The body of a plain-text message, the projection of a markdown one.
 */
export function textOf(message, projections) {
    const body = typeof message?.body === 'string' ? message.body : '';
    if (body === '' || message.bodyFormat !== 'markdown') return body;
    return projections.get(body);
}

/**
 * Decide whether two lists of value rows are the same.
 *
 * @param {?Array<{value: string, category?: ?string}>} a - A list.
 * @param {Array<{value: string, category?: ?string}>} b - Another list.
 * @returns {boolean} True when both hold the same values with the same categories, in the same order.
 */
function sameRows(a, b) {
    if (a === null || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) {
        if (a[index].value !== b[index].value) return false;
        if ((a[index].category ?? null) !== (b[index].category ?? null)) return false;
    }
    return true;
}

/**
 * Decide whether two message lists would match the same way.
 *
 * @param {?Array<object>} a - A list.
 * @param {Array<object>} b - Another list.
 * @returns {boolean} True when every message has the same key, body and format at the same place.
 */
function sameMessages(a, b) {
    if (a === null || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index++) {
        const x = a[index];
        const y = b[index];
        if ((x.key ?? x.id) !== (y.key ?? y.id)) return false;
        if (x.body !== y.body || x.bodyFormat !== y.bodyFormat) return false;
    }
    return true;
}

/**
 * Count one message's highlights by category.
 *
 * @param {Array<{categories: string[]}>} spans - The message's highlights.
 * @returns {{byCategory: Map<string, number>, none: number}} Highlights per category name, a value in
 *     several categories counting in each, and highlights without a category.
 */
function countCategories(spans) {
    const byCategory = new Map();
    let none = 0;
    for (const span of spans) {
        if (span.categories.length === 0) none += 1;
        for (const name of span.categories) byCategory.set(name, (byCategory.get(name) ?? 0) + 1);
    }
    return { byCategory, none };
}

/**
 * Find how many of a message's highlights are drawn.
 *
 * @param {object} result - The conversation result.
 * @param {number} index - The message's index.
 * @param {boolean} renderAll - Whether every message is rendered at once.
 * @returns {number} All of them in a virtualized list, which draws only what is on screen; with every
 *     message rendered, the ones among the first {@link MAX_DRAWN_HIGHLIGHTS} of the conversation.
 */
export function drawnCount(result, index, renderAll) {
    const spans = result?.byMessage?.[index]?.spans ?? [];
    if (!renderAll) return spans.length;
    const before = result?.firstStop?.[index] ?? 0;
    return Math.min(spans.length, Math.max(0, MAX_DRAWN_HIGHLIGHTS - before));
}

/**
 * Create the highlighter for one chatbox object.
 *
 * @param {object} [options] - Options.
 * @param {number} [options.occurrenceBudget] - Occurrences collected across a conversation.
 * @param {{get: function(string): string}} [options.projections] - The markdown projections, shared
 *     with search; a cache of its own when not given.
 * @returns {{highlight: function(object): object, matchPlain: function(string): Array<object>}} The
 *     highlighter. `matchPlain` matches a text on its own, outside the conversation's counts.
 */
export function createConversationHighlighter({
    occurrenceBudget = OCCURRENCE_BUDGET,
    projections = createProjections(),
} = {}) {
    let matcher = null;
    let matchedRows = null;
    let optionsKey = '';
    let results = new Map();
    let last = null;

    /**
     * Use a matcher for these values and options, building one only when they changed.
     *
     * @param {Array<{value: string, category?: ?string}>} rows - The values.
     * @param {object} options - The matching options.
     * @returns {void}
     */
    function useMatcher(rows, options) {
        const key = `${options.caseSensitive}|${options.wholeValues}|${options.flexibleWhitespace}`;
        if (matcher !== null && key === optionsKey && sameRows(matchedRows, rows)) return;
        // The markdown projection separates blocks with NUL; a value holding one could match across.
        const usable = rows.filter((row) => !String(row.value ?? '').includes(SEPARATOR));
        matcher = createValueMatcher(usable, options);
        matchedRows = rows.map(({ value, category }) => ({ value, category: category ?? null }));
        optionsKey = key;
        results = new Map();
        last = null;
    }

    /**
     * Find the values in every message.
     *
     * @param {object} request - What to find.
     * @param {Array<object>} request.messages - The messages, in display order.
     * @param {Array<{value: string, category?: ?string}>} request.rows - The values to find, each with
     *     one of its categories or null; a value in several categories comes once per category.
     * @param {{caseSensitive: boolean, wholeValues: boolean, flexibleWhitespace: boolean}}
     *     request.options - The matching options.
     * @returns {object} `byMessage` (each message's `text`, `spans`, `byCategory`, `none` and
     *     `occurrences`), `firstStop`, `total`, `messagesWith`, `counts` and `messageCounts` (by category
     *     and without one), `searchTruncated` and `indexByKey`. The same object while nothing changed.
     */
    function highlight({ messages, rows, options }) {
        if (!Array.isArray(rows) || rows.length === 0) return emptyResult(messages.length);
        useMatcher(rows, options);
        if (last !== null && sameMessages(last.messages, messages)) return last.result;

        const result = emptyResult(messages.length);
        const kept = new Map();
        let used = 0;
        for (let index = 0; index < messages.length; index++) {
            const message = messages[index];
            result.firstStop[index] = result.total;
            result.indexByKey.set(message.key ?? message.id, index);

            const body = typeof message.body === 'string' ? message.body : '';
            let entry = NO_MESSAGE_HIGHLIGHTS;
            if (body && used >= occurrenceBudget) {
                result.searchTruncated = true;
            } else if (body) {
                const cacheKey = `${message.bodyFormat}${SEPARATOR}${body}`;
                const cached = kept.get(cacheKey) ?? results.get(cacheKey);
                // The budget counts every occurrence in display order, cached or not, so where the
                // search stops never depends on what happened to be matched before.
                if (cached !== undefined && used + cached.occurrences <= occurrenceBudget) {
                    entry = cached;
                    kept.set(cacheKey, cached);
                } else {
                    // A markdown body is projected only here, when its result is not already known.
                    const text = textOf(message, projections);
                    const found = matcher.match(prepareText(text, matcher.options), {
                        occurrenceLimit: occurrenceBudget - used,
                    });
                    entry =
                        found.matches.length === 0
                            ? NO_MESSAGE_HIGHLIGHTS
                            : {
                                  text,
                                  spans: found.matches,
                                  ...countCategories(found.matches),
                                  occurrences: found.occurrences,
                              };
                    // A search cut short is not the message's answer: it is not kept.
                    if (found.truncated) result.searchTruncated = true;
                    else kept.set(cacheKey, entry);
                }
                used += entry.occurrences;
            }

            result.byMessage[index] = entry;
            if (entry.spans.length === 0) continue;
            result.total += entry.spans.length;
            result.messagesWith += 1;
            for (const [name, count] of entry.byCategory) {
                const { byCategory } = result.counts;
                byCategory.set(name, (byCategory.get(name) ?? 0) + count);
                const perMessage = result.messageCounts.byCategory;
                perMessage.set(name, (perMessage.get(name) ?? 0) + 1);
            }
            if (entry.none > 0) {
                result.counts.none += entry.none;
                result.messageCounts.none += 1;
            }
        }
        result.firstStop[messages.length] = result.total;

        // Only this conversation's results are kept, so the cache never outgrows it.
        results = kept;
        last = { messages, result };
        return result;
    }

    /**
     * Find the values in one text, outside the conversation: the source of a markdown message.
     *
     * @param {string} text - The text.
     * @returns {Array<object>} The highlights, in text order; none before the first `highlight` call.
     */
    function matchPlain(text) {
        if (matcher === null || typeof text !== 'string' || text === '') return [];
        return matcher.match(prepareText(text, matcher.options)).matches;
    }

    return { highlight, matchPlain };
}
