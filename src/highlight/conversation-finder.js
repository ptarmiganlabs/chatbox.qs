/**
 * Finding what was typed in the search box, in the conversation shown.
 *
 * What is searched is what the reader sees: each message's body, in the text it renders, and the names
 * in its header line — the author and the recipients as shown — where the header line is shown at all.
 * Consecutive messages from one sender show the header once, and a long recipient list shows three
 * names and "and N more", so a name hidden there is not found; the message's details list everyone.
 * Kind chips are labels on a message, not its text, and are not searched.
 *
 * Search matches like textview.qs's find box: case is ignored, any run of whitespace in the query
 * matches any run in the text, a match may sit inside a longer word, and every character is literal.
 * The highlight switches do not apply. Matches do not overlap, and one budget covers the conversation.
 *
 * Stops go message by message, and within a message author, recipients, body. Like the highlighter,
 * each message's matches are counted before it, so a stop anywhere is one number; and a search with the
 * same query over the same messages answers the very same result, so a resize finds nothing again.
 *
 * It builds no DOM.
 */
import { formatRecipients } from '../chat/recipients';
import { startsCluster } from '../chat/grouping';
import { findText, prepareText } from '../match/index';
import { createProjections } from './markdown-projection';

/** How the search box matches: plain text, ignoring case, flexible about whitespace. */
export const FIND_OPTIONS = Object.freeze({
    caseSensitive: false,
    wholeValues: false,
    flexibleWhitespace: true,
});

/** Matches collected across a conversation before the search stops and says so. */
export const MATCH_BUDGET = 1_000_000;

/** The parts of a message searched, in stop order. */
export const PARTS = Object.freeze(['author', 'recipients', 'body']);

/** A message without matches. Shared: never change it. */
export const NO_MESSAGE_FINDS = Object.freeze({
    author: Object.freeze([]),
    recipients: Object.freeze([]),
    body: Object.freeze([]),
    text: '',
    count: 0,
});

/**
 * Work out what of a message is searched.
 *
 * @param {object} message - The message.
 * @param {boolean} headerShown - Whether its header line is shown.
 * @param {{get: function(string): string}} projections - The markdown projections.
 * @returns {{author: string, recipients: string, body: string}} The texts searched; '' for a part
 *     that is not shown.
 */
function searchedTexts(message, headerShown, projections) {
    const body = typeof message.body === 'string' ? message.body : '';
    return {
        author: headerShown ? String(message.author?.label ?? '') : '',
        recipients:
            headerShown && message.recipients?.length
                ? formatRecipients(message.recipients, { partial: message.recipientsPartial })
                : '',
        body: body !== '' && message.bodyFormat === 'markdown' ? projections.get(body) : body,
    };
}

/**
 * Find which part a stop in a message belongs to.
 *
 * @param {object} entry - The message's matches.
 * @param {number} ordinal - The stop's ordinal in the message.
 * @returns {?{part: string, ordinal: number}} The part, and the stop's ordinal within it.
 */
export function partOf(entry, ordinal) {
    let rest = ordinal;
    for (const part of PARTS) {
        const count = entry?.[part]?.length ?? 0;
        if (rest < count) return { part, ordinal: rest };
        rest -= count;
    }
    return null;
}

/**
 * Create the finder for one chatbox object.
 *
 * @param {object} [options] - Options.
 * @param {{get: function(string): string}} [options.projections] - The markdown projections, shared
 *     with highlighting; a cache of its own when not given.
 * @param {number} [options.budget] - Matches collected across a conversation.
 * @returns {{find: function(object): ?object, findPlain: function(string, string): Array<object>}} The
 *     finder. `findPlain` searches one text on its own: the source of a markdown message's quote.
 */
export function createConversationFinder({
    projections = createProjections(),
    budget = MATCH_BUDGET,
} = {}) {
    let prepared = new Map();
    let last = null;

    /**
     * Get a text prepared for searching, prepared once while it keeps being searched.
     *
     * @param {string} text - The text.
     * @param {Map<string, object>} kept - The preparations this search keeps.
     * @returns {object} The prepared text.
     */
    function prepare(text, kept) {
        let entry = kept.get(text) ?? prepared.get(text);
        if (entry === undefined) entry = prepareText(text, FIND_OPTIONS);
        kept.set(text, entry);
        return entry;
    }

    /**
     * Search the conversation.
     *
     * @param {object} request - What to search.
     * @param {Array<object>} request.messages - The messages, in display order.
     * @param {string} request.query - What was typed.
     * @param {number} request.gapSec - How far apart one sender's messages still share a header line.
     * @returns {?object} `byMessage` (each message's `author`, `recipients` and `body` matches, the
     *     body's searched `text`, and their `count`), `firstStop`, `total`, `messagesWith`, `truncated`
     *     and `indexByKey`; null for a query with nothing to search for. The same object while the
     *     query and what is searched are unchanged.
     */
    function find({ messages, query, gapSec }) {
        if (typeof query !== 'string' || query.trim() === '') return null;

        // What is searched, message by message. Compared as text, since every render builds new
        // message objects for the same conversation.
        const keys = messages.map((message) => message.key ?? message.id);
        const texts = messages.map((message, index) =>
            searchedTexts(
                message,
                startsCluster(message, index > 0 ? messages[index - 1] : null, gapSec),
                projections
            )
        );
        if (
            last !== null &&
            last.query === query &&
            last.keys.length === keys.length &&
            keys.every((key, index) => {
                const before = last.texts[index];
                const now = texts[index];
                return (
                    key === last.keys[index] &&
                    now.body === before.body &&
                    now.author === before.author &&
                    now.recipients === before.recipients
                );
            })
        ) {
            return last.result;
        }

        const kept = new Map();
        const result = {
            byMessage: new Array(messages.length),
            firstStop: new Int32Array(messages.length + 1),
            total: 0,
            messagesWith: 0,
            truncated: false,
            indexByKey: new Map(),
        };
        for (let index = 0; index < messages.length; index++) {
            result.firstStop[index] = result.total;
            result.indexByKey.set(keys[index], index);
            const searched = texts[index];
            const entry = { author: [], recipients: [], body: [], text: searched.body, count: 0 };
            for (const part of PARTS) {
                if (searched[part] === '' || result.truncated) continue;
                const found = findText(prepare(searched[part], kept), query, {
                    occurrenceLimit: budget - result.total - entry.count,
                });
                entry[part] = found.matches;
                entry.count += found.matches.length;
                if (found.truncated) result.truncated = true;
            }
            result.byMessage[index] = entry.count === 0 ? NO_MESSAGE_FINDS : entry;
            result.total += entry.count;
            if (entry.count > 0) result.messagesWith += 1;
        }
        result.firstStop[messages.length] = result.total;

        // Only this conversation's preparations are kept, so the cache never outgrows it.
        prepared = kept;
        last = { query, keys, texts, result };
        return result;
    }

    /**
     * Search one text on its own.
     *
     * @param {string} text - The text.
     * @param {string} query - What was typed.
     * @returns {Array<object>} The matches, in text order.
     */
    function findPlain(text, query) {
        if (typeof text !== 'string' || text === '' || typeof query !== 'string') return [];
        if (query.trim() === '') return [];
        return findText(prepareText(text, FIND_OPTIONS), query).matches;
    }

    return { find, findPlain };
}
