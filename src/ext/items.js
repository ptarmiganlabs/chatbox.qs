/**
 * Builders for property-panel items that appear more than once.
 *
 * Every component string used here is one the panel already renders: a wrong one does not fail, it
 * renders a default input or no panel at all (GOTCHAS 6).
 *
 * Adapted from textview.qs `src/ext/items.js` at df84a5e.
 */

/**
 * Standard on/off options for a switch component.
 *
 * Not frozen: the classic panel is AngularJS, whose ng-repeat may write a `$$hashKey` onto the option
 * objects it renders, and a write to a frozen object throws in strict mode.
 */
export const ON_OFF = [
    { value: true, label: 'On' },
    { value: false, label: 'Off' },
];

/**
 * Build an On/Off switch.
 *
 * @param {object} options - The switch.
 * @param {string} options.ref - The property path, under `chatbox.`.
 * @param {string} options.label - The label shown in the panel.
 * @param {boolean} options.defaultValue - The default.
 * @param {function(object): boolean} [options.show] - When to show the item.
 * @returns {object} The item definition.
 */
export function switchItem({ ref, label, defaultValue, show }) {
    const item = {
        type: 'boolean',
        component: 'switch',
        ref,
        label,
        // A fresh copy per item, as textview.qs ships it: no two items share option objects.
        options: ON_OFF.map((option) => ({ ...option })),
        defaultValue,
    };
    if (show) item.show = show;
    return item;
}
