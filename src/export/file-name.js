/**
 * Naming an exported file.
 *
 * The name says what it holds and when it was taken, so a folder of exports reads at a glance: the
 * object's title, the conversation when one was exported on its own, and the day, e.g.
 * "Support chats - Order 1042 - 2026-11-18.pdf". Pure.
 */
import { dayKey, localWallClock } from '../chat/grouping';

/** The longest a name may be before its extension, well inside every file system's limit. */
const MAX_LENGTH = 120;

/**
 * Make a text safe to be a file name on every system.
 *
 * @param {*} text - The text.
 * @returns {string} The text without characters Windows, macOS or Linux refuse, and without leading or
 *     trailing dots and spaces; empty when nothing is left.
 */
export function safeFileName(text) {
    return String(text ?? '')
        .replace(/[\p{Cc}<>:"/\\|?*]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .slice(0, MAX_LENGTH)
        .trim();
}

/**
 * Name an export, without its extension.
 *
 * @param {object} model - The export model: `title`, `heading` and `conversationLabel`.
 * @param {number} now - When, in epoch milliseconds.
 * @returns {string} For example "Support chats - Order 1042 - 2026-11-18".
 */
export function exportFileBase(model, now) {
    const day = dayKey(localWallClock(now));
    const lead = safeFileName(model?.title) || safeFileName(model?.heading) || 'Conversation';
    const parts = [lead];
    const label = safeFileName(model?.conversationLabel);
    if (label && label !== lead) parts.push(label);
    return safeFileName(`${parts.join(' - ')} - ${day}`) || day;
}

/**
 * Name one image of several.
 *
 * @param {string} base - The export's name.
 * @param {number} index - The image's index, from 0.
 * @param {number} count - How many images there are.
 * @returns {string} For example "Support chats - 2026-11-18 - 03.png", numbered to sort in order.
 */
export function partFileName(base, index, count) {
    const digits = Math.max(2, String(count).length);
    return `${base} - ${String(index + 1).padStart(digits, '0')}.png`;
}
