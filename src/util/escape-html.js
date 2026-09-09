/**
 * HTML escaping for any value that originates in the Qlik data model.
 *
 * Every existing chat-shaped Sense extension in the wild interpolates cell text
 * straight into the DOM. In QSEoW an extension is served from the hub's own
 * origin and runs inside the authenticated user's session, so that is a genuine
 * session-stealing XSS vector — and message bodies routinely arrive from email,
 * Slack or ticketing exports that contain markup.
 *
 * React escapes its children, so this is only for the rare paths that build
 * markup by hand (the pre-React placeholder states).
 */

const ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

/**
 * Escape the five HTML-significant characters in a value.
 *
 * @param {*} value - Any value; non-strings are coerced, null/undefined become ''.
 * @returns {string} The escaped string, safe for interpolation into markup.
 */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

export default escapeHtml;
