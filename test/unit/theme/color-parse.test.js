// Ported from textview.qs test/unit/theme/color-parse.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import {
    colorFromNumber,
    colorFromText,
    cssColor,
    mixColors,
    parseColor,
    relativeLuminance,
} from '../../../src/theme/color-parse';
import { NAMED_COLORS } from '../../../src/theme/named-colors';

const rgb = (color) => color && [color.r, color.g, color.b].map(Math.round);

describe('colorFromNumber', () => {
    it("reads Qlik's colour numbers, 0xAARRGGBB, as RGB() returns them", () => {
        // Captured from the engine: RGB(255, 0, 0) and RGB(4, 5, 6) as attribute expression values.
        expect(colorFromNumber(4294901760)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        expect(colorFromNumber(4278453510)).toEqual({ r: 4, g: 5, b: 6, a: 1 });
    });

    it('keeps an alpha byte, and takes a number without one as opaque', () => {
        expect(colorFromNumber(0x80336699)).toEqual({ r: 0x33, g: 0x66, b: 0x99, a: 128 / 255 });
        expect(colorFromNumber(0x336699)).toEqual({ r: 0x33, g: 0x66, b: 0x99, a: 1 });
    });

    it('refuses what is not a whole colour number', () => {
        for (const value of [-1, 0x100000000, 1.5, Number.NaN, 'NaN', '4294901760', null]) {
            expect(colorFromNumber(value)).toBeNull();
        }
    });
});

describe('colorFromText', () => {
    it('reads hex colours of every length, in any case', () => {
        expect(colorFromText('#4477AA')).toEqual({ r: 0x44, g: 0x77, b: 0xaa, a: 1 });
        expect(colorFromText('#47a')).toEqual({ r: 0x44, g: 0x77, b: 0xaa, a: 1 });
        expect(colorFromText('#47a8')).toEqual({ r: 0x44, g: 0x77, b: 0xaa, a: 0x88 / 255 });
        expect(colorFromText(' #4477aa80 ')).toEqual({ r: 0x44, g: 0x77, b: 0xaa, a: 0x80 / 255 });
    });

    it('reads rgb() and rgba() with commas, spaces, a slash and percentages', () => {
        expect(colorFromText('rgb(68, 119, 170)')).toEqual({ r: 68, g: 119, b: 170, a: 1 });
        expect(colorFromText('rgba(68,119,170,0.5)')).toEqual({ r: 68, g: 119, b: 170, a: 0.5 });
        expect(colorFromText('rgb(68 119 170 / 25%)')).toEqual({ r: 68, g: 119, b: 170, a: 0.25 });
        expect(rgb(colorFromText('rgb(100%, 50%, 0%)'))).toEqual([255, 128, 0]);
    });

    it("reads Qlik's own text form of a colour", () => {
        expect(colorFromText('RGB(255,0,0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        expect(colorFromText('ARGB(128,255,0,0)')).toEqual({ r: 255, g: 0, b: 0, a: 128 / 255 });
    });

    it('reads hsl() and hsla()', () => {
        expect(rgb(colorFromText('hsl(0, 100%, 50%)'))).toEqual([255, 0, 0]);
        expect(rgb(colorFromText('hsl(120deg 100% 25%)'))).toEqual([0, 128, 0]);
        expect(rgb(colorFromText('hsl(-120, 100%, 50%)'))).toEqual([0, 0, 255]);
        expect(colorFromText('hsla(210, 43%, 47%, 0.5)').a).toBe(0.5);
        expect(rgb(colorFromText('hsl(210, 0%, 100%)'))).toEqual([255, 255, 255]);
    });

    it('reads every CSS named colour, in any case', () => {
        expect(NAMED_COLORS.size).toBe(148);
        expect(colorFromText('SteelBlue')).toEqual({ r: 0x46, g: 0x82, b: 0xb4, a: 1 });
        expect(colorFromText('rebeccapurple')).toEqual({ r: 0x66, g: 0x33, b: 0x99, a: 1 });
        expect(colorFromText('grey')).toEqual(colorFromText('gray'));
    });

    it('refuses anything that is not a colour', () => {
        const notColours = [
            '',
            'not a colour',
            'transparent',
            '#12345',
            '#ggg',
            'rgb(1, 2)',
            'rgb(1, 2, 3, 4, 5)',
            'rgb(1deg, 2, 3)',
            'rgb(1, 2, 3, 50deg)',
            'rgb(a, b, c)',
            'argb(1, 2, 3)',
            'argb(1deg, 2, 3, 4)',
            'hsl(10%, 50%, 50%)',
            'hsl(10, 50deg, 50%)',
            'hsl(10, 50%)',
            'var(--colour)',
            'color-mix(in srgb, red, blue)',
        ];
        for (const value of notColours) expect(colorFromText(value)).toBeNull();
        expect(colorFromText(42)).toBeNull();
        expect(colorFromText(undefined)).toBeNull();
    });

    it('keeps channels and alpha within range', () => {
        expect(colorFromText('rgb(300, -5, 128, 2)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
    });
});

describe('parseColor', () => {
    it('reads a number as a Qlik colour and a text as a CSS colour', () => {
        expect(parseColor(4294901760)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
        expect(parseColor(null)).toBeNull();
    });
});

describe('relativeLuminance, mixColors and cssColor', () => {
    it('ranks black, a mid grey and white', () => {
        expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBe(0);
        expect(relativeLuminance({ r: 128, g: 128, b: 128, a: 1 })).toBeCloseTo(0.216, 2);
        expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBeCloseTo(1);
    });

    it('mixes towards another colour, keeping the first alpha', () => {
        const red = { r: 255, g: 0, b: 0, a: 0.5 };
        const white = { r: 255, g: 255, b: 255, a: 1 };
        expect(mixColors(red, white, 0.5)).toEqual({ r: 255, g: 127.5, b: 127.5, a: 0.5 });
        expect(mixColors(red, white, 2)).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
    });

    it('writes rgba() with rounded channels and a scaled alpha', () => {
        expect(cssColor({ r: 68.4, g: 119.6, b: 170, a: 1 })).toBe('rgba(68, 120, 170, 1)');
        expect(cssColor({ r: 68, g: 119, b: 170, a: 0.5 }, 0.25)).toBe('rgba(68, 119, 170, 0.125)');
    });
});
