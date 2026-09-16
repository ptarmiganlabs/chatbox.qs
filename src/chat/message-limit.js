/**
 * Maximum messages: which rows a conversation reads when the cube has more.
 *
 * The cube is sorted oldest first, and the rows read are one unbroken run of it. Read from the first row,
 * the limit keeps the oldest messages: Newest first then showed the oldest messages, newest first, and
 * conversations side by side ranked lanes by their latest activity among old rows only. Both read from
 * the last row instead, so the limit keeps the newest messages. Oldest first reads from the first row,
 * where the conversation starts.
 *
 * Pure: no engine, no DOM.
 */
import { readLaneSettings } from './lanes';

/**
 * Report whether a conversation reads the last rows of the cube rather than the first.
 *
 * @param {object} [settings] - The `chatbox` property bag.
 * @returns {boolean} True for Newest first, and while conversations side by side are switched on.
 */
export function readsFromEnd(settings) {
    return settings?.order === 'newest' || readLaneSettings(settings?.lanes).show;
}
