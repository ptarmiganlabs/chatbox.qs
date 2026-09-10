/**
 * Clustering messages for display: author runs, and day boundaries.
 *
 * Both operate on `Message.ts`, which is epoch milliseconds by the time it gets
 * here — `qlikTimeToEpochMs` converts the day serial the engine actually
 * returns. Anything comparing raw engine values here would silently never fire.
 */

/**
 * Report whether a message starts a new author cluster.
 *
 * A cluster is a run of consecutive messages from one participant close together
 * in time; only the first of them shows an avatar and a name.
 *
 * @param {object} message - The current message.
 * @param {?object} previous - The message before it, if any.
 * @param {number} gapSec - Seconds after which a new cluster starts.
 * @returns {boolean} True when the author header should be shown.
 */
export function startsCluster(message, previous, gapSec) {
    if (!previous) return true;
    if (previous.authorKey !== message.authorKey) return true;
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

    const groupCounts = [];
    const labels = [];
    let currentKey = null;

    for (const message of messages) {
        if (typeof message.ts !== 'number') {
            // Undated: fold into whatever group is open, or start one if this is
            // the very first message.
            if (groupCounts.length === 0) {
                groupCounts.push(0);
                labels.push('');
            }
            groupCounts[groupCounts.length - 1] += 1;
            continue;
        }

        const key = dayKey(message.ts);
        if (key !== currentKey) {
            currentKey = key;
            groupCounts.push(0);
            labels.push(dayLabel(message.ts, now));
        }
        groupCounts[groupCounts.length - 1] += 1;
    }

    return { groupCounts, labels };
}
