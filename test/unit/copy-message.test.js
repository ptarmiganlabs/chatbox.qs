import { describe, it, expect, vi } from 'vitest';
import { copyMessage } from '../../src/export/copy-message';
import { messageText } from '../../src/export/conversation-export';

const message = {
    id: '1',
    author: { label: 'Ada' },
    recipients: [{ label: 'Bob' }, { label: 'Cy' }],
    tsText: '10:32',
    body: 'the reload failed',
};

describe('messageText', () => {
    it('writes the two lines a whole transcript gives a message', () => {
        expect(messageText(message)).toBe('Ada → Bob, Cy · 10:32\nthe reload failed');
    });

    it('writes the markdown that was typed, not the text it renders', () => {
        // It is what the reader would select with the mouse, and the only form that pastes back as
        // the message it was.
        expect(messageText({ ...message, bodyFormat: 'markdown', body: '**New** York' })).toMatch(
            /\*\*New\*\* York$/
        );
    });

    it('leaves out the parts a message does not have', () => {
        expect(messageText({ author: { label: 'Ada' }, body: 'hi' })).toBe('Ada\nhi');
        expect(messageText({ body: 'hi' })).toBe('hi');
        expect(messageText({ author: { label: 'Ada' } })).toBe('Ada');
    });
});

describe('copyMessage', () => {
    it('copies the message and says so', async () => {
        const copy = vi.fn().mockResolvedValue(true);
        const notice = await copyMessage({ message, copy });
        expect(copy).toHaveBeenCalledWith('Ada → Bob, Cy · 10:32\nthe reload failed');
        expect(notice).toEqual({ level: 'info', text: 'Copied the message' });
    });

    it('says when the browser refused, rather than looking as though it worked', async () => {
        // Client-managed Sense is often plain HTTP, where the Clipboard API is refused (GOTCHAS 30).
        const notice = await copyMessage({ message, copy: vi.fn().mockResolvedValue(false) });
        expect(notice).toEqual({
            level: 'error',
            text: 'The browser did not allow copying to the clipboard',
        });
    });

    it('copies nothing when there is nothing to copy', async () => {
        const copy = vi.fn();
        expect(await copyMessage({ message: null, copy })).toBeNull();
        expect(await copyMessage({ message: {}, copy })).toBeNull();
        expect(copy).not.toHaveBeenCalled();
    });
});
