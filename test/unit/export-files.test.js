import { describe, it, expect } from 'vitest';
import { exportFileBase, partFileName, safeFileName } from '../../src/export/file-name';
import { createZip, crc32, dosDateTime } from '../../src/export/zip';
import {
    IMAGE_SCALE,
    fitFactor,
    planParts,
    slideSize,
    tallLimit,
} from '../../src/export/png-parts';
import { htmlFile } from '../../src/export/run-export';

const NOW = Date.UTC(2026, 10, 18, 12);

describe('naming an export', () => {
    it('names it after the object, the conversation exported alone, and the day', () => {
        const name = exportFileBase(
            { title: 'Support chats', heading: 'Order 1042', conversationLabel: 'Order 1042' },
            NOW
        );
        expect(name).toMatch(/^Support chats - Order 1042 - 2026-11-1[789]$/);
    });

    it('falls back to the heading, and never repeats a name', () => {
        expect(exportFileBase({ title: '', heading: 'T1', conversationLabel: 'T1' }, NOW)).toMatch(
            /^T1 - 2026-11-1\d$/
        );
        expect(exportFileBase({}, NOW)).toMatch(/^Conversation - 2026-11-1\d$/);
    });

    it('takes out what a file system refuses', () => {
        expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
        expect(safeFileName('  ..hidden.. ')).toBe('hidden');
        expect(safeFileName('tab\there\nand\u0000nul')).toBe('tab here and nul');
        expect(safeFileName('x'.repeat(300))).toHaveLength(120);
        expect(safeFileName(null)).toBe('');
    });

    it('numbers images so they sort in order', () => {
        expect(partFileName('Chat', 0, 3)).toBe('Chat - 01.png');
        expect(partFileName('Chat', 99, 120)).toBe('Chat - 100.png');
        expect(partFileName('Chat', 4, 120)).toBe('Chat - 005.png');
    });
});

/**
 * Read a zip back: each file's name, the bytes stored, and whether its checksum holds.
 *
 * @param {Uint8Array} zip - The archive.
 * @returns {Array<object>} The files, from the central directory.
 */
function readZip(zip) {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const files = [];
    const decoder = new TextDecoder();
    for (let index = 0; index < count; index++) {
        expect(view.getUint32(at, true)).toBe(0x02014b50);
        const flags = view.getUint16(at + 8, true);
        const crc = view.getUint32(at + 16, true);
        const size = view.getUint32(at + 20, true);
        const nameLength = view.getUint16(at + 28, true);
        const local = view.getUint32(at + 42, true);
        const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength));
        expect(view.getUint32(local, true)).toBe(0x04034b50);
        const localName = view.getUint16(local + 26, true);
        const start = local + 30 + localName + view.getUint16(local + 28, true);
        const data = zip.subarray(start, start + size);
        files.push({ name, flags, data, crcHolds: crc32(data) === crc });
        at += 46 + nameLength;
    }
    return files;
}

describe('createZip', () => {
    it('computes the CRC-32 zip uses', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
        expect(crc32(new Uint8Array(0))).toBe(0);
    });

    it('stores each file whole, under its UTF-8 name, with a checksum that holds', () => {
        const files = [
            { name: 'Möte - 01.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) },
            { name: 'Möte - 02.png', data: new Uint8Array([9, 8, 7]) },
        ];
        const read = readZip(createZip(files, { wallClock: NOW }));
        expect(read.map((file) => file.name)).toEqual(['Möte - 01.png', 'Möte - 02.png']);
        expect(read.every((file) => file.crcHolds)).toBe(true);
        expect(read.every((file) => (file.flags & 0x0800) !== 0)).toBe(true);
        expect([...read[1].data]).toEqual([9, 8, 7]);
    });

    it('dates the files as MS-DOS does', () => {
        const { time, date } = dosDateTime(Date.UTC(2026, 10, 18, 15, 42, 10));
        expect(date).toBe(((2026 - 1980) << 9) | (11 << 5) | 18);
        expect(time).toBe((15 << 11) | (42 << 5) | 5);
    });
});

