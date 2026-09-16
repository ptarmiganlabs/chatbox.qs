/**
 * The conversation as text to copy out: a transcript a person reads, or JSON a program reads.
 *
 * Both hold exactly the messages the object shows under the current selections, in the order it shows
 * them, and say when the message limit left some out. The transcript is plain: the date where a new day
 * starts, then for each message a line naming the sender, every recipient and the time, then the body as
 * it was written — markdown source for a markdown message — then a blank line. The time is shown as the
 * object shows it, often without a date, so the date lines say which day; the day separators do that on
 * screen. The JSON carries each message's fields, KPIs and highlights, with offsets
 * a program can slice: into the body of a plain-text message, and into `plainText`, the text a markdown
 * message renders, for a markdown one. Search matches are the reader's, not the data's, and are left
 * out.
 *
 * With conversations side by side, both hold the conversations shown, one after another in lane order,
 * each under a line naming it: read top to bottom, lanes that were beside each other would otherwise
 * interleave.
 *
 * Pure: it builds strings and objects, and copies nothing.
 */
import { dayKey } from '../chat/grouping';
import { conversationsShownText } from '../chat/lanes';
import { HIGHLIGHT_KINDS } from '../qix/highlight-source';
import { BLOCK_SEPARATOR } from '../highlight/markdown-projection';

/** The version of the JSON's shape; raised when a field changes meaning or goes away. */
export const EXPORT_SCHEMA_VERSION = 1;

/** Category names sort the same way on every host, as the legend sorts them. */
const NAME_ORDER = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Write a message's header line.
 *
 * @param {object} message - The message.
 * @returns {string} The sender, every recipient and the time as shown, e.g. "Ada → Bob, Cy · 10:32".
 */
function headerLine(message) {
    const author = message.author?.label ?? '';
    const recipients = message.recipients?.length
        ? message.recipients.map((recipient) => recipient.label).join(', ')
        : '';
    const who = recipients ? `${author} → ${recipients}` : author;
    return [who, message.tsText].filter(Boolean).join(' · ');
}

/**
 * List the messages to write, conversation by conversation when they are side by side.
 *
 * @param {Array<object>} messages - The messages shown.
 * @param {?object} board - The board they are shown in, or null.
 * @returns {Array<{label: ?string, indices: Array<number>}>} Runs of message indices: one per lane, named
 *     after its conversation, or a single unnamed run of every message.
 */
function runsOf(messages, board) {
    if (!board) return [{ label: null, indices: messages.map((_, index) => index) }];
    return board.lanes.map((lane) => ({ label: lane.label, indices: [...lane.indices] }));
}

/**
 * Write the conversation as a transcript.
 *
 * @param {object} conversation - The normalized conversation.
 * @param {object} [options] - Options.
 * @param {?object} [options.board] - The board the messages are shown in, with conversations side by side.
 * @returns {string} The transcript. A dated message on a new day is preceded by the day, as YYYY-MM-DD
 *     in the reader's time zone, the day its separator shows; a message without a time is not. Side by
 *     side, each conversation starts with a line naming it, and its first dated message with its day.
 */
export function conversationText(conversation, { board = null } = {}) {
    const messages = conversation?.messages ?? [];
    const parts = [];
    const truncated = (conversation?.diagnostics ?? []).find((d) => d.code === 'truncated');
    if (truncated) parts.push(`${truncated.message}\n`);
    if (board) parts.push(`${conversationsShownText(board)}\n`);
    for (const run of runsOf(messages, board)) {
        if (run.label !== null) parts.push(`Conversation: ${run.label}\n`);
        let day = null;
        for (const index of run.indices) {
            const message = messages[index];
            if (Number.isFinite(message.ts) && dayKey(message.ts) !== day) {
                day = dayKey(message.ts);
                parts.push(`${day}\n`);
            }
            parts.push(`${headerLine(message)}\n${message.body ? message.body : '(no text)'}\n`);
        }
    }
    return parts.join('\n');
}

/**
 * Summarise the highlights for the JSON.
 *
 * @param {?object} highlights - The highlight view the object drew with.
 * @returns {?object} The highlight field, where its values came from, and the counts; null while
 *     highlighting is off or has no values.
 */
