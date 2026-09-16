/**
 * The overview ruler's ticks: where in the conversation the stops are.
 *
 * Ticks are placed by message index over the message count, not by pixels: bubbles differ in height,
 * day headings add their own, and a virtualized list has not measured the messages it has not drawn,
 * so the index is the only scale every message has. Messages close together share one of 400 slots
 * and one tick, which counts all of them. A highlight tick is striped in the colours of the categories
 * in its slot, in legend order.
 *
 * It builds no DOM. Adapted from textview.qs `src/render/ruler.js` at df84a5e, which placed ticks by
 * line.
 */
import { NO_CATEGORY_LABEL, stripes } from './category-styles';
import { counted } from '../util/format';

/** The slots ticks are gathered into. */
export const RULER_BUCKETS = 400;

/**
 * Work out the ruler's ticks.
 *
 * @param {object} request - What to show.
 * @param {object} request.stops - The conversation's stops: `firstStop` and, for highlights,
 *     `byMessage` with each message's `byCategory` and `none`.
 * @param {number} request.count - How many messages there are.
 * @param {string} request.kind - 'highlight' or 'find'.
 * @param {?object} [request.styles] - The category styles, for highlight ticks.
 * @returns {Array<{position: number, messageIndex: number, color: ?string, title: string}>} Ticks in
 *     order: where each sits (0 to 1), the first message it stands for, its colour, and its tooltip.
 */
export function rulerTicks({ stops, count, kind, styles = null }) {
    const ticks = [];
    if (!stops || count <= 0) return ticks;
    const categorised = kind === 'highlight' && styles?.enabled === true;
    let tick = null;
    for (let index = 0; index < count; index++) {
        const here = stops.firstStop[index + 1] - stops.firstStop[index];
        if (here <= 0) continue;
        const bucket = Math.floor((index / count) * RULER_BUCKETS);
        if (tick === null || tick.bucket !== bucket) {
            tick = { bucket, index, stops: 0, messages: 0, parts: new Set() };
            ticks.push(tick);
        }
        tick.stops += here;
        tick.messages += 1;
        if (categorised) {
            const message = stops.byMessage[index];
            for (const name of message.byCategory.keys()) {
                const style = styles.byName.get(name);
                if (style) tick.parts.add(style);
            }
            if (message.none > 0) tick.parts.add(styles.none);
        }
    }

    const [one, many] = kind === 'find' ? ['match', 'matches'] : ['highlight', 'highlights'];
    return ticks.map((entry) => {
        const parts = [...entry.parts].sort((a, b) => a.index - b.index);
        const names = parts.map((part) => part.name ?? NO_CATEGORY_LABEL);
        const summary = `${counted(entry.stops, one, many)} in ${counted(entry.messages, 'message', 'messages')}`;
        return {
            position: (entry.index + 0.5) / count,
            messageIndex: entry.index,
            color: parts.length > 0 ? stripes(parts.map((part) => part.line)) : null,
            title: names.length > 0 ? `${summary}: ${names.join(', ')}` : summary,
        };
    });
}

/**
 * Find the tick nearest a place on the ruler.
 *
 * @param {Array<{position: number}>} ticks - The ticks, in order.
 * @param {number} fraction - The place, 0 at the top and 1 at the bottom.
 * @param {number} reach - How far from a tick still counts as on it, as a fraction.
 * @returns {number} The tick's index, or -1 when none is within reach.
 */
export function nearestTick(ticks, fraction, reach) {
    let best = -1;
    let distance = Infinity;
    for (let index = 0; index < ticks.length; index++) {
        const gap = Math.abs(ticks[index].position - fraction);
        if (gap < distance) {
            distance = gap;
            best = index;
        }
    }
    return distance <= reach ? best : -1;
}
