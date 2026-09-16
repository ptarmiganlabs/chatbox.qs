import { describe, it, expect, vi } from 'vitest';
import {
    NO_MESSAGE_FINDS,
    createConversationFinder,
    partOf,
} from '../../../src/highlight/conversation-finder';

const person = (label) => ({ key: label, label, unknown: false });
const message = (id, body, over = {}) => ({
    id,
    key: `k${id}`,
    body,
    bodyFormat: 'text',
    authorKey: 'Ada',
    author: person('Ada Lovelace'),
    recipients: null,
    ts: null,
    side: 'left',
    ...over,
});

const MESSAGES = [
    message('1', 'Ada asked about the reload'),
    message('2', 'Reload done', { authorKey: 'Bob', author: person('Bob Ada') }),
    message('3', 'nothing here', { authorKey: 'Bob', author: person('Bob Ada') }),
];

describe('createConversationFinder', () => {
    it('finds the query in bodies and in the names of header lines, in stop order', () => {
        const result = createConversationFinder().find({
            messages: MESSAGES,
            query: 'ada',
            gapSec: 120,
        });
        // Message 1: author "Ada Lovelace", then body "Ada asked".
        expect(result.byMessage[0].author.map((s) => [s.start, s.end])).toEqual([[0, 3]]);
        expect(result.byMessage[0].body.map((s) => [s.start, s.end])).toEqual([[0, 3]]);
        // Message 2: "Bob Ada" in its header line; message 3 continues Bob's cluster, without a header.
        expect(result.byMessage[1].author.map((s) => s.start)).toEqual([4]);
        expect(result.byMessage[2]).toBe(NO_MESSAGE_FINDS);
        expect([...result.firstStop]).toEqual([0, 2, 3, 3]);
        expect(result.total).toBe(3);
        expect(result.messagesWith).toBe(2);
        expect(result.indexByKey.get('k2')).toBe(1);
    });

    it('searches names only where the header line is shown, which the gap decides', () => {
        const timed = [message('1', 'x', { ts: 0 }), message('2', 'y', { ts: 10 * 60 * 1000 })];
        const finder = createConversationFinder();
        expect(finder.find({ messages: timed, query: 'lovelace', gapSec: 120 }).total).toBe(2);
        expect(finder.find({ messages: timed, query: 'lovelace', gapSec: 3600 }).total).toBe(1);
    });

    it('searches the recipients as shown, three names and "and N more"', () => {
        const recipients = ['Cy', 'Dan', 'Eve', 'Zoe'].map(person);
        const group = [message('1', 'hello', { recipients })];
        const finder = createConversationFinder();
        expect(
            finder.find({ messages: group, query: 'eve', gapSec: 120 }).byMessage[0].recipients
        ).toHaveLength(1);
        expect(finder.find({ messages: group, query: 'zoe', gapSec: 120 }).total).toBe(0);
        expect(finder.find({ messages: group, query: '1 more', gapSec: 120 }).total).toBe(1);
    });

    it('matches like a find box: case ignored, flexible whitespace, inside words, literally', () => {
        const finder = createConversationFinder();
        const body = [message('1', 'Reloading the\n  TASK list: a.b and axb')];
        expect(finder.find({ messages: body, query: 'LOAD', gapSec: 120 }).total).toBe(1);
        expect(finder.find({ messages: body, query: 'the task', gapSec: 120 }).total).toBe(1);
        expect(finder.find({ messages: body, query: 'a.b', gapSec: 120 }).total).toBe(1);
    });

    it('searches a markdown body in the text it renders', () => {
        const markdown = [message('1', 'The **re**load _now_', { bodyFormat: 'markdown' })];
        const result = createConversationFinder().find({
            messages: markdown,
            query: 'reload now',
            gapSec: 120,
        });
        expect(result.byMessage[0].text).toBe('The reload now');
        expect(result.byMessage[0].body.map((s) => [s.start, s.end])).toEqual([[4, 14]]);
    });

    it('answers null for a query with nothing to search for', () => {
        const finder = createConversationFinder();
        expect(finder.find({ messages: MESSAGES, query: '', gapSec: 120 })).toBeNull();
        expect(finder.find({ messages: MESSAGES, query: '   ', gapSec: 120 })).toBeNull();
    });

    it('answers the same object for the same query over the same messages, rebuilt', () => {
        const finder = createConversationFinder();
        const first = finder.find({ messages: MESSAGES, query: 'ada', gapSec: 120 });
        const rebuilt = MESSAGES.map((m) => ({ ...m, author: { ...m.author } }));
        expect(finder.find({ messages: rebuilt, query: 'ada', gapSec: 120 })).toBe(first);
        expect(finder.find({ messages: rebuilt, query: 'reload', gapSec: 120 })).not.toBe(first);
    });

    it('projects a markdown body once, shared with highlighting', () => {
        const projections = { get: vi.fn((body) => body.replaceAll('*', '')) };
        const finder = createConversationFinder({ projections });
        const markdown = [message('1', '**a** b', { bodyFormat: 'markdown' })];
        finder.find({ messages: markdown, query: 'a b', gapSec: 120 });
        expect(projections.get).toHaveBeenCalledWith('**a** b');
    });

    it('stops at the budget, and says so', () => {
        const many = [message('1', 'a '.repeat(40)), message('2', 'a '.repeat(40))];
        const result = createConversationFinder({ budget: 50 }).find({
            messages: many,
            query: 'a',
            gapSec: 120,
        });
        expect(result.truncated).toBe(true);
        expect(result.total).toBe(50);
    });

    it('searches one text on its own, for a markdown quote', () => {
        const finder = createConversationFinder();
        expect(finder.findPlain('**re**load reload', 'reload').map((s) => s.start)).toEqual([11]);
        expect(finder.findPlain('text', '')).toEqual([]);
    });
});

describe('partOf', () => {
    const entry = { author: [{}], recipients: [], body: [{}, {}] };

    it('finds the part a stop in a message is in, author first', () => {
        expect(partOf(entry, 0)).toEqual({ part: 'author', ordinal: 0 });
        expect(partOf(entry, 1)).toEqual({ part: 'body', ordinal: 0 });
        expect(partOf(entry, 2)).toEqual({ part: 'body', ordinal: 1 });
        expect(partOf(entry, 3)).toBeNull();
    });
});
