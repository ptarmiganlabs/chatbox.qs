/**
 * Colours from the app theme: one palette for participants and for highlight categories, and the tint,
 * underline and label colours a highlight in a given colour is drawn with.
 *
 * Colour keys off `qElemNumber` — the field value's symbol rank in the Qlik data model — rather than
 * order of appearance. That rank is stable across selections and across paging, so a participant or a
 * category keeps the same colour when the user scrolls or filters. Keying off "index first seen" would
 * recolour people and categories mid-scroll, which looks like a rendering bug and is very hard to
 * attribute once reported. Two values share a colour only when their field holds more values than the
 * palette has colours; a category can also share an author's colour, since both draw from one palette.
 *
 * Theme palettes include pale colours, and a pale underline disappears on a light background, so
 * underlines and labels are darkened (or, on a dark theme, lightened) until they stand out.
 *
 * Merged from chatbox.qs's own participant colours and textview.qs `src/theme/palette.js` at df84a5e:
 * `colorForElem` replaces textview's `paletteColor`, and textview's stricter `paletteFromTheme` keeps
 * only entries that parse as colours, because highlight colours are computed from them.
 */
import { colorFromText, cssColor, mixColors, relativeLuminance } from './color-parse';

/** Fallback palette, used when the Qlik theme exposes no data palette. */
export const FALLBACK_PALETTE = Object.freeze([
    '#4477aa',
    '#ee6677',
    '#228833',
    '#ccbb44',
    '#66ccee',
    '#aa3377',
    '#bbbbbb',
    '#ee8866',
]);

/** Colour for synthetic rows (Total, Null, Others) which have no real identity. */
export const UNKNOWN_COLOR = '#9e9e9e';

/** The colour of a highlight whose value has no category: the same grey. */
export const NO_CATEGORY_COLOR = UNKNOWN_COLOR;

/** Below four colours a palette cannot tell participants or categories apart. */
const MIN_PALETTE_SIZE = 4;

/** How strongly a highlight's tint shows through, on a light and on a dark background. */
const FILL_OPACITY = Object.freeze({ light: 0.25, dark: 0.35 });

/** What pale and deep colours are moved towards. */
const BLACK = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
const WHITE = Object.freeze({ r: 255, g: 255, b: 255, a: 1 });

/**
 * Pick a stable colour for a participant or a category.
 *
 * @param {number} elem - The value's qElemNumber.
 * @param {string[]} palette - Colours to choose from.
 * @returns {string} A colour from the palette, or the unknown grey for a null or synthetic row.
 */
export function colorForElem(elem, palette) {
    if (!Array.isArray(palette) || palette.length === 0) palette = FALLBACK_PALETTE;
    if (!Number.isInteger(elem) || elem < 0) return UNKNOWN_COLOR;
    return palette[elem % palette.length];
}

/**
 * Extract a CATEGORICAL colour palette from a Qlik theme.
 *
 * `getDataColorPalettes()` returns a mixed list: sequential and single-colour palettes sit alongside
 * categorical ones, and the first entry is not reliably categorical. Taking `[0]` blindly can yield a
 * one-colour palette, which makes every participant the same colour — the modulo always lands on
 * index 0. So the richest flat list of colours on offer is taken, the largest step of a pyramid
 * palette included, and only when it has enough colours to tell values apart. Qlik's "100 Colors"
 * palette starts with the same twelve colours as its "12 Colors" palette.
 *
 * @param {object} [theme] - The stardust theme object.
 * @returns {string[]} Palette colours, falling back to a built-in set.
 */
export function paletteFromTheme(theme) {
    try {
        const palettes = theme?.getDataColorPalettes?.();
        let best = [];
        for (const palette of Array.isArray(palettes) ? palettes : []) {
            const raw = palette?.colors;
            if (!Array.isArray(raw) || raw.length === 0) continue;
            // A scale or pyramid palette nests one list per size; the last one is the largest.
            const colors = Array.isArray(raw[0]) ? raw[raw.length - 1] : raw;
            if (!Array.isArray(colors)) continue;
            const usable = colors.filter((color) => colorFromText(color) !== null);
            if (usable.length > best.length) best = usable;
        }
        if (best.length >= MIN_PALETTE_SIZE) return best;
    } catch {
        // A theme that throws is not worth failing a render over.
    }
    return [...FALLBACK_PALETTE];
}

/**
 * Move a colour towards black or white until its luminance passes a bound.
 *
 * @param {import('./color-parse').Rgba} color - The colour.
 * @param {boolean} lighten - Move towards white rather than black.
 * @param {number} bound - The luminance to reach: at most this when darkening, at least when lightening.
 * @returns {import('./color-parse').Rgba} The first colour, in steps of a tenth, that passes; at the
 *     last step, white or black itself.
 */
function adjustLuminance(color, lighten, bound) {
    const target = lighten ? WHITE : BLACK;
    /**
     * Tell whether a colour has passed the bound.
     *
     * @param {import('./color-parse').Rgba} mixed - The colour so far.
     * @returns {boolean} True once it is dark or light enough.
     */
    const passes = (mixed) => {
        const luminance = relativeLuminance(mixed);
        return lighten ? luminance >= bound : luminance <= bound;
    };
    let step = 0;
    let mixed = color;
    while (step < 10 && !passes(mixed)) {
        step += 1;
        mixed = mixColors(color, target, step / 10);
    }
    return mixed;
}

/**
 * Work out the colours a highlight in a given colour is drawn with.
 *
 * @param {import('./color-parse').Rgba} color - The category's colour.
 * @param {object} [options] - Options.
 * @param {boolean} [options.dark] - Whether the background is dark.
 * @returns {{fill: string, line: string, ink: string}} CSS colours: the tint behind the text, the
 *     underline (also the legend swatch and the ruler tick), and the text of a category label.
 */
export function highlightColors(color, { dark = false } = {}) {
    const line = dark ? adjustLuminance(color, true, 0.25) : adjustLuminance(color, false, 0.35);
    const ink = dark ? adjustLuminance(color, true, 0.45) : adjustLuminance(color, false, 0.12);
    return {
        fill: cssColor(color, dark ? FILL_OPACITY.dark : FILL_OPACITY.light),
        line: cssColor(line),
        ink: cssColor({ ...ink, a: 1 }),
    };
}
