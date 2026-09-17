/**
 * Message kinds shown as chips: the settings, and how a kind expression's text becomes a list of values.
 *
 * A message can have several kinds — tags, labels, a ticket's categories — and the kind expression
 * returns them as one text, joined with a separator: `Concat(DISTINCT [MsgKind], ',')`. `Only()` returns
 * nothing for a message with more than one, which is why the panel says to use Concat.
 *
 * The settings have one definition, used by the object properties, the panel's defaults and the render
 * code, as `src/highlight/settings.js` does for highlighting. They live under `chatbox.kindChips`, never
 * under `chatbox.attrs`: that bag is copied into the cube's attribute expressions, and any value there, even
 * an empty one, would make a panel never filled in look like one that was (src/qix/sync-attrs.js).
 */

/** The most chips a message can be set to show. */
export const KIND_CHIPS_MAX = 20;

/** The most distinct kinds kept per message, whatever the setting; more are counted as "and more". */
export const KINDS_KEPT_MAX = 100;

/** The separators on offer; `none` keeps the whole text as one kind. */
export const KIND_SEPARATORS = Object.freeze([',', ';', '|', 'none']);

/** Every kind chip setting and its default, as stored under `chatbox.kindChips`. */
export const KIND_CHIP_DEFAULTS = Object.freeze({
    show: false,
    max: 3,
    separator: ',',
});

/**
 * Make a plain, mutable copy of the defaults, for object properties the engine will store.
 *
 * @returns {{show: boolean, max: number, separator: string}} A copy of {@link KIND_CHIP_DEFAULTS}.
 */
export function kindChipsBag() {
    return { ...KIND_CHIP_DEFAULTS };
}

/**
 * Bring a chip count within what a bubble shows.
 *
 * @param {*} value - The stored or typed count.
 * @returns {number} A whole number from 1 to {@link KIND_CHIPS_MAX}; the default when the value is not a
 *     number at all.
 */
export function clampKindChipsMax(value) {
    const blank = value === null || (typeof value === 'string' && value.trim() === '');
    const count = blank ? NaN : Number(value);
    if (!Number.isFinite(count)) return KIND_CHIP_DEFAULTS.max;
    return Math.min(KIND_CHIPS_MAX, Math.max(1, Math.round(count)));
}

/**
 * Read the kind chip settings, falling back to the defaults for anything missing or invalid.
 *
 * @param {object} [bag] - The `chatbox.kindChips` bag of a layout or of the object properties.
 * @returns {{show: boolean, max: number, separator: string}} The settings.
 */
export function readKindChipSettings(bag) {
    return {
        show: bag?.show === true,
        max: clampKindChipsMax(bag?.max),
        separator: KIND_SEPARATORS.includes(bag?.separator)
            ? bag.separator
            : KIND_CHIP_DEFAULTS.separator,
    };
}

/**
 * Split a kind expression's text into its values.
 *
 * @param {?string} text - The kind, as `attrText` reads it: null when there is none.
 * @param {string} separator - One of {@link KIND_SEPARATORS}.
 * @returns {{kinds: string[], capped: boolean}} The distinct values in the order they first appear, with
 *     surrounding whitespace and empty values dropped, at most {@link KINDS_KEPT_MAX}; `capped` when there
 *     were more.
 */
export function splitKinds(text, separator) {
    if (typeof text !== 'string') return { kinds: [], capped: false };
    const parts = separator === 'none' ? [text] : text.split(separator);
    return mergeKinds([], parts);
}

/**
 * Add values to a list of kinds.
 *
 * @param {string[]} kinds - The kinds so far, distinct; not changed.
 * @param {Array<string>} more - The values to add, in order.
 * @param {boolean} [capped] - Whether `kinds` already left some out.
 * @returns {{kinds: string[], capped: boolean}} The union in first-seen order, trimmed, without empty
 *     values, at most {@link KINDS_KEPT_MAX}; `capped` when any were left out.
 */
export function mergeKinds(kinds, more, capped = false) {
    const out = [...kinds];
    const seen = new Set(out);
    let left = capped;
    for (const part of more ?? []) {
        const kind = typeof part === 'string' ? part.trim() : '';
        if (kind === '' || seen.has(kind)) continue;
        if (out.length >= KINDS_KEPT_MAX) {
            left = true;
            continue;
        }
        seen.add(kind);
        out.push(kind);
    }
    return { kinds: out, capped: left };
}
