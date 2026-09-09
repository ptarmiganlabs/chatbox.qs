/**
 * Shared build-date helper.
 *
 * CommonJS on purpose: it is required by `nebula.config.cjs` (CJS) and by
 * `scripts/post-build.mjs` (ESM, via createRequire), so both stamp an identical
 * value into the bundle.
 */

/**
 * Build a human-readable build timestamp, e.g. "9 September 2026, 18:42".
 *
 * @returns {string} The formatted build date.
 */
function buildDateString() {
    const now = new Date();
    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];
    /**
     * Zero-pad a number to two digits.
     *
     * @param {number} n - The number to pad.
     * @returns {string} The padded string.
     */
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

module.exports = { buildDateString };
