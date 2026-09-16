/**
 * Copying text to the clipboard, and saying whether it worked.
 *
 * The Clipboard API is refused on plain-HTTP sites and in frames without clipboard permission, both
 * of which client-managed Sense installations can be. The fallback is a hidden textarea and
 * `document.execCommand('copy')`, which is deprecated but still honoured for a user's click. Every
 * path resolves to true or false: a copy that silently did nothing is the failure this avoids.
 *
 * It does not read the clipboard.
 *
 * Ported from textview.qs `src/render/copy.js` at df84a5e, without `selectedTextWithin`.
 */

/**
 * Copy with the legacy command, from a temporary textarea.
 *
 * @param {string} text - The text to copy.
 * @param {Document} doc - The document to work in.
 * @returns {boolean} True when the browser reported success.
 */
function copyWithCommand(text, doc) {
    if (!doc?.body || typeof doc.execCommand !== 'function') return false;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    const previous = doc.activeElement;
    doc.body.append(area);
    // Some browsers copy only from a focused field.
    area.focus({ preventScroll: true });
    area.select();
    try {
        return doc.execCommand('copy') === true;
    } catch {
        return false;
    } finally {
        area.remove();
        previous?.focus?.({ preventScroll: true });
    }
}

/**
 * Copy text to the clipboard.
 *
 * @param {string} text - The text to copy.
 * @param {object} [environment] - Where to copy; defaults to the browser's.
 * @param {{writeText: function(string): Promise<void>}} [environment.clipboard] - The Clipboard API.
 * @param {Document} [environment.doc] - The document, for the fallback.
 * @returns {Promise<boolean>} True when the text reached the clipboard.
 */
export async function copyText(
    text,
    { clipboard = globalThis.navigator?.clipboard, doc = globalThis.document } = {}
) {
    if (typeof clipboard?.writeText === 'function') {
        try {
            await clipboard.writeText(text);
            return true;
        } catch {
            // Refused: an insecure origin or a missing permission. Try the fallback.
        }
    }
    return copyWithCommand(text, doc);
}
