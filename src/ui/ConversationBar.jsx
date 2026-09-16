/**
 * The bar above the conversation: what the highlights come to, their legend, and the counter.
 *
 * It takes no room of its own when it has nothing to say. The legend lists the categories with their
 * counts, and scrolls when it is taller than a few lines rather than squeezing the conversation.
 *
 * Category names and values are field data, and reach the DOM as React children and attributes only.
 */
import { entrySummary } from '../highlight/legend';
import { formatCount } from '../util/format';
import styles from './chat.module.css';

/**
 * Render one legend entry.
 *
 * @param {object} props - Component props.
 * @param {object} props.entry - From `legendEntries`.
 * @returns {object} The rendered chip.
 */
function LegendChip({ entry }) {
    return (
        <span
            className={styles.chip}
            role="listitem"
            title={entrySummary(entry)}
            data-empty={entry.empty ? 'true' : undefined}
            data-none={entry.name === null ? 'true' : undefined}
        >
            <span
                className={styles.swatch}
                style={{ '--cqs-chip-color': entry.color }}
                aria-hidden="true"
            />
            <span>{entry.label}</span>
            <span className={styles.chipCount}>{formatCount(entry.count)}</span>
        </span>
    );
}

/**
 * Key a legend entry, keeping "No category" apart from a category of any name.
 *
 * @param {{name: ?string}} entry - The entry.
 * @returns {string} A key unique within the legend.
 */
function entryKey(entry) {
    return entry.name === null ? 'none' : `category:${entry.name}`;
}

/**
 * Render the bar above the conversation.
 *
 * @param {object} props - Component props.
 * @param {?{text: string, level: string}} [props.info] - The highlight summary, when it is shown here.
 * @param {Array<object>} [props.entries] - The legend's entries; none hides the legend.
 * @param {string} [props.counter] - What the counter says; '' for nothing.
 * @returns {?object} The rendered bar, or null when it has nothing to show.
 */
export function ConversationBar({ info = null, entries = [], counter = '' }) {
    const hasTools = Boolean(info) || counter !== '';
    if (!hasTools && entries.length === 0) return null;
    return (
        <div className={styles.bar}>
            {hasTools ? (
                <div className={styles.toolbar}>
                    {info ? (
                        <span className={styles.summary} title={info.text} data-level={info.level}>
                            {info.text}
                        </span>
                    ) : null}
                    {counter !== '' ? (
                        <span className={styles.counter} role="status">
                            {counter}
                        </span>
                    ) : null}
                </div>
            ) : null}
            {entries.length ? (
                <div className={styles.legend} role="list" aria-label="Categories">
                    {entries.map((entry) => (
                        <LegendChip key={entryKey(entry)} entry={entry} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default ConversationBar;
