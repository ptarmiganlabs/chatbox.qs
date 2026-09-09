import { describe, it, expect } from 'vitest';
import * as cell from '../../src/qix/read-cell';

describe('read-cell', () => {
    describe('num()', () => {
        it('reads a real number', () => {
            expect(cell.num({ qNum: 42 })).toBe(42);
            expect(cell.num({ qNum: 0 })).toBe(0);
        });

        it('returns null for the "NaN" STRING the engine sends for non-numeric cells', () => {
            // JSON has no NaN literal, so the engine serialises it as a string.
            expect(cell.num({ qNum: 'NaN', qText: 'hello' })).toBeNull();
        });

        it('returns null for missing, null and undefined', () => {
            expect(cell.num(undefined)).toBeNull();
            expect(cell.num({})).toBeNull();
            expect(cell.num({ qNum: null })).toBeNull();
        });

        it('returns null for a null cell even when qNum is present', () => {
            expect(cell.num({ qNum: 5, qIsNull: true })).toBeNull();
        });

        it('parses a numeric string', () => {
            expect(cell.num({ qNum: '17.5' })).toBe(17.5);
        });
    });

    describe('optionalText()', () => {
        it("maps the engine's '-' sentinel to null", () => {
            expect(cell.optionalText({ qText: '-' })).toBeNull();
        });

        it('maps empty string to null but keeps real values', () => {
            expect(cell.optionalText({ qText: '' })).toBeNull();
            expect(cell.optionalText({ qText: 'real' })).toBe('real');
        });

        it('does not swallow a value that merely contains a dash', () => {
            expect(cell.optionalText({ qText: 'a-b' })).toBe('a-b');
        });
    });

    describe('isSelectable()', () => {
        it.each([
            [-1, 'Total'],
            [-2, 'Null'],
            [-3, 'Others'],
            [-4, 'empty'],
        ])('rejects synthetic element number %i (%s)', (elem) => {
            expect(cell.isSelectable({ qElemNumber: elem })).toBe(false);
        });

        it('accepts real element numbers including zero', () => {
            expect(cell.isSelectable({ qElemNumber: 0 })).toBe(true);
            expect(cell.isSelectable({ qElemNumber: 7 })).toBe(true);
        });

        it('rejects a missing cell', () => {
            expect(cell.isSelectable(undefined)).toBe(false);
        });
    });

    describe('qArea offsets', () => {
        it('resolves absolute row and column from the page area', () => {
            expect(cell.absoluteRow({ qTop: 2000, qLeft: 0 }, 5)).toBe(2005);
            expect(cell.absoluteCol({ qTop: 0, qLeft: 3 }, 2)).toBe(5);
        });

        it('treats a missing area as origin', () => {
            expect(cell.absoluteRow(undefined, 4)).toBe(4);
            expect(cell.absoluteCol(undefined, 4)).toBe(4);
        });
    });

    it('state() defaults to optional', () => {
        expect(cell.state({})).toBe('O');
        expect(cell.state({ qState: 'S' })).toBe('S');
    });
});

describe('read-cell — regressions', () => {
    it('returns the text of a STRING-VALUED MEASURE even though the engine marks it null', () => {
        // Regression: Only([MsgText]) returns a string, so the cell's NUMERIC value
        // is null and the engine sets qIsNull — on a cell whose qText is perfectly
        // good. Guarding on qIsNull silently blanked every message body.
        // Qlik's own sn-table never reads qIsNull; it renders qText unconditionally.
        const measureCell = {
            qText: 'Morning — did the reload finish?',
            qNum: 'NaN',
            qIsNull: true,
        };
        expect(cell.text(measureCell)).toBe('Morning — did the reload finish?');
    });

    it('still reports such a cell as non-numeric', () => {
        expect(cell.num({ qText: 'hello', qNum: 'NaN', qIsNull: true })).toBeNull();
    });

    it('still returns empty for a genuinely absent cell', () => {
        expect(cell.text(undefined)).toBe('');
        expect(cell.text({})).toBe('');
    });
});
