import { describe, it, expect } from 'vitest';
import { buildDayGroups, dayStarts } from '../../src/chat/grouping';
import { buildBoard, rowDayGroups } from '../../src/chat/lanes';
import { normalize } from '../../src/chat/normalize';
import { conversationText } from '../../src/export/conversation-export';
import { ATTR_IDS } from '../../src/qix/attr-map';
import { ZONE_NAMES, inTimeZone } from '../helpers/time-zones';

/*
 * Days in every time zone, from the value the engine returns to what the reader sees and copies
 * (GOTCHAS 32).
 *
 * A Qlik timestamp has no time zone. Read by the reader's clock, a message at 23:30 went under the next
 * day east of UTC and one at 00:30 under the day before west of it, on screen and in the transcript
 * alike, while in UTC, where CI runs, both looked right.
 */

/** The day serial the engine returns for a wall-clock time: days since 1899-12-30. */
const serial = (y, m, d, h, min) => Date.UTC(y, m - 1, d, h, min) / 86400000 + 25569;

/** A cube with a thread, and the timestamp expressions on the message id. */
const layout = (qcy) => ({
    qHyperCube: {
        qSize: { qcx: 5, qcy },
        qDimensionInfo: [
            { cId: 'd_msgid', qAttrExprInfo: [{ id: ATTR_IDS.TS }, { id: ATTR_IDS.TS_TEXT }] },
            { cId: 'd_author' },
            { cId: 'd_thread' },
        ],
        qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
    },
});

/** One message row as the engine sends it, with the timestamp's number and its text. */
const row = (id, thread, value, timeText) => [
    {
        qText: id,
        qElemNumber: Number(id),
        qAttrExps: { qValues: [{ qNum: value }, { qText: timeText }] },
    },
    { qText: 'Ada', qElemNumber: 0, qState: 'O' },
    { qText: thread, qElemNumber: thread.charCodeAt(0) },
    { qText: `message ${id}`, qNum: 'NaN' },
    { qText: '1', qNum: 1 },
];

/** Late at night and just after midnight, twice, in two conversations. */
const ROWS = [
    row('1', 'A', serial(2026, 9, 8, 23, 30), '23:30'),
    row('2', 'B', serial(2026, 9, 9, 0, 30), '00:30'),
    row('3', 'A', serial(2026, 9, 9, 23, 30), '23:30'),
    row('4', 'B', serial(2026, 9, 10, 0, 30), '00:30'),
];

/** The day the data holds for each of the rows, by message id. */
const DAY_OF = { 1: '2026-09-08', 2: '2026-09-09', 3: '2026-09-09', 4: '2026-09-10' };

/** The conversation, normalized in the zone the test runs in. */
const conversationOf = (rows = ROWS) => normalize({ layout: layout(rows.length), rows });

/** An instant the reader's clock shows as the given time, in the zone the test runs in. */
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

/**
 * Write a day of 2026 as a separator does, in the test machine's locale.
 *
 * @param {string} key - The day, as YYYY-MM-DD.
 * @returns {string} The label.
 */
const written = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    }).format(Date.UTC(y, m - 1, d));
};

/**
 * Spread day groups back over what they count.
 *
 * @param {{groupCounts: number[], labels: string[]}} groups - Day groups.
 * @returns {string[]} The label over each message, or row, in order.
 */
const spread = ({ groupCounts, labels }) =>
    groupCounts.flatMap((count, group) => Array(count).fill(labels[group]));

/**
 * Read a transcript's date lines message by message.
 *
 * @param {string} text - The transcript, of messages whose body is `message <id>`.
 * @returns {{id: string, dateLine: ?string, day: ?string}[]} Each message in order, with the date line
 *     written just before it, if any, and the day it is written under.
 */
const transcriptDays = (text) => {
    const lines = text.split('\n');
    const isDay = (line) => /^\d{4}-\d{2}-\d{2}$/.test(line ?? '');
    let day = null;
    const out = [];
    lines.forEach((line, index) => {
        if (isDay(line)) day = line;
        const body = /^message (\d+)$/.exec(line);
        // A date part, a blank line, then the header: the date line is three lines above the body.
        if (body) {
            const above = lines[index - 3];
            out.push({ id: body[1], dateLine: isDay(above) ? above : null, day });
        }
    });
    return out;
};

