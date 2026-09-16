// Ported from textview.qs test/unit/qix/field-ref.test.js at df84a5e, without the text dimension.
import { describe, it, expect } from 'vitest';
import { fieldRef, normalizeFieldName } from '../../src/qix/field-ref';

describe('fieldRef', () => {
    it('brackets a field name', () => {
        expect(fieldRef('notes')).toBe('[notes]');
    });

    it('doubles a closing bracket in the name', () => {
        // Checked on Sense May 2026: Count(DISTINCT [odd]]name]) counts the field "odd]name".
        expect(fieldRef('odd]name')).toBe('[odd]]name]');
    });
});

describe('normalizeFieldName', () => {
    it('keeps a plain name, without surrounding whitespace', () => {
        expect(normalizeFieldName('  match ')).toBe('match');
    });

    it('takes a name out of its brackets and undoes the doubled closing bracket', () => {
        expect(normalizeFieldName('[match]')).toBe('match');
        expect(normalizeFieldName('[odd]]name]')).toBe('odd]name');
        expect(fieldRef(normalizeFieldName('[odd]]name]'))).toBe('[odd]]name]');
    });

    it('leaves a lone bracket and names with inner brackets alone', () => {
        expect(normalizeFieldName('[')).toBe('[');
        expect(normalizeFieldName('a[b]')).toBe('a[b]');
    });

    it('reads anything that is not a string as no name', () => {
        expect(normalizeFieldName(undefined)).toBe('');
        expect(normalizeFieldName({ qStringExpression: {} })).toBe('');
    });
});
