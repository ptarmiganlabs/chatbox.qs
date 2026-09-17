/**
 * Clustering messages for display: author runs, and day boundaries.
 *
 * Both operate on `Message.ts`, which is milliseconds by the time it gets
 * here — `qlikTimeToEpochMs` converts the day serial the engine actually
 * returns. Anything comparing raw engine values here would silently never fire.
 *
 * A timestamp from a day serial is a WALL-CLOCK time: the date and time the data
 * holds, with no time zone, stored as the milliseconds of that time in UTC. Read
 * with local getters it moves by the reader's zone, and near midnight onto
 * another day. Days are therefore read from wall-clock milliseconds with the UTC
 * getters only, and `wallClockOf` is the one place a message's timestamp is
 * turned into them: a timestamp that came as epoch milliseconds (`tsInstant`) is
 * a real instant, and reads as the reader's clock shows it. See GOTCHAS 32.
 */

import { recipientsKey } from './recipients';

/** One calendar day of wall-clock time, which never has a daylight-saving change. */
const DAY_MS = 86400000;

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
 * Read an instant as the time the reader's clock shows for it.
 *
 * @param {number} instant - Epoch milliseconds: a real moment, such as `Date.now()`.
 * @returns {number} Wall-clock milliseconds, whose UTC date and time are the reader's local ones.
 */
export function localWallClock(instant) {
    return instant - new Date(instant).getTimezoneOffset() * 60000;
}

/**
 * Read a message's timestamp as a wall-clock time, the only form a day is read from.
 *
 * @param {?object} message - A message, with `ts` and, for epoch milliseconds, `tsInstant`.
 * @returns {?number} Wall-clock milliseconds: the timestamp itself for a day serial, which has no time
 *     zone, and the reader's clock for an instant; null when the message has no usable timestamp.
 */
export function wallClockOf(message) {
    const ts = message?.ts;
    if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
    return message.tsInstant === true ? localWallClock(ts) : ts;
}

/**
 * Calendar day of a wall-clock time.
 *
 * Read with the UTC getters, because wall-clock milliseconds hold their date and
 * time as UTC. The reader's time zone plays no part: 23:30 on 8 September in the
 * data is on 8 September in Stockholm and in New York alike, and a message sent
 * at 00:30 stays on the day after.
 *
 * @param {number} wallClock - Wall-clock milliseconds, as `wallClockOf` gives them.
 * @returns {string} A `YYYY-MM-DD` key.
 */
export function dayKey(wallClock) {
    const d = new Date(wallClock);
    /**
     * Zero-pad a number to two digits.
     *
     * @param {number} n - The number to pad.
     * @returns {string} The padded string.
     */
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Day label formatters, by whether they name the year.
 *
 * Making an Intl.DateTimeFormat costs far more than formatting with one, and a conversation over many days
 * labels a day header for every one of them, so each formatter is made once. They format in UTC, as
 * dayKey reads: a formatter made without a time zone keeps the zone it was made in, and would name the
 * reader's day instead of the one in the data.
 */
const dayFormatters = new Map();

/**
 * Get the formatter for day labels.
 *
 * @param {boolean} withYear - Whether the label names the year.
 * @returns {Intl.DateTimeFormat} The formatter, made on first use.
 */
function dayFormatter(withYear) {
    let formatter = dayFormatters.get(withYear);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: withYear ? 'numeric' : undefined,
            timeZone: 'UTC',
        });
        dayFormatters.set(withYear, formatter);
    }
    return formatter;
}

/**
 * Human label for a day separator.
 *
 * `today` is a parameter rather than read from the clock so the relative labels
 * are testable and so a snapshot renders the same way it did when taken. It is
 * the reader's wall clock, not an instant: an export is drawn again on the
 * server, whose clock may be in another time zone and on another day.
 *
 * @param {number} wallClock - Wall-clock milliseconds for the day, as `wallClockOf` gives them.
 * @param {number} [today] - The reader's wall clock, as `localWallClock` gives it; defaults to the
 *     reader's clock now.
 * @returns {string} 'Today', 'Yesterday', or a formatted date.
 */
export function dayLabel(wallClock, today = localWallClock(Date.now())) {
    const key = dayKey(wallClock);
    if (key === dayKey(today)) return 'Today';
    // A day back on the wall clock, not 24 hours back: an instant 24 hours ago is still today in the
    // last hour of the day the clocks go back, and two days ago in the first hour after they go forward.
    if (key === dayKey(today - DAY_MS)) return 'Yesterday';

    const d = new Date(wallClock);
    try {
        // Only name the year when it is not the current one — "12 Mar" reads
        // better than "12 Mar 2026" for a conversation from this year.
        return dayFormatter(d.getUTCFullYear() !== new Date(today).getUTCFullYear()).format(d);
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
    const wallClocks = list.map(wallClockOf);
    if (!wallClocks.some((wallClock) => wallClock !== null)) return starts;

    let currentKey = null;
    let open = false;
    list.forEach((_, index) => {
        const wallClock = wallClocks[index];
        if (wallClock === null) {
            // Undated: fold into whatever group is open, or start one if this is the very first message.
            if (!open) {
                starts[index] = 1;
                open = true;
            }
            return;
        }
        const key = dayKey(wallClock);
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
 * @param {number} [today] - The reader's wall clock, for Today and Yesterday; defaults to the reader's clock
 *     now.
 * @returns {?object} { groupCounts, labels }, or null when nothing can be dated.
 */
export function buildDayGroups(messages, today = localWallClock(Date.now())) {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    if (!messages.some((m) => wallClockOf(m) !== null)) return null;

    const starts = dayStarts(messages);
    const groupCounts = [];
    const labels = [];
    messages.forEach((message, index) => {
        if (starts[index] === 1) {
            groupCounts.push(0);
            const wallClock = wallClockOf(message);
            labels.push(wallClock === null ? '' : dayLabel(wallClock, today));
        }
        groupCounts[groupCounts.length - 1] += 1;
    });

    return { groupCounts, labels };
}
