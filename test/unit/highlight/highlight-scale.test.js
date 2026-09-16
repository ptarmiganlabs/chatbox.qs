import { describe, it, expect, vi } from 'vitest';
import { fastestTime } from '../../helpers/timing';

// Count matcher builds and text matches, to pin the work a render does, not only its time.
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

const { createConversationHighlighter } =
    await import('../../../src/highlight/conversation-highlights');

/** The size of the ChatBig fixture on the PTLAB server. */
const COUNT = 12_000;
const OPTIONS = { caseSensitive: false, wholeValues: true, flexibleWhitespace: true };

/** A thousand keyword values in ten categories, like a term-extraction table. */
const ROWS = Array.from({ length: 1000 }, (_, i) => ({
    value: `user${i}@example.se`,
    category: `c${i % 10}`,
}));

/** Generated messages, some mentioning keywords, as normalize() builds them. */
function messages(count) {
    return Array.from({ length: count }, (_, i) => ({
        id: String(i + 1),
        key: String(i + 1),
        bodyFormat: 'text',
        body: `Generated message ${i + 1}: please mail user${i % 1200}@example.se about the reload`,
    }));
}

describe('highlighting at scale: 12,000 messages', () => {
    it('finds the values in every message in a time a render can afford', () => {
        const highlighter = createConversationHighlighter();
        const list = messages(COUNT);
        const started = performance.now();
        const result = highlighter.highlight({ messages: list, rows: ROWS, options: OPTIONS });
        const elapsed = performance.now() - started;
        // 1,000 of every 1,200 messages name a keyword.
        expect(result.messagesWith).toBe(10_000);
        expect(elapsed).toBeLessThan(2000);
    });

    it('builds the matcher once for the whole conversation, never per message — regression', () => {
        // Rebuilding the automaton for each message took 270 ms for 500 messages on Node 24.
        counters.builds = 0;
        createConversationHighlighter().highlight({
            messages: messages(COUNT),
            rows: ROWS,
            options: OPTIONS,
        });
        expect(counters.builds).toBe(1);
    });

    it('does nothing again for a render that brings the same messages, as a resize does', () => {
        const highlighter = createConversationHighlighter();
        const first = highlighter.highlight({
            messages: messages(COUNT),
            rows: ROWS,
            options: OPTIONS,
        });
        counters.matches = 0;
        const rebuilt = messages(COUNT);
        const started = performance.now();
        const again = highlighter.highlight({ messages: rebuilt, rows: ROWS, options: OPTIONS });
        expect(performance.now() - started).toBeLessThan(100);
        expect(again).toBe(first);
        expect(counters.matches).toBe(0);
    });

    it('matches only the new messages when the conversation grows', () => {
        const highlighter = createConversationHighlighter();
        highlighter.highlight({ messages: messages(COUNT), rows: ROWS, options: OPTIONS });
        counters.matches = 0;
        highlighter.highlight({ messages: messages(COUNT + 10), rows: ROWS, options: OPTIONS });
        expect(counters.matches).toBe(10);
    });

    it('does not degrade super-linearly from 3,000 to 12,000 messages', () => {
        const small = messages(3000);
        const large = messages(COUNT);
        // A fresh highlighter each run, so the time is the matching and not the cache.
        const smallTime = Math.max(
            fastestTime(() =>
                createConversationHighlighter().highlight({
                    messages: small,
                    rows: ROWS,
                    options: OPTIONS,
                })
            ),
            1
        );
        const largeTime = fastestTime(() =>
            createConversationHighlighter().highlight({
                messages: large,
                rows: ROWS,
                options: OPTIONS,
            })
        );
        expect(largeTime / smallTime).toBeLessThan(12);
    });
});

describe('highlighting at scale: 12,000 markdown messages', () => {
    /** Generated markdown messages, each a different body. */
    function markdownMessages(count) {
        return Array.from({ length: count }, (_, i) => ({
            id: String(i + 1),
            key: String(i + 1),
            bodyFormat: 'markdown',
            body: `**Message ${i + 1}**: mail \`user${i % 1200}@example.se\` about the _reload_`,
        }));
    }

    it(
        'projects and matches every body once, in a time a first render can afford',
        { timeout: 30_000 },
        () => {
            // Parsing is about 0.07 ms a body on Node 24; slower clients take two or three times that.
            const highlighter = createConversationHighlighter();
            const list = markdownMessages(COUNT);
            const started = performance.now();
            const result = highlighter.highlight({ messages: list, rows: ROWS, options: OPTIONS });
            expect(performance.now() - started).toBeLessThan(8000);
            expect(result.messagesWith).toBe(10_000);
        }
    );

    it('never parses a body again when only the values change', { timeout: 30_000 }, () => {
        const highlighter = createConversationHighlighter();
        const list = markdownMessages(COUNT);
        highlighter.highlight({ messages: list, rows: ROWS, options: OPTIONS });
        const started = performance.now();
        const result = highlighter.highlight({
            messages: list,
            rows: ROWS.slice(0, 500),
            options: OPTIONS,
        });
        expect(performance.now() - started).toBeLessThan(2000);
        expect(result.messagesWith).toBeLessThan(10_000);
    });
});
