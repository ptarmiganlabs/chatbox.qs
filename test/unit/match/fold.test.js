// Ported from textview.qs test/unit/match/fold.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { foldCase, keepLength } from '../../../src/match/fold';

describe('foldCase', () => {
    it('lowercases ASCII', () => {
        expect(foldCase('Anna.Svensson@EXAMPLE.se')).toBe('anna.svensson@example.se');
    });

    it('folds Turkish dotted capital I to a plain i without growing the string', () => {
        // toLowerCase() turns "İ" into "i" plus a combining dot: one unit longer, shifting every
        // later offset. That shift is the bug this module exists to prevent.
        expect('İ'.toLowerCase()).toHaveLength(2);
        expect(foldCase('İSTANBUL')).toBe('istanbul');
        expect(foldCase('İSTANBUL')).toHaveLength('İSTANBUL'.length);
    });

    it('folds Greek capitals and the final sigma to the same letters', () => {
        expect(foldCase('ΟΔΟΣ 12')).toBe('οδοσ 12');
        expect(foldCase('οδος 12')).toBe('οδοσ 12');
    });

    it('folds the long s to s', () => {
        expect(foldCase('ſtraße')).toBe('straße');
    });

    it('folds Swedish letters', () => {
        expect(foldCase('ÅSA I VÄXJÖ')).toBe('åsa i växjö');
    });

    it('folds capital sharp s without expanding it', () => {
        expect(foldCase('ẞ')).toBe('ß');
    });

    it('folds characters outside the Basic Multilingual Plane in place', () => {
        // Deseret capital long I (U+10400) and its lowercase (U+10428), two UTF-16 units each.
        expect(foldCase('a\u{10400}b')).toBe('a\u{10428}b');
    });

    it('leaves lone surrogates where they are', () => {
        const text = 'x\ud800y\udc00z';
        expect(foldCase(text)).toBe('x\ud800y\udc00z');
    });

    it('keeps the length of every string it folds', () => {
        const texts = ['İİİ', 'ΣΑΣ', 'Ǆ ǅ ǆ', '\u{10400}İ\u{1e9e}', 'mixed İ and Σ, ſ and Ω'];
        for (const text of texts) expect(foldCase(text)).toHaveLength(text.length);
    });

    it('returns the same result on every call, including cached characters', () => {
        expect(foldCase('ÄÖÜ')).toBe(foldCase('ÄÖÜ'));
    });
});

describe('keepLength', () => {
    it('keeps a folded form of the same length', () => {
        expect(keepLength('A', 'a')).toBe('a');
    });

    it('falls back to the original when folding would change the length', () => {
        expect(keepLength('\u0130', 'i\u0307')).toBe('\u0130');
    });
});
