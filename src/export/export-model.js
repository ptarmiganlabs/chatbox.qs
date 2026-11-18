/**
 * What an exported conversation holds, worked out once for every format.
 *
 * An export is drawn for reading, and for a slide, rather than copied from the screen: every message the
 * object holds, not the ones scrolled into view, laid out as a table. A column per conversation, so
 * conversations side by side line up in time as linked lanes do on screen, and a row per line of
 * messages, so a page or an image is only ever cut between rows. The PDF, the PNG and the HTML file are
 * all drawn from this one model (`ExportDocument.jsx`).
 *
 * Pure: it reads the view the object last rendered with, and touches no DOM.
 */
import { dayKey, dayStarts, localWallClock, startsCluster, wallClockOf } from '../chat/grouping';
import { laneKeyOf, laneLabelOf } from '../chat/lanes';
import { HIGHLIGHT_KINDS } from '../qix/highlight-source';
import { legendEntries } from '../highlight/legend';
import { counted, formatCount } from '../util/format';

/** The formats an export can be written in. */
export const EXPORT_FORMATS = Object.freeze(['pdf', 'png', 'html']);

/** The shapes a PNG export can take: images sized for a 16:9 slide, or one tall image. */
export const PNG_SHAPES = Object.freeze(['slides', 'tall']);

/** The names a title lists before it says how many more there are. */
export const NAMES_LISTED = 4;

/** The gap that starts a new cluster of one author's messages when the setting holds none. */
const DEFAULT_GAP_SEC = 120;

/**
 * A formatter that writes a wall-clock time's date.
 *
 * Wall-clock milliseconds hold their date as UTC, so every formatter here names UTC as its zone.
 *
 * @param {object} options - Intl.DateTimeFormat options, without the zone.
 * @returns {?Intl.DateTimeFormat} The formatter, or null where the runtime has none.
 */
function utcFormatter(options) {
    try {
        return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });
    } catch {
        return null;
    }
}

