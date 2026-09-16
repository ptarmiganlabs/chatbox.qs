/**
 * Conversations side by side: which conversations get a lane, and the order everything is shown in.
 *
 * Each value of the Conversation / thread dimension is a conversation. With lanes on, the ones with the
 * latest activity get a lane each, most recent on the left, as many as the setting allows and the
 * object's width fits.
 *
 * Everything is worked out once, as a board, and the rest of the object works on the board's order of
 * messages: highlights, search matches, stepping and copying all count messages by their index in it, so
 * none of them needs to know about lanes.
 *
 * - **Free** scrolling: the lanes' messages one lane after another, so each lane is one stretch of the
 *   board, shown in a list of its own.
 * - **Linked** scrolling: the shown messages in display order, packed into rows. A message starts a new
 *   row when its lane already has one in the row, or when a new day starts, so rows are stretches of the
 *   board too, everything in a row is later than everything above it, and a row never crosses a day.
 *
 * Pure: no DOM, no engine. The settings have one definition, as `src/highlight/settings.js` does for
 * highlighting, used by the object properties, the panel's defaults and the render code.
 */
import { buildDayGroups, dayLabel, dayStarts } from './grouping';

/** The most conversations side by side. Also keeps a row's lanes within a bitmask. */
export const LANE_MAX = 10;

/** The narrowest a lane is laid out; a narrower object shows fewer lanes. */
export const MIN_LANE_WIDTH_PX = 220;

/** Every lane setting and its default, as stored under `chatbox.lanes`. */
export const LANE_DEFAULTS = Object.freeze({
    show: false,
    max: 4,
    scroll: 'linked',
});

/** The label of the lane for messages that belong to no conversation. */
export const NO_CONVERSATION_LABEL = '(no conversation)';

/** Labels for the engine's synthetic rows, by element number. */
const SYNTHETIC_LABELS = Object.freeze({
    [-1]: 'Total',
    [-2]: NO_CONVERSATION_LABEL,
    [-3]: 'Others',
    [-4]: '(empty)',
});

/**
 * Make a plain, mutable copy of the defaults, for object properties the engine will store.
 *
 * @returns {{show: boolean, max: number, scroll: string}} A copy of {@link LANE_DEFAULTS}.
 */
export function lanesBag() {
    return { ...LANE_DEFAULTS };
}

/**
 * Bring a lane count within what can be shown.
 *
 * @param {*} value - The stored or typed count.
 * @returns {number} A whole number from 1 to {@link LANE_MAX}; the default when the value is not a number.
 */
export function clampLaneMax(value) {
    const blank = value === null || (typeof value === 'string' && value.trim() === '');
    const count = blank ? NaN : Number(value);
    if (!Number.isFinite(count)) return LANE_DEFAULTS.max;
    return Math.min(LANE_MAX, Math.max(1, Math.round(count)));
}

/**
 * Read the lane settings, falling back to the defaults for anything missing or invalid.
 *
 * @param {object} [bag] - The `chatbox.lanes` bag of a layout or of the object properties.
 * @returns {{show: boolean, max: number, scroll: string}} The settings.
 */
export function readLaneSettings(bag) {
    return {
        show: bag?.show === true,
        max: clampLaneMax(bag?.max),
        scroll: bag?.scroll === 'free' ? 'free' : 'linked',
    };
}

/**
 * Tell a message's conversation apart from every other.
 *
 * A thread value is keyed by its text, which stays the same across selections even for a calculated
 * dimension; a null, Others or Total row by its element number, so a thread really called "Others", or
 * a real empty value, is never taken for one of them.
 *
 * @param {object} message - A normalized message.
 * @returns {string} The lane key.
 */
export function laneKeyOf(message) {
    const elem = threadElemOf(message);
    return elem >= 0 ? `v:${message.threadId ?? ''}` : `n:${elem}`;
}

/**
 * Name a message's conversation.
 *
 * @param {object} message - A normalized message.
 * @returns {string} The thread value, or a label for a message without one.
 */
export function laneLabelOf(message) {
    const elem = threadElemOf(message);
    if (elem >= 0) return message.threadId ?? '(empty)';
    return message.threadId ?? SYNTHETIC_LABELS[elem] ?? NO_CONVERSATION_LABEL;
}

/**
 * Read a message's thread element number, for a message built by hand without one.
 *
 * @param {object} message - A normalized message.
 * @returns {number} The element number; -2, as for null, when there is neither a number nor a thread.
 */
