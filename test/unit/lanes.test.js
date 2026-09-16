import { describe, it, expect } from 'vitest';
import definition from '../../src/object-properties';
import { buildDayGroups } from '../../src/chat/grouping';
import {
    LANE_DEFAULTS,
    LANE_MAX,
    NO_CONVERSATION_LABEL,
    buildBoard,
    clampLaneMax,
    fitLaneCount,
    laneBoardFor,
    laneKeyOf,
    laneKeys,
    laneLabelOf,
    lanePlace,
    lanesBag,
    packRows,
    rankLanes,
    readLaneSettings,
    rowDayGroups,
} from '../../src/chat/lanes';

const DAY = 86_400_000;
const T0 = new Date(2026, 8, 7, 9).getTime();

/** A message in a thread, at a cube row, optionally dated. */
const msg = (id, thread, { row = Number(id), ts = null, elem } = {}) => ({
    id,
    key: `k${id}`,
    threadId: thread,
    threadElem: elem ?? (thread === null ? -2 : thread.charCodeAt(0)),
    rowIdx: row,
    ts,
});

describe('lane settings', () => {
    it('reads defaults for an object saved before lanes existed', () => {
        expect(readLaneSettings(undefined)).toEqual(LANE_DEFAULTS);
        expect(readLaneSettings({ show: 'yes', max: 'lots', scroll: 'sideways' })).toEqual(
            LANE_DEFAULTS
        );
    });

    it('keeps valid values', () => {
        expect(readLaneSettings({ show: true, max: 6, scroll: 'free' })).toEqual({
            show: true,
            max: 6,
            scroll: 'free',
        });
    });

    it('keeps the lane count a whole number from 1 to the maximum', () => {
        expect(clampLaneMax(0)).toBe(1);
        expect(clampLaneMax(3.6)).toBe(4);
        expect(clampLaneMax('7')).toBe(7);
        expect(clampLaneMax(99)).toBe(LANE_MAX);
        for (const value of ['', null, undefined, 'x']) {
            expect(clampLaneMax(value), String(value)).toBe(LANE_DEFAULTS.max);
        }
    });

    it('starts the object properties from a mutable copy of the defaults', () => {
        const bag = lanesBag();
        bag.max = 9;
        expect(LANE_DEFAULTS.max).toBe(4);
        expect(definition.chatbox.lanes).toEqual(LANE_DEFAULTS);
    });
});

describe('lane keys and labels', () => {
    it('keys a thread value by its text, and a synthetic row by its element number', () => {
        expect(laneKeyOf(msg('1', 'Ticket 9', { elem: 4 }))).toBe('v:Ticket 9');
        expect(laneKeyOf(msg('2', null))).toBe('n:-2');
        expect(laneKeyOf(msg('3', 'Others', { elem: -3 }))).toBe('n:-3');
    });

    it('never takes a thread called like a synthetic row, or a real empty value, for one', () => {
        expect(laneKeyOf(msg('1', 'Others', { elem: 7 }))).not.toBe(
            laneKeyOf(msg('2', 'Others', { elem: -3 }))
        );
        // A real '' or '-' value reads as a null thread id, but its element number says it is a value.
        const empty = msg('3', null, { elem: 5 });
        expect(laneKeyOf(empty)).toBe('v:');
        expect(laneLabelOf(empty)).toBe('(empty)');
    });

    it('names the lanes', () => {
        expect(laneLabelOf(msg('1', 'Ticket 9'))).toBe('Ticket 9');
        expect(laneLabelOf(msg('2', null))).toBe(NO_CONVERSATION_LABEL);
        expect(laneLabelOf(msg('3', 'Övriga', { elem: -3 }))).toBe('Övriga');
        expect(laneLabelOf({ id: '4', threadId: null })).toBe(NO_CONVERSATION_LABEL);
    });
});

