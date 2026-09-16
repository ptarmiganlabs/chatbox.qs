/**
 * The settings for highlighting keywords in messages: their defaults, and how they are read back.
 *
 * chatbox.qs keeps most defaults inline, in three places — the object properties, each panel item's
 * `defaultValue`, and a fallback in render code — with nothing checking they agree. The settings here
 * have one definition instead, used by all three, so a default can never differ between a newly added
 * object and one whose panel has been opened. Reading validates every value, because a layout can
 * carry anything a property edit or an older version left there.
 *
 * Settings are read from the `chatbox` property bag, not the layout, so property-panel callbacks can
 * pass `data.chatbox` and render code `layout.chatbox`.
 *
 * Modelled on textview.qs `src/settings.js` at df84a5e.
 */
import { normalizeFieldName } from '../qix/field-ref';

/** The most values highlighted: the engine's per-call cell budget is 10,000. */
export const HIGHLIGHT_LIMIT_MAX = 10_000;

/** Every highlight setting and its default, as it is stored under `chatbox`. */
export const TEXT_TOOL_DEFAULTS = Object.freeze({
    // The overview ruler beside the conversation, for highlights and search matches alike.
    showRuler: true,
    highlight: Object.freeze({
        field: '',
        possibleWhenNoneSelected: true,
        limit: 1000,
        clickToSelect: true,
        showSummary: true,
    }),
    match: Object.freeze({
        caseSensitive: false,
        wholeValues: true,
        flexibleWhitespace: true,
    }),
    category: Object.freeze({
        field: '',
        colorExpression: '',
        showLegend: true,
        showLabels: false,
    }),
});

/**
 * Make a plain, mutable copy of the defaults, for object properties the engine will store.
 *
 * @returns {object} A deep copy of {@link TEXT_TOOL_DEFAULTS}.
 */
export function textToolSettingsBag() {
    return JSON.parse(JSON.stringify(TEXT_TOOL_DEFAULTS));
}

/**
 * Read a boolean setting.
 *
 * @param {*} value - The stored value.
 * @param {boolean} fallback - The default.
 * @returns {boolean} The value when it is a boolean, otherwise the default.
 */
function booleanOr(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

/**
 * Bring a highlight limit within what can be read.
 *
 * @param {*} value - The stored or typed limit.
 * @returns {number} A whole number from 1 to {@link HIGHLIGHT_LIMIT_MAX}; the default when the value is
 *     not a number at all.
 */
export function clampHighlightLimit(value) {
    const limit = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
    if (!Number.isFinite(limit)) return TEXT_TOOL_DEFAULTS.highlight.limit;
    return Math.min(HIGHLIGHT_LIMIT_MAX, Math.max(1, Math.round(limit)));
}

/**
 * Turn a typed colour expression into the expression the engine is given.
 *
 * The expression is stored as typed, not as an expression the engine evaluates into the layout: it is
 * evaluated once per category, as an attribute of the category column. Authors write expressions with
 * a leading "=" out of habit, and it is dropped.
 *
 * @param {*} value - The stored expression.
 * @returns {string} The expression without surrounding whitespace or a leading "=", or ''.
 */
export function normalizeColorExpression(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
}

/**
 * Read the highlight settings, falling back to the defaults for anything missing or invalid.
 *
 * @param {object} [bag] - The `chatbox` property bag of a layout or of the object properties.
 * @returns {{showRuler: boolean,
 *     highlight: {field: string, possibleWhenNoneSelected: boolean, limit: number,
 *     clickToSelect: boolean, showSummary: boolean},
 *     match: {caseSensitive: boolean, wholeValues: boolean, flexibleWhitespace: boolean},
 *     category: {field: string, colorExpression: string, showLegend: boolean,
 *     showLabels: boolean}}} The settings.
 */
export function readTextToolSettings(bag) {
    const highlight = bag?.highlight ?? {};
    const match = bag?.match ?? {};
    const category = bag?.category ?? {};
    const defaults = TEXT_TOOL_DEFAULTS;
    return {
        showRuler: booleanOr(bag?.showRuler, defaults.showRuler),
        highlight: {
            field: normalizeFieldName(highlight.field),
            possibleWhenNoneSelected: booleanOr(
                highlight.possibleWhenNoneSelected,
                defaults.highlight.possibleWhenNoneSelected
            ),
            limit: clampHighlightLimit(highlight.limit),
            clickToSelect: booleanOr(highlight.clickToSelect, defaults.highlight.clickToSelect),
            showSummary: booleanOr(highlight.showSummary, defaults.highlight.showSummary),
        },
        match: {
            caseSensitive: booleanOr(match.caseSensitive, defaults.match.caseSensitive),
            wholeValues: booleanOr(match.wholeValues, defaults.match.wholeValues),
            flexibleWhitespace: booleanOr(
                match.flexibleWhitespace,
                defaults.match.flexibleWhitespace
            ),
        },
        category: {
            field: normalizeFieldName(category.field),
            colorExpression: normalizeColorExpression(category.colorExpression),
            showLegend: booleanOr(category.showLegend, defaults.category.showLegend),
            showLabels: booleanOr(category.showLabels, defaults.category.showLabels),
        },
    };
}
