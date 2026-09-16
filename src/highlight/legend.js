/**
 * The legend's entries: one per category, in legend order, with how many highlights belong to it
 * across the conversation and in how many messages.
 *
 * A category none of whose values occur in these messages is kept and dimmed, so the legend does not
 * reshuffle while selections change. Highlights without a category get a "No category" entry, last.
 * A value in several categories counts in each.
 *
 * It builds no DOM. Adapted from textview.qs `src/render/legend.js` at df84a5e, which counted
 * highlights in one text.
 */
import { counted } from '../util/format';
import { NO_CATEGORY_LABEL } from './category-styles';

/**
 * Build the legend's entries.
 *
 * @param {object} styles - From `categoryStyles`.
 * @param {object} result - The conversation highlighter's result, with `counts` and `messageCounts`.
 * @param {Array<{name: string, elemNumber: number, selected: boolean}>} [categories] - The categories
 *     the highlight source read.
 * @returns {Array<{name: ?string, label: string, count: number, messages: number, color: string,
 *     empty: boolean, elemNumber: number, selected: boolean}>} The entries; none while categories are
 *     not in use.
 */
export function legendEntries(styles, result, categories = []) {
    if (!styles?.enabled) return [];
    const known = new Map(categories.map((category) => [category.name, category]));
    const counts = result?.counts ?? { byCategory: new Map(), none: 0 };
    const messageCounts = result?.messageCounts ?? { byCategory: new Map(), none: 0 };
    const entries = styles.order.map((name) => {
        const count = counts.byCategory.get(name) ?? 0;
        const category = known.get(name);
        return {
            name,
            label: name,
            count,
            messages: messageCounts.byCategory.get(name) ?? 0,
            color: styles.byName.get(name).line,
            empty: count === 0,
            elemNumber: Number.isInteger(category?.elemNumber) ? category.elemNumber : -1,
            selected: category?.selected === true,
        };
    });
    if (counts.none > 0) {
        entries.push({
            name: null,
            label: NO_CATEGORY_LABEL,
            count: counts.none,
            messages: messageCounts.none,
            color: styles.none.line,
            empty: false,
            elemNumber: -1,
            selected: false,
        });
    }
    return entries;
}

/**
 * Write what hovering over a legend entry says about its counts.
 *
 * @param {{label: string, count: number, messages: number}} entry - The entry.
 * @returns {string} For example "email: 12 highlights in 7 messages", or "email: 0 highlights".
 */
export function entrySummary(entry) {
    const highlights = counted(entry.count, 'highlight', 'highlights');
    if (entry.count === 0) return `${entry.label}: ${highlights}`;
    return `${entry.label}: ${highlights} in ${counted(entry.messages, 'message', 'messages')}`;
}
