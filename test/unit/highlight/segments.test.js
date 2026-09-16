// Ported from textview.qs test/unit/render/segments.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { firstEndingAfter, layeredPieces } from '../../../src/highlight/segments';

const spans = [
    { start: 2, end: 5 },
    { start: 8, end: 14 },
    { start: 20, end: 22 },
];

describe('firstEndingAfter', () => {
    it('finds the first item that ends after an offset', () => {
        expect(firstEndingAfter(spans, 0)).toBe(0);
        expect(firstEndingAfter(spans, 4)).toBe(0);
        expect(firstEndingAfter(spans, 5)).toBe(1);
        expect(firstEndingAfter(spans, 13)).toBe(1);
        expect(firstEndingAfter(spans, 14)).toBe(2);
        expect(firstEndingAfter(spans, 22)).toBe(3);
    });

    it('searches onwards from a known index', () => {
        expect(firstEndingAfter(spans, 0, 2)).toBe(2);
    });

    it('answers 0 for no items', () => {
        expect(firstEndingAfter([], 10)).toBe(0);
    });
});

/** Pieces with one layer, written as [start, end, span]. */
const single = (rowStart, rowEnd, layer) =>
    layeredPieces(rowStart, rowEnd, [layer]).map((piece) => [
        piece.start,
        piece.end,
        piece.spans[0],
    ]);

describe('layeredPieces with one layer', () => {
    it('keeps a row without spans as one plain piece', () => {
        expect(single(15, 19, spans)).toEqual([[15, 19, -1]]);
    });

    it('alternates plain text and spans, covering the row exactly', () => {
        expect(single(0, 15, spans)).toEqual([
            [0, 2, -1],
            [2, 5, 0],
            [5, 8, -1],
            [8, 14, 1],
            [14, 15, -1],
        ]);
    });

    it('gives each row its part of a span that crosses a line break', () => {
        // "070-123\n45 67" with the whole number highlighted: rows 0–7 and 8–13.
        const crossing = [{ start: 0, end: 13 }];
        expect(single(0, 7, crossing)).toEqual([[0, 7, 0]]);
        expect(single(8, 13, crossing)).toEqual([[8, 13, 0]]);
    });

    it('cuts a span at the edges of a row cut out of a long line', () => {
        expect(single(10, 21, spans)).toEqual([
            [10, 14, 1],
            [14, 20, -1],
            [20, 21, 2],
        ]);
    });

    it('gives an empty row one empty plain piece', () => {
        expect(single(6, 6, spans)).toEqual([[6, 6, -1]]);
        expect(single(10, 10, spans)).toEqual([[10, 10, -1]]);
    });

    it('keeps spans that touch apart', () => {
        expect(
            single(0, 6, [
                { start: 0, end: 3 },
                { start: 3, end: 6 },
            ])
        ).toEqual([
            [0, 3, 0],
            [3, 6, 1],
        ]);
    });
});

describe('layeredPieces with several layers', () => {
    const highlights = [
        { start: 4, end: 12 },
        { start: 20, end: 26 },
    ];

    it('cuts a highlight where a find match inside it starts and ends', () => {
        const finds = [{ start: 6, end: 9 }];
        expect(layeredPieces(0, 14, [highlights, finds])).toEqual([
            { start: 0, end: 4, spans: [-1, -1] },
            { start: 4, end: 6, spans: [0, -1] },
            { start: 6, end: 9, spans: [0, 0] },
            { start: 9, end: 12, spans: [0, -1] },
            { start: 12, end: 14, spans: [-1, -1] },
        ]);
    });

    it('lets a find match straddle two highlights and the text between them', () => {
        const finds = [{ start: 10, end: 22 }];
        expect(layeredPieces(8, 26, [highlights, finds])).toEqual([
            { start: 8, end: 10, spans: [0, -1] },
            { start: 10, end: 12, spans: [0, 0] },
            { start: 12, end: 20, spans: [-1, 0] },
            { start: 20, end: 22, spans: [1, 0] },
            { start: 22, end: 26, spans: [1, -1] },
        ]);
    });

    it('marks a current match on a layer of its own', () => {
        const current = [{ start: 20, end: 26 }];
        expect(layeredPieces(18, 27, [highlights, [], current])).toEqual([
            { start: 18, end: 20, spans: [-1, -1, -1] },
            { start: 20, end: 26, spans: [1, -1, 0] },
            { start: 26, end: 27, spans: [-1, -1, -1] },
        ]);
    });
});
