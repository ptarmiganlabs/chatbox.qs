import { describe, it, expect } from 'vitest';
import { assignBubbleKeys, collapseKey, collapseRecords } from '../../src/chat/collapse';

const record = (over = {}) => ({
    id: '7',
    elem: 7,
    authorKey: 'Ada',
    threadId: null,
    body: 'hello',
    ts: 1,
    rowCount: 1,
    merged: false,
    sideHint: null,
    kpis: [],
    ...over,
});

describe('collapseKey', () => {
    it('keys a real message id on id, author and thread', () => {
        expect(collapseKey(record())).not.toBeNull();
        expect(collapseKey(record({ threadId: 'T1' }))).not.toBe(collapseKey(record()));
        expect(collapseKey(record({ authorKey: 'Bob' }))).not.toBe(collapseKey(record()));
    });

    it('refuses to key a null or synthetic message id', () => {
        expect(collapseKey(record({ elem: -2 }))).toBeNull();
        expect(collapseKey(record({ elem: undefined }))).toBeNull();
    });
});

describe('collapseRecords', () => {
    it('folds matching rows and splits rows whose content differs', () => {
        const { messages, conflictCount } = collapseRecords([
            record(),
            record(),
            record({ body: 'different' }),
            record({ body: 'different' }),
        ]);
        expect(messages.map((m) => [m.body, m.rowsCollapsed])).toEqual([
            ['hello', 2],
            ['different', 2],
        ]);
        expect(conflictCount).toBe(1);
    });

    it('treats a different timestamp as a different message', () => {
        const { messages } = collapseRecords([record({ ts: 1 }), record({ ts: 2 })]);
        expect(messages).toHaveLength(2);
    });

    it('tolerates a missing record list', () => {
        expect(collapseRecords(undefined)).toEqual({
            messages: [],
            conflictCount: 0,
            lastBubble: null,
        });
    });
});

describe('assignBubbleKeys', () => {
    it('keeps unique ids as keys', () => {
        const messages = assignBubbleKeys([{ id: 'a' }, { id: 'b' }]);
        expect(messages.map((m) => m.key)).toEqual(['a', 'b']);
    });

    it('skips a suffix that is another message’s real id', () => {
        const messages = assignBubbleKeys([{ id: '5' }, { id: '5' }, { id: '5#2' }]);
        expect(messages.map((m) => m.key)).toEqual(['5', '5#3', '5#2']);
        expect(new Set(messages.map((m) => m.key)).size).toBe(3);
    });
});
