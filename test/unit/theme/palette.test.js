// Ported from textview.qs test/unit/theme/palette.test.js at df84a5e; paletteColor became
// chatbox's colorForElem, which participants and categories now share.
import { describe, it, expect } from 'vitest';
import { colorFromText, relativeLuminance } from '../../../src/theme/color-parse';
import {
    FALLBACK_PALETTE,
    NO_CATEGORY_COLOR,
    UNKNOWN_COLOR,
    colorForElem,
    highlightColors,
    paletteFromTheme,
} from '../../../src/theme/palette';

/** The first colours of the Horizon theme's palettes, as the test server's theme lists them. */
const TWELVE = ['#006580', '#C8C7A9', '#AC4D58', '#99CFCD', '#E1DAD5', '#83AF9B'];
const HUNDRED = [...TWELVE, '#E0BD8D', '#8A85C6', '#10CFC9', '#A16090', '#87205D', '#C4CFDA'];

/** Parse an rgba() string back into its channels. */
function channels(css) {
    return colorFromText(css);
}

describe('paletteFromTheme', () => {
    it('takes the richest palette, the largest step of a pyramid included', () => {
        const theme = {
            getDataColorPalettes: () => [
                { key: 'one', type: 'row', colors: ['#000000'] },
                { key: '12', type: 'pyramid', colors: [TWELVE.slice(0, 1), TWELVE] },
                { key: '100', type: 'row', colors: HUNDRED },
            ],
        };
        expect(paletteFromTheme(theme)).toEqual(HUNDRED);
    });

    it('prefers a pyramid when it is the richest', () => {
        const theme = {
            getDataColorPalettes: () => [
                { type: 'row', colors: TWELVE.slice(0, 4) },
                { type: 'pyramid', colors: [TWELVE.slice(0, 2), TWELVE] },
            ],
        };
        expect(paletteFromTheme(theme)).toEqual(TWELVE);
    });

    it('leaves out entries that are not colours, so highlight colours can be computed from all', () => {
        const theme = {
            getDataColorPalettes: () => [{ colors: ['#006580', 42, 'nope', ...TWELVE.slice(1)] }],
        };
        expect(paletteFromTheme(theme)).toEqual(TWELVE);
    });

    it('falls back when the theme has no palette with enough colours', () => {
        expect(paletteFromTheme(undefined)).toEqual(FALLBACK_PALETTE);
        expect(paletteFromTheme({ getDataColorPalettes: () => null })).toEqual(FALLBACK_PALETTE);
        expect(
            paletteFromTheme({
                getDataColorPalettes: () => [{ colors: [] }, { colors: 'red' }, { colors: [42] }],
            })
        ).toEqual(FALLBACK_PALETTE);
        expect(
            paletteFromTheme({ getDataColorPalettes: () => [{ colors: TWELVE.slice(0, 3) }] })
        ).toEqual(FALLBACK_PALETTE);
    });

    it('falls back when the theme throws', () => {
        const theme = {
            getDataColorPalettes: () => {
                throw new Error('no palettes');
            },
        };
        expect(paletteFromTheme(theme)).toEqual(FALLBACK_PALETTE);
    });

    it('hands out a copy of the fallback, never the shared constant', () => {
        const palette = paletteFromTheme(undefined);
        expect(palette).not.toBe(FALLBACK_PALETTE);
        expect(Object.isFrozen(FALLBACK_PALETTE)).toBe(true);
    });
});

describe('colorForElem', () => {
    it('keys a colour by element number, so a value keeps it whatever is selected', () => {
        expect(colorForElem(0, TWELVE)).toBe('#006580');
        expect(colorForElem(7, TWELVE)).toBe('#C8C7A9');
    });

    it('uses the fallback palette for an empty one', () => {
        expect(colorForElem(1, [])).toBe(FALLBACK_PALETTE[1]);
        expect(colorForElem(1, undefined)).toBe(FALLBACK_PALETTE[1]);
    });

    it('gives the unknown grey to a null or synthetic row, and to what is not an element number', () => {
        expect(colorForElem(-2, TWELVE)).toBe(UNKNOWN_COLOR);
        expect(colorForElem(undefined, TWELVE)).toBe(UNKNOWN_COLOR);
        expect(colorForElem(1.5, TWELVE)).toBe(UNKNOWN_COLOR);
        expect(NO_CATEGORY_COLOR).toBe(UNKNOWN_COLOR);
    });
});

describe('highlightColors', () => {
    const pale = colorFromText('#E1DAD5');
    const deep = colorFromText('#006580');

    it('tints with the colour itself, stronger on a dark background', () => {
        expect(highlightColors(deep).fill).toBe('rgba(0, 101, 128, 0.25)');
        expect(highlightColors(deep, { dark: true }).fill).toBe('rgba(0, 101, 128, 0.35)');
    });

    it('darkens a pale underline and label on a light background until they stand out', () => {
        const { line, ink } = highlightColors(pale);
        expect(relativeLuminance(channels(line))).toBeLessThanOrEqual(0.35);
        expect(relativeLuminance(channels(ink))).toBeLessThanOrEqual(0.12);
        // A colour that already stands out is left as it is.
        expect(highlightColors(deep).line).toBe('rgba(0, 101, 128, 1)');
    });

    it('lightens a deep underline and label on a dark background', () => {
        const { line, ink } = highlightColors(deep, { dark: true });
        expect(relativeLuminance(channels(line))).toBeGreaterThanOrEqual(0.25);
        expect(relativeLuminance(channels(ink))).toBeGreaterThanOrEqual(0.45);
    });

    it('keeps the colour’s own transparency for the tint and the underline, never for a label', () => {
        const half = { ...deep, a: 0.5 };
        const colors = highlightColors(half);
        expect(colors.fill).toBe('rgba(0, 101, 128, 0.125)');
        expect(colors.line).toBe('rgba(0, 101, 128, 0.5)');
        expect(channels(colors.ink).a).toBe(1);
    });

    it('turns even white into a readable label on a light background', () => {
        const white = { r: 255, g: 255, b: 255, a: 1 };
        expect(relativeLuminance(channels(highlightColors(white).ink))).toBeLessThanOrEqual(0.12);
        const black = { r: 0, g: 0, b: 0, a: 1 };
        const { ink } = highlightColors(black, { dark: true });
        expect(relativeLuminance(channels(ink))).toBeGreaterThanOrEqual(0.45);
    });
});