describe('a Qlik timestamp keeps the date the data holds in every time zone', () => {
    it.each(ZONE_NAMES)('on the separators and in the transcript, in %s', (zone) => {
        inTimeZone(zone, () => {
            const { messages } = conversationOf();
            const groups = buildDayGroups(messages, local(2026, 9, 17));
            expect(groups.groupCounts).toEqual([1, 2, 1]);
            expect(spread(groups)).toEqual(messages.map((m) => written(DAY_OF[m.id])));

            const copied = transcriptDays(conversationText({ messages, diagnostics: [] }));
            expect(copied.map(({ id, day }) => [id, day])).toEqual(
                messages.map((m) => [m.id, DAY_OF[m.id]])
            );
            // A date line stands exactly where a separator starts a day.
            expect(copied.map(({ dateLine }) => (dateLine ? 1 : 0))).toEqual([
                ...dayStarts(messages),
            ]);
        });
    });

    it.each(ZONE_NAMES)('over linked lanes, and in the transcript lane by lane, in %s', (zone) => {
        inTimeZone(zone, () => {
            const { messages } = conversationOf();
            const board = buildBoard(messages, { max: 2, scroll: 'linked' });
            const rows = spread(rowDayGroups(board, local(2026, 9, 17)));
            const overEach = board.messages.map((_, index) => rows[board.rows.of[index]]);
            expect(overEach).toEqual(board.messages.map((m) => written(DAY_OF[m.id])));

            const text = conversationText({ messages: board.messages, diagnostics: [] }, { board });
            const copied = transcriptDays(text);
            // B has the latest message, so its lane comes first.
            expect(copied.map(({ id }) => id)).toEqual(['2', '4', '1', '3']);
            expect(copied.map(({ id, day }) => [id, day])).toEqual(
                copied.map(({ id }) => [id, DAY_OF[id]])
            );
        });
    });

    it.each(ZONE_NAMES)('in free lanes, in %s', (zone) => {
        inTimeZone(zone, () => {
            const board = buildBoard(conversationOf().messages, { max: 2, scroll: 'free' });
            for (const lane of board.lanes) {
                expect(spread(buildDayGroups(lane.messages, local(2026, 9, 17)))).toEqual(
                    lane.messages.map((m) => written(DAY_OF[m.id]))
                );
            }
        });
    });

    it.each(ZONE_NAMES)('names today and yesterday by the reader’s clock, in %s', (zone) => {
        inTimeZone(zone, () => {
            const { messages } = conversationOf();
            // 09:00 on 10 September on the reader's own clock.
            const groups = buildDayGroups(messages, local(2026, 9, 10, 9));
            expect(spread(groups)).toEqual([
                written('2026-09-08'),
                'Yesterday',
                'Yesterday',
                'Today',
            ]);
        });
    });
});

describe('epoch milliseconds are a real instant, dated by the reader’s clock', () => {
    // 21:30 and 22:30 UTC on 8 September.
    const INSTANT_ROWS = [
        row('1', 'A', Date.UTC(2026, 8, 8, 21, 30), '21:30'),
        row('2', 'A', Date.UTC(2026, 8, 8, 22, 30), '22:30'),
    ];

    it.each([
        ['UTC', ['2026-09-08', '2026-09-08']],
        ['Europe/Stockholm', ['2026-09-08', '2026-09-09']],
        ['America/New_York', ['2026-09-08', '2026-09-08']],
        ['Asia/Kolkata', ['2026-09-09', '2026-09-09']],
        ['Pacific/Kiritimati', ['2026-09-09', '2026-09-09']],
        ['Etc/GMT+12', ['2026-09-08', '2026-09-08']],
    ])('on the separators and in the transcript alike, in %s', (zone, days) => {
        inTimeZone(zone, () => {
            const { messages } = conversationOf(INSTANT_ROWS);
            expect(messages.map((m) => m.tsInstant)).toEqual([true, true]);
            expect(spread(buildDayGroups(messages, local(2026, 9, 17)))).toEqual(days.map(written));
            const copied = transcriptDays(conversationText({ messages, diagnostics: [] }));
            expect(copied.map(({ day }) => day)).toEqual(days);
        });
    });
});
