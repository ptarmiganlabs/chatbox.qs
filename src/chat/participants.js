/**
 * Participant identity, colour and side resolution.
 *
 * Colour keys off `qElemNumber` — the field value's symbol rank in the Qlik
 * data model — rather than order of appearance. That rank is stable across
 * selections and across paging, so a participant keeps the same colour when
 * the user scrolls or filters. Keying off "index first seen" would recolour
 * people mid-scroll, which looks like a rendering bug and is very hard to
 * attribute once reported.
 */

/** Fallback palette, used when the Qlik theme exposes no data palette. */
const FALLBACK_PALETTE = [
    '#4477aa',
    '#ee6677',
    '#228833',
    '#ccbb44',
    '#66ccee',
    '#aa3377',
    '#bbbbbb',
    '#ee8866',
];

/** Colour for synthetic rows (Total, Null, Others) which have no real identity. */
const UNKNOWN_COLOR = '#9e9e9e';

/**
 * Pick a stable colour for a participant.
 *
 * @param {number} elem - The participant's qElemNumber.
 * @param {string[]} palette - Colours to choose from.
 * @returns {string} A colour from the palette, or the unknown-participant grey.
 */
export function colorForElem(elem, palette) {
    if (!Array.isArray(palette) || palette.length === 0) palette = FALLBACK_PALETTE;
    if (typeof elem !== 'number' || elem < 0) return UNKNOWN_COLOR;
    // Modulo twice so a negative input can never yield a negative index.
    const index = ((elem % palette.length) + palette.length) % palette.length;
    return palette[index];
}

/**
 * Extract a CATEGORICAL colour palette from a Qlik theme.
 *
 * `getDataColorPalettes()` returns a mixed list: sequential and single-colour
 * palettes sit alongside categorical ones, and the first entry is not reliably
 * categorical. Taking `[0]` blindly can yield a one-colour palette, which makes
 * every participant the same colour — the modulo always lands on index 0.
 *
 * So pick the richest flat colour array on offer, and only accept it if it has
 * enough distinct colours to actually distinguish participants.
 *
 * @param {object} [theme] - The stardust theme object.
 * @returns {string[]} Palette colours, falling back to a built-in set.
 */
export function paletteFromTheme(theme) {
    try {
        const palettes = theme?.getDataColorPalettes?.();
        if (!Array.isArray(palettes)) return FALLBACK_PALETTE;

        let best = [];
        for (const palette of palettes) {
            const raw = palette?.colors;
            if (!Array.isArray(raw) || raw.length === 0) continue;
            // A scale palette nests its colours one level deeper.
            const colors = Array.isArray(raw[0]) ? raw[raw.length - 1] : raw;
            if (!Array.isArray(colors)) continue;
            const flat = colors.filter((c) => typeof c === 'string' && c);
            if (flat.length > best.length) best = flat;
        }

        // Below four colours it is not a categorical palette worth using.
        if (best.length >= 4) return best;
    } catch {
        // A theme that throws is not worth failing a render over.
    }
    return FALLBACK_PALETTE;
}

/**
 * Decide which participants sit on the right-hand side.
 *
 * Precedence, highest first:
 *   1. The `side` attribute expression (0/1 per message) — the data model wins.
 *   2. The `ownParticipant` property, matched case-insensitively. Accepts a
 *      literal, or an expression such as `=OSUser()` resolved before this call.
 *   3. Automatic: with exactly two participants, the author of the LAST message
 *      in the full cube goes right. Anchoring on the last message rather than
 *      the first keeps sides stable as the user pages backwards; anchoring on
 *      the loaded page would flip them mid-scroll.
 *
 * With one participant, or three or more, everything stays left — right
 * alignment carries no meaning beyond two parties.
 *
 * @param {object} options - Resolution inputs.
 * @param {string[]} options.authorKeys - Distinct participant keys, in first-seen order.
 * @param {?string} options.ownParticipant - Configured "me" value, if any.
 * @param {?string} options.lastAuthorKey - Author of the final message in the cube.
 * @returns {Set<string>} The participant keys that render right-aligned.
 */
export function resolveRightSide({ authorKeys, ownParticipant, lastAuthorKey }) {
    const right = new Set();
    const keys = Array.isArray(authorKeys) ? authorKeys : [];

    const own = typeof ownParticipant === 'string' ? ownParticipant.trim().toLowerCase() : '';
    if (own) {
        const match = keys.find((k) => k.toLowerCase() === own);
        if (match) {
            right.add(match);
            return right;
        }
    }

    if (keys.length === 2 && lastAuthorKey && keys.includes(lastAuthorKey)) {
        right.add(lastAuthorKey);
    }

    return right;
}

export { FALLBACK_PALETTE, UNKNOWN_COLOR };
