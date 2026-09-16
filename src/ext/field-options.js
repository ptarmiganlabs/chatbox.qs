/**
 * The options of a field dropdown in the property panel: None, then the app's fields.
 *
 * Qlik calls an option provider with the properties, a handler and further arguments, and where the
 * app handle sits depends on the host, so every place is tried, the component's own handle last. The
 * list can come back unreadable for reasons outside the extension (filter-pane-header.qs), and then
 * the dropdown says so instead of looking like an app without fields; a name typed in the item beside
 * the dropdown still works. A typed name the list does not show, such as a hidden field's, stays the
 * visible choice.
 *
 * Ported from textview.qs `src/ext/field-options.js` at df84a5e; only the import paths changed.
 */
import { listFields } from '../qix/field-list';
import { extensionState } from '../util/extension-state';
import logger from '../util/logger';

/**
 * Build the options of a field dropdown.
 *
 * @param {string} current - The field name stored now, normalised; '' for none.
 * @param {object} [handler] - The property handler Qlik passed; may carry the app.
 * @param {object} [args] - The further arguments Qlik passed; may carry the app.
 * @returns {Promise<Array<{value: string, label: string}>>} The dropdown options.
 */
export async function fieldOptions(current, handler, args) {
    const none = { value: '', label: 'None' };
    const fields = await listFields([args?.app, handler?.app, extensionState.app], { logger });

    if (fields === null) {
        const unavailable = current
            ? { value: current, label: `${current} (the field list could not be read)` }
            : { value: '', label: 'The field list could not be read: type the name below' };
        return current ? [none, unavailable] : [unavailable];
    }

    const options = [none, ...fields.map((name) => ({ value: name, label: name }))];
    if (current && !fields.includes(current)) {
        options.splice(1, 0, { value: current, label: `${current} (not in the field list)` });
    }
    return options;
}
