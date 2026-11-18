import { describe, it, expect } from 'vitest';
import { buildBoard } from '../../src/chat/lanes';
import { HIGHLIGHT_KINDS } from '../../src/qix/highlight-source';
import {
    buildExportModel,
    dateSpanText,
    dayHeading,
    exportedOnText,
    laneAt,
    namesText,
    participantNames,
    truncationNote,
} from '../../src/export/export-model';

const people = {
    Ada: { key: 'Ada', label: 'Ada', color: '#4477aa' },
    Bob: { key: 'Bob', label: 'Bob', color: '#ee6677' },
    Cy: { key: 'Cy', label: 'Cy', color: '#228833' },
};

/** A message in a thread, dated by minutes into 8 September 2026 unless `ts` is given. */
const message = (
    id,
    thread,
    body,
    { author = 'Ada', minutes = null, ts, recipients = null } = {}
) => ({
    id,
    key: `k${id}`,
    body,
    bodyFormat: 'text',
    authorKey: author,
    author: people[author],
    recipients: recipients ? recipients.map((name) => people[name]) : null,
    threadId: thread,
    threadElem: thread === null ? -2 : 1,
    ts:
        ts !== undefined
            ? ts
            : minutes === null
              ? null
              : Date.UTC(2026, 8, 8, 9, 0) + minutes * 60000,
    tsText: null,
    side: author === 'Bob' ? 'right' : 'left',
});

const DAY = 86400000;

/** A view, as the object hands it over, of a list of messages without lanes. */
const listView = (messages, extra = {}) => ({
    conversation: { messages, meta: { truncated: false }, diagnostics: [] },
    board: null,
    settings: { groupGapSec: 120 },
    layout: { title: 'Support chats' },
    ...extra,
});

/** A view of messages side by side. */
const boardView = (messages, scroll = 'linked', extra = {}) => {
    const board = buildBoard(messages, { max: 4, scroll });
    return {
        conversation: { messages: board.messages, meta: { truncated: false }, diagnostics: [] },
        board,
        settings: { groupGapSec: 120 },
        layout: { title: 'Support chats' },
        ...extra,
    };
};

/** The bodies of the messages in each row, a day row as its label. */
const shape = (rows) =>
    rows.map((row) =>
        row.kind === 'day'
            ? `day:${row.label}`
            : row.cells.map((cell) => cell?.message.body ?? null)
    );

describe('buildExportModel, one conversation', () => {
    const messages = [
        message('1', 'T1', 'hello', { minutes: 0, recipients: ['Bob'] }),
        message('2', 'T1', 'are you there?', { minutes: 1, recipients: ['Bob'] }),
        message('3', 'T1', 'yes', { author: 'Bob', minutes: 2 }),
        message('4', 'T1', 'next day', { minutes: 60 * 24 + 5, recipients: ['Bob'] }),
    ];

    it('holds every message, with a day row where a day starts', () => {
        const model = buildExportModel(listView(messages));
        expect(shape(model.rows)).toEqual([
            `day:${dayHeading(messages[0].ts)}`,
            ['hello'],
            ['are you there?'],
            ['yes'],
            `day:${dayHeading(messages[3].ts)}`,
            ['next day'],
        ]);
        expect(model.columns).toEqual([{ label: null, count: 4 }]);
        expect(model.headed).toBe(false);
        expect(model.messageCount).toBe(4);
    });

    it('names a conversation of one thread after the thread, and says who, when and how many', () => {
        const model = buildExportModel(listView(messages));
        expect(model.heading).toBe('T1');
        expect(model.facts).toEqual(['Ada and Bob', dateSpanText(messages), '4 messages']);
        expect(model.title).toBe('Support chats');
        expect(model.conversationLabel).toBeNull();
    });

    it("names one that spans threads after the object's title, or Conversation without one", () => {
        const mixed = [...messages, message('5', 'T2', 'other', { minutes: 3 })];
        expect(buildExportModel(listView(mixed)).heading).toBe('Support chats');
        expect(buildExportModel(listView(mixed, { layout: { title: ' ' } })).heading).toBe(
            'Conversation'
        );
    });

    it('shows the author once per cluster, as the object does', () => {
        const model = buildExportModel(listView(messages));
        const cells = model.rows
            .filter((row) => row.kind === 'messages')
            .map((row) => row.cells[0]);
        expect(cells.map((cell) => cell.showAuthor)).toEqual([true, false, true, true]);
        // Each cell keeps the message's index, by which its highlights are found.
        expect(cells.map((cell) => cell.index)).toEqual([0, 1, 2, 3]);
    });

    it('leaves the days out when the object does', () => {
        const model = buildExportModel(listView(messages, { settings: { dateSeparators: false } }));
        expect(model.rows.every((row) => row.kind === 'messages')).toBe(true);
    });

    it('answers null with nothing to export', () => {
        expect(buildExportModel(listView([]))).toBeNull();
        expect(buildExportModel(null)).toBeNull();
    });

    it('says when the export was made, by the date', () => {
        const model = buildExportModel(listView(messages), { now: Date.UTC(2026, 10, 18, 12) });
        expect(model.footer).toBe(exportedOnText(Date.UTC(2026, 10, 18, 12)));
        expect(model.footer).toMatch(/^Exported .*2026/);
    });
});