describe('cutting an export into images', () => {
    const rows = (...heights) =>
        heights.map((height) =>
            typeof height === 'string'
                ? { kind: 'day', height: Number(height) }
                : { kind: 'messages', height }
        );

    it('fills each image with whole rows', () => {
        expect(planParts(rows(40, 40, 40, 40, 40), { first: 100, rest: 100 })).toEqual([
            { start: 0, end: 2 },
            { start: 2, end: 4 },
            { start: 4, end: 5 },
        ]);
    });

    it('leaves less room on the first image, for the title block', () => {
        expect(planParts(rows(40, 40, 40, 40), { first: 50, rest: 100 })).toEqual([
            { start: 0, end: 1 },
            { start: 1, end: 3 },
            { start: 3, end: 4 },
        ]);
    });

    it('carries a day heading over to the image its messages are on', () => {
        expect(planParts(rows(40, 40, '20', 40), { first: 100, rest: 100 })).toEqual([
            { start: 0, end: 2 },
            { start: 2, end: 4 },
        ]);
    });

    it('takes one more row onto a slide that may shrink a little to hold it', () => {
        const heights = rows(40, 40, 40, 30);
        expect(planParts(heights, { first: 140, rest: 140 })).toEqual([
            { start: 0, end: 3 },
            { start: 3, end: 4 },
        ]);
        expect(planParts(heights, { first: 140, rest: 140, shrink: 0.92 })).toEqual([
            { start: 0, end: 4 },
        ]);
    });

    it('puts a row too tall for any image on one of its own', () => {
        expect(planParts(rows(40, 500, 40), { first: 100, rest: 100 })).toEqual([
            { start: 0, end: 1 },
            { start: 1, end: 2 },
            { start: 2, end: 3 },
        ]);
    });

    it('makes one image of what fits, and of nothing', () => {
        expect(planParts(rows(10, 10), { first: 100, rest: 100 })).toEqual([{ start: 0, end: 2 }]);
        expect(planParts([], { first: 100, rest: 100 })).toEqual([{ start: 0, end: 0 }]);
    });

    it('makes a slide 16:9, at least 1920 × 1080 when drawn', () => {
        expect(slideSize(580)).toEqual({ width: 960, height: 540 });
        const wide = slideSize(4 * 344 - 24);
        expect(wide.width).toBeGreaterThan(960);
        expect(wide.height / wide.width).toBeCloseTo(9 / 16, 2);
        expect(960 * IMAGE_SCALE).toBe(1920);
    });

    it('keeps a tall image within what a canvas can hold', () => {
        expect(tallLimit(676) * IMAGE_SCALE).toBeLessThanOrEqual(32000);
        const wide = 4000;
        expect(wide * IMAGE_SCALE * tallLimit(wide) * IMAGE_SCALE).toBeLessThanOrEqual(240000000);
    });

    it('shrinks a slide only when its content does not fit', () => {
        expect(fitFactor(400, 500)).toBe(1);
        expect(fitFactor(1000, 500)).toBe(0.5);
        expect(fitFactor(100000, 500)).toBe(0.25);
    });
});

describe('htmlFile', () => {
    it('writes a whole document with the export sheet, escaping its title and language', () => {
        const file = htmlFile({
            lang: 'sv"><script>',
            title: '<b>Chat</b> & more',
            page: '<div class="cx-page"></div>',
        });
        expect(file.startsWith('<!DOCTYPE html>\n')).toBe(true);
        expect(file).toContain('<title>&lt;b&gt;Chat&lt;/b&gt; &amp; more</title>');
        expect(file).toContain('lang="sv&quot;&gt;&lt;script&gt;"');
        expect(file).toContain('<style>');
        expect(file).not.toMatch(/<script/i);
    });
});
