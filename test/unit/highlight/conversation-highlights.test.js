import { describe, it, expect, vi } from 'vitest';

// Count matcher builds and text matches without changing what they find.
const counters = vi.hoisted(() => ({ builds: 0, matches: 0 }));
vi.mock('../../../src/match/index', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createValueMatcher: (rows, options) => {
            counters.builds += 1;
            const matcher = actual.createValueMatcher(rows, options);
            return {
                ...matcher,
                match: (...args) => {
                    counters.matches += 1;
                    return matcher.match(...args);
                },
            };
        },
    };
});

const {
    MAX_DRAWN_HIGHLIGHTS,
    NO_MESSAGE_HIGHLIGHTS,
    createConversationHighlighter,
    drawnCount,
    textOf,
} = await import('../../../src/highlight/conversation-highlights');

const OPTIONS = { caseSensitive: false, wholeValues: true, flexibleWhitespace: true };
const message = (id, body, over = {}) => ({ id, key: `k${id}`, body, bodyFormat: 'text', ...over });

const ROWS = [
    { value: 'reload', category: 'ops' },
    { value: 'task', category: 'ops' },
    { value: 'task', category: 'script' },
    { value: 'Swedish-locale', category: null },
];

const MESSAGES = [
    message('1', 'The reload failed, retry the reload'),
    message('2', 'Nothing to see'),
    message('3', 'The task ran, and a Swedish-locale date broke it'),
];

