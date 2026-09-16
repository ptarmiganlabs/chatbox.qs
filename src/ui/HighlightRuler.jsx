/**
 * The overview ruler: a strip beside the conversation with a tick wherever there are highlights, or
 * search matches while a query is typed. A click goes there.
 *
 * It is not a tab stop and is hidden from screen readers: stepping with F3 reaches every stop from the
 * keyboard, and the counter says where it is.
 */
import { nearestTick } from '../highlight/ruler';
import styles from './chat.module.css';

/** How close, in pixels, a click must land to a tick to mean that tick. */
const TICK_REACH_PX = 6;

/**
 * Render the ruler.
 *
 * @param {object} props - Component props.
 * @param {Array<object>} props.ticks - From `rulerTicks`.
 * @param {number} props.count - How many messages the conversation has.
 * @param {string} props.kind - 'highlight' or 'find'.
 * @param {boolean} [props.interactive] - Whether a click goes somewhere.
 * @param {function(number): void} [props.onJump] - Called with the message index to go to.
 * @param {function(number): number} [props.indexAt] - The message a click away from any tick stands for,
 *   given where it landed (0 to 1); by default the message at that share of `count`.
 * @returns {object} The rendered ruler.
 */
export function HighlightRuler({ ticks, count, kind, interactive = true, onJump, indexAt = null }) {
    /**
     * Go to the tick nearest the click, or to the place in the conversation the click stands for.
     *
     * @param {object} event - The React mouse event.
     * @returns {void}
     */
    const handleClick = (event) => {
        if (!interactive || !onJump || count <= 0) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (!(box.height > 0)) return;
        const fraction = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
        const nearest = nearestTick(ticks, fraction, TICK_REACH_PX / box.height);
        let index = Math.min(count - 1, Math.floor(fraction * count));
        if (nearest >= 0) index = ticks[nearest].messageIndex;
        else if (indexAt) index = indexAt(fraction);
        onJump(index);
    };

    const where = kind === 'find' ? 'search matches' : 'highlights';
    return (
        <div
            className={styles.ruler}
            data-kind={kind}
            aria-hidden="true"
            title={interactive ? `Where the ${where} are: click to go there` : undefined}
            onClick={handleClick}
        >
            {ticks.map((tick) => (
                <div
                    key={tick.messageIndex}
                    className={styles.tick}
                    title={tick.title}
                    style={{
                        '--cqs-tick-pos': String(tick.position),
                        ...(tick.color ? { '--cqs-tick-color': tick.color } : {}),
                    }}
                />
            ))}
        </div>
    );
}

export default HighlightRuler;
