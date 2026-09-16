/**
 * Clustering messages for display: author runs, and day boundaries.
 *
 * Both operate on `Message.ts`, which is epoch milliseconds by the time it gets
 * here — `qlikTimeToEpochMs` converts the day serial the engine actually
 * returns. Anything comparing raw engine values here would silently never fire.
 */

import { recipientsKey } from './recipients';

/**
 * Report whether a message starts a new author cluster.
 *
 * A cluster is a run of consecutive messages from one participant to the same
 * recipients, close together in time; only the first of them shows an avatar
 * and a name. The recipients matter because the header names them: without the
 * check, "Ada → Bob" would silently head a following message from Ada to Cy.
 *
 * @param {object} message - The current message.
 * @param {?object} previous - The message before it, if any.
 * @param {number} gapSec - Seconds after which a new cluster starts.
 * @returns {boolean} True when the author header should be shown.
 */
export function startsCluster(message, previous, gapSec) {
    if (!previous) return true;
    if (previous.authorKey !== message.authorKey) return true;
    if (recipientsKey(previous.recipients) !== recipientsKey(message.recipients)) return true;
    // Sides can differ for one author — Own in one conversation, automatic in
    // another, or a side attribute. A bubble that switches sides needs its header.
    if (previous.side !== message.side) return true;
    if (typeof message.ts === 'number' && typeof previous.ts === 'number') {
        return Math.abs(message.ts - previous.ts) > gapSec * 1000;
    }
    return false;
}

/**
 * Local calendar day for an epoch timestamp.
 *
 * Local rather than UTC on purpose: a conversation reads by the viewer's clock,
 * so a message at 23:30 local should sit under that day's heading even when UTC
 * has already rolled over.
 *
 * @param {number} ts - Epoch milliseconds.
 * @returns {string} A `YYYY-MM-DD` key in local time.
 */
export function dayKey(ts) {
    const d = new Date(ts);
    /**
     * Zero-pad a number to two digits.
     *
     * @param {number} n - The number to pad.
     * @returns {string} The padded string.
     */
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Human label for a day separator.
 *
 * `now` is a parameter rather than read from the clock so the relative labels
 * are testable and so a snapshot renders the same way it did when taken.
 *
 * @param {number} ts - Epoch milliseconds for the day.
 * @param {number} [now] - Reference time; defaults to the current clock.
 * @returns {string} 'Today', 'Yesterday', or a formatted date.
 */
export function dayLabel(ts, now = Date.now()) {
    const key = dayKey(ts);
    if (key === dayKey(now)) return 'Today';
    if (key === dayKey(now - 86400000)) return 'Yesterday';

    const d = new Date(ts);
    try {
        return new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            // Only name the year when it is not the current one — "12 Mar" reads
            // better than "12 Mar 2026" for a conversation from this year.
            year: d.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
        }).format(d);
    } catch {
        return key;
    }
}

/**
 * Mark where each day group starts.
 *
 * The one definition of where a day starts, shared by the day groups and by the rows that line
 * conversations up side by side: rows never cross a day, so the day groups can count rows. Messages
 * with no timestamp cannot be dated, so they join the group that precedes them; a conversation that
 * starts with undated messages opens with an unlabelled group of its own.
 *
 * @param {object[]} messages - The conversation, in display order.
 * @returns {Uint8Array} 1 at each message that starts a group, 0 elsewhere; all 0 when nothing can be
 *     dated, since then there are no day groups at all.
 */
export function dayStarts(messages) {
    const list = Array.isArray(messages) ? messages : [];
    const starts = new Uint8Array(list.length);
    if (!list.some((m) => typeof m.ts === 'number')) return starts;

    let currentKey = null;
    let open = false;
    list.forEach((message, index) => {
        if (typeof message.ts !== 'number') {
            // Undated: fold into whatever group is open, or start one if this is the very first message.
            if (!open) {
                starts[index] = 1;
                open = true;
            }
            return;
        }
        const key = dayKey(message.ts);
        if (key !== currentKey) {
            currentKey = key;
            starts[index] = 1;
            open = true;
        }
    });
    return starts;
}

/**
 * Split a conversation into consecutive day groups.
 *
 * Returns the shape react-virtuoso's GroupedVirtuoso wants: a count per group,
 * in order, plus the label for each. Messages with no timestamp cannot be dated,
 * so they join the group that precedes them rather than forming an "unknown"
 * heading nobody asked for.
 *
 * @param {object[]} messages - The conversation, in display order.
 * @param {number} [now] - Reference time for relative labels.
 * @returns {?object} { groupCounts, labels }, or null when nothing can be dated.
 */
export function buildDayGroups(messages, now = Date.now()) {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    if (!messages.some((m) => typeof m.ts === 'number')) return null;

    const starts = dayStarts(messages);
    const groupCounts = [];
    const labels = [];
    messages.forEach((message, index) => {
        if (starts[index] === 1) {
            groupCounts.push(0);
            labels.push(typeof message.ts === 'number' ? dayLabel(message.ts, now) : '');
        }
        groupCounts[groupCounts.length - 1] += 1;
    });

    return { groupCounts, labels };
}
