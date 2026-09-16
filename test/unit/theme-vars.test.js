import { describe, it, expect, vi } from 'vitest';
import { isDarkTheme, luminance, themeVars } from '../../src/ui/theme-vars';

/** A stardust theme that resolves the given attributes on every style path. */
function theme(styles) {
    return { getStyle: vi.fn((_base, _path, attribute) => styles[attribute]) };
}

describe('luminance', () => {
    it('reads short and long hex colours', () => {
        expect(luminance('#fff')).toBeCloseTo(1);
        expect(luminance('#000000')).toBe(0);
        expect(luminance('#ffffff80')).toBeCloseTo(1);
    });

    it('reads rgb() and rgba() colours', () => {
        expect(luminance('rgb(0, 0, 0)')).toBe(0);
        expect(luminance('rgba(255,255,255,0.4)')).toBeCloseTo(1);
    });

    it('reads hsl() and named colours, which the old hex-and-rgb reader took for light', () => {
        expect(luminance('hsl(0, 0%, 12%)')).toBeLessThan(0.4);
        expect(luminance('black')).toBe(0);
        expect(luminance('White')).toBeCloseTo(1);
    });

    it('ranks a dark grey below a light grey', () => {
        expect(luminance('#323232')).toBeLessThan(0.4);
        expect(luminance('#f2f2f2')).toBeGreaterThan(0.4);
    });

    it('treats what it cannot read as light', () => {
        expect(luminance('transparent')).toBe(1);
        expect(luminance(undefined)).toBe(1);
        expect(luminance(42)).toBe(1);
    });
});

describe('isDarkTheme', () => {
    it("decides from the theme's resolved background", () => {
        expect(isDarkTheme(theme({ backgroundColor: '#1e1e1e' }))).toBe(true);
        expect(isDarkTheme(theme({ backgroundColor: '#ffffff' }))).toBe(false);
    });

    it('takes a theme without a background, or no theme at all, as light', () => {
        expect(isDarkTheme(theme({}))).toBe(false);
        expect(isDarkTheme(undefined)).toBe(false);
    });

    it('agrees with the custom properties, so highlights and bubbles never disagree', () => {
        const dark = theme({ backgroundColor: '#1e1e1e' });
        expect(isDarkTheme(dark)).toBe(true);
        expect(themeVars(dark)['--cqs-bubble-bg']).toBe('#2f3236');
        const light = theme({ backgroundColor: '#fafafa' });
        expect(isDarkTheme(light)).toBe(false);
        expect(themeVars(light)['--cqs-bubble-bg']).toBe('#f2f2f2');
    });
});