const DAY_HEADING = utcFormatter({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});
const SPAN_DATE = utcFormatter({ day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Write the day a day separator names.
 *
 * Always the date itself: an export is read later, when Today and Yesterday no longer are.
 *
 * @param {number} wallClock - Wall-clock milliseconds, as `wallClockOf` gives them.
 * @returns {string} For example "Tuesday, 8 September 2026"; the YYYY-MM-DD key without a formatter.
 */
export function dayHeading(wallClock) {
    try {
        return DAY_HEADING ? DAY_HEADING.format(new Date(wallClock)) : dayKey(wallClock);
    } catch {
        return dayKey(wallClock);
    }
}

/**
 * Write the days a conversation covers.
 *
 * @param {Array<object>} messages - The messages exported.
 * @returns {?string} For example "8 September 2026" or "8–12 September 2026"; null when none is dated.
 */
export function dateSpanText(messages) {
    let first = null;
    let last = null;
    for (const message of messages) {
        const wallClock = wallClockOf(message);
        if (wallClock === null) continue;
        if (first === null || wallClock < first) first = wallClock;
        if (last === null || wallClock > last) last = wallClock;
    }
    if (first === null) return null;
    if (dayKey(first) === dayKey(last)) return formatDay(first);
    try {
        if (SPAN_DATE && typeof SPAN_DATE.formatRange === 'function') {
            return SPAN_DATE.formatRange(new Date(first), new Date(last));
        }
    } catch {
        // A runtime without formatRange writes the two days apart.
    }
    return `${formatDay(first)} – ${formatDay(last)}`;
}

/**
 * Write one day of a span.
 *
 * @param {number} wallClock - Wall-clock milliseconds.
 * @returns {string} For example "8 September 2026".
 */
function formatDay(wallClock) {
    try {
        return SPAN_DATE ? SPAN_DATE.format(new Date(wallClock)) : dayKey(wallClock);
    } catch {
        return dayKey(wallClock);
    }
}

/**
 * Write when the export was made, for its footer.
 *
 * @param {number} now - Epoch milliseconds.
 * @returns {string} For example "Exported 18 November 2026", by the reader's own clock.
 */
export function exportedOnText(now) {
    return `Exported ${formatDay(localWallClock(now))}`;
}

/**
 * List the people in the messages exported, in the order they first appear.
 *
 * @param {Array<object>} messages - The messages exported.
 * @returns {Array<string>} Each author and recipient once, by name.
 */
export function participantNames(messages) {
    const names = [];
    const seen = new Set();
    /**
     * Add one person.
     *
     * @param {*} label - Their name.
     * @returns {void}
     */
    const add = (label) => {
        if (typeof label !== 'string' || label === '' || seen.has(label)) return;
        seen.add(label);
        names.push(label);
    };
    for (const message of messages) {
        add(message.author?.label);
        for (const recipient of message.recipients ?? []) add(recipient?.label);
    }
    return names;
}

/**
 * Write the people as a title line lists them.
 *
 * @param {Array<string>} names - Everyone, from {@link participantNames}.
 * @param {number} [max] - The most names to list.
 * @returns {?string} For example "Ada, Bob and Cy", or "Ada, Bob, Cy, Dee and 3 others"; null for nobody.
 */
export function namesText(names, max = NAMES_LISTED) {
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    if (names.length <= max + 1) {
        return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    }
    const rest = names.length - max;
    return `${names.slice(0, max).join(', ')} and ${counted(rest, 'other', 'others')}`;
}

/**
 * Say what the message limit left out, in words that fit a document rather than a screen.
 *
 * @param {?object} meta - The conversation's `meta`, from `normalize`.
 * @param {number} messageCount - How many messages the object holds.
 * @returns {?string} The note; null when nothing was left out.
 */
export function truncationNote(meta, messageCount) {
    if (!meta?.truncated) return null;
    if (!Number.isFinite(meta.rowsLoaded) || !Number.isFinite(meta.total)) {
        return 'Some messages are not included: the object reads at most Maximum messages.';
    }
    const unit = meta.rowsLoaded === messageCount ? ['message', 'messages'] : ['row', 'rows'];
    const read = `${formatCount(meta.rowsLoaded)} of ${counted(meta.total, ...unit)}`;
    if (meta.truncatedTo === 'newest')
        return `Older messages are not included: only the newest ${read} were read.`;
    if (meta.truncatedTo === 'oldest')
        return `Newer messages are not included: only the oldest ${read} were read.`;
    return `Some messages are not included: ${read} were read.`;
}

/**
 * Name the conversation of a whole export without lanes.
 *
 * @param {Array<object>} messages - The messages.
 * @param {string} title - The object's title.
 * @returns {string} The thread's name when every message has the same one; the object's title otherwise.
 */
function singleHeading(messages, title) {
    const first = messages[0];
    const oneThread =
        first &&
        first.threadId !== null &&
        first.threadId !== undefined &&
        messages.every((message) => laneKeyOf(message) === laneKeyOf(first));
    if (oneThread) return laneLabelOf(first);
    return title || 'Conversation';
}

/**
 * Lay out one column of messages: a day row where a day starts, and a row per message.
 *
 * @param {Array<object>} messages - Every message of the view, by index.
 * @param {Array<number>} indices - The indices of the column's messages, in order.
 * @param {object} options - How.
 * @param {number} options.gapSec - The gap that starts a new cluster.
 * @param {boolean} options.days - Whether days are separated.
 * @returns {Array<object>} The rows.
 */
function columnRows(messages, indices, { gapSec, days }) {
    const column = indices.map((index) => messages[index]);
    const starts = days ? dayStarts(column) : new Uint8Array(column.length);
    const rows = [];
    indices.forEach((index, position) => {
        const message = messages[index];
        if (starts[position]) {
            const wallClock = wallClockOf(message);
            if (wallClock !== null) {
                rows.push({ kind: 'day', key: `d${index}`, label: dayHeading(wallClock) });
            }
        }
        const previous = position > 0 ? column[position - 1] : null;
        rows.push({
            kind: 'messages',
            key: `m${index}`,
            cells: [
                { message, index, showAuthor: startsCluster(message, previous, gapSec), day: null },
            ],
        });
    });
    return rows;
}

/**
 * Lay out conversations side by side and lined up in time, as linked lanes are.
 *
 * @param {object} board - The board, from `buildBoard`, with `rows`.
 * @param {object} options - How.
 * @param {number} options.gapSec - The gap that starts a new cluster.
 * @param {boolean} options.days - Whether days are separated.
 * @returns {Array<object>} The rows.
 */
function linkedRows(board, { gapSec, days }) {
    const { rows, laneOf, prevInLane, messages, lanes, dayStarts: starts } = board;
    const out = [];
    for (let row = 0; row < rows.count; row++) {
        const first = rows.start[row];
        if (days && starts?.[first]) {
            const wallClock = wallClockOf(messages[first]);
            if (wallClock !== null)
                out.push({ kind: 'day', key: `d${first}`, label: dayHeading(wallClock) });
        }
        const cells = new Array(lanes.length).fill(null);
        for (let index = first; index < rows.start[row + 1]; index++) {
            const message = messages[index];
            const previous = prevInLane[index] >= 0 ? messages[prevInLane[index]] : null;
            cells[laneOf[index]] = {
                message,
                index,
                showAuthor: startsCluster(message, previous, gapSec),
                day: null,
            };
        }
        out.push({ kind: 'messages', key: `r${row}`, cells });
    }
    return out;
}

/**
 * Lay out conversations side by side, each packed on its own, as free lanes are.
 *
 * Row N holds each conversation's Nth message, and a day starts inside a column rather than across them.
 *
 * @param {object} board - The board, from `buildBoard`.
 * @param {object} options - How.
 * @param {number} options.gapSec - The gap that starts a new cluster.
 * @param {boolean} options.days - Whether days are separated.
 * @returns {Array<object>} The rows.
 */
function freeRows(board, { gapSec, days }) {
    const { lanes, messages } = board;
    const depth = Math.max(0, ...lanes.map((lane) => lane.indices.length));
    const out = [];
    for (let position = 0; position < depth; position++) {
        const cells = lanes.map((lane) => {
            if (position >= lane.indices.length) return null;
            const index = lane.indices[position];
            const message = messages[index];
            const previous = position > 0 ? messages[lane.indices[position - 1]] : null;
            const wallClock = wallClockOf(message);
            const previousClock = previous ? wallClockOf(previous) : null;
            const newDay =
                days &&
                wallClock !== null &&
                (previousClock === null || dayKey(previousClock) !== dayKey(wallClock));
            return {
                message,
                index,
                showAuthor: startsCluster(message, previous, gapSec),
                day: newDay ? dayHeading(wallClock) : null,
            };
        });
        out.push({ kind: 'messages', key: `p${position}`, cells });
    }
    return out;
}

/**
 * Find the lane a right-click landed in.
 *
 * @param {?object} board - The board shown, or null.
 * @param {?EventTarget} target - What was right-clicked.
 * @returns {?number} The lane's index, or null when the click was not in a lane.
 */
export function laneAt(board, target) {
    if (!board || typeof target?.closest !== 'function') return null;
    const lane = target.closest('[data-lane]');
    const number = lane ? Number(lane.getAttribute('data-lane')) : NaN;
    if (Number.isInteger(number) && number >= 0 && number < board.lanes.length) return number;
    const bubble = target.closest('[data-message-index]');
    const index = bubble ? Number(bubble.getAttribute('data-message-index')) : NaN;
    if (Number.isInteger(index) && index >= 0 && index < board.laneOf.length)
        return board.laneOf[index];
    return null;
}

/**
 * Work out what an export holds.
 *
 * @param {object} view - The props the object last rendered with: `conversation` (the messages shown, in
 *     board order with lanes), `board`, `highlights`, `settings` and `layout`.
 * @param {object} [options] - What to export.
 * @param {?number} [options.lane] - The lane to export alone; null for every conversation shown.
 * @param {number} [options.now] - When, in epoch milliseconds.
 * @returns {?object} The model: `heading`, `facts` (lines under the heading), `notes`, `legend`,
 *     `showLabels`, `columns` (one per conversation, each `label` and `count`), `headed` (whether the
 *     columns have headers), `rows`, `messageCount`, `footer`, `title` (for the file name) and
 *     `conversationLabel` (the lane exported, or null); null with nothing to export.
 */
export function buildExportModel(view, { lane = null, now = Date.now() } = {}) {
    const messages = view?.conversation?.messages ?? [];
    if (messages.length === 0) return null;
    const settings = view.settings ?? {};
    const board = view.board ?? null;
    const gapSec =
        Number(settings.groupGapSec) >= 0 ? Number(settings.groupGapSec) : DEFAULT_GAP_SEC;
    const days = settings.dateSeparators !== false;
    const title = typeof view.layout?.title === 'string' ? view.layout.title.trim() : '';

    let columns;
    let rows;
    let exported;
    let heading;
    let conversationLabel = null;
    const single = board && Number.isInteger(lane) && lane >= 0 && lane < board.lanes.length;
    if (single) {
        const chosen = board.lanes[lane];
        const indices = [...chosen.indices];
        columns = [{ label: chosen.label, count: indices.length }];
        rows = columnRows(messages, indices, { gapSec, days });
        exported = indices.map((index) => messages[index]);
        heading = chosen.label;
        conversationLabel = chosen.label;
    } else if (board) {
        columns = board.lanes.map((each) => ({ label: each.label, count: each.indices.length }));
        rows = board.rows ? linkedRows(board, { gapSec, days }) : freeRows(board, { gapSec, days });
        exported = messages;
        heading = title || counted(board.lanes.length, 'conversation', 'conversations');
    } else {
        columns = [{ label: null, count: messages.length }];
        rows = columnRows(
            messages,
            messages.map((_, index) => index),
            { gapSec, days }
        );
        exported = messages;
        heading = singleHeading(messages, title);
    }

    const counts =
        columns.length > 1
            ? `${counted(columns.length, 'conversation', 'conversations')} · ${counted(exported.length, 'message', 'messages')}`
            : counted(exported.length, 'message', 'messages');
    const facts = [namesText(participantNames(exported)), dateSpanText(exported), counts].filter(
        Boolean
    );

    const notes = [];
    const truncated = truncationNote(view.conversation.meta, view.conversation.messages.length);
    if (truncated) notes.push({ kind: 'truncated', text: truncated });
    if (exported.some((message) => message.context)) {
        notes.push({
            kind: 'context',
            text: 'Faded messages are context: they are in the same conversations, but outside the selection.',
        });
    }

    const highlights = view.highlights ?? null;
    const values = highlights?.answer?.kind === HIGHLIGHT_KINDS.VALUES;
    const legend =
        values && highlights.styles?.enabled && highlights.settings?.category?.showLegend
            ? legendEntries(
                  highlights.styles,
                  highlights.result,
                  highlights.answer.categories?.list ?? []
              )
                  .filter((entry) => !entry.empty)
                  .map((entry) => ({ label: entry.label, color: entry.color }))
            : [];

    return {
        heading,
        facts,
        notes,
        legend,
        showLabels: Boolean(
            values && highlights.styles?.enabled && highlights.settings?.category?.showLabels
        ),
        columns,
        headed: columns.length > 1,
        rows,
        messageCount: exported.length,
        avatars: settings.showAvatars !== false,
        footer: exportedOnText(now),
        title,
        conversationLabel,
    };
}