describe('rankLanes', () => {
    it('puts the latest activity first, by timestamp', () => {
        const ranked = rankLanes([
            msg('1', 'A', { ts: T0 + 5 }),
            msg('2', 'B', { ts: T0 + 1 }),
            msg('3', 'C', { ts: T0 + 3 }),
            msg('4', 'B', { ts: T0 + 9 }),
        ]);
        expect(ranked.map((lane) => [lane.label, lane.count])).toEqual([
            ['B', 2],
            ['A', 1],
            ['C', 1],
        ]);
    });

    it('puts dated conversations before undated ones, and ranks undated ones by cube place', () => {
        const ranked = rankLanes([
            msg('1', 'Dated', { row: 1, ts: T0 }),
            msg('2', 'Late', { row: 900 }),
            msg('3', 'Early', { row: 50 }),
        ]);
        expect(ranked.map((lane) => lane.label)).toEqual(['Dated', 'Late', 'Early']);
    });

    it('is the same whichever way the messages are shown', () => {
        const messages = [msg('1', 'A', { row: 1 }), msg('2', 'B', { row: 2 }), msg('3', 'C')];
        const newestFirst = [...messages].reverse();
        expect(rankLanes(newestFirst)).toEqual(rankLanes(messages));
    });

    it('breaks a tie by key, so equal conversations never swap', () => {
        const a = rankLanes([msg('1', 'B', { row: 5 }), msg('2', 'A', { row: 5 })]);
        const b = rankLanes([msg('2', 'A', { row: 5 }), msg('1', 'B', { row: 5 })]);
        expect(a.map((lane) => lane.label)).toEqual(['A', 'B']);
        expect(b).toEqual(a);
    });
});

describe('fitLaneCount', () => {
    it('fits lanes of at least 220 pixels, from 1 to the setting', () => {
        expect(fitLaneCount(219, 4)).toBe(1);
        expect(fitLaneCount(880, 4)).toBe(4);
        expect(fitLaneCount(879, 4)).toBe(3);
        expect(fitLaneCount(4000, 4)).toBe(4);
    });

    it('shows as many as the setting allows before the object is measured', () => {
        expect(fitLaneCount(0, 6)).toBe(6);
        expect(fitLaneCount(undefined, 6)).toBe(6);
    });
});

describe('buildBoard, free scrolling', () => {
    const messages = [
        msg('1', 'A'),
        msg('2', 'B'),
        msg('3', 'A'),
        msg('4', 'C'),
        msg('5', 'B'),
        msg('6', 'A'),
    ];

    it('shows the lanes one after another, each a stretch of the board', () => {
        const board = buildBoard(messages, { max: 2, scroll: 'free' });
        // A and B are the most recent: A's last message is row 6, B's is row 5.
        expect(board.lanes.map((lane) => lane.label)).toEqual(['A', 'B']);
        expect(board.total).toBe(3);
        expect(board.messages.map((m) => m.id)).toEqual(['1', '3', '6', '2', '5']);
        expect(board.lanes.map((lane) => [lane.start, [...lane.indices]])).toEqual([
            [0, [0, 1, 2]],
            [3, [3, 4]],
        ]);
        expect([...board.laneOf]).toEqual([0, 0, 0, 1, 1]);
        expect([...board.posInLane]).toEqual([0, 1, 2, 0, 1]);
        expect([...board.prevInLane]).toEqual([-1, 0, 1, -1, 3]);
        expect(board.rows).toBeNull();
        expect(board.lanes[1].messages.map((m) => m.id)).toEqual(['2', '5']);
    });

    it('fits the lanes to the width, and shows a snapshot’s lanes in its order', () => {
        expect(buildBoard(messages, { max: 3, scroll: 'free', width: 500 }).lanes).toHaveLength(2);
        const recorded = buildBoard(messages, {
            max: 1,
            scroll: 'free',
            width: 100,
            keys: ['v:C', 'v:A'],
        });
        expect(laneKeys(recorded)).toEqual(['v:C', 'v:A']);
        // Keys a selection has since removed are skipped; none left means ranking again.
        expect(
            laneKeys(buildBoard(messages, { max: 1, scroll: 'free', keys: ['v:gone'] }))
        ).toEqual(['v:A']);
    });

    it('finds a message within its lane for the details', () => {
        const board = buildBoard(messages, { max: 2, scroll: 'free' });
        expect(lanePlace(board, board.messages, 4)).toEqual({
            messages: board.lanes[1].messages,
            index: 1,
        });
        expect(lanePlace(null, messages, 2)).toEqual({ messages, index: 2 });
    });
});

