/**
 * Collapse hypercube rows that belong to one message into one bubble.
 *
 * A straight hypercube emits one row per distinct combination of dimension
 * values. When a dimension beyond the message id, author and thread has several
 * values for one message — a recipient dimension on a group message, or a
 * dimension no role uses — that message arrives as several rows. The integrity
 * probe cannot see it: every one of those rows counts a single record. Rendered
 * row by row, the message silently repeats.
 *
 * Rows are grouped on the message id, the author and the thread, but only rows
 * whose body and timestamp also agree are folded together. Ids that are unique
 * within a conversation but not across conversations would otherwise fold two
 * different messages into one bubble and silently drop the second; those are
 * kept apart and flagged instead.
 *
 * Pure, so every one of those cases is unit-testable with no engine.
 */

import { addRecipients } from './recipients';

/** Separator for composite keys. It cannot occur in engine text. */
const SEP = String.fromCharCode(0);

/**
 * Report whether a record is a phantom row rather than a message.
 *
 * Null suppression is pinned off on every dimension, so that a message whose
 * thread or recipient is null still renders. The price: every value of a table
 * linked to one of those dimensions that has NO message still becomes a row —
 * a person nobody wrote to, a thread with no messages — with a null message id,
 * no text and a probe of 0. Rendered, each is an empty bubble; worse, its person
 * counts as a participant and silently disables two-sided layout.
 *
 * A row is a phantom only when all three hold. A null id with text, or with a
 * probe above zero, is a real — if broken — message, and is kept and reported.
 *
 * @param {object} record - A record from normalize's row reader.
 * @returns {boolean} True when the row carries no message at all.
 */
export function isPhantomRecord(record) {
    return (
        typeof record?.elem === 'number' &&
        record.elem < 0 &&
        !record.body &&
        (record.probe === null || record.probe === undefined || record.probe === 0)
    );
}

/**
 * Build the grouping key for a record.
 *
 * Only rows whose message id is a real field value can belong together. Null,
 * Total and Others rows all share one negative element number, so grouping on it
 * would merge unrelated messages.
 *
 * @param {object} record - A record from normalize's row reader.
 * @returns {?string} The key, or null when the row must stand alone.
 */
export function collapseKey(record) {
    if (typeof record?.elem !== 'number' || record.elem < 0) return null;
    return [record.elem, record.id, record.authorKey, record.threadId ?? ''].join(SEP);
}

/**
 * Start a bubble from its first row.
 *
 * @param {object} record - The first record of the message.
 * @returns {object} A bubble carrying every field of the record.
 */
function toBubble(record) {
    return {
        ...record,
        // A copy, because folding appends to it.
        recipients: Array.isArray(record.recipients) ? [...record.recipients] : null,
        rowsCollapsed: 1,
        idConflict: false,
    };
}

/**
 * Key a row by the content that decides whether it is the same message.
 *
 * Body and timestamp, serialised unambiguously so a lookup replaces a scan: a
 * misconfigured Message ID shared by thousands of different messages must cost
 * one Map lookup per row, not a pass over every bubble already collected.
 *
 * @param {object} record - A record or bubble.
 * @returns {string} Equal for rows with the same body and timestamp.
 */
function contentKey(record) {
    return JSON.stringify([record.body, record.ts]);
}

/**
 * Fold one more row of a message into its bubble.
 *
 * The probe is the one field where rows must not simply defer to the first:
 * any row reporting a merge means the bubble is merged, and the count is the
 * largest seen — summing would count recipients as messages. A KPI that differs
 * between rows has no single value to show, so it is marked as varying rather
 * than quietly showing the first row's number. The side attribute is honoured
 * only while every row agrees on it.
 *
 * @param {object} bubble - The bubble to extend, mutated.
 * @param {object} record - The additional row.
 * @returns {void}
 */
function foldInto(bubble, record) {
    bubble.rowsCollapsed += 1;
    if (bubble.recipients) addRecipients(bubble.recipients, record.recipients);
    bubble.merged = bubble.merged || record.merged;
    bubble.rowCount = Math.max(bubble.rowCount, record.rowCount);
    if (bubble.sideHint !== record.sideHint) bubble.sideHint = null;
    bubble.kpis = bubble.kpis.map((kpi, k) => {
        const other = record.kpis?.[k];
        if (kpi.varies || !other || other.text === kpi.text) return kpi;
        return { ...kpi, text: '', num: null, varies: true };
    });
}

/**
 * Collapse records into bubbles.
 *
 * Rows need not be adjacent — a dragged dimension or an expression sort can
 * separate them — so grouping is by key, and each bubble keeps the position of
 * its first row.
 *
 * @param {object[]} records - Records in cube order.
 * @returns {object} { messages, conflictCount, lastBubble } where conflictCount is
 *   the number of extra bubbles created because different messages share a key, and
 *   lastBubble is the bubble that received the last record.
 */
export function collapseRecords(records) {
    const messages = [];
    const byKey = new Map();
    let conflictCount = 0;
    let lastBubble = null;

    for (const record of Array.isArray(records) ? records : []) {
        const key = collapseKey(record);
        // Each group maps content → bubble, so finding a row's bubble is a lookup.
        const group = key === null ? null : byKey.get(key);

        if (!group) {
            const bubble = toBubble(record);
            if (key !== null) byKey.set(key, new Map([[contentKey(record), bubble]]));
            messages.push(bubble);
            lastBubble = bubble;
            continue;
        }

        const match = group.get(contentKey(record));
        if (match) {
            foldInto(match, record);
            lastBubble = match;
            continue;
        }

        const bubble = toBubble(record);
        bubble.idConflict = true;
        // Only the group's first bubble can still be unflagged: every later one
        // was flagged as it arrived. Re-flagging the whole group each time made
        // a heavily shared id quadratic.
        if (group.size === 1) for (const other of group.values()) other.idConflict = true;
        group.set(contentKey(record), bubble);
        messages.push(bubble);
        lastBubble = bubble;
        conflictCount += 1;
    }

    return { messages, conflictCount, lastBubble };
}

/**
 * Give every bubble a key that is unique within the conversation.
 *
 * Message ids can legitimately repeat — two authors sharing an id, or the
 * conflicts above — and the view keys open details, React rows and snapshot
 * state on something that must not. The first bubble with an id keeps the id
 * itself, so a snapshot taken before this existed still reopens the same bubble;
 * later ones get `id#2`, `id#3`, skipping any value that is some other message's
 * real id.
 *
 * @param {object[]} messages - Bubbles in display order, mutated.
 * @returns {object[]} The same array.
 */
export function assignBubbleKeys(messages) {
    const reserved = new Set(messages.map((m) => m.id));
    const used = new Set();
    // Where each id's suffix search resumes. Restarting at #2 for every repeat
    // made k bubbles sharing an id cost k² probes — 12 seconds at 20 000 rows.
    const nextSuffix = new Map();
    for (const message of messages) {
        if (!used.has(message.id)) {
            message.key = message.id;
            used.add(message.id);
            continue;
        }
        let n = nextSuffix.get(message.id) ?? 2;
        while (reserved.has(`${message.id}#${n}`) || used.has(`${message.id}#${n}`)) n += 1;
        message.key = `${message.id}#${n}`;
        used.add(message.key);
        nextSuffix.set(message.id, n + 1);
    }
    return messages;
}
