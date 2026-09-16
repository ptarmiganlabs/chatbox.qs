/**
 * Writing counts in what the object says, the same way on every host.
 *
 * Counts use en-US digit grouping whatever the browser's locale, so a message reads the same in every
 * screenshot, log and test. Nothing here translates.
 *
 * Ported from textview.qs `src/render/format.js` at df84a5e, unchanged.
 */

/** Counts are formatted the same way on every host, whatever its locale. */
const COUNT = new Intl.NumberFormat('en-US');

/**
 * Write a count.
 *
 * @param {number} count - The count.
 * @returns {string} For example "20,017".
 */
export function formatCount(count) {
    return COUNT.format(count);
}

/**
 * Write a count with its noun.
 *
 * @param {number} count - The count.
 * @param {string} singular - The noun for one.
 * @param {string} plural - The noun for any other count.
 * @returns {string} For example "1 highlight" or "2,345 highlights".
 */
export function counted(count, singular, plural) {
    return `${COUNT.format(count)} ${count === 1 ? singular : plural}`;
}
