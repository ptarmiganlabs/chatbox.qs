import { describe, it, expect } from 'vitest';
import { dayKey } from '../../src/chat/grouping';
import { normalize } from '../../src/chat/normalize';
import { HIGHLIGHT_KINDS } from '../../src/qix/highlight-source';
import { createHighlightView } from '../../src/highlight/highlight-view';
import { projectMarkdown } from '../../src/highlight/markdown-projection';
import {
    EXPORT_SCHEMA_VERSION,
    conversationJson,
    conversationText,
} from '../../src/export/conversation-export';
import { ZONE_NAMES, inTimeZone } from '../helpers/time-zones';

const person = (label) => ({ key: label, label });
const MESSAGES = [
    {
        id: '1',
        key: 'k1',
        author: person('Ada'),
        recipients: [person('Bob'), person('Cy'), person('Dan'), person('Eve')],
        body: 'Please reload the task',
        bodyFormat: 'text',
        ts: Date.UTC(2026, 8, 14, 10, 32),
        tsText: '2026-09-14 10:32',
        threadId: 't1',
        kind: 'chat',
        badge: null,
        kpis: [{ key: 'm', label: 'Sentiment', text: '0.8', num: 0.8, varies: false }],
    },
    {
        id: '2',
        key: 'k2',
        author: person('Bob'),
        recipients: null,
        body: 'Done: the **re**load worked\n\n- task',
        bodyFormat: 'markdown',
        ts: null,
        tsText: null,
        threadId: null,
        kind: null,
        badge: 'ok',
        kpis: [],
    },
    {
        id: '3',
        key: 'k3',
        author: person('Cy'),
        recipients: null,
        body: '',
        bodyFormat: 'text',
        kpis: [],
    },
];
const conversation = {
    messages: MESSAGES,
    meta: { total: 3, truncated: false },
    diagnostics: [],
};

describe('conversationText', () => {
    it('writes a readable transcript: who to whom and when, then the body as written', () => {
        expect(conversationText(conversation)).toBe(
            [
                dayKey(MESSAGES[0].ts),
                '',
                'Ada → Bob, Cy, Dan, Eve · 2026-09-14 10:32',
                'Please reload the task',
                '',
                'Bob',
                'Done: the **re**load worked',
                '',
                '- task',
                '',
                'Cy',
                '(no text)',
                '',
            ].join('\n')
        );
    });

    it('says first when the message limit left messages out', () => {
        const cut = {
            ...conversation,
            diagnostics: [
                {
                    code: 'truncated',
                    message: 'Showing 3 of 12000 messages. Filter to see the rest.',
                },
            ],
        };
        expect(conversationText(cut).split('\n').slice(0, 3)).toEqual([
            'Showing 3 of 12000 messages. Filter to see the rest.',
            '',
            dayKey(MESSAGES[0].ts),
        ]);
    });

    // Found on the server: the object's time expression showed only the time, so a transcript of a
    // conversation over two days could not say which day a message was from. On screen the day
    // separators say it.
    it('starts each day with its date, since the time as shown may not say which day', () => {
        // Timestamps as Qlik timestamps give them: wall-clock times, read as UTC.
        const at = (day, hour) => Date.UTC(2026, 8, day, hour, 5);
        const message = (id, ts, tsText) => ({
            id,
            key: `k${id}`,
            author: person('Ada'),
            body: `message ${id}`,
            bodyFormat: 'text',
            ts,
            tsText,
            kpis: [],
        });
        const days = {
            messages: [
                message('1', at(8, 8), '08:05'),
                message('2', at(8, 9), '09:05'),
                message('3', null, null),
                message('4', at(9, 10), '10:05'),
            ],
            diagnostics: [],
        };
        expect(conversationText(days).split('\n')).toEqual([
            '2026-09-08',
            '',
            'Ada · 08:05',
            'message 1',
            '',
            'Ada · 09:05',
            'message 2',
            '',
            'Ada',
            'message 3',
            '',
            '2026-09-09',
            '',
            'Ada · 10:05',
            'message 4',
            '',
        ]);
    });
});

