/**
 * Colours an export can read, on whatever it is drawn on.
 *
 * A participant's colour comes from the theme's palette, which holds pale colours as well as deep ones:
 * a sky blue name on a white slide, or white initials on a pale yellow face, is a colour, not a word. On
 * screen the object is read up close; an export is read across a room. So a name is darkened (or, on a
 * dark theme, lightened) until it stands out from the page, and initials are written in whichever of
 * white and near-black stands out from the face. Pure.
 */
import { colorFromText, cssColor, mixColors, relativeLuminance } from '../theme/color-parse';

const BLACK = Object.freeze({ r: 0, g: 0, b: 0, a: 1 });
const WHITE = Object.freeze({ r: 255, g: 255, b: 255, a: 1 });

/** The contrast a name must have with the page: WCAG's for large and bold text. */
export const NAME_CONTRAST = 3;

/**
 * Work out the contrast between two colours, as WCAG defines it.
 *
 * @param {import('../theme/color-parse').Rgba} one - A colour.
 * @param {import('../theme/color-parse').Rgba} other - Another.
 * @returns {number} From 1, for the same luminance, to 21, for black on white.
 */
export function contrastRatio(one, other) {
    const a = relativeLuminance(one);
    const b = relativeLuminance(other);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Make a colour readable as text on a background.
 *
 * @param {*} color - The colour, as CSS text.
 * @param {*} background - The background, as CSS text.
 * @param {number} [minimum] - The contrast to reach.
 * @returns {*} The colour itself when it reads already, or when either cannot be read as a colour;
 *     otherwise the first mix towards black on a light background, or white on a dark one, in steps of a
 *     tenth, that reaches the contrast.
 */
export function readableOn(color, background, minimum = NAME_CONTRAST) {
    const ink = colorFromText(color);
    const page = colorFromText(background);
    if (ink === null || page === null) return color;
    const solid = { ...ink, a: 1 };
    if (contrastRatio(solid, page) >= minimum) return color;
    const target = relativeLuminance(page) >= 0.4 ? BLACK : WHITE;
    for (let step = 1; step <= 10; step++) {
        const mixed = mixColors(solid, target, step / 10);
        if (contrastRatio(mixed, page) >= minimum) return cssColor(mixed);
    }
    return cssColor(target);
}

/**
 * Pick the colour of initials on a face of a colour.
 *
 * @param {*} face - The face's colour, as CSS text.
 * @returns {string} White where it reads, near-black where it does not.
 */
export function initialsInk(face) {
    const color = colorFromText(face);
    if (color === null) return '#ffffff';
    return contrastRatio({ ...color, a: 1 }, WHITE) >= NAME_CONTRAST ? '#ffffff' : '#1f1f1f';
}
