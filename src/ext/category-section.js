/**
 * The Categories section of the property panel: which field's values categorise the highlights, how
 * they are coloured, and the legend and labels that show them.
 *
 * The section appears once a highlight field is set, since categories colour highlights. The field is
 * picked from a dropdown or typed, through two items bound to the same property, as in the Highlights
 * section. The colour expression is a plain text, not an expression the engine evaluates into the
 * layout: it is handed to the engine to evaluate once for each category.
 *
 * Adapted from textview.qs `src/ext/category-section.js` at df84a5e; the overview ruler switch lives
 * under Appearance here, because the ruler also shows search matches, which need no highlight field.
 */
import { normalizeFieldName } from '../qix/field-ref';
import { TEXT_TOOL_DEFAULTS } from '../highlight/settings';
import { fieldOptions } from './field-options';
import { highlightFieldIsSet } from './highlight-section';
import { switchItem } from './items';

/**
 * Show an item only once a category field is set.
 *
 * @param {object} data - The object properties.
 * @returns {boolean} True when a category field is set.
 */
export function categoryFieldIsSet(data) {
    return normalizeFieldName(data?.chatbox?.category?.field) !== '';
}

/**
 * Offer the app's fields in the category field dropdown.
 *
 * @param {object} data - The object properties.
 * @param {object} [handler] - The property handler; may carry the app.
 * @param {object} [args] - Further arguments; may carry the app.
 * @returns {Promise<Array<{value: string, label: string}>>} The dropdown options.
 */
export function categoryFieldOptions(data, handler, args) {
    return fieldOptions(normalizeFieldName(data?.chatbox?.category?.field), handler, args);
}

/**
 * Tidy the stored category field name after an edit.
 *
 * @param {object} data - The object properties.
 * @returns {void}
 */
export function tidyCategorySettings(data) {
    const category = data?.chatbox?.category;
    if (category) category.field = normalizeFieldName(category.field);
}

/**
 * Build the Categories accordion section.
 *
 * @returns {object} The section definition.
 */
export function categorySection() {
    const defaults = TEXT_TOOL_DEFAULTS;
    return {
        type: 'items',
        label: 'Categories',
        show: highlightFieldIsSet,
        items: {
            field: {
                type: 'string',
                component: 'dropdown',
                ref: 'chatbox.category.field',
                label: 'Category field',
                options: categoryFieldOptions,
                defaultValue: defaults.category.field,
                change: tidyCategorySettings,
            },
            // The same property as the dropdown, on purpose: the list can be unreadable, and it leaves
            // hidden fields out.
            fieldName: {
                type: 'string',
                ref: 'chatbox.category.field',
                label: '…or type a field name',
                defaultValue: defaults.category.field,
                change: tidyCategorySettings,
            },
            // No expression flag: the engine would evaluate it once for the whole object, and every
            // category would get the same answer.
            colorExpression: {
                type: 'string',
                ref: 'chatbox.category.colorExpression',
                label: 'Colour expression',
                defaultValue: defaults.category.colorExpression,
                show: categoryFieldIsSet,
            },
            colorExpressionHelp: {
                component: 'text',
                label: "Optional. Evaluated for each category, it returns a colour such as RGB(68, 119, 170) or '#4477aa'. Empty: the theme's colours.",
                show: categoryFieldIsSet,
            },
            showLegend: switchItem({
                ref: 'chatbox.category.showLegend',
                label: 'Show legend',
                defaultValue: defaults.category.showLegend,
                show: categoryFieldIsSet,
            }),
            showLabels: switchItem({
                ref: 'chatbox.category.showLabels',
                label: 'Show category labels',
                defaultValue: defaults.category.showLabels,
                show: categoryFieldIsSet,
            }),
        },
    };
}

export default categorySection;
