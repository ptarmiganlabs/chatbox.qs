/**
 * Reading the rows of a conversation's cube: which rows, up to Maximum messages.
 *
 * Newest first and conversations side by side read the last rows of the cube (see
 * src/chat/message-limit.js). Null message ids sort last whatever the sort, so the last rows are where
 * the phantom rows are — the values of a linked table that have no message (GOTCHAS 13). Read, they
 * would take the places of the newest messages, and when there are as many as the limit, of every
 * message. So when the cube has more rows than the limit, the phantom rows at its end are left out, and
 * the rows kept end just before them. They are counted among the last rows read; only when every one of
 * those is a phantom are they found by a scan of their own, before reading again.
 *
 * The rows of a cube within the limit are all read, phantoms and all: they take no message's place, and
 * finding them would cost a call.
 */
import { readsFromEnd } from '../chat/message-limit';
import { phantomRowTest } from '../chat/normalize';
import { readRowSnapshot } from '../ui/snapshot';
import { countTrailingRows, fetchAllRows, heldRows } from './paging';

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
 *   at the end of the cube were left out of the rows, for normalize.
 */
export async function readConversationRows({ model, layout, settings, isStale, onProgress }) {
    const maxRows = Number(settings?.maxMessages) || DEFAULT_MAX_MESSAGES;
    const fromEnd = readsFromEnd(settings);
    const rowCount = layout?.qHyperCube?.qSize?.qcy ?? 0;
    const phantom =
        fromEnd && rowCount > Math.floor(maxRows) ? phantomRowTest(layout, settings) : null;
    if (!phantom) {
        const result = await fetchAllRows({ model, layout, maxRows, fromEnd, isStale, onProgress });
        return { ...result, phantomTail: 0 };
    }

    // The last rows are read first, as if none were phantoms, and the phantom rows are counted among
    // them: a separate scan before reading was a round trip of its own, and on a sheet where objects
    // share the connection it queued behind their pages (GOTCHAS 61). Most cubes end in no phantom row
    // or in a few, and then the rows read are the rows wanted, or all but a few that one small call
    // before them brings.
    const read = await fetchAllRows({ model, layout, maxRows, fromEnd: true, isStale, onProgress });
    let tail = 0;
    while (
        tail < read.rows.length &&
        phantom.matches(
            phantom.columns.map((column) => read.rows[read.rows.length - 1 - tail][column])
        )
    ) {
        tail += 1;
    }
    if (tail === 0) return { ...read, phantomTail: 0 };
    if (tail < read.rows.length) {
        // The phantom rows end inside the rows read, so `tail` is all of them: the rows wanted end just
        // before them, and the ones the phantoms took the place of come before the rows read.
        const before = await fetchAllRows({
            model,
            layout,
            maxRows: tail,
            fromEnd: true,
            skipLast: rowCount - read.area.qTop,
            isStale,
        });
        const rows = [...before.rows, ...read.rows.slice(0, read.rows.length - tail)];
        return {
            rows,
            area: { ...read.area, qTop: before.area.qTop, qHeight: rows.length },
            total: read.total,
            truncated: read.total > rows.length,
            phantomTail: tail,
        };
    }

    // Every row read was a phantom: where they start is further back, and is found by the scan.
    const phantomTail = await countTrailingRows({
        model,
        layout,
        columns: phantom.columns,
        matches: phantom.matches,
        isStale,
    });
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

/**
 * Read the rows a snapshot shows, without the engine.
 *
 * An image or PDF export draws the object again from a snapshot of its layout, with a model that
 * has no data calls (GOTCHAS 29): paging it fails with "getHyperCubeData is not a function", and
 * that error was all an export showed. The rows shown travel in the snapshot instead; one taken
 * before they did shows the rows its layout happens to hold.
 *
 * @param {object} options - Inputs.
 * @param {object} options.layout - The snapshot layout.
 * @param {object} [options.settings] - The `chatbox` property bag.
 * @returns {object} What {@link readConversationRows} returns.
 */
export function readSnapshotRows({ layout, settings }) {
    const captured = readRowSnapshot(layout);
    if (captured) return captured;
    const maxRows = Number(settings?.maxMessages) || DEFAULT_MAX_MESSAGES;
    return { ...heldRows({ layout, maxRows }), phantomTail: 0 };
}

export default readConversationRows;
