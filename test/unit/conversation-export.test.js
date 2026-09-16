import { describe, it, expect } from 'vitest';
import { HIGHLIGHT_KINDS } from '../../src/qix/highlight-source';
import { createHighlightView } from '../../src/highlight/highlight-view';
import { projectMarkdown } from '../../src/highlight/markdown-projection';
import {
    EXPORT_SCHEMA_VERSION,
    conversationJson,
    conversationText,
} from '../../src/export/conversation-export';

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
            'Ada → Bob, Cy, Dan, Eve · 2026-09-14 10:32',
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
            conversation: { messages: 3, rows: 3, truncated: false, order: 'oldest' },
            highlights: null,
        });
        expect(json.messages[0]).toEqual({
            id: '1',
            author: 'Ada',
            recipients: ['Bob', 'Cy', 'Dan', 'Eve'],
            thread: 't1',
            time: '2026-09-14T10:32:00.000Z',
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