function threadElemOf(message) {
    if (typeof message?.threadElem === 'number') return message.threadElem;
    return message?.threadId === null || message?.threadId === undefined ? -2 : 0;
}

/**
 * Rank every conversation by its latest activity.
 *
 * One key throughout, so the order is the same whichever way the messages are shown: conversations
 * with a timestamp first, latest timestamp first; then the latest place in the cube, which is the order
 * the engine sorts the messages in and does not change with Newest first; then the key.
 *
 * @param {Array<object>} messages - The messages, in display order.
 * @returns {Array<{key: string, label: string, elem: number, count: number}>} One entry per conversation,
 *     most recent first.
 */
export function rankLanes(messages) {
    const lanes = new Map();
    (messages ?? []).forEach((message, index) => {
        const key = laneKeyOf(message);
        let lane = lanes.get(key);
        if (!lane) {
            lane = {
                key,
                label: laneLabelOf(message),
                elem: threadElemOf(message),
                count: 0,
                latestTs: null,
                latestRow: -1,
            };
            lanes.set(key, lane);
        }
        lane.count += 1;
        if (Number.isFinite(message.ts) && (lane.latestTs === null || message.ts > lane.latestTs)) {
            lane.latestTs = message.ts;
        }
        const row = Number.isInteger(message.rowIdx) ? message.rowIdx : index;
        if (row > lane.latestRow) lane.latestRow = row;
    });
    return [...lanes.values()]
        .sort((a, b) => {
            if ((a.latestTs === null) !== (b.latestTs === null))
                return a.latestTs === null ? 1 : -1;
            if (a.latestTs !== b.latestTs) return b.latestTs - a.latestTs;
            if (a.latestRow !== b.latestRow) return b.latestRow - a.latestRow;
            return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
        })
        .map(({ key, label, elem, count }) => ({ key, label, elem, count }));
}

/**
 * Work out how many lanes fit.
 *
 * @param {number} width - The object's width in pixels; 0 before it is measured.
 * @param {number} max - The most lanes the setting allows.
 * @returns {number} From 1 to `max`; `max` before the width is known.
 */
export function fitLaneCount(width, max) {
    if (!(width > 0)) return max;
    return Math.min(max, Math.max(1, Math.floor(width / MIN_LANE_WIDTH_PX)));
}

/**
 * Pack messages into rows that line lanes up in time.
 *
 * @param {Int32Array} laneOf - Each message's lane, in display order.
 * @param {Uint8Array} starts - 1 where a day starts, from `dayStarts`.
 * @returns {{count: number, start: Int32Array, of: Int32Array}} How many rows, the first message of each
 *     (with the message count after the last row), and each message's row.
 */
export function packRows(laneOf, starts) {
    const count = laneOf.length;
    const of = new Int32Array(count);
    const firsts = [];
    let taken = 0;
    for (let index = 0; index < count; index++) {
        const bit = 1 << laneOf[index];
        if (index === 0 || (taken & bit) !== 0 || starts[index] === 1) {
            firsts.push(index);
            taken = 0;
        }
        taken |= bit;
        of[index] = firsts.length - 1;
    }
    const start = new Int32Array(firsts.length + 1);
    firsts.forEach((first, row) => {
        start[row] = first;
    });
    start[firsts.length] = count;
    return { count: firsts.length, start, of };
}

/**
 * Build the board: the lanes shown, and every message of theirs in the order the object shows them.
 *
 * @param {Array<object>} messages - The conversation's messages, in display order.
 * @param {object} options - How to lay them out.
 * @param {number} options.max - The most lanes.
 * @param {string} options.scroll - 'linked' or 'free'.
 * @param {number} [options.width] - The object's width, to fit the lanes to.
 * @param {?Array<string>} [options.keys] - The lanes to show, in order, as a snapshot recorded them; in
 *     place of ranking and fitting.
 * @returns {object} `scroll`, `total` (conversations), `lanes` (each with `key`, `label`, `elem`, `count`,
 *     `start` — its first board index in free scrolling, -1 in linked —, `indices` and `messages`),
 *     `messages` in board order, `laneOf`, `posInLane`, `prevInLane` (-1 at a lane's first message) and,
 *     for linked scrolling, `rows`.
 */
