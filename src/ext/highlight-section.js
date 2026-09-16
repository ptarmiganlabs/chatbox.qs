/**
 * The Highlights section of the property panel: which field's values are highlighted in the
 * messages, how many, and how they are matched.
 *
 * With nothing selected in the field, its possible values are highlighted unless that is switched off:
 * pick a category and a conversation, and that category's values light up without being selected again.
 *
 * The field can be picked from a dropdown or typed, through two items bound to the same property. The
 * dropdown can only offer what the host's app API lists, and that can come back empty for reasons
 * outside the extension; typing is the way out, and the only way to name a hidden field. The object
 * then checks the name against the data model and says when it is not there.
 *
 * Clicking a highlight selects its value, and clicking a legend chip its category, unless **Select by
 * clicking a highlight** is switched off: on a highlight, that click replaces the message's own click
 * action, so an app that wants every click to act on the message can have that.
 *
 * Everything but the field itself stays hidden until a field is set.
 *
 * Adapted from textview.qs `src/ext/highlight-section.js` at df84a5e.
 */
import { normalizeFieldName } from '../qix/field-ref';
import { TEXT_TOOL_DEFAULTS, clampHighlightLimit } from '../highlight/settings';
import { fieldOptions } from './field-options';
import { switchItem } from './items';

/**
 * Show an item only once a highlight field is set.
 *
 * @param {object} data - The object properties.
 * @returns {boolean} True when a highlight field is set.
 */
export function highlightFieldIsSet(data) {
    return normalizeFieldName(data?.chatbox?.highlight?.field) !== '';
}

/**
 * Show the click help only while clicking a highlight selects.
 *
 * @param {object} data - The object properties.
 * @returns {boolean} True when a highlight field is set and selecting by clicking is on.
 */
export function clickHelpIsShown(data) {
    return highlightFieldIsSet(data) && data?.chatbox?.highlight?.clickToSelect !== false;
}

/**
 * Offer the app's fields in the highlight field dropdown.
 *
 * @param {object} data - The object properties.
 * @param {object} [handler] - The property handler; may carry the app.
 * @param {object} [args] - Further arguments; may carry the app.
 * @returns {Promise<Array<{value: string, label: string}>>} The dropdown options.
 */
export function highlightFieldOptions(data, handler, args) {
    return fieldOptions(normalizeFieldName(data?.chatbox?.highlight?.field), handler, args);
}

/**
 * Tidy the stored highlight settings after an edit.
 *
 * @param {object} data - The object properties.
 * @returns {void}
 */
export function tidyHighlightSettings(data) {
    const highlight = data?.chatbox?.highlight;
    if (!highlight) return;
    highlight.field = normalizeFieldName(highlight.field);
    highlight.limit = clampHighlightLimit(highlight.limit);
}

/**
 * Build the Highlights accordion section.
 *
 * @returns {object} The section definition.
 */
export function highlightSection() {
    const defaults = TEXT_TOOL_DEFAULTS;
    return {
        type: 'items',
        label: 'Highlights',
        items: {
            field: {
                type: 'string',
                component: 'dropdown',
                ref: 'chatbox.highlight.field',
                label: 'Highlight field',
                options: highlightFieldOptions,
                defaultValue: defaults.highlight.field,
                change: tidyHighlightSettings,
            },
            // The same property as the dropdown, on purpose: see the module comment. No expression:
            // a field name is a literal, and a computed one could never be checked.
            fieldName: {
                type: 'string',
                ref: 'chatbox.highlight.field',
                label: '…or type a field name',
                defaultValue: defaults.highlight.field,
                change: tidyHighlightSettings,
            },
            possibleWhenNoneSelected: switchItem({
                ref: 'chatbox.highlight.possibleWhenNoneSelected',
                label: 'Highlight possible values',
                defaultValue: defaults.highlight.possibleWhenNoneSelected,
                show: highlightFieldIsSet,
            }),
            limit: {
                type: 'integer',
                ref: 'chatbox.highlight.limit',
                label: 'Most values to highlight',
                defaultValue: defaults.highlight.limit,
                change: tidyHighlightSettings,
                show: highlightFieldIsSet,
            },
            clickToSelect: switchItem({
                ref: 'chatbox.highlight.clickToSelect',
                label: 'Select by clicking a highlight',
                defaultValue: defaults.highlight.clickToSelect,
                show: highlightFieldIsSet,
            }),
            clickToSelectHelp: {
                component: 'text',
                label:
                    'A click on a highlight selects its value instead of doing what Clicking a ' +
                    'message does. Ctrl+click or Cmd+click adds or removes it; a legend chip ' +
                    'selects its category.',
                show: clickHelpIsShown,
            },
            caseSensitive: switchItem({
                ref: 'chatbox.match.caseSensitive',
                label: 'Match case',
                defaultValue: defaults.match.caseSensitive,
                show: highlightFieldIsSet,
            }),
            wholeValues: switchItem({
                ref: 'chatbox.match.wholeValues',
                label: 'Whole values only',
                defaultValue: defaults.match.wholeValues,
                show: highlightFieldIsSet,
            }),
            flexibleWhitespace: switchItem({
                ref: 'chatbox.match.flexibleWhitespace',
                label: 'Flexible whitespace',
                defaultValue: defaults.match.flexibleWhitespace,
                show: highlightFieldIsSet,
            }),
            showSummary: switchItem({
                ref: 'chatbox.highlight.showSummary',
                label: 'Show highlight summary',
                defaultValue: defaults.highlight.showSummary,
                show: highlightFieldIsSet,
            }),
        },
    };
}

export default highlightSection;
