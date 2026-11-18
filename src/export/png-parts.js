/**
 * Cutting an exported conversation into images.
 *
 * A slide is 16:9, so a conversation that does not fit one is cut into several, each ready to paste onto
 * a slide of its own; one tall image is cut too, only where a browser can no longer draw it in one
 * canvas. Either way the cut falls between rows, never through a message, and a day heading is never
 * left at the foot of an image with its messages on the next. Pure.
 */
import { IMAGE_PADDING, SLIDE_MIN_WIDTH } from './export-styles';

/** How many device pixels an image has per CSS pixel: 960 CSS pixels wide makes a 1920 × 1080 slide. */
export const IMAGE_SCALE = 2;

/** The tallest canvas Chrome, Edge and Firefox all draw, in device pixels. */
const CANVAS_MAX_SIDE = 32000;

/** The largest canvas they all draw, in device pixels, with room to spare. */
const CANVAS_MAX_AREA = 240000000;

/**
 * How far a slide may shrink to take one more row rather than leave it for the next slide. Text at 92%
 * of its size reads the same; a slide with one message on it, left over from the one before, does not.
 */
export const SLIDE_SHRINK = 0.92;

/**
 * Work out the size of a slide.
 *
 * @param {number} sheetWidth - How wide the conversation is drawn.
 * @returns {{width: number, height: number}} At least 960 × 540 CSS pixels, wider for conversations side by
 *     side, always 16:9.
 */
export function slideSize(sheetWidth) {
    const width = Math.max(SLIDE_MIN_WIDTH, Math.ceil(sheetWidth + 2 * IMAGE_PADDING.x));
    return { width, height: Math.round((width * 9) / 16) };
}

/**
 * Work out how tall one tall image may be.
 *
 * @param {number} width - The image's width in CSS pixels.
 * @param {number} [scale] - Device pixels per CSS pixel.
 * @returns {number} The most CSS pixels a canvas of that width can hold.
 */
export function tallLimit(width, scale = IMAGE_SCALE) {
    const bySide = Math.floor(CANVAS_MAX_SIDE / scale);
    const byArea = Math.floor(CANVAS_MAX_AREA / (Math.max(1, width) * scale * scale));
    return Math.max(1, Math.min(bySide, byArea));
}

/**
 * Cut the rows into parts that each fit the room an image has for them.
 *
 * @param {Array<{kind: string, height: number}>} rows - Every row, in order, with its measured height.
 * @param {object} room - How much room the rows have.
 * @param {number} room.first - On the first image, which has the title block.
 * @param {number} room.rest - On every other image.
 * @param {number} [room.shrink] - How far an image may be shrunk to hold more, from 1 for not at all;
 *     an image that is then drawn shrinks by {@link fitFactor}.
 * @returns {Array<{start: number, end: number}>} The parts, as row ranges with `end` exclusive; one row
 *     too tall for any image is a part on its own.
 */
export function planParts(rows, { first, rest, shrink = 1 }) {
    const stretch = shrink > 0 && shrink <= 1 ? 1 / shrink : 1;
    const parts = [];
    let start = 0;
    let used = 0;
    let room = first * stretch;
    for (let index = 0; index < rows.length; index++) {
        const height = Math.max(0, Number(rows[index].height) || 0);
        if (index > start && used + height > room) {
            let end = index;
            // A day heading belongs with the messages under it.
            while (end - 1 > start && rows[end - 1].kind === 'day') end -= 1;
            parts.push({ start, end });
            start = end;
            used = rows
                .slice(start, index)
                .reduce((sum, row) => sum + (Number(row.height) || 0), 0);
            room = rest * stretch;
        }
        used += height;
    }
    if (start < rows.length || parts.length === 0) parts.push({ start, end: rows.length });
    return parts;
}

/**
 * Work out how much a slide's content must shrink to fit it.
 *
 * @param {number} needed - How tall the content is.
 * @param {number} room - How tall the slide's room for it is.
 * @returns {number} 1 when it fits; otherwise the factor that makes it fit, never below a quarter.
 */
export function fitFactor(needed, room) {
    if (!(needed > room) || !(room > 0)) return 1;
    return Math.max(0.25, Math.floor((room / needed) * 1000) / 1000);
}
