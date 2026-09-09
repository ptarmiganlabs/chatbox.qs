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
 * @param {string} color - A hex or rgb() colour.
 * @returns {number} Luminance in 0..1; defaults to 1 (light) when unparseable.
 */
export function luminance(color) {
    if (typeof color !== 'string') return 1;
    let r;
    let g;
    let b;

    const hex = color.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(hex)) {
        [r, g, b] = [...hex].map((c) => parseInt(c + c, 16));
    } else if (/^[0-9a-f]{6,8}$/i.test(hex)) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
    } else {
        const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color);
        if (!m) return 1;
        [, r, g, b] = m.map(Number);
    }

    const srgb = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/**
 * Build the CSS custom properties for the current theme.
 *
 * @param {object} [theme] - The stardust theme object.
 * @returns {object} A style object of CSS custom properties.
 */
export function themeVars(theme) {
    const background = resolveStyle(theme, 'backgroundColor') || DEFAULTS.background;
    const isDark = luminance(background) < 0.4;

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
    };
}

export default themeVars;
