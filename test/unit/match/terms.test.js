// Ported from textview.qs test/unit/match/terms.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { buildTerms, normalizeTerm } from '../../../src/match/terms';

const LENIENT = { caseSensitive: false, wholeValues: true, flexibleWhitespace: true };
const EXACT = { caseSensitive: true, wholeValues: true, flexibleWhitespace: false };

describe('normalizeTerm', () => {
    it('trims, collapses whitespace and folds case by default', () => {
        expect(normalizeTerm('  +46 70\n123   45 67 ', LENIENT)).toBe('+46 70 123 45 67');
        expect(normalizeTerm('İSTANBUL', LENIENT)).toBe('istanbul');
    });

    it('keeps case and whitespace exactly when asked', () => {
        expect(normalizeTerm(' ABC  123 ', EXACT)).toBe(' ABC  123 ');
    });

    it('turns numbers into text and missing values into nothing', () => {
        expect(normalizeTerm(701234567, LENIENT)).toBe('701234567');
        expect(normalizeTerm(null, LENIENT)).toBe('');
        expect(normalizeTerm(undefined, LENIENT)).toBe('');
    });
});

describe('buildTerms', () => {
    it('merges spellings that normalise alike, keeping every spelling and category', () => {
        const terms = buildTerms(
            [
                { value: 'istanbul', category: 'city' },
                { value: 'İSTANBUL', category: 'place' },
                { value: 'istanbul', category: 'city' },
            ],
            LENIENT
        );
        expect(terms).toHaveLength(1);
        expect(terms[0].key).toBe('istanbul');
        expect(terms[0].values).toEqual(['istanbul', 'İSTANBUL']);
        expect(terms[0].categories).toEqual(['city', 'place']);
    });

    it('keeps spellings apart when case matters', () => {
        const terms = buildTerms([{ value: 'istanbul' }, { value: 'İSTANBUL' }], EXACT);
        expect(terms.map((term) => term.key)).toEqual(['istanbul', 'İSTANBUL']);
    });

    it('records one value in several categories', () => {
        const terms = buildTerms(
            [
                { value: '978-91-0096-205-7', category: 'isbn' },
                { value: '978-91-0096-205-7', category: 'credit-card' },
            ],
            LENIENT
        );
        expect(terms[0].categories).toEqual(['isbn', 'credit-card']);
    });

    it('skips missing and empty values, and missing or empty categories', () => {
        const terms = buildTerms(
            [
                { value: null },
                { value: '   ' },
                undefined,
                { value: 'x', category: '' },
                { value: 'x', category: null },
                { value: 'x' },
                { value: 'x', category: 42 },
            ],
            LENIENT
        );
        expect(terms).toHaveLength(1);
        expect(terms[0].categories).toEqual(['42']);
    });

    it('records which edges of each term need a boundary check', () => {
        const [plus, plate] = buildTerms([{ value: '+46 70' }, { value: 'ABC 123' }], LENIENT);
        expect(plus.startsWithWord).toBe(false);
        expect(plate.startsWithWord).toBe(true);
        expect(plate.endsWithWord).toBe(true);
    });
});