describe('buildBoard, linked scrolling', () => {
    it('keeps display order, leaving out the lanes not shown', () => {
        const board = buildBoard(
            [msg('1', 'A'), msg('2', 'C', { row: 0 }), msg('3', 'B'), msg('4', 'A')],
            { max: 2, scroll: 'linked' }
        );
        expect(board.lanes.map((lane) => lane.label)).toEqual(['A', 'B']);
        expect(board.messages.map((m) => m.id)).toEqual(['1', '3', '4']);
        expect(board.lanes.every((lane) => lane.start === -1)).toBe(true);
        expect([...board.prevInLane]).toEqual([-1, -1, 0]);
    });

    it('packs messages into rows with at most one per lane, in order', () => {
        const board = buildBoard(
            [
                msg('1', 'A', { row: 1 }),
                msg('2', 'B', { row: 2 }),
                msg('3', 'B', { row: 3 }),
                msg('4', 'A', { row: 4 }),
                msg('5', 'C', { row: 5 }),
                msg('6', 'A', { row: 6 }),
            ],
            { max: 3, scroll: 'linked' }
        );
        const { rows, laneOf } = board;
        expect([...rows.of]).toEqual([0, 0, 1, 1, 1, 2]);
        expect([...rows.start]).toEqual([0, 2, 5, 6]);
        for (let row = 0; row < rows.count; row++) {
            const lanes = [];
            for (let i = rows.start[row]; i < rows.start[row + 1]; i++) lanes.push(laneOf[i]);
            expect(new Set(lanes).size).toBe(lanes.length);
        }
    });

    it('starts a row with each new day, so the day groups count rows', () => {
        const messages = [
            msg('1', 'A', { ts: T0 }),
            msg('2', 'B', { ts: T0 + 60_000 }),
            msg('3', 'A', { ts: T0 + DAY }),
            msg('4', 'B'),
            msg('5', 'B', { ts: T0 + 2 * DAY }),
        ];
        const board = buildBoard(messages, { max: 2, scroll: 'linked' });
        // Day 1: A and B share a row. Day 2: A, then undated B joins its row. Day 3: B.
        expect([...board.rows.of]).toEqual([0, 0, 1, 1, 2]);
        const groups = rowDayGroups(board.messages, board.rows, T0 + 10 * DAY);
        expect(groups.groupCounts).toEqual([1, 1, 1]);
        expect(groups.groupCounts.reduce((a, b) => a + b, 0)).toBe(board.rows.count);
        expect(buildDayGroups(board.messages, T0 + 10 * DAY).labels).toEqual(groups.labels);
    });

    it('gives a leading undated run its own group, as the day headers do', () => {
        const messages = [msg('1', 'A'), msg('2', 'B'), msg('3', 'A', { ts: T0 })];
        const board = buildBoard(messages, { max: 2, scroll: 'linked' });
        const groups = rowDayGroups(board.messages, board.rows, T0);
        expect(groups.labels[0]).toBe('');
        expect(groups.groupCounts.reduce((a, b) => a + b, 0)).toBe(board.rows.count);
    });

    it('has no day groups when nothing can be dated', () => {
        const board = buildBoard([msg('1', 'A'), msg('2', 'B')], { max: 2, scroll: 'linked' });
        expect(rowDayGroups(board.messages, board.rows)).toBeNull();
    });
});

describe('linked rows and pauses', () => {
    const at = (h, m) => new Date(2026, 8, 16, h, m).getTime();
    // Three lanes: a few messages in A, a pause, one in B, then A again; C spoke an hour before.
    const scenario = [
        msg('1', 'C', { ts: at(9, 0) }),
        msg('2', 'A', { ts: at(10, 0) }),
        msg('3', 'A', { ts: at(10, 1) }),
        msg('4', 'A', { ts: at(10, 2) }),
        msg('5', 'B', { ts: at(14, 0) }),
        msg('6', 'A', { ts: at(14, 5) }),
    ];
    /** Each row's message ids, in board order. */
    const rowsOf = (board) =>
        Array.from({ length: board.rows.count }, (_, row) =>
            board.messages.slice(board.rows.start[row], board.rows.start[row + 1]).map((m) => m.id)
        );

    it('never puts a message beside one sent long before it', () => {
        const board = buildBoard(scenario, { max: 3, scroll: 'linked', gapSec: 120 });
        // Every message here is more than two minutes from the ones around it: one row each, in time order.
        expect(rowsOf(board)).toEqual([['1'], ['2'], ['3'], ['4'], ['5'], ['6']]);
    });

    it('still pairs messages sent close together in different lanes', () => {
        const board = buildBoard(
            [
                msg('1', 'A', { ts: at(10, 0) }),
                msg('2', 'B', { ts: at(10, 1) }),
                msg('3', 'A', { ts: at(10, 2) }),
                msg('4', 'B', { ts: at(10, 5) }),
            ],
            { max: 2, scroll: 'linked', gapSec: 120 }
        );
        // 3 joins no row with 1 (lane A repeats); 4 is three minutes after 3, too far to share its row.
        expect(rowsOf(board)).toEqual([['1', '2'], ['3'], ['4']]);
    });

    it('measures from the row’s first message, whichever way the messages are shown', () => {
        const oldestFirst = [
            msg('1', 'A', { ts: at(10, 0) }),
            msg('2', 'B', { ts: at(10, 1) }),
            msg('3', 'C', { ts: at(10, 3) }),
        ];
        const oldest = buildBoard(oldestFirst, { max: 3, scroll: 'linked', gapSec: 120 });
        expect(rowsOf(oldest)).toEqual([['1', '2'], ['3']]);
        const newest = buildBoard([...oldestFirst].reverse(), {
            max: 3,
            scroll: 'linked',
            gapSec: 120,
        });
        expect(rowsOf(newest)).toEqual([['3', '2'], ['1']]);
    });

    it('follows the setting: a wider gap pairs more, 0 pairs only messages sent at the same time', () => {
        const wide = buildBoard(scenario, { max: 3, scroll: 'linked', gapSec: 600 });
        expect(rowsOf(wide)).toEqual([['1'], ['2'], ['3'], ['4'], ['5', '6']]);
        const same = buildBoard(
            [msg('1', 'A', { ts: at(10, 0) }), msg('2', 'B', { ts: at(10, 0) })],
            { max: 2, scroll: 'linked', gapSec: 0 }
        );
        expect(rowsOf(same)).toEqual([['1', '2']]);
    });

    it('uses two minutes when the setting holds no number, as the conversation view does', () => {
        const close = [msg('1', 'A', { ts: at(10, 0) }), msg('2', 'B', { ts: at(10, 2) })];
        for (const gapSec of [undefined, 'lots', -5]) {
            expect(
                rowsOf(buildBoard(close, { max: 2, scroll: 'linked', gapSec })),
                String(gapSec)
            ).toEqual([['1', '2']]);
        }
    });

    it('lets undated messages join a row without being compared', () => {
        const board = buildBoard(
            [msg('1', 'A', { ts: at(10, 0) }), msg('2', 'B'), msg('3', 'C', { ts: at(10, 1) })],
            { max: 3, scroll: 'linked', gapSec: 120 }
        );
        expect(rowsOf(board)).toEqual([['1', '2', '3']]);
    });
});

