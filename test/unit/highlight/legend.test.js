import { describe, it, expect } from 'vitest';
import { categoryStyles } from '../../../src/highlight/category-styles';
import { entrySummary, legendEntries } from '../../../src/highlight/legend';

const PALETTE = ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377'];
const categories = (list) => ({ field: 'pattern', problem: null, expression: null, list });
const email = { name: 'email', elemNumber: 0, color: null, selected: false };
const isbn = { name: 'isbn', elemNumber: 4, color: null, selected: true };
const phone = { name: 'se-phone', elemNumber: 1, color: null, selected: false };

/** A conversation result with the given counts. */
const result = (counts, messageCounts, none = [0, 0]) => ({
    counts: { byCategory: new Map(Object.entries(counts)), none: none[0] },
    messageCounts: { byCategory: new Map(Object.entries(messageCounts)), none: none[1] },
});

describe('legendEntries', () => {
    const list = [phone, isbn, email];
    const styles = categoryStyles({ categories: categories(list), palette: PALETTE });

    it('lists every category alphabetically, with its highlights and the messages they are in', () => {
        const entries = legendEntries(
            styles,
            result({ email: 12, isbn: 3 }, { email: 7, isbn: 3 }),
            list
        );
        expect(entries.map((e) => [e.label, e.count, e.messages, e.empty])).toEqual([
            ['email', 12, 7, false],
            ['isbn', 3, 3, false],
            ['se-phone', 0, 0, true],
        ]);
        expect(entries[0]).toMatchObject({ elemNumber: 0, selected: false });
        expect(entries[1]).toMatchObject({ elemNumber: 4, selected: true });
        expect(entries[0].color).toBe(styles.byName.get('email').line);
    });

    it('adds an entry for highlights without a category, last', () => {
        const entries = legendEntries(styles, result({ email: 1 }, { email: 1 }, [4, 2]), list);
        expect(entries.at(-1)).toMatchObject({
            name: null,
            label: 'No category',
            count: 4,
            messages: 2,
            elemNumber: -1,
            selected: false,
        });
    });

    it('lists nothing while categories are off', () => {
        const off = categoryStyles({ categories: null, palette: PALETTE });
        expect(legendEntries(off, result({}, {}), [])).toEqual([]);
    });
});

describe('entrySummary', () => {
    it('says how many highlights, in how many messages', () => {
        expect(entrySummary({ label: 'email', count: 12, messages: 7 })).toBe(
            'email: 12 highlights in 7 messages'
        );
        expect(entrySummary({ label: 'isbn', count: 1, messages: 1 })).toBe(
            'isbn: 1 highlight in 1 message'
        );
        expect(entrySummary({ label: 'se-phone', count: 0, messages: 0 })).toBe(
            'se-phone: 0 highlights'
        );
    });
});
