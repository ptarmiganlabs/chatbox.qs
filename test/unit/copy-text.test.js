// Ported from textview.qs test/unit/render/copy.test.js at df84a5e, without selectedTextWithin.
import { describe, it, expect, vi } from 'vitest';
import { copyText } from '../../src/util/copy-text';

/** A document whose copy command records what the textarea held when it ran. */
function documentWithCommand(result = true) {
    const doc = document.implementation.createHTMLDocument('copy');
    doc.copied = [];
    doc.execCommand = vi.fn((command) => {
        const area = doc.querySelector('textarea');
        doc.copied.push([command, area?.value]);
        if (result instanceof Error) throw result;
        return result;
    });
    return doc;
}

describe('copyText', () => {
    it('uses the Clipboard API when it is allowed', async () => {
        const clipboard = { writeText: vi.fn(async () => {}) };
        const doc = documentWithCommand();

        await expect(copyText('Åsa\nline two', { clipboard, doc })).resolves.toBe(true);
        expect(clipboard.writeText).toHaveBeenCalledWith('Åsa\nline two');
        expect(doc.execCommand).not.toHaveBeenCalled();
    });

    it('falls back to the copy command when the Clipboard API is refused', async () => {
        const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('Denied')) };
        const doc = documentWithCommand();

        await expect(copyText('the text', { clipboard, doc })).resolves.toBe(true);
        expect(doc.copied).toEqual([['copy', 'the text']]);
        expect(doc.querySelector('textarea')).toBeNull();
    });

    it('falls back to the copy command where there is no Clipboard API', async () => {
        const doc = documentWithCommand();
        await expect(copyText('the text', { clipboard: undefined, doc })).resolves.toBe(true);
    });

    it('reports failure when the copy command does not copy', async () => {
        const doc = documentWithCommand(false);
        await expect(copyText('the text', { clipboard: undefined, doc })).resolves.toBe(false);
        expect(doc.querySelector('textarea')).toBeNull();
    });

    it('reports failure when the copy command throws', async () => {
        const doc = documentWithCommand(new Error('Not allowed'));
        await expect(copyText('the text', { clipboard: undefined, doc })).resolves.toBe(false);
        expect(doc.querySelector('textarea')).toBeNull();
    });

    it('copies from a focused field, then gives focus back', async () => {
        // The main document, because jsdom only moves focus in a document shown in a window.
        const button = document.createElement('button');
        document.body.append(button);
        button.focus();
        let focusedWhileCopying = null;
        document.execCommand = vi.fn(() => {
            focusedWhileCopying = document.activeElement.tagName;
            return true;
        });

        try {
            await expect(
                copyText('the text', { clipboard: undefined, doc: document })
            ).resolves.toBe(true);
            expect(focusedWhileCopying).toBe('TEXTAREA');
            expect(document.activeElement).toBe(button);
        } finally {
            delete document.execCommand;
            button.remove();
        }
    });

    it('reports failure when there is no way to copy at all', async () => {
        const doc = document.implementation.createHTMLDocument('no command');
        await expect(copyText('the text', { clipboard: undefined, doc })).resolves.toBe(false);
        await expect(copyText('the text', { clipboard: undefined, doc: undefined })).resolves.toBe(
            false
        );
    });
});
