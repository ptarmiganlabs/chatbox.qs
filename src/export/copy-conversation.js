/**
 * Copying the conversation from the object's context menu, and saying how it went.
 *
 * The menu item runs outside the render, so it copies the conversation the object last showed — the
 * very messages and highlights on screen. A copy that did not happen is never silent: the notice says
 * the browser refused.
 */
import { counted } from '../util/format';
import { copyText } from '../util/copy-text';
import { conversationJson, conversationText } from './conversation-export';

/**
 * Copy the conversation shown.
 *
 * @param {object} request - The copy.
 * @param {?object} request.view - The props the conversation was last rendered with.
 * @param {string} request.format - 'text' or 'json'.
 * @param {function(string): string} request.projectionOf - The text a markdown body renders.
 * @param {string} request.version - The extension's version.
 * @param {Date} [request.now] - When.
 * @param {function(string): Promise<boolean>} [request.copy] - Puts text on the clipboard.
 * @returns {Promise<?{text: string, level: string}>} The notice to show; null with nothing to copy.
 */
export async function copyConversation({
    view,
    format,
    projectionOf,
    version,
    now = new Date(),
    copy = copyText,
}) {
    const conversation = view?.conversation;
    const count = conversation?.messages?.length ?? 0;
    if (count === 0) return null;
    const json = format === 'json';
    const text = json
        ? JSON.stringify(
              conversationJson(conversation, {
                  highlights: view.highlights,
                  projectionOf,
                  exportedAt: now.toISOString(),
                  version,
                  order: view.settings?.order,
              }),
              null,
              2
          )
        : conversationText(conversation);
    const copied = await copy(text);
    if (!copied)
        return { level: 'error', text: 'The browser did not allow copying to the clipboard' };
    return {
        level: 'info',
        text: `Copied ${counted(count, 'message', 'messages')} as ${json ? 'JSON' : 'text'}`,
    };
}
