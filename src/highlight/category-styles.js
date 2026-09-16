/**
 * How categories look: their order in the legend, and how each highlight is drawn and titled.
 *
 * A category's colour comes from the colour expression when it returned a colour, and otherwise from the
 * theme palette by the category's element number. An answer that is not a colour falls back the same
 * way, and the first such answer is kept, so the viewer can say what the expression returned instead
 * of quietly showing theme colours.
 *
 * The legend lists categories alphabetically, the same way on every host. A value in several
 * categories is tinted in the colour of the first of them in that order, its underline shows all of
 * them side by side, and its label and tooltip name all of them. While the categories cannot be read —
 * the field is not in the data model, or the engine failed — nothing is presented as having no
 * category: highlights keep the plain highlight colour.
 *
 * It builds no DOM.
 *
 * Ported from textview.qs `src/render/categories.js` at df84a5e. Changed: colours come from the palette
 * chatbox.qs shares with its participants, and a highlight's custom properties are named `--cqs-mark-*`.
 */
import { colorFromText, parseColor } from '../theme/color-parse';
import { NO_CATEGORY_COLOR, colorForElem, highlightColors } from '../theme/palette';

/** What a highlight without a category is called in the legend, its label and its tooltip. */
export const NO_CATEGORY_LABEL = 'No category';

/** Category names sort the same way on every host, whatever its locale. */
const NAME_ORDER = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** The styles while categories are not in use. */
const NO_STYLES = Object.freeze({
    enabled: false,
    order: Object.freeze([]),
    byName: new Map(),
    none: null,
    invalidColor: null,
    key: 'off',
});

/**
 * Order two category names.
 *
 * @param {string} a - A name.
 * @param {string} b - Another name.
 * @returns {number} Negative when `a` comes first.
 */
function byName(a, b) {
    return NAME_ORDER.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Work out one category's colour.
 *
 * @param {{elemNumber: number, color: ?{text: string, number: ?number}}} category - The category.
 * @param {string[]} [palette] - The theme palette.
 * @returns {{color: import('../theme/color-parse').Rgba, invalid: ?string}} The colour, and what the
 *     colour expression returned when that was not a colour.
 */
function colorOfCategory(category, palette) {
    const fromPalette = colorFromText(colorForElem(category.elemNumber, palette));
    const fallback = fromPalette ?? colorFromText(NO_CATEGORY_COLOR);
    const answer = category.color;
    if (!answer) return { color: fallback, invalid: null };

    const color =
        (answer.number !== null ? parseColor(answer.number) : null) ??
        (answer.text !== '' ? parseColor(answer.text) : null);
    if (color) return { color, invalid: null };
    return { color: fallback, invalid: answer.text !== '' ? answer.text : String(answer.number) };
}

/**
 * Work out how the categories look.
 *
 * @param {object} request - What to style.
 * @param {?object} request.categories - The highlight source's categories, or null without a category
 *     field.
 * @param {string[]} [request.palette] - The theme palette.
 * @param {boolean} [request.dark] - Whether the background is dark.
 * @returns {{enabled: boolean, order: string[], byName: Map<string, object>, none: ?object,
 *     invalidColor: ?string, key: string}} Whether categories are in use, their names in legend order,
 *     each name's style (`name`, `index`, `fill`, `line`, `ink`), the style of highlights without a
 *     category, the first colour expression answer that is not a colour, and a key that changes
 *     whenever any of it does.
 */
export function categoryStyles({ categories, palette, dark = false }) {
    if (!categories || categories.problem) return NO_STYLES;

    const list = Array.isArray(categories.list) ? categories.list : [];
    const order = [...new Set(list.map((category) => category.name))].sort(byName);
    const styles = new Map();
    let invalidColor = null;
    for (const category of list) {
        if (styles.has(category.name)) continue;
        const { color, invalid } = colorOfCategory(category, palette);
        if (invalidColor === null) invalidColor = invalid;
        styles.set(category.name, { name: category.name, ...highlightColors(color, { dark }) });
    }
    const byNameInOrder = new Map(
        order.map((name, index) => [name, { ...styles.get(name), index }])
    );
    const none = {
        name: null,
        index: order.length,
        ...highlightColors(colorFromText(NO_CATEGORY_COLOR), { dark }),
    };
    const key = JSON.stringify([
        dark,
        order.map((name) => {
            const style = byNameInOrder.get(name);
            return [name, style.fill, style.line, style.ink];
        }),
        none.line,
    ]);
    return { enabled: true, order, byName: byNameInOrder, none, invalidColor, key };
}

/**
 * Write the colours of an underline or a ruler tick: one colour, or several side by side.
 *
 * @param {string[]} colors - CSS colours, in order.
 * @returns {string} A CSS image. Hard colour stops are written out in full, which every browser that
 *     renders exports understands.
 */
export function stripes(colors) {
    if (colors.length === 1) return `linear-gradient(${colors[0]}, ${colors[0]})`;
    const stops = colors.map((color, index) => {
        const from = Math.round((index / colors.length) * 1000) / 10;
        const to = Math.round(((index + 1) / colors.length) * 1000) / 10;
        return `${color} ${from}%, ${color} ${to}%`;
    });
    return `linear-gradient(to right, ${stops.join(', ')})`;
}

/**
 * Find the styles of a highlight's categories, in legend order.
 *
 * @param {{categories?: string[]}} span - The highlight.
 * @param {object} styles - From {@link categoryStyles}, with categories in use.
 * @returns {object[]} The styles of the categories it belongs to, or the no-category style alone.
 */
export function stylesOfSpan(span, styles) {
    const found = [];
    for (const name of Array.isArray(span.categories) ? span.categories : []) {
        const style = styles.byName.get(name);
        if (style && !found.includes(style)) found.push(style);
    }
    return found.length > 0 ? found.sort((a, b) => a.index - b.index) : [styles.none];
}

/**
 * Describe how to draw one highlight.
 *
 * @param {{values?: string[], categories?: string[]}} span - The highlight.
 * @param {object} styles - From {@link categoryStyles}.
 * @returns {{title: string, label: ?string, style: ?{[name: string]: string}}} The tooltip, the category
 *     label, and custom properties for the mark; no label or properties while categories are not in
 *     use.
 */
export function describeSpan(span, styles) {
    const values = Array.isArray(span.values) ? span.values.join(', ') : '';
    if (!styles.enabled) return { title: values, label: null, style: null };

    const parts = stylesOfSpan(span, styles);
    const label = parts.map((part) => part.name ?? NO_CATEGORY_LABEL).join(', ');
    const [primary] = parts;
    return {
        title: values === '' ? label : `${values} · ${label}`,
        label,
        style: {
            '--cqs-mark-fill': primary.fill,
            '--cqs-mark-line': stripes(parts.map((part) => part.line)),
            '--cqs-mark-border': primary.line,
            '--cqs-mark-ink': primary.ink,
        },
    };
}
