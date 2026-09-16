/**
 * Bridge the Qlik theme into CSS custom properties.
 *
 * `useTheme()` returns a JavaScript object, not CSS variables, so the values
 * are read once per render and written onto the extension root; the static
 * CSS module then consumes them. That keeps all styling in a real stylesheet
 * while still following the app theme.
 *
 * Note the API surface is narrower than some documentation suggests: there is
 * no `theme.validateColor` and no `isDark()`. Light/dark is derived here from
 * the resolved background's relative luminance.
 */
import { colorFromText, relativeLuminance } from '../theme/color-parse';

/** Fallbacks used when the theme resolves nothing. */
const DEFAULTS = {
    background: '#ffffff',
    text: '#404040',
    muted: '#6c6c6c',
    border: '#d9d9d9',
    bubble: '#f2f2f2',
};

/**
 * Read a style value from the theme, walking progressively broader fallbacks.
 *
 * `getStyle` searches upward from its base path, so how the path is split
 * determines how far the search reaches — hence several attempts.
 *
 * @param {object} [theme] - The stardust theme object.
 * @param {string} attribute - The attribute to resolve, e.g. 'backgroundColor'.
 * @returns {?string} The resolved value, or null.
 */
function resolveStyle(theme, attribute) {
    if (!theme?.getStyle) return null;
    const attempts = [
        ['object', 'chatboxQs', attribute],
        ['object', '', attribute],
        ['', '', attribute],
    ];
    for (const [base, path, attr] of attempts) {
        try {
            const value = theme.getStyle(base, path, attr);
            if (value) return value;
        } catch {
            // A theme that throws must not take the render down with it.
        }
    }
    return null;
}

/**
 * Compute relative luminance for a CSS colour, for light/dark detection.
 *
 * @param {*} color - A CSS colour text: hex, rgb(), hsl() or a name.
 * @returns {number} Luminance in 0..1; defaults to 1 (light) when unparseable.
 */
export function luminance(color) {
    const parsed = colorFromText(color);
    return parsed === null ? 1 : relativeLuminance(parsed);
}

/**
 * Decide whether the theme puts objects on a dark background.
 *
 * The one place the light/dark threshold lives: the custom properties below and the highlight
 * colours both follow it.
 *
 * @param {object} [theme] - The stardust theme object.
 * @returns {boolean} True when the resolved background is dark.
 */
export function isDarkTheme(theme) {
    return luminance(resolveStyle(theme, 'backgroundColor') || DEFAULTS.background) < 0.4;
}

/**
 * Build the CSS custom properties for the current theme.
 *
 * @param {object} [theme] - The stardust theme object.
 * @returns {object} A style object of CSS custom properties.
 */
export function themeVars(theme) {
    const background = resolveStyle(theme, 'backgroundColor') || DEFAULTS.background;
    const isDark = isDarkTheme(theme);

    const text = resolveStyle(theme, 'color') || (isDark ? '#f0f0f0' : DEFAULTS.text);
    const fontFamily =
        resolveStyle(theme, 'fontFamily') ||
        "'QlikView Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    return {
        '--cqs-bg': background,
        '--cqs-text': text,
        '--cqs-muted': isDark ? '#a8a8a8' : DEFAULTS.muted,
        '--cqs-border': isDark ? '#4a4a4a' : DEFAULTS.border,
        '--cqs-bubble-bg': isDark ? '#2f3236' : DEFAULTS.bubble,
        '--cqs-bubble-own-bg': isDark ? '#26414f' : '#e3f1fb',
        '--cqs-font': fontFamily,
        '--cqs-radius': '10px',
        // Highlights, search matches and the bar above the conversation (from textview.qs).
        '--cqs-highlight': isDark ? 'rgba(255, 196, 0, 0.28)' : 'rgba(255, 196, 0, 0.35)',
        '--cqs-highlight-line': isDark ? '#e0b000' : '#b58900',
        '--cqs-find': isDark ? 'rgba(255, 160, 60, 0.45)' : 'rgba(255, 140, 0, 0.45)',
        '--cqs-current': isDark ? '#f0f0f0' : '#262626',
        '--cqs-ruler': isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        '--cqs-selected': '#009845',
        '--cqs-focus': isDark ? '#8cc4e6' : '#3f8ab3',
    };
}

export default themeVars;
