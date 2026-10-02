/**
 * Copying one message to the clipboard, and saying how it went.
 *
 * The whole-conversation copy lives beside this in copy-conversation.js; both answer with a notice
 * rather than failing silently, because a copy that did not happen looks exactly like one that did.
 */
import { copyText } from '../util/copy-text';
import { messageText } from './conversation-export';

/**
 * Copy a message.
 *
 * @param {object} request - The copy.
 * @param {?object} request.message - The message to copy.
 * @param {function(string): Promise<boolean>} [request.copy] - Puts text on the clipboard.
 * @returns {Promise<?{text: string, level: string}>} The notice to show; null with nothing to copy.
 */
export async function copyMessage({ message, copy = copyText }) {
    if (!message) return null;
    const text = messageText(message);
    if (text === '') return null;
    const copied = await copy(text);
    return copied
        ? { level: 'info', text: 'Copied the message' }
        : { level: 'error', text: 'The browser did not allow copying to the clipboard' };
}

export default copyMessage;
