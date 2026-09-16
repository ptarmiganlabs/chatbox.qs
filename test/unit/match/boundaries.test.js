// Ported from textview.qs test/unit/match/boundaries.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import {
    codePointAtOffset,
    codePointBefore,
    edgeFlags,
    isWholeValue,
    isWordCodePoint,
} from '../../../src/match/boundaries';

const cp = (character) => character.codePointAt(0);

describe('isWordCodePoint', () => {
    it('counts letters and digits in any script as word characters', () => {
        for (const character of ['a', 'Z', 'å', 'Ö', 'Ж', 'ω', '中', '5', '٣']) {
            expect(isWordCodePoint(cp(character))).toBe(true);
        }
    });

    it('counts combining marks and connector punctuation as word characters', () => {
        expect(isWordCodePoint(0x0301)).toBe(true);
        expect(isWordCodePoint(cp('_'))).toBe(true);
        expect(isWordCodePoint(cp('‿'))).toBe(true);
    });

    it('does not count spaces, punctuation or symbols', () => {
        for (const character of [' ', '.', '@', '-', '+', ',', '\n', '€']) {
            expect(isWordCodePoint(cp(character))).toBe(false);
        }
    });

    it('classifies code points outside the Basic Multilingual Plane', () => {
        expect(isWordCodePoint(0x10428)).toBe(true);
        expect(isWordCodePoint(0x1f600)).toBe(false);
    });

    it('treats the edge of the text as a non-word character', () => {
        expect(isWordCodePoint(-1)).toBe(false);
    });

    it('gives the same answer twice for a cached character', () => {
        expect(isWordCodePoint(cp('x'))).toBe(isWordCodePoint(cp('x')));
    });
});

describe('code point readers', () => {
    it('read whole surrogate pairs on either side of an offset', () => {
        const text = 'a\u{10428}b';
        expect(codePointBefore(text, 3)).toBe(0x10428);
        expect(codePointAtOffset(text, 1)).toBe(0x10428);
    });

    it('return -1 at the edges of the text', () => {
        expect(codePointBefore('ab', 0)).toBe(-1);
        expect(codePointAtOffset('ab', 2)).toBe(-1);
    });

    it('return a lone low surrogate as itself', () => {
        expect(codePointBefore('\udc00', 1)).toBe(0xdc00);
        expect(codePointBefore('x\udc00', 2)).toBe(0xdc00);
    });
});

describe('edgeFlags', () => {
    it('flags only the edges that are word characters', () => {
        expect(edgeFlags('+46 70')).toEqual({ startsWithWord: false, endsWithWord: true });
        expect(edgeFlags('ABC 123')).toEqual({ startsWithWord: true, endsWithWord: true });
        expect(edgeFlags('(x)')).toEqual({ startsWithWord: false, endsWithWord: false });
    });
});

describe('isWholeValue', () => {
    const find = (text, term) => {
        const start = text.indexOf(term);
        return isWholeValue(text, start, start + term.length, edgeFlags(term));
    };

    it('rejects a value that continues into a longer word', () => {
        expect(find('Åsaka', 'Åsa')).toBe(false);
        expect(find('order ABC 1234', 'ABC 123')).toBe(false);
        expect(find('user_anna@example.se', 'anna@example.se')).toBe(false);
    });

    it('accepts a value followed by punctuation or the end of the text', () => {
        expect(find('Åsa, not Åsaka', 'Åsa')).toBe(true);
        expect(find('plate ABC 123', 'ABC 123')).toBe(true);
    });

    it('does not check an edge where the value starts with a non-word character', () => {
        expect(find('tel+46 70', '+46 70')).toBe(true);
    });

    it('rejects a letter followed by a combining accent', () => {
        expect(find('cafe\u0301', 'cafe')).toBe(false);
    });

    it('checks letters outside the Basic Multilingual Plane', () => {
        expect(find('\u{10428}abc', 'abc')).toBe(false);
    });
});