describe('conversationJson', () => {
    const options = {
        projectionOf: projectMarkdown,
        exportedAt: '2026-09-16T12:00:00.000Z',
        version: '0.4.0',
        order: 'oldest',
    };

    it('describes the export and every message, without highlights while they are off', () => {
        const json = conversationJson(conversation, options);
        expect(json).toMatchObject({
            export: 'chatbox.qs conversation',
            schemaVersion: EXPORT_SCHEMA_VERSION,
            exportedAt: '2026-09-16T12:00:00.000Z',
            extensionVersion: '0.4.0',
            conversation: {
                messages: 3,
                rows: 3,
                rowsRead: 3,
                truncated: false,
                truncatedTo: null,
                order: 'oldest',
            },
            highlights: null,
        });
        expect(json.messages[0]).toEqual({
            id: '1',
            author: 'Ada',
            recipients: ['Bob', 'Cy', 'Dan', 'Eve'],
            thread: 't1',
            time: '2026-09-14T10:32:00.000',
            timeText: '2026-09-14 10:32',
            kind: 'chat',
            badge: null,
            format: 'text',
            body: 'Please reload the task',
            kpis: [{ label: 'Sentiment', text: '0.8', number: 0.8, varies: false }],
        });
        expect(json.messages[1]).toMatchObject({
            format: 'markdown',
            plainText: 'Done: the reload worked\ntask',
            badge: 'ok',
            recipients: null,
        });
        expect(JSON.parse(JSON.stringify(json))).toEqual(json);
    });

    // The README says what `time` means; this holds it to that in every zone (GOTCHAS 32).
    describe('time', () => {
        const late = { ...MESSAGES[0], ts: Date.UTC(2026, 8, 8, 23, 30), tsText: '23:30' };
        const instant = { ...late, ts: Date.UTC(2026, 8, 8, 21, 30), tsInstant: true };
        const timesIn = (zone) =>
            inTimeZone(zone, () =>
                conversationJson(
                    { ...conversation, messages: [late, instant] },
                    options
                ).messages.map((message) => message.time)
            );

        it.each(ZONE_NAMES)('has no zone for a Qlik timestamp, Z for an instant: %s', (zone) => {
            expect(timesIn(zone)).toEqual([
                // 23:30 as the data holds it: a Qlik timestamp has no time zone.
                '2026-09-08T23:30:00.000',
                // A real moment, in UTC.
                '2026-09-08T21:30:00.000Z',
            ]);
        });

        it.each(ZONE_NAMES)('reads back as the time the data holds, in a program in %s', (zone) => {
            const [wallClock] = timesIn('UTC');
            inTimeZone(zone, () => {
                // A date and time with no zone is a local time to a program reading it.
                const read = new Date(wallClock);
                expect([read.getDate(), read.getHours(), read.getMinutes()]).toEqual([8, 23, 30]);
            });
        });

        it('says it is schema 2, since schema 1 wrote Z on every time', () => {
            expect(conversationJson(conversation, options).schemaVersion).toBe(2);
            expect(EXPORT_SCHEMA_VERSION).toBe(2);
        });

        it('is null without a time', () => {
            const undated = [
                { ...late, ts: null },
                { ...late, ts: Number.NaN, tsInstant: true },
            ];
            const { messages } = conversationJson({ ...conversation, messages: undated }, options);
            expect(messages.map((message) => message.time)).toEqual([null, null]);
        });

        it('writes a timestamp in Unix seconds as the instant it is, rather than throwing', () => {
            // Regression: seconds were read as a day serial past what a Date can hold, so toISOString
            // threw and the whole conversation failed to copy as JSON.
            const { messages } = normalize({
                layout: {
                    qHyperCube: {
                        qSize: { qcx: 4, qcy: 1 },
                        qDimensionInfo: [
                            { cId: 'd_msgid', qAttrExprInfo: [{ id: 'ts' }] },
                            { cId: 'd_author' },
                        ],
                        qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
                    },
                },
                rows: [
                    [
                        {
                            qText: '1',
                            qElemNumber: 0,
                            qAttrExps: { qValues: [{ qNum: Date.UTC(2026, 8, 8, 21, 30) / 1000 }] },
                        },
                        { qText: 'Ada', qElemNumber: 0, qState: 'O' },
                        { qText: 'hello', qNum: 'NaN' },
                        { qText: '1', qNum: 1 },
                    ],
                ],
            });
            const json = conversationJson({ ...conversation, messages }, options);
            expect(json.messages.map((message) => message.time)).toEqual([
                '2026-09-08T21:30:00.000Z',
            ]);
        });
    });

    describe('which rows the message limit kept', () => {
        /** A participant cube of `qcy` rows, with the given rows read from `qTop`, normalized. */
        const normalized = ({ qcy, qTop, count, order = 'oldest' }) =>
            normalize({
                layout: {
                    qHyperCube: {
                        qSize: { qcx: 5, qcy },
                        qDimensionInfo: [
                            { cId: 'd_msgid' },
                            { cId: 'd_author' },
                            { cId: 'd_thread' },
                        ],
                        qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
                    },
                },
                rows: Array.from({ length: count }, (_, i) => [
                    {
                        qText: String(qTop + i + 1),
                        qElemNumber: qTop + i,
                        qAttrExps: { qValues: [] },
                    },
                    { qText: 'Ada', qElemNumber: 0, qState: 'O' },
                    { qText: 'T1', qElemNumber: 0 },
                    { qText: `message ${qTop + i + 1}`, qNum: 'NaN' },
                    { qText: '1', qNum: 1 },
                ]),
                props: { order },
                area: { qTop, qLeft: 0 },
            });

        it('says the newest rows were kept when rows before them were left out', () => {
            const cut = normalized({ qcy: 12000, qTop: 11997, count: 3, order: 'newest' });
            expect(conversationJson(cut, { ...options, order: 'newest' }).conversation).toEqual({
                messages: 3,
                rows: 12000,
                rowsRead: 3,
                truncated: true,
                truncatedTo: 'newest',
                order: 'newest',
            });
        });

        it('says the oldest rows were kept when rows after them were left out', () => {
            const cut = normalized({ qcy: 12000, qTop: 0, count: 3 });
            expect(conversationJson(cut, options).conversation).toMatchObject({
                rows: 12000,
                rowsRead: 3,
                truncated: true,
                truncatedTo: 'oldest',
            });
        });

        it('says no rows were cut when every row was read', () => {
            const whole = normalized({ qcy: 3, qTop: 0, count: 3 });
            const { conversation: summary } = conversationJson(whole, options);
            expect(summary).toMatchObject({ truncated: false, truncatedTo: null });
            expect(summary.rowsRead).toBe(summary.rows);
        });

        it('counts the rows read, not the messages, when a message spans several rows', () => {
            const meta = { total: 9, rowsLoaded: 6, truncated: true, truncatedTo: 'oldest' };
            const { conversation: summary } = conversationJson({ ...conversation, meta }, options);
            expect(summary).toMatchObject({ messages: 3, rows: 9, rowsRead: 6 });
        });

        it('writes null for anything but the oldest or the newest', () => {
            for (const truncatedTo of [undefined, null, 'middle']) {
                const meta = { total: 9, rowsLoaded: 3, truncated: true, truncatedTo };
                expect(
                    conversationJson({ ...conversation, meta }, options).conversation.truncatedTo
                ).toBeNull();
            }
        });
    });

    it('carries the highlights, with offsets that slice the body or the rendered markdown', () => {
        const layout = {
            chatbox: { highlight: { field: 'match' }, category: { field: 'pattern' } },
        };
        const highlights = createHighlightView().build({
            tagged: {
                answer: {
                    kind: HIGHLIGHT_KINDS.VALUES,
                    field: 'match',
                    source: 'selected',
                    total: 2,
                    values: ['reload', 'task'],
                    rows: [
                        { value: 'reload', category: 'ops' },
                        { value: 'task', category: 'ops' },
                        { value: 'task', category: 'script' },
                    ],
                    truncated: false,
                    categories: { field: 'pattern', problem: null, expression: null, list: [] },
                },
                derivedFrom: layout,
                version: 0,
            },
            layout,
            version: 0,
            messages: MESSAGES,
        });
        const json = conversationJson(conversation, { ...options, highlights });
        expect(json.highlights).toEqual({
            field: 'match',
            source: 'selected',
            values: 2,
            valuesLeftOut: false,
            categoryField: 'pattern',
            total: 4,
            messagesWith: 2,
            searchTruncated: false,
            categories: [
                { name: 'ops', highlights: 4, messages: 2 },
                { name: 'script', highlights: 2, messages: 2 },
            ],
            noCategory: { highlights: 0, messages: 0 },
        });
        const [text, markdown, empty] = json.messages;
        expect(
            text.highlights.map((h) => [h.text, text.body.slice(h.start, h.end), h.categories])
        ).toEqual([
            ['reload', 'reload', ['ops']],
            ['task', 'task', ['ops', 'script']],
        ]);
        expect(markdown.highlights.map((h) => markdown.plainText.slice(h.start, h.end))).toEqual([
            'reload',
            'task',
        ]);
        expect(empty.highlights).toEqual([]);
    });
});