describe('buildExportModel, conversations side by side', () => {
    // Lanes by latest activity: T2 first, then T1.
    const messages = [
        message('1', 'T1', 'one opens', { minutes: 0 }),
        message('2', 'T2', 'two opens', { author: 'Bob', minutes: 0 }),
        message('3', 'T2', 'two again', { author: 'Bob', minutes: 10 }),
        message('4', 'T1', 'one closes', { minutes: 11 }),
        message('5', 'T2', 'two closes', { author: 'Cy', minutes: 30 }),
    ];

    it('lines the conversations up in time, a column each, as linked lanes do', () => {
        const view = boardView(messages);
        const model = buildExportModel(view);
        expect(model.columns.map((column) => column.label)).toEqual(
            view.board.lanes.map((lane) => lane.label)
        );
        expect(model.headed).toBe(true);
        const t2 = view.board.lanes.findIndex((lane) => lane.label === 'T2');
        const rows = shape(model.rows).filter((row) => Array.isArray(row));
        // Every message once, each in its own conversation's column.
        const inT2 = rows.map((row) => row[t2]).filter(Boolean);
        expect(inT2).toEqual(['two opens', 'two again', 'two closes']);
        expect(rows.flat().filter(Boolean)).toHaveLength(5);
        expect(model.heading).toBe('Support chats');
        expect(model.facts.at(-1)).toBe('2 conversations · 5 messages');
    });

    it('names an untitled object by how many conversations it holds', () => {
        const model = buildExportModel(boardView(messages, 'linked', { layout: {} }));
        expect(model.heading).toBe('2 conversations');
    });

    it('packs each conversation on its own with free scrolling, with its day inside its column', () => {
        const view = boardView(messages, 'free');
        const model = buildExportModel(view);
        const t1 = view.board.lanes.findIndex((lane) => lane.label === 'T1');
        expect(model.rows.every((row) => row.kind === 'messages')).toBe(true);
        expect(model.rows.map((row) => row.cells[t1]?.message.body ?? null)).toEqual([
            'one opens',
            'one closes',
            null,
        ]);
        expect(model.rows[0].cells[t1].day).toBe(dayHeading(messages[0].ts));
        expect(model.rows[1].cells[t1].day).toBeNull();
    });

    it('exports one lane on its own, under its own name', () => {
        const view = boardView(messages);
        const t1 = view.board.lanes.findIndex((lane) => lane.label === 'T1');
        const model = buildExportModel(view, { lane: t1 });
        expect(model.heading).toBe('T1');
        expect(model.conversationLabel).toBe('T1');
        expect(model.columns).toEqual([{ label: 'T1', count: 2 }]);
        expect(model.headed).toBe(false);
        expect(shape(model.rows).filter((row) => Array.isArray(row))).toEqual([
            ['one opens'],
            ['one closes'],
        ]);
        // Indices are the board's, which the highlights are kept by.
        const index = model.rows.find((row) => row.kind === 'messages').cells[0].index;
        expect(view.conversation.messages[index].body).toBe('one opens');
    });

    it('exports every lane when the lane asked for is not on the board', () => {
        expect(buildExportModel(boardView(messages), { lane: 7 }).columns).toHaveLength(2);
    });
});

