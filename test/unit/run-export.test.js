import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runExport } from '../../src/export/run-export';

const ada = { key: 'Ada', label: 'Ada', color: '#4477aa' };

const message = (id, body, extra = {}) => ({
    id,
    key: `k${id}`,
    body,
    bodyFormat: 'text',
    authorKey: 'Ada',
    author: ada,
    recipients: null,
    threadId: 'T1',
    threadElem: 1,
    ts: Date.UTC(2026, 8, 8, 9, Number(id)),
    tsText: `09:0${id}`,
    side: 'left',
    ...extra,
});

const VIEW = {
    conversation: {
        messages: [
            message('1', 'Hello <script>alert("x")</script> & welcome'),
            message('2', 'A [link](javascript:alert(1)) and **bold**', { bodyFormat: 'markdown' }),
        ],
        meta: { truncated: false },
        diagnostics: [],
    },
    board: null,
    settings: {},
    layout: { title: 'Support <chats>' },
    exportTheme: { '--cqs-bg': '#ffffff', '--cqs-font-family': "'QlikView Sans', sans-serif" },
};

/** Catch what is saved: the file's name and its content. */
function catchSaves() {
    const saved = [];
    const blobs = new Map();
    let counter = 0;
    URL.createObjectURL = vi.fn((blob) => {
        const url = `blob:test/${++counter}`;
        blobs.set(url, blob);
        return url;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
        saved.push({ name: this.download, blob: blobs.get(this.href) });
    });
    return saved;
}

describe('runExport as HTML', () => {
    let saved;
    beforeEach(() => {
        saved = catchSaves();
        // Nothing is fetched: the messages have no pictures and the page has no fonts.
        globalThis.fetch = vi.fn(async () => ({ ok: false }));
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('saves one file that holds every message, its text escaped and no script', async () => {
        const notice = await runExport({
            view: VIEW,
            choice: { format: 'html', lane: null, title: true },
            now: Date.UTC(2026, 10, 18, 12),
        });
        expect(notice).toEqual({ level: 'info', text: 'Saved 2 messages as HTML' });
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toMatch(/^Support chats - 2026-11-1\d\.html$/);
        const html = await saved[0].blob.text();
        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html).toContain('Hello &lt;script&gt;alert("x")&lt;/script&gt; &amp; welcome');
        expect(html).not.toMatch(/<script/i);
        expect(html).not.toContain('javascript:');
        expect(html).toContain('<strong>bold</strong>');
        expect(html).toContain('<title>T1</title>');
        // The frame it was drawn in is gone.
        expect(document.querySelectorAll('iframe')).toHaveLength(0);
    });

    it('answers null with nothing to export, and saves nothing', async () => {
        const empty = { ...VIEW, conversation: { ...VIEW.conversation, messages: [] } };
        expect(await runExport({ view: empty, choice: { format: 'html' } })).toBeNull();
        expect(saved).toHaveLength(0);
    });

    it('says so when the export fails, and never throws', async () => {
        URL.createObjectURL = vi.fn(() => {
            throw new Error('no object URLs here');
        });
        const notice = await runExport({ view: VIEW, choice: { format: 'html' } });
        expect(notice).toEqual({
            level: 'error',
            text: 'The export did not work: no object URLs here',
        });
        expect(document.querySelectorAll('iframe')).toHaveLength(0);
    });
});
