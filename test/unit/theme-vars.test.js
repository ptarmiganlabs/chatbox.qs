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

describe('highlight colours', () => {
    it('defines the highlight, search and current colours for light and dark themes', () => {
        const light = themeVars(theme({ backgroundColor: '#ffffff' }));
        const dark = themeVars(theme({ backgroundColor: '#1e1e1e' }));
        for (const name of [
            '--cqs-highlight',
            '--cqs-highlight-line',
            '--cqs-find',
            '--cqs-current',
            '--cqs-ruler',
            '--cqs-selected',
            '--cqs-focus',
        ]) {
            expect(light[name], name).toBeTruthy();
            expect(dark[name], name).toBeTruthy();
        }
        expect(light['--cqs-current']).toBe('#262626');
        expect(dark['--cqs-current']).toBe('#f0f0f0');
    });
});

describe('the font family and the font size are separate properties', () => {
    it('names the family --cqs-font-family, and never --cqs-font', () => {
        // One name for both meant `font-family: 13px`, which is invalid at computed-value time, so
        // the themed family was silently dropped and the client's own was inherited (GOTCHAS 38).
        const vars = themeVars(theme({ fontFamily: 'Comic Sans MS' }));
        expect(vars['--cqs-font-family']).toBe('Comic Sans MS');
        expect(vars['--cqs-font']).toBeUndefined();
        expect(vars['--cqs-font-size']).toBeUndefined();
    });

    it('tints a pressed toolbar button away from the bar it sits in, on either theme', () => {
        const light = themeVars(theme({ backgroundColor: '#ffffff' }));
        const dark = themeVars(theme({ backgroundColor: '#1e1e1e' }));
        expect(light['--cqs-pressed']).toMatch(/rgba\(0, 0, 0/);
        expect(dark['--cqs-pressed']).toMatch(/rgba\(255, 255, 255/);
        expect(light['--cqs-groupbg']).toMatch(/rgba\(0, 0, 0/);
        expect(dark['--cqs-groupbg']).toMatch(/rgba\(255, 255, 255/);
    });
});