describe('buildExportModel, notes and highlights', () => {
    const messages = [
        message('1', 'T1', 'hello', { minutes: 0 }),
        { ...message('2', 'T1', 'context', { minutes: 1 }), context: true },
    ];

    it('says what the message limit left out, and what faded messages are', () => {
        const view = listView(messages);
        view.conversation.meta = {
            truncated: true,
            rowsLoaded: 2,
            total: 9000,
            truncatedTo: 'newest',
        };
        const model = buildExportModel(view);
        expect(model.notes.map((note) => note.kind)).toEqual(['truncated', 'context']);
        expect(model.notes[0].text).toBe(
            'Older messages are not included: only the newest 2 of 9,000 messages were read.'
        );
    });

    it('draws a legend of the categories that occur', () => {
        const styles = {
            enabled: true,
            order: ['carrier', 'product'],
            byName: new Map([
                ['carrier', { name: 'carrier', line: '#aa0000' }],
                ['product', { name: 'product', line: '#00aa00' }],
            ]),
            none: { line: '#999999' },
        };
        const highlights = {
            answer: { kind: HIGHLIGHT_KINDS.VALUES, categories: { list: [] } },
            styles,
            settings: { category: { showLegend: true, showLabels: true } },
            result: {
                counts: { byCategory: new Map([['carrier', 3]]), none: 0 },
                messageCounts: { byCategory: new Map([['carrier', 1]]), none: 0 },
                byMessage: [],
            },
        };
        const model = buildExportModel(listView(messages, { highlights }));
        expect(model.legend).toEqual([{ label: 'carrier', color: '#aa0000' }]);
        expect(model.showLabels).toBe(true);
    });
});

describe('the words of the title block', () => {
    it('lists the people, then how many more there are', () => {
        expect(namesText([])).toBeNull();
        expect(namesText(['Ada'])).toBe('Ada');
        expect(namesText(['Ada', 'Bob', 'Cy'])).toBe('Ada, Bob and Cy');
        expect(namesText(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C, D and E');
        expect(namesText(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D and 2 others');
    });

    it('takes authors and recipients alike, once each, in the order they appear', () => {
        const messages = [
            message('1', 'T1', 'x', { author: 'Bob', recipients: ['Ada', 'Cy'] }),
            message('2', 'T1', 'y', { author: 'Ada', recipients: ['Bob'] }),
        ];
        expect(participantNames(messages)).toEqual(['Bob', 'Ada', 'Cy']);
    });

    it('writes one day, or the first and last', () => {
        const one = [
            message('1', 'T1', 'x', { minutes: 0 }),
            message('2', 'T1', 'y', { minutes: 9 }),
        ];
        expect(dateSpanText(one)).toMatch(/8/);
        expect(dateSpanText(one)).toMatch(/2026/);
        const two = [one[0], message('3', 'T1', 'z', { ts: one[0].ts + 4 * DAY })];
        expect(dateSpanText(two)).not.toBe(dateSpanText(one));
        expect(dateSpanText(two)).toMatch(/12/);
        expect(dateSpanText([message('4', 'T1', 'undated')])).toBeNull();
    });

    it('writes a day separator as the date itself, never Today', () => {
        expect(dayHeading(Date.now())).not.toMatch(/today/i);
        expect(dayHeading(Date.UTC(2026, 8, 8, 23, 30))).toMatch(/2026/);
    });

    it('writes what the limit left out by which end it kept', () => {
        expect(truncationNote({ truncated: false }, 3)).toBeNull();
        expect(
            truncationNote(
                { truncated: true, rowsLoaded: 50, total: 80, truncatedTo: 'oldest' },
                40
            )
        ).toBe('Newer messages are not included: only the oldest 50 of 80 rows were read.');
        expect(
            truncationNote({ truncated: true, rowsLoaded: 5, total: 8, truncatedTo: null }, 5)
        ).toBe('Some messages are not included: 5 of 8 messages were read.');
    });
});

describe('laneAt', () => {
    const board = buildBoard(
        [message('1', 'T1', 'a', { minutes: 0 }), message('2', 'T2', 'b', { minutes: 1 })],
        { max: 4, scroll: 'linked' }
    );

    /** An element inside another that carries an attribute. */
    const inside = (attribute, value) => {
        const outer = document.createElement('div');
        outer.setAttribute(attribute, value);
        const inner = document.createElement('span');
        outer.appendChild(inner);
        return inner;
    };

    it('reads the lane from the element right-clicked', () => {
        expect(laneAt(board, inside('data-lane', '1'))).toBe(1);
    });

    it('reads it from a bubble, by its message', () => {
        const index = board.messages.findIndex((each) => each.body === 'a');
        expect(laneAt(board, inside('data-message-index', String(index)))).toBe(
            board.laneOf[index]
        );
    });

    it('answers null outside a lane, without lanes, or for a lane not on the board', () => {
        expect(laneAt(board, document.createElement('div'))).toBeNull();
        expect(laneAt(null, inside('data-lane', '0'))).toBeNull();
        expect(laneAt(board, inside('data-lane', '5'))).toBeNull();
        expect(laneAt(board, null)).toBeNull();
    });
});