export function buildBoard(messages, { max, scroll, width = 0, keys = null }) {
    const list = Array.isArray(messages) ? messages : [];
    const ranked = rankLanes(list);
    let chosen = [];
    if (Array.isArray(keys) && keys.length > 0) {
        const byKey = new Map(ranked.map((lane) => [lane.key, lane]));
        chosen = keys.map((key) => byKey.get(key)).filter(Boolean);
    }
    if (chosen.length === 0) chosen = ranked.slice(0, fitLaneCount(width, clampLaneMax(max)));

    const laneIndex = new Map(chosen.map((lane, index) => [lane.key, index]));
    const members = chosen.map(() => []);
    const shownInOrder = [];
    list.forEach((message, index) => {
        const lane = laneIndex.get(laneKeyOf(message));
        if (lane === undefined) return;
        members[lane].push(index);
        shownInOrder.push(index);
    });

    const linked = scroll !== 'free';
    const order = linked ? shownInOrder : members.flat();
    const count = order.length;
    const boardMessages = order.map((index) => list[index]);
    const boardIndexOf = new Map(order.map((index, board) => [index, board]));
    const laneOf = new Int32Array(count);
    const posInLane = new Int32Array(count);
    const prevInLane = new Int32Array(count);

    const lanes = chosen.map((lane, laneNumber) => {
        const indices = Int32Array.from(members[laneNumber], (index) => boardIndexOf.get(index));
        indices.forEach((board, position) => {
            laneOf[board] = laneNumber;
            posInLane[board] = position;
            prevInLane[board] = position > 0 ? indices[position - 1] : -1;
        });
        return {
            ...lane,
            start: linked || indices.length === 0 ? -1 : indices[0],
            indices,
            messages: members[laneNumber].map((index) => list[index]),
        };
    });

    return {
        scroll: linked ? 'linked' : 'free',
        total: ranked.length,
        lanes,
        messages: boardMessages,
        laneOf,
        posInLane,
        prevInLane,
        rows: linked ? packRows(laneOf, dayStarts(boardMessages)) : null,
    };
}

/**
 * Build the board for a render, when lanes are on and there are conversations to put in them.
 *
 * @param {object} request - What to lay out.
 * @param {Array<object>} request.messages - The conversation's messages, in display order.
 * @param {{show: boolean, max: number, scroll: string}} request.settings - From `readLaneSettings`.
 * @param {boolean} request.hasThread - Whether a Conversation / thread dimension resolves.
 * @param {number} [request.width] - The object's width.
 * @param {?Array<string>} [request.keys] - The lanes a snapshot recorded.
 * @returns {?object} The board from {@link buildBoard}; null with lanes off, no thread dimension or no
 *     messages.
 */
export function laneBoardFor({ messages, settings, hasThread, width = 0, keys = null }) {
    if (!settings?.show || !hasThread || !messages?.length) return null;
    return buildBoard(messages, { max: settings.max, scroll: settings.scroll, width, keys });
}

/**
 * Group a linked board's rows by day, for sticky day headers over rows.
 *
 * @param {Array<object>} messages - The board's messages.
 * @param {{count: number, start: Int32Array}} rows - The board's rows.
 * @param {number} [now] - Reference time for relative labels.
 * @returns {?{groupCounts: number[], labels: string[]}} Rows per day, which add up to the row count; null
 *     when nothing can be dated.
 */
export function rowDayGroups(messages, rows, now = Date.now()) {
    if (!rows || !buildDayGroups(messages, now)) return null;
    const starts = dayStarts(messages);
    const groupCounts = [];
    const labels = [];
    for (let row = 0; row < rows.count; row++) {
        const first = rows.start[row];
        if (groupCounts.length === 0 || starts[first] === 1) {
            groupCounts.push(0);
            const ts = messages[first].ts;
            labels.push(typeof ts === 'number' ? dayLabel(ts, now) : '');
        }
        groupCounts[groupCounts.length - 1] += 1;
    }
    return { groupCounts, labels };
}

/**
 * Find a message within its lane, for what is worked out over one conversation: a KPI's sparkline.
 *
 * @param {?object} board - The board, or null without lanes.
 * @param {Array<object>} messages - The messages shown, in board order.
 * @param {number} index - The message's board index.
 * @returns {{messages: Array<object>, index: number}} Its lane's messages and its place among them; the
 *     messages shown and the index itself without a board.
 */
export function lanePlace(board, messages, index) {
    if (!board || index < 0 || index >= board.laneOf.length) return { messages, index };
    return { messages: board.lanes[board.laneOf[index]].messages, index: board.posInLane[index] };
}

/**
 * List the keys of the lanes a board shows, for a snapshot to show the same ones.
 *
 * @param {?object} board - The board.
 * @returns {?Array<string>} The keys in lane order, or null without a board.
 */
export function laneKeys(board) {
    return board ? board.lanes.map((lane) => lane.key) : null;
}