function highlightsJson(highlights) {
    const answer = highlights?.answer;
    if (answer?.kind !== HIGHLIGHT_KINDS.VALUES) return null;
    const { result } = highlights;
    const names = [...result.counts.byCategory.keys()].sort(NAME_ORDER.compare);
    return {
        field: answer.field,
        source: answer.source,
        values: answer.values.length,
        valuesLeftOut: Boolean(answer.truncated),
        categoryField: answer.categories?.field ?? null,
        total: result.total,
        messagesWith: result.messagesWith,
        searchTruncated: Boolean(result.searchTruncated),
        categories: names.map((name) => ({
            name,
            highlights: result.counts.byCategory.get(name),
            messages: result.messageCounts.byCategory.get(name) ?? 0,
        })),
        noCategory: {
            highlights: result.counts.none,
            messages: result.messageCounts.none,
        },
    };
}

/**
 * Write one message for the JSON.
 *
 * @param {object} message - The message.
 * @param {?object} entry - Its highlights, when highlighting is on.
 * @param {function(string): string} projectionOf - The text a markdown body renders.
 * @returns {object} The message.
 */
function messageJson(message, entry, projectionOf) {
    const markdown = message.bodyFormat === 'markdown';
    const body = typeof message.body === 'string' ? message.body : '';
    const out = {
        id: message.id ?? null,
        author: message.author?.label ?? null,
        recipients: message.recipients
            ? message.recipients.map((recipient) => recipient.label)
            : null,
        thread: message.threadId ?? null,
        time: Number.isFinite(message.ts) ? new Date(message.ts).toISOString() : null,
        timeText: message.tsText ?? null,
        kind: message.kind ?? null,
        badge: message.badge ?? null,
        format: markdown ? 'markdown' : 'text',
        body,
    };
    // The separator between blocks becomes a line break: one character for one, so offsets hold.
    const text = markdown ? projectionOf(body).split(BLOCK_SEPARATOR).join('\n') : body;
    if (markdown) out.plainText = text;
    out.kpis = (message.kpis ?? []).map((kpi) => ({
        label: kpi.label,
        text: kpi.text,
        number: Number.isFinite(kpi.num) ? kpi.num : null,
        varies: Boolean(kpi.varies),
    }));
    if (entry) {
        out.highlights = entry.spans.map((span) => ({
            text: text.slice(span.start, span.end),
            start: span.start,
            end: span.end,
            values: span.values,
            categories: span.categories,
        }));
    }
    return out;
}

/**
 * Write the conversation as JSON-ready data.
 *
 * @param {object} conversation - The normalized conversation.
 * @param {object} options - What else goes in.
 * @param {?object} [options.highlights] - The highlight view the object drew with.
 * @param {function(string): string} options.projectionOf - The text a markdown body renders.
 * @param {string} options.exportedAt - When, as an ISO date.
 * @param {string} options.version - The extension's version.
 * @param {string} [options.order] - 'oldest' or 'newest' first, as shown.
 * @param {?object} [options.board] - The board the messages are shown in, with conversations side by side.
 * @returns {object} The data; `JSON.stringify` it. Side by side, the messages come conversation by
 *     conversation, and `conversation.conversations` says how many are shown of how many.
 */
export function conversationJson(
    conversation,
    { highlights = null, projectionOf, exportedAt, version, order = 'oldest', board = null }
) {
    const messages = conversation?.messages ?? [];
    const meta = conversation?.meta ?? {};
    const highlighting = highlightsJson(highlights);
    return {
        export: 'chatbox.qs conversation',
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt,
        extensionVersion: version,
        conversation: {
            messages: messages.length,
            rows: Number.isFinite(meta.total) ? meta.total : messages.length,
            truncated: Boolean(meta.truncated),
            order: order === 'newest' ? 'newest' : 'oldest',
            ...(board ? { conversations: { shown: board.lanes.length, total: board.total } } : {}),
        },
        highlights: highlighting,
        // Highlights are found by the index a message is shown at, whatever order it is written in.
        messages: runsOf(messages, board).flatMap((run) =>
            run.indices.map((index) =>
                messageJson(
                    messages[index],
                    highlighting ? highlights.result.byMessage[index] : null,
                    projectionOf
                )
            )
        ),
    };
}
