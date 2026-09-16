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
 * @param {number} [request.first] - The index of the first message the ruler covers: a lane's first,
 *     when each lane has a ruler of its own.
 * @param {number} [request.slots] - How many places the ruler is divided into; one per message by default.
 * @param {function(number): number} [request.slotOf] - The place a message is at, from 0; its index
 *     from `first` by default. Messages that share a row share a place.
 * @returns {Array<{position: number, messageIndex: number, color: ?string, title: string}>} Ticks in
 *     order: where each sits (0 to 1), the first message it stands for, its colour, and its tooltip.
 */
export function rulerTicks({
    stops,
    count,
    kind,
    styles = null,
    first = 0,
    slots = count,
    slotOf = null,
}) {
    const ticks = [];
    if (!stops || count <= 0 || slots <= 0) return ticks;
    const categorised = kind === 'highlight' && styles?.enabled === true;
    /**
     * Find the place a message is at on the ruler.
     *
     * @param {number} index - The message's index.
     * @returns {number} Its place, from 0.
     */
    const place = (index) => (slotOf ? slotOf(index) : index - first);
    let tick = null;
    for (let index = first; index < first + count; index++) {
        const here = stops.firstStop[index + 1] - stops.firstStop[index];
        if (here <= 0) continue;
        const bucket = Math.floor((place(index) / slots) * RULER_BUCKETS);
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
            position: (place(entry.index) + 0.5) / slots,
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
