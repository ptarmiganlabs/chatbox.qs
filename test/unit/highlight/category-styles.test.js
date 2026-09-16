// Ported from textview.qs test/unit/render/categories.test.js at df84a5e, with chatbox's custom
// property names.
import { describe, it, expect } from 'vitest';
import {
    NO_CATEGORY_LABEL,
    categoryStyles,
    describeSpan,
    stripes,
    stylesOfSpan,
} from '../../../src/highlight/category-styles';
import { highlightColors } from '../../../src/theme/palette';

const PALETTE = ['#006580', '#C8C7A9', '#AC4D58', '#99CFCD', '#E1DAD5', '#83AF9B'];

/** Categories as the highlight source answers them. */
function categories(list, extra = {}) {
    return { field: 'pattern', problem: null, expression: null, list, ...extra };
}

const email = { name: 'email', elemNumber: 0, color: null };
const isbn = { name: 'isbn', elemNumber: 4, color: null };
const card = { name: 'credit-card', elemNumber: 5, color: null };

describe('categoryStyles', () => {
    it('is off without a category field', () => {
        const styles = categoryStyles({ categories: null, palette: PALETTE });
        expect(styles.enabled).toBe(false);
        expect(styles.key).toBe('off');
    });

    it('is off, rather than claiming no categories, while the categories cannot be read', () => {
        const missing = categories([], { problem: { kind: 'field-missing' } });
        expect(categoryStyles({ categories: missing, palette: PALETTE }).enabled).toBe(false);
    });

    it('orders the legend alphabetically, numbers by value, whatever the host locale', () => {
        const list = [isbn, email, card, { name: 'bulk-10', elemNumber: 7, color: null }];
        list.push({ name: 'bulk-9', elemNumber: 8, color: null }, { name: 'Email', elemNumber: 9 });
        const styles = categoryStyles({ categories: categories(list), palette: PALETTE });
        expect(styles.order).toEqual([
            'bulk-9',
            'bulk-10',
            'credit-card',
            'Email',
            'email',
            'isbn',
        ]);
        expect(styles.byName.get('isbn').index).toBe(5);
    });

    it('colours a category from the palette by its element number', () => {
        const styles = categoryStyles({ categories: categories([isbn]), palette: PALETTE });
        // Element number 4 takes the fifth palette colour.
        const expected = highlightColors({ r: 0xe1, g: 0xda, b: 0xd5, a: 1 });
        expect(styles.byName.get('isbn')).toMatchObject(expected);
    });

    it('uses a colour the colour expression returned, as a number or a text', () => {
        const list = [
            { ...isbn, color: { text: 'RGB(255,0,0)', number: 4294901760 } },
            { ...card, color: { text: '#00ff00', number: null } },
        ];
        const styles = categoryStyles({ categories: categories(list), palette: PALETTE });
        expect(styles.byName.get('isbn').fill).toBe('rgba(255, 0, 0, 0.25)');
        expect(styles.byName.get('credit-card').fill).toBe('rgba(0, 255, 0, 0.25)');
        expect(styles.invalidColor).toBeNull();
    });

    it('falls back to the palette for an answer that is not a colour, and keeps the first one', () => {
        const list = [
            { ...email, color: { text: 'not a colour', number: null } },
            { ...isbn, color: { text: 'also not', number: null } },
            { ...card, color: { text: '', number: -1 } },
        ];
        const styles = categoryStyles({ categories: categories(list), palette: PALETTE });
        expect(styles.invalidColor).toBe('not a colour');
        expect(styles.byName.get('email').fill).toBe('rgba(0, 101, 128, 0.25)');

        const numberOnly = categoryStyles({ categories: categories([list[2]]), palette: PALETTE });
        expect(numberOnly.invalidColor).toBe('-1');
    });

    it('draws highlights without a category in grey', () => {
        const styles = categoryStyles({ categories: categories([]), palette: PALETTE });
        expect(styles.none).toMatchObject({ name: null, index: 0 });
        expect(styles.none.fill).toBe('rgba(158, 158, 158, 0.25)');
    });

    it('changes its key when a colour, the order or the background changes', () => {
        const base = categoryStyles({ categories: categories([email, isbn]), palette: PALETTE });
        const same = categoryStyles({ categories: categories([isbn, email]), palette: PALETTE });
        expect(same.key).toBe(base.key);

        const recoloured = categoryStyles({
            categories: categories([email, isbn]),
            palette: [...PALETTE].reverse(),
        });
        expect(recoloured.key).not.toBe(base.key);
        const dark = categoryStyles({
            categories: categories([email, isbn]),
            palette: PALETTE,
            dark: true,
        });
        expect(dark.key).not.toBe(base.key);
    });

    it('styles a category listed twice once', () => {
        const styles = categoryStyles({ categories: categories([email, email]), palette: PALETTE });
        expect(styles.order).toEqual(['email']);
    });
});

describe('stripes', () => {
    it('writes one colour as a plain image, and several side by side with hard stops', () => {
        expect(stripes(['red'])).toBe('linear-gradient(red, red)');
        expect(stripes(['red', 'blue', 'green'])).toBe(
            'linear-gradient(to right, red 0%, red 33.3%, blue 33.3%, blue 66.7%, green 66.7%, green 100%)'
        );
    });
});

describe('describeSpan', () => {
    const styles = categoryStyles({
        categories: categories([email, isbn, card]),
        palette: PALETTE,
    });

    it('titles a highlight by its values while categories are off', () => {
        const off = categoryStyles({ categories: null });
        expect(describeSpan({ values: ['a@x.se', 'A@x.se'], categories: [] }, off)).toEqual({
            title: 'a@x.se, A@x.se',
            label: null,
            style: null,
        });
    });

    it('tints a value in several categories in the first in legend order, underlining all of them', () => {
        const span = { values: ['978-91-0096-205-7'], categories: ['isbn', 'credit-card'] };
        const described = describeSpan(span, styles);
        const cardStyle = styles.byName.get('credit-card');
        const isbnStyle = styles.byName.get('isbn');
        expect(described.title).toBe('978-91-0096-205-7 · credit-card, isbn');
        expect(described.label).toBe('credit-card, isbn');
        expect(described.style).toEqual({
            '--cqs-mark-fill': cardStyle.fill,
            '--cqs-mark-line': stripes([cardStyle.line, isbnStyle.line]),
            '--cqs-mark-border': cardStyle.line,
            '--cqs-mark-ink': cardStyle.ink,
        });
    });

    it('names a highlight without a category, and one with no values listed', () => {
        expect(describeSpan({ values: ['x'], categories: [] }, styles)).toMatchObject({
            title: `x · ${NO_CATEGORY_LABEL}`,
            label: NO_CATEGORY_LABEL,
        });
        expect(describeSpan({ categories: ['email'] }, styles).title).toBe('email');
    });

    it('ignores categories it has no style for', () => {
        expect(stylesOfSpan({ categories: ['unknown', 'email', 'email'] }, styles)).toEqual([
            styles.byName.get('email'),
        ]);
        expect(stylesOfSpan({}, styles)).toEqual([styles.none]);
    });
});