describe('packRows', () => {
    it('breaks on a repeated lane and on a day start, and never otherwise', () => {
        const rows = packRows(
            Int32Array.from([0, 1, 2, 0, 1, 1]),
            Uint8Array.from([1, 0, 0, 0, 0, 0])
        );
        expect([...rows.of]).toEqual([0, 0, 0, 1, 1, 2]);
        const days = packRows(Int32Array.from([0, 1, 2]), Uint8Array.from([1, 0, 1]));
        expect([...days.of]).toEqual([0, 0, 1]);
    });

    it('starts a row when a dated message is further than the gap from the row’s first dated one', () => {
        const minute = 60_000;
        const rows = packRows(Int32Array.from([0, 1, 2]), new Uint8Array(3), {
            times: [null, 0, 5 * minute],
            gapMs: 2 * minute,
        });
        expect([...rows.of]).toEqual([0, 0, 1]);
    });

    it('handles no messages', () => {
        const rows = packRows(new Int32Array(0), new Uint8Array(0));
        expect(rows.count).toBe(0);
        expect([...rows.start]).toEqual([0]);
    });
});

describe('laneBoardFor', () => {
    const settings = { show: true, max: 4, scroll: 'linked' };
    const messages = [msg('1', 'A')];

    it('builds a board only with lanes on, a thread dimension and messages', () => {
        expect(laneBoardFor({ messages, settings, hasThread: true })).not.toBeNull();
        expect(
            laneBoardFor({ messages, settings: { ...settings, show: false }, hasThread: true })
        ).toBeNull();
        expect(laneBoardFor({ messages, settings, hasThread: false })).toBeNull();
        expect(laneBoardFor({ messages: [], settings, hasThread: true })).toBeNull();
    });
});

describe('boards at scale', () => {
    it('builds a 12,000-message board in either scrolling', () => {
        const messages = Array.from({ length: 12_000 }, (_, i) =>
            msg(String(i), `Thread ${Math.floor(i / 500)}`, {
                row: i,
                ts: T0 + i * 300_000,
                elem: Math.floor(i / 500),
            })
        );
        const started = performance.now();
        const linked = buildBoard(messages, { max: 10, scroll: 'linked' });
        const free = buildBoard(messages, { max: 10, scroll: 'free' });
        expect(performance.now() - started).toBeLessThan(1000);
        expect(linked.lanes.map((lane) => lane.label)[0]).toBe('Thread 23');
        expect(linked.messages).toHaveLength(5000);
        expect(free.messages).toHaveLength(5000);
        expect(linked.rows.count).toBeGreaterThan(0);
    });
});
