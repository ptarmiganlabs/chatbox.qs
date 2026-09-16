import { describe, it, expect } from 'vitest';
import { categoryStyles } from '../../../src/highlight/category-styles';
import { createDescriber, describeByValues, markPieces } from '../../../src/highlight/marks';

const span = (start, end, values = ['v'], categories = []) => ({ start, end, values, categories });

describe('markPieces', () => {
    it('leaves a text without marks as one plain piece', () => {
        expect(markPieces({ end: 5 })).toEqual([{ start: 0, end: 5, mark: null }]);
    });

    it('marks highlights, with the ordinal a click on them means', () => {
        const pieces = markPieces({ end: 10, highlights: [span(0, 3), span(5, 8)] });
        expect(pieces.map((p) => [p.start, p.end, p.mark?.ordinal ?? null])).toEqual([
            [0, 3, 0],
            [3, 5, null],
            [5, 8, 1],
            [8, 10, null],
        ]);
        expect(pieces[0].mark).toMatchObject({ highlight: true, find: false, current: false });
    });

    it('cuts a highlight where a search match starts inside it, and says where it goes on', () => {
        const pieces = markPieces({
            end: 10,
            highlights: [span(0, 8, ['New York'])],
            finds: [span(4, 10)],
        });
        expect(pieces.map((p) => [p.start, p.end])).toEqual([
            [0, 4],
            [4, 8],
            [8, 10],
        ]);
        expect(pieces[0].mark).toMatchObject({
            highlight: true,
            find: false,
            cutStart: false,
            cutEnd: true,
        });
        expect(pieces[1].mark).toMatchObject({
            highlight: true,
            find: true,
            cutStart: true,
            cutEnd: false,
        });
        expect(pieces[2].mark).toMatchObject({ highlight: false, find: true, ordinal: -1 });
    });

    it('puts the category label only on the piece where the highlight ends', () => {
        const styles = categoryStyles({
            categories: { problem: null, list: [{ name: 'city', elemNumber: 0, color: null }] },
            palette: ['#4477aa', '#ee6677', '#228833', '#ccbb44'],
        });
        const describe = createDescriber({ styles });
        const pieces = markPieces({
            end: 8,
            highlights: [span(0, 8, ['New York'], ['city'])],
            finds: [span(2, 4)],
            describe,
        });
        expect(pieces.map((p) => p.mark.label)).toEqual([null, null, 'city']);
        expect(pieces.every((p) => p.mark.title === 'New York · city')).toBe(true);
        expect(pieces[0].mark.style).toHaveProperty('--cqs-mark-fill');
    });

    it('draws only the highlights within the drawing cap, and the current one beyond it', () => {
        const highlights = [span(0, 1), span(2, 3), span(4, 5)];
        const capped = markPieces({ end: 5, highlights, drawn: 1 });
        expect(capped.filter((p) => p.mark).map((p) => p.mark.ordinal)).toEqual([0]);

        const current = markPieces({
            end: 5,
            highlights,
            drawn: 1,
            current: { kind: 'highlight', ordinal: 2 },
        });
        const marked = current.filter((p) => p.mark);
        expect(marked.map((p) => [p.mark.ordinal, p.mark.current])).toEqual([
            [0, false],
            [2, true],
        ]);
    });

    it('marks a current search match as current, and not as a highlight', () => {
        const pieces = markPieces({
            end: 6,
            finds: [span(0, 2), span(3, 5)],
            current: { kind: 'find', ordinal: 1 },
        });
        const marked = pieces.filter((p) => p.mark);
        expect(marked.map((p) => [p.start, p.mark.find, p.mark.current, p.mark.highlight])).toEqual(
            [
                [0, true, false, false],
                [3, true, true, false],
            ]
        );
    });

    it('ignores a current mark that points past the list', () => {
        const pieces = markPieces({
            end: 3,
            highlights: [span(0, 1)],
            current: { kind: 'highlight', ordinal: 5 },
        });
        expect(pieces.filter((p) => p.mark?.current)).toEqual([]);
    });

    it('cuts only the part of a text it is given, for text split across nodes', () => {
        const pieces = markPieces({ start: 4, end: 9, highlights: [span(2, 6), span(8, 12)] });
        expect(
            pieces.map((p) => [p.start, p.end, p.mark?.cutStart ?? null, p.mark?.cutEnd ?? null])
        ).toEqual([
            [4, 6, true, false],
            [6, 8, null, null],
            [8, 9, false, true],
        ]);
    });
});

describe('createDescriber', () => {
    const off = categoryStyles({ categories: null, palette: [] });

    it('describes each span once, handing back the very same description', () => {
        const describe = createDescriber({ styles: off });
        const s = span(0, 1, ['reload', 'Reload']);
        expect(describe(s)).toBe(describe(s));
        expect(describe(s)).toEqual({
            title: 'reload, Reload',
            linkTitle: 'reload, Reload',
            label: null,
            style: null,
        });
    });

    it('adds what a click does as a second tooltip line', () => {
        const describe = createDescriber({ styles: off, hint: 'Click to select this value' });
        const described = describe(span(0, 1, ['x']));
        expect(described.title).toBe('x\nClick to select this value');
        // Inside a link a click opens the link, so its tooltip leaves the hint out.
        expect(described.linkTitle).toBe('x');
    });

    it('describes by values alone without styles', () => {
        expect(describeByValues(span(0, 1, ['a', 'b']))).toEqual({
            title: 'a, b',
            label: null,
            style: null,
        });
        expect(describeByValues({})).toEqual({ title: '', label: null, style: null });
    });
});
