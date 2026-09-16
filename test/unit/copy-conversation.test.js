import { describe, it, expect, vi } from 'vitest';
import { copyConversation } from '../../src/export/copy-conversation';

const view = {
    conversation: {
        messages: [
            { id: '1', author: { label: 'Ada' }, body: 'hello', bodyFormat: 'text', kpis: [] },
            { id: '2', author: { label: 'Bob' }, body: 'hi', bodyFormat: 'text', kpis: [] },
        ],
        meta: { total: 2, truncated: false },
        diagnostics: [],
    },
    settings: { order: 'newest' },
    highlights: null,
};

describe('copyConversation', () => {
    it('copies the transcript, and says how many messages', async () => {
        const copy = vi.fn(async () => true);
        await expect(
            copyConversation({ view, format: 'text', copy, version: '1' })
        ).resolves.toEqual({
            level: 'info',
            text: 'Copied 2 messages as text',
        });
        expect(copy).toHaveBeenCalledWith('Ada\nhello\n\nBob\nhi\n');
    });

    it('copies JSON a program can parse, in the order shown', async () => {
        const copy = vi.fn(async () => true);
        const notice = await copyConversation({
            view,
            format: 'json',
            copy,
            version: '0.4.0',
            now: new Date('2026-09-16T12:00:00Z'),
            projectionOf: (body) => body,
        });
        expect(notice.text).toBe('Copied 2 messages as JSON');
        const json = JSON.parse(copy.mock.calls[0][0]);
        expect(json).toMatchObject({
            extensionVersion: '0.4.0',
            exportedAt: '2026-09-16T12:00:00.000Z',
            conversation: { messages: 2, order: 'newest' },
        });
    });

    it('says how many conversations the messages came from, side by side', async () => {
        const copy = vi.fn(async () => true);
        const board = {
            total: 5,
            lanes: [
                { label: 'A', indices: [0] },
                { label: 'B', indices: [1] },
            ],
        };
        const notice = await copyConversation({
            view: { ...view, board },
            format: 'text',
            copy,
            version: '1',
        });
        expect(notice.text).toBe('Copied 2 messages from 2 conversations as text');
        expect(copy.mock.calls[0][0]).toBe(
            '2 of 5 conversations\n\nConversation: A\n\nAda\nhello\n\nConversation: B\n\nBob\nhi\n'
        );
    });

    it('says when the browser did not allow copying', async () => {
        const copy = vi.fn(async () => false);
        await expect(copyConversation({ view, format: 'text', copy })).resolves.toEqual({
            level: 'error',
            text: 'The browser did not allow copying to the clipboard',
        });
    });

    it('copies nothing without a conversation', async () => {
        const copy = vi.fn();
        await expect(copyConversation({ view: null, format: 'text', copy })).resolves.toBeNull();
        expect(copy).not.toHaveBeenCalled();
    });
});
