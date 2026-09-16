// Ported from textview.qs test/unit/match/resolve.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { selectLeftmostLongest } from '../../../src/match/resolve';

const span = (start, end) => ({ start, end });

describe('selectLeftmostLongest', () => {
    it('keeps the occurrence that starts first', () => {
        // "New York City" with "New York" (0-8) and "York City" (4-13) both selected.
        expect(selectLeftmostLongest([span(4, 13), span(0, 8)])).toEqual([span(0, 8)]);
    });

    it('keeps the longer of two occurrences that start together', () => {
        expect(selectLeftmostLongest([span(6, 13), span(6, 14)])).toEqual([span(6, 14)]);
    });

    it('drops an occurrence inside another', () => {
        expect(selectLeftmostLongest([span(5, 10), span(0, 29)])).toEqual([span(0, 29)]);
    });

    it('keeps adjacent occurrences', () => {
        expect(selectLeftmostLongest([span(3, 6), span(0, 3)])).toEqual([span(0, 3), span(3, 6)]);
    });

    it('returns nothing for nothing', () => {
        expect(selectLeftmostLongest([])).toEqual([]);
    });
});
