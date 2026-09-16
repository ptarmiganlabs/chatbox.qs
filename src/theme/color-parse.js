/**
 * Reading a colour from what a colour expression returned, and writing colours for CSS.
 *
 * A colour expression can answer in two ways, and both are read:
 *
 * - **A number**, the way Qlik's colour functions answer. `RGB()`, `ARGB()`, `HSL()` and `Color()`
 *   return a dual whose number is the colour as 0xAARRGGBB. A number without an alpha byte is taken as
 *   opaque: a colour nobody can see is never what an expression meant.
 * - **A text**, the way CSS writes colours: `#4477aa`, `#47a`, `rgb(68 119 170)`,
 *   `rgba(68, 119, 170, 0.5)`, `hsl(210, 43%, 47%)` or a named colour such as `steelblue`. Qlik's own
 *   text form of a colour, `RGB(68,119,170)` or `ARGB(255,68,119,170)`, is read as well.
 *
 * Anything else is not a colour, and the answer says so, so callers can tell "no colour" (an empty
 * answer) from "not a colour" (an answer that could not be read). CSS colours are written with
 * `rgba()` only, never `color-mix()`, which the browser that renders exports may not know.
 *
 * Ported from textview.qs `src/theme/color-parse.js` at df84a5e; only the import path changed.
 */
import { NAMED_COLORS } from './named-colors';

/**
 * @typedef {object} Rgba
 * @property {number} r - Red, 0 to 255.
 * @property {number} g - Green, 0 to 255.
 * @property {number} b - Blue, 0 to 255.
 * @property {number} a - Alpha, 0 to 1.
 */

/** The largest colour number: 0xFFFFFFFF. */
const MAX_COLOR_NUMBER = 0xffffffff;

/** Functional notations: the name, then everything between the parentheses. */
const FUNCTIONAL = /^(rgba?|argb|hsla?)\((.*)\)$/;

/** A number as CSS writes one, with an optional unit. */
const NUMBER = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg)?$/;

/**
 * Keep a number within bounds.
 *
 * @param {number} value - The number.
 * @param {number} low - The lower bound.
 * @param {number} high - The upper bound.
 * @returns {number} The number, clamped.
 */
function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
}

/**
 * Read a colour from a Qlik colour number.
 *
 * @param {*} value - The number, 0xAARRGGBB.
 * @returns {?Rgba} The colour, or null when the value is not a whole number in range.
 */
export function colorFromNumber(value) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_COLOR_NUMBER) return null;
    const alpha = Math.floor(value / 0x1000000) & 0xff;
    return {
        r: Math.floor(value / 0x10000) & 0xff,
        g: Math.floor(value / 0x100) & 0xff,
        b: value & 0xff,
        a: alpha === 0 ? 1 : alpha / 255,
    };
}

/**
 * Read a hex colour.
 *
 * @param {string} digits - The digits after "#": 3, 4, 6 or 8 of them.
 * @returns {?Rgba} The colour, or null when the digits are not a hex colour.
 */
function colorFromHex(digits) {
    if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(digits)) return null;
    const full = digits.length <= 4 ? [...digits].map((digit) => digit + digit).join('') : digits;
    /**
     * Read one channel's two digits.
     *
     * @param {number} at - Where the digits start.
     * @returns {number} The channel, 0 to 255.
     */
    const channel = (at) => parseInt(full.slice(at, at + 2), 16);
    return {
        r: channel(0),
        g: channel(2),
        b: channel(4),
        a: full.length === 8 ? channel(6) / 255 : 1,
    };
}

/**
 * Read one argument of a functional notation.
 *
 * @param {string} token - The argument, for example "50%" or "210deg".
 * @returns {?{value: number, unit: string}} The number and its unit ('' for none), or null.
 */
function readArgument(token) {
    const match = NUMBER.exec(token);
    return match ? { value: Number(match[1]), unit: match[2] ?? '' } : null;
}

/**
 * Read a colour channel: 0 to 255, or a percentage of that.
 *
 * @param {{value: number, unit: string}} argument - The argument.
 * @returns {?number} The channel, or null for a unit a channel cannot take.
 */
function channelOf({ value, unit }) {
    if (unit === '%') return clamp((value * 255) / 100, 0, 255);
    return unit === '' ? clamp(value, 0, 255) : null;
}

/**
 * Read an alpha value: 0 to 1, or a percentage.
 *
 * @param {{value: number, unit: string}} [argument] - The argument; opaque when missing.
 * @returns {?number} The alpha, or null for a unit alpha cannot take.
 */
function alphaOf(argument) {
    if (argument === undefined) return 1;
    if (argument.unit === '%') return clamp(argument.value / 100, 0, 1);
    return argument.unit === '' ? clamp(argument.value, 0, 1) : null;
}

