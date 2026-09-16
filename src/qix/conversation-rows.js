/**
 * Reading the rows of a conversation's cube: which rows, up to Maximum messages.
 *
 * Newest first and conversations side by side read the last rows of the cube (see
 * src/chat/message-limit.js). Null message ids sort last whatever the sort, so the last rows are where
 * the phantom rows are — the values of a linked table that have no message (GOTCHAS 13). Read, they
 * would take the places of the newest messages, and when there are as many as the limit, of every
 * message. So when the cube has more rows than the limit, the phantom rows at its end are found first
 * and left out, and the rows read end just before them.
 *
 * The rows of a cube within the limit are all read, phantoms and all: they take no message's place, and
 * finding them would cost a call.
 */
import { readsFromEnd } from '../chat/message-limit';
import { phantomRowTest } from '../chat/normalize';
import { countTrailingRows, fetchAllRows } from './paging';

/** Maximum messages when the setting holds no usable number. */
export const DEFAULT_MAX_MESSAGES = 5000;

/**
 * Read the rows a conversation shows.
 *
 * @param {object} options - Inputs.
 * @param {object} options.model - The enigma GenericObject model.
 * @param {object} options.layout - The layout to page against (use useStaleLayout).
 * @param {object} [options.settings] - The `chatbox` property bag.
 * @param {Function} [options.isStale] - Returns true when this run is superseded.
 * @param {Function} [options.onProgress] - Called with (loaded, total) per page.
 * @returns {Promise<object>} What {@link fetchAllRows} returns, and `phantomTail`: how many phantom rows
 *   at the end of the cube were left out without being read, for normalize.
 */
export async function readConversationRows({ model, layout, settings, isStale, onProgress }) {
    const maxRows = Number(settings?.maxMessages) || DEFAULT_MAX_MESSAGES;
    const fromEnd = readsFromEnd(settings);
    const rowCount = layout?.qHyperCube?.qSize?.qcy ?? 0;
    const phantom =
        fromEnd && rowCount > Math.floor(maxRows) ? phantomRowTest(layout, settings) : null;
    const phantomTail = phantom
        ? await countTrailingRows({
              model,
              layout,
              columns: phantom.columns,
              matches: phantom.matches,
              isStale,
          })
        : 0;
    const result = await fetchAllRows({
        model,
        layout,
        maxRows,
        fromEnd,
        skipLast: phantomTail,
        isStale,
        onProgress,
    });
    return { ...result, phantomTail };
}

export default readConversationRows;
