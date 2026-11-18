/**
 * Handing an export to the reader as a file.
 *
 * A link with `download` to an object URL of the file, clicked once: the browser saves it the way it saves
 * any download, and nothing leaves the reader's machine.
 */

/** How long the file's object URL is kept, for a browser that starts the download late. */
const KEEP_URL_MS = 60000;

/**
 * Save a file.
 *
 * @param {Blob} blob - The file's content.
 * @param {string} name - Its name.
 * @param {Document} [doc] - The document to save from.
 * @returns {void}
 */
export function saveFile(blob, name, doc = globalThis.document) {
    const url = URL.createObjectURL(blob);
    const link = doc.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    link.style.display = 'none';
    doc.body.appendChild(link);
    try {
        link.click();
    } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), KEEP_URL_MS);
    }
}