/**
 * Convert a hue, saturation and lightness to red, green and blue.
 *
 * @param {number} hue - The hue in degrees.
 * @param {number} saturation - The saturation, 0 to 1.
 * @param {number} lightness - The lightness, 0 to 1.
 * @returns {number[]} Red, green and blue, 0 to 255.
 */
function hslToRgb(hue, saturation, lightness) {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const sector = (((hue % 360) + 360) % 360) / 60;
    const second = chroma * (1 - Math.abs((sector % 2) - 1));
    const [r, g, b] = [
        [chroma, second, 0],
        [second, chroma, 0],
        [0, chroma, second],
        [0, second, chroma],
        [second, 0, chroma],
        [chroma, 0, second],
    ][Math.floor(sector) % 6];
    const offset = lightness - chroma / 2;
    return [r, g, b].map((value) => (value + offset) * 255);
}

/**
 * Read a colour written in a functional notation.
 *
 * @param {string} name - The notation: rgb, rgba, argb, hsl or hsla.
 * @param {string} inside - What stands between the parentheses.
 * @returns {?Rgba} The colour, or null when the arguments do not fit the notation.
 */
function colorFromFunction(name, inside) {
    const tokens = inside.split(/[\s,/]+/).filter((token) => token !== '');
    const args = tokens.map(readArgument);
    if (args.includes(null)) return null;

    if (name === 'argb') {
        if (args.length !== 4) return null;
        const channels = args.map(channelOf);
        if (channels.includes(null)) return null;
        const [a, r, g, b] = channels;
        return { r, g, b, a: a / 255 };
    }
    if (args.length !== 3 && args.length !== 4) return null;
    const alpha = alphaOf(args[3]);
    if (alpha === null) return null;

    if (name.startsWith('rgb')) {
        const channels = args.slice(0, 3).map(channelOf);
        if (channels.includes(null)) return null;
        const [r, g, b] = channels;
        return { r, g, b, a: alpha };
    }

    const [hue, saturation, lightness] = args;
    if (hue.unit === '%' || saturation.unit === 'deg' || lightness.unit === 'deg') return null;
    const [r, g, b] = hslToRgb(
        hue.value,
        clamp(saturation.value / 100, 0, 1),
        clamp(lightness.value / 100, 0, 1)
    );
    return { r, g, b, a: alpha };
}

/**
 * Read a colour written as text.
 *
 * @param {*} value - The text.
 * @returns {?Rgba} The colour, or null when the text is not a colour.
 */
export function colorFromText(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim().toLowerCase();
    if (text.startsWith('#')) return colorFromHex(text.slice(1));

    const functional = FUNCTIONAL.exec(text);
    if (functional) return colorFromFunction(functional[1], functional[2]);

    const hex = NAMED_COLORS.get(text);
    return hex === undefined ? null : colorFromHex(hex);
}

/**
 * Read a colour from a number or a text.
 *
 * @param {*} value - A Qlik colour number or a CSS colour text.
 * @returns {?Rgba} The colour, or null when the value is neither.
 */
export function parseColor(value) {
    return typeof value === 'number' ? colorFromNumber(value) : colorFromText(value);
}

/**
 * Compute a colour's relative luminance.
 *
 * @param {Rgba} color - The colour.
 * @returns {number} Luminance from 0 (black) to 1 (white), ignoring alpha.
 */
export function relativeLuminance(color) {
    const [r, g, b] = [color.r, color.g, color.b].map((value) => {
        const channel = value / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Move a colour towards another.
 *
 * @param {Rgba} color - The colour.
 * @param {Rgba} other - The colour to move towards.
 * @param {number} weight - How far: 0 keeps the colour, 1 gives the other.
 * @returns {Rgba} The mixed colour, with the first colour's alpha.
 */
export function mixColors(color, other, weight) {
    const share = clamp(weight, 0, 1);
    /**
     * Mix one channel.
     *
     * @param {number} from - The channel in the first colour.
     * @param {number} to - The channel in the other colour.
     * @returns {number} The mixed channel.
     */
    const mix = (from, to) => from + (to - from) * share;
    return {
        r: mix(color.r, other.r),
        g: mix(color.g, other.g),
        b: mix(color.b, other.b),
        a: color.a,
    };
}

/**
 * Write a colour for CSS.
 *
 * @param {Rgba} color - The colour.
 * @param {number} [opacity] - A factor applied to the colour's own alpha.
 * @returns {string} The colour as `rgba()`, for example "rgba(68, 119, 170, 0.25)".
 */
export function cssColor(color, opacity = 1) {
    /**
     * Write one channel as a whole number.
     *
     * @param {number} value - The channel.
     * @returns {number} The channel, rounded and within 0 to 255.
     */
    const channel = (value) => Math.round(clamp(value, 0, 255));
    const alpha = Math.round(clamp(color.a * opacity, 0, 1) * 1000) / 1000;
    return `rgba(${channel(color.r)}, ${channel(color.g)}, ${channel(color.b)}, ${alpha})`;
}
