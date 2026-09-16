// Ported from textview.qs test/unit/match/whitespace.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { collapseWhitespace, trimWhitespace, unchangedText } from '../../../src/match/whitespace';

/**
 * Check that every non-whitespace character of the collapsed text maps back to itself.
 *
 * @param {string} text - The original text.
 */
function expectMapsBack(text) {
    const { text: collapsed, toOriginal } = collapseWhitespace(text);
    for (let offset = 0; offset < collapsed.length; offset++) {
        if (collapsed[offset] !== ' ') {
            expect(text[toOriginal(offset)]).toBe(collapsed[offset]);
        }
    }
}

describe('collapseWhitespace', () => {
    it('returns the text untouched when it has no whitespace', () => {
        const result = collapseWhitespace('abc');
        expect(result.text).toBe('abc');
        expect(result.toOriginal(2)).toBe(2);
    });

    it('turns single whitespace characters into spaces without shifting offsets', () => {
        const result = collapseWhitespace('a\nb\tc');
        expect(result.text).toBe('a b c');
        expect(result.toOriginal(4)).toBe(4);
    });

    it('collapses Windows line endings and runs of spaces', () => {
        const text = 'Called back on +46 70\r\n123  45 67';
        const result = collapseWhitespace(text);
        expect(result.text).toBe('Called back on +46 70 123 45 67');
        expectMapsBack(text);
    });

    it('treats Unicode whitespace as whitespace', () => {
        // No-break space, narrow no-break space, next line, ideographic space.
        const text = 'a\u00a0\u00a0b\u202f\u202fc\u0085\u0085d\u3000\u3000e';
        expect(collapseWhitespace(text).text).toBe('a b c d e');
        expectMapsBack(text);
    });

    it('maps the space standing in for a run to the start of that run', () => {
        const result = collapseWhitespace('a   b');
        expect(result.toOriginal(1)).toBe(1);
        expect(result.toOriginal(2)).toBe(4);
    });

    it('maps offsets across many runs', () => {
        const text = '  one\r\n\r\ntwo \t three  ';
        expectMapsBack(text);
        const { text: collapsed, toOriginal } = collapseWhitespace(text);
        expect(collapsed).toBe(' one two three ');
        expect(text.slice(toOriginal(9), toOriginal(13) + 1)).toBe('three');
    });
});

describe('trimWhitespace', () => {
    it('trims Unicode whitespace that String.prototype.trim leaves behind', () => {
        expect('\u0085x\u0085'.trim()).toBe('\u0085x\u0085');
        expect(trimWhitespace('\u0085 x \u0085')).toBe('x');
    });
});

describe('unchangedText', () => {
    it('maps every offset to itself', () => {
        const result = unchangedText('a  b');
        expect(result.text).toBe('a  b');
        expect(result.toOriginal(3)).toBe(3);
    });
});