describe('conversations side by side', () => {
    const at = (day, hour) => Date.UTC(2026, 8, day, hour, 5);
    const message = (id, thread, ts, body = `message ${id}`) => ({
        id,
        key: `k${id}`,
        author: person('Ada'),
        body,
        bodyFormat: 'text',
        ts,
        tsText: null,
        threadId: thread,
        kpis: [],
    });
    // Linked scrolling interleaves the lanes: B's message sits between A's two.
    const messages = [
        message('1', 'A', at(8, 8)),
        message('2', 'B', at(8, 9), 'reload B'),
        message('3', 'A', at(9, 10), 'reload A'),
    ];
    const board = {
        total: 3,
        lanes: [
            { label: 'A', indices: Int32Array.from([0, 2]) },
            { label: 'B', indices: Int32Array.from([1]) },
        ],
    };

    it('writes each conversation under its name, with its own days', () => {
        expect(conversationText({ messages, diagnostics: [] }, { board }).split('\n')).toEqual([
            '2 of 3 conversations',
            '',
            'Conversation: A',
            '',
            '2026-09-08',
            '',
            'Ada',
            'message 1',
            '',
            '2026-09-09',
            '',
            'Ada',
            'reload A',
            '',
            'Conversation: B',
            '',
            '2026-09-08',
            '',
            'Ada',
            'reload B',
            '',
        ]);
    });

    it('writes the JSON conversation by conversation, with each message’s own highlights', () => {
        const view = createHighlightView();
        const highlights = view.build({
            tagged: {
                answer: {
                    kind: HIGHLIGHT_KINDS.VALUES,
                    field: 'match',
                    source: 'selected',
                    values: ['reload'],
                    rows: [{ value: 'reload', category: null }],
                    truncated: false,
                    categories: null,
                },
            },
            layout: { chatbox: {} },
            version: 0,
            messages,
        });
        const json = conversationJson(
            { messages, meta: { total: 3 }, diagnostics: [] },
            { highlights, projectionOf: (body) => body, exportedAt: 'now', version: '1', board }
        );
        expect(json.conversation.conversations).toEqual({ shown: 2, total: 3 });
        expect(json.messages.map((m) => [m.id, m.thread, m.highlights.length])).toEqual([
            ['1', 'A', 0],
            ['3', 'A', 1],
            ['2', 'B', 1],
        ]);
        expect(json.messages[2].highlights[0].text).toBe('reload');
    });
});