describe('createConversationHighlighter', () => {
    it('finds the values in every message, in offsets of that message', () => {
        const result = createConversationHighlighter().highlight({
            messages: MESSAGES,
            rows: ROWS,
            options: OPTIONS,
        });
        expect(result.byMessage[0].spans.map((s) => [s.start, s.end])).toEqual([
            [4, 10],
            [29, 35],
        ]);
        expect(result.byMessage[1]).toBe(NO_MESSAGE_HIGHLIGHTS);
        expect(result.byMessage[2].spans.map((s) => s.values)).toEqual([
            ['task'],
            ['Swedish-locale'],
        ]);
        expect(result.total).toBe(4);
        expect(result.messagesWith).toBe(2);
        expect([...result.firstStop]).toEqual([0, 2, 2, 4]);
        expect(result.indexByKey.get('k3')).toBe(2);
    });

    it('counts highlights and messages per category, a value in two categories in each', () => {
        const result = createConversationHighlighter().highlight({
            messages: MESSAGES,
            rows: ROWS,
            options: OPTIONS,
        });
        expect(result.counts.byCategory).toEqual(
            new Map([
                ['ops', 3],
                ['script', 1],
            ])
        );
        expect(result.counts.none).toBe(1);
        expect(result.messageCounts.byCategory).toEqual(
            new Map([
                ['ops', 2],
                ['script', 1],
            ])
        );
        expect(result.messageCounts.none).toBe(1);
    });

    it('answers the same object for the same messages, built again as a resize builds them', () => {
        const highlighter = createConversationHighlighter();
        const first = highlighter.highlight({ messages: MESSAGES, rows: ROWS, options: OPTIONS });
        const rebuilt = MESSAGES.map((m) => ({ ...m }));
        const again = highlighter.highlight({
            messages: rebuilt,
            rows: [...ROWS],
            options: { ...OPTIONS },
        });
        expect(again).toBe(first);
    });

    it('builds the matcher once, and matches a body it has seen only once', () => {
        counters.builds = 0;
        counters.matches = 0;
        const highlighter = createConversationHighlighter();
        highlighter.highlight({ messages: MESSAGES, rows: ROWS, options: OPTIONS });
        expect(counters.builds).toBe(1);
        expect(counters.matches).toBe(3);

        // A new message arrives: only it is matched, and the result is a new object.
        const more = [...MESSAGES, message('4', 'Another reload')];
        const result = highlighter.highlight({ messages: more, rows: ROWS, options: OPTIONS });
        expect(counters.builds).toBe(1);
        expect(counters.matches).toBe(4);
        expect(result.total).toBe(5);

        // A body that repeats is matched once.
        counters.matches = 0;
        const repeated = [message('5', 'Same reload'), message('6', 'Same reload')];
        createConversationHighlighter().highlight({
            messages: repeated,
            rows: ROWS,
            options: OPTIONS,
        });
        expect(counters.matches).toBe(1);
    });

    it('matches again, with a new matcher, when the values or the options change', () => {
        counters.builds = 0;
        const highlighter = createConversationHighlighter();
        highlighter.highlight({ messages: MESSAGES, rows: ROWS, options: OPTIONS });
        const caseSensitive = highlighter.highlight({
            messages: MESSAGES,
            rows: ROWS,
            options: { ...OPTIONS, caseSensitive: true },
        });
        expect(counters.builds).toBe(2);
        expect(caseSensitive.total).toBe(4);
        const other = highlighter.highlight({
            messages: MESSAGES,
            rows: [{ value: 'nothing', category: null }],
            options: OPTIONS,
        });
        expect(counters.builds).toBe(3);
        expect(other.total).toBe(1);
    });

    it('matches a markdown body in the text it renders, across its formatting', () => {
        const markdown = [
            message('1', 'Run the **re**load now', { bodyFormat: 'markdown' }),
            message('2', '- reload\n- task', { bodyFormat: 'markdown' }),
        ];
        const result = createConversationHighlighter().highlight({
            messages: markdown,
            rows: ROWS,
            options: OPTIONS,
        });
        expect(result.byMessage[0].text).toBe('Run the reload now');
        expect(result.byMessage[0].spans.map((s) => [s.start, s.end])).toEqual([[8, 14]]);
        // Two list items are two blocks, separated by NUL in the projection.
        expect(result.byMessage[1].text).toBe(`reload${String.fromCharCode(0)}task`);
        expect(result.total).toBe(3);
        expect(textOf(message('3', '**bold**', { bodyFormat: 'text' }), null)).toBe('**bold**');
    });

    it('projects a markdown body once, whatever the values or the options', () => {
        const project = vi.fn((body) => body.replaceAll('*', ''));
        const projections = { get: vi.fn((body) => project(body)) };
        const cached = new Map();
        projections.get.mockImplementation((body) => {
            if (!cached.has(body)) cached.set(body, project(body));
            return cached.get(body);
        });
        const highlighter = createConversationHighlighter({ projections });
        const markdown = [message('1', 'a **reload**', { bodyFormat: 'markdown' })];
        highlighter.highlight({ messages: markdown, rows: ROWS, options: OPTIONS });
        highlighter.highlight({
            messages: markdown,
            rows: [{ value: 'a', category: null }],
            options: { ...OPTIONS, wholeValues: false },
        });
        expect(project).toHaveBeenCalledTimes(1);
    });

    it('stops at the occurrence budget, says so, and does not keep a cut-short answer', () => {
        const words = Array.from({ length: 30 }, () => 'reload').join(' ');
        const messages = [message('1', words), message('2', words), message('3', words)];
        const highlighter = createConversationHighlighter({ occurrenceBudget: 50 });
        const result = highlighter.highlight({ messages, rows: ROWS, options: OPTIONS });
        expect(result.searchTruncated).toBe(true);
        // 30 in the first message, the 20 the budget leaves in the second, none in the third.
        expect(result.byMessage.map((m) => m.spans.length)).toEqual([30, 20, 0]);
        expect(result.total).toBe(50);
        expect(result.byMessage[2]).toBe(NO_MESSAGE_HIGHLIGHTS);

        // The same conversation again, cached or not, stops at the same place.
        const again = highlighter.highlight({
            messages: messages.map((m) => ({ ...m, key: `${m.key}-again` })),
            rows: ROWS,
            options: OPTIONS,
        });
        expect(again.byMessage.map((m) => m.spans.length)).toEqual([30, 20, 0]);
    });

    it('answers nothing without values, and drops values the markdown separator could join', () => {
        const highlighter = createConversationHighlighter();
        expect(
            highlighter.highlight({ messages: MESSAGES, rows: [], options: OPTIONS }).total
        ).toBe(0);
        const joined = highlighter.highlight({
            messages: MESSAGES,
            rows: [{ value: `reload${String.fromCharCode(0)}task`, category: null }],
            options: OPTIONS,
        });
        expect(joined.total).toBe(0);
    });

    it('matches a text outside the conversation, for the source of a markdown message', () => {
        const highlighter = createConversationHighlighter();
        expect(highlighter.matchPlain('reload')).toEqual([]);
        highlighter.highlight({ messages: MESSAGES, rows: ROWS, options: OPTIONS });
        expect(highlighter.matchPlain('**reload** the task').map((s) => s.values)).toEqual([
            ['reload'],
            ['task'],
        ]);
    });
});

describe('drawnCount', () => {
    const result = {
        byMessage: [{ spans: new Array(15_000) }, { spans: new Array(15_000) }, { spans: [] }],
        firstStop: Int32Array.from([0, 15_000, 30_000, 30_000]),
    };

    it('draws every highlight in a virtualized list, which draws only what is on screen', () => {
        expect(drawnCount(result, 1, false)).toBe(15_000);
    });

    it('draws the first highlights of the conversation when every message is rendered', () => {
        expect(drawnCount(result, 0, true)).toBe(15_000);
        expect(drawnCount(result, 1, true)).toBe(MAX_DRAWN_HIGHLIGHTS - 15_000);
        expect(drawnCount(result, 2, true)).toBe(0);
        expect(drawnCount(undefined, 0, true)).toBe(0);
    });
});
