/**
 * Writing field names into engine expressions, and reading back what an author typed as one.
 *
 * A field name may itself contain "]", which the engine's expression syntax writes as "]]". Authors
 * type field names the way expressions need them — "[odd]]name]" — as often as plainly, and both must
 * name the same field.
 *
 * Ported from textview.qs `src/qix/field-ref.js` at df84a5e. Only `fieldRef` and `normalizeFieldName`
 * came along; the text-dimension helpers belong to textview's single text.
 */

/**
 * Write a field name as an expression.
 *
 * @param {string} name - The field name.
 * @returns {string} The name in brackets, with any "]" doubled.
 */
export function fieldRef(name) {
    return `[${String(name).replaceAll(']', ']]')}]`;
}

/**
 * Turn what an author typed as a field name into the name itself.
 *
 * A name in brackets loses them and its doubled "]" is undone; surrounding whitespace is dropped.
 * Anything else, an expression included, is left for the engine to reject by name.
 *
 * @param {*} value - The typed or stored name.
 * @returns {string} The field name, or '' when there is none.
 */
export function normalizeFieldName(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed.length >= 2 && trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed.slice(1, -1).replaceAll(']]', ']');
    }
    return trimmed;
}
