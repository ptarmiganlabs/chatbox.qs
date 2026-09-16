/**
 * The bar above the conversation: what the highlights come to, their legend, and the counter.
 *
 * It takes no room of its own when it has nothing to say. The legend lists the categories with their
 * counts, and scrolls when it is taller than a few lines rather than squeezing the conversation.
 *
 * Category names and values are field data, and reach the DOM as React children and attributes only.
 */
import { categoryClickHint } from '../highlight/click-selection';
import { entrySummary } from '../highlight/legend';
import { formatCount } from '../util/format';
import styles from './chat.module.css';

/**
 * Render one legend entry: a toggle button while clicking selects its category, a list item otherwise.
 *
 * @param {object} props - Component props.
 * @param {object} props.entry - From `legendEntries`.
 * @param {?object} [props.picking] - How chips select: `locked`, `field`, `selectedCount`, `tabbable`
 *     and `onPick(entry, toggle)`; null while they do not.
 * @returns {object} The rendered chip.
 */
function LegendChip({ entry, picking = null }) {
    const content = (
        <>
            <span
                className={styles.swatch}
                style={{ '--cqs-chip-color': entry.color }}
                aria-hidden="true"
            />
            <span>{entry.label}</span>
            <span className={styles.chipCount}>{formatCount(entry.count)}</span>
        </>
    );
    const shared = {
        className: styles.chip,
        'data-empty': entry.empty ? 'true' : undefined,
        'data-none': entry.name === null ? 'true' : undefined,
    };
    // "No category" has no value behind it to select.
    if (picking === null || entry.elemNumber < 0) {
        return (
            <span
                {...shared}
                role={picking === null ? 'listitem' : undefined}
                title={entrySummary(entry)}
            >
                {content}
            </span>
        );
    }
    return (
        <button
            {...shared}
            type="button"
            aria-pressed={entry.selected}
            disabled={picking.locked}
            tabIndex={picking.tabbable ? 0 : -1}
            title={`${entrySummary(entry)}\n${categoryClickHint(entry, picking)}`}
            onClick={(event) => picking.onPick(entry, Boolean(event.ctrlKey || event.metaKey))}
        >
            {content}
        </button>
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
 * @param {?object} [props.picking] - How chips select a category; null while they do not.
 * @param {?object} [props.stepper] - The step buttons: `kind` ('highlight' or 'find'), `canStep`,
 *     `tabbable` and `onStep(direction)`; null to leave them out.
 * @param {?object} [props.search] - The search box: `query`, `inputRef`, `tabbable`,
 *     `onChange(query)` and `onKeyDown(event)`; null to leave it out.
 * @returns {?object} The rendered bar, or null when it has nothing to show.
 */
export function ConversationBar({
    info = null,
    entries = [],
    counter = '',
    picking = null,
    stepper = null,
    search = null,
}) {
    const hasTools = Boolean(info) || counter !== '' || stepper !== null || search !== null;
    const noun = stepper?.kind === 'find' ? 'match' : 'highlight';
    if (!hasTools && entries.length === 0) return null;
    return (
        <div className={styles.bar}>
            {hasTools ? (
                <div className={styles.toolbar}>
                    {search ? (
                        <input
                            ref={search.inputRef}
                            type="search"
                            className={styles.search}
                            placeholder="Search messages"
                            aria-label="Search messages"
                            autoComplete="off"
                            spellCheck={false}
                            value={search.query}
                            tabIndex={search.tabbable ? 0 : -1}
                            onChange={(event) => search.onChange(event.target.value)}
                            onKeyDown={search.onKeyDown}
                        />
                    ) : null}
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
                    {stepper ? (
                        <span className={styles.stepper}>
                            <button
                                type="button"
                                className={styles.step}
                                aria-label={`Previous ${noun}`}
                                title={`Previous ${noun} (Shift+F3)`}
                                aria-keyshortcuts="Shift+F3"
                                disabled={!stepper.canStep}
                                tabIndex={stepper.tabbable ? 0 : -1}
                                onClick={() => stepper.onStep(-1)}
                            >
                                ▲
                            </button>
                            <button
                                type="button"
                                className={styles.step}
                                aria-label={`Next ${noun}`}
                                title={`Next ${noun} (F3)`}
                                aria-keyshortcuts="F3"
                                disabled={!stepper.canStep}
                                tabIndex={stepper.tabbable ? 0 : -1}
                                onClick={() => stepper.onStep(1)}
                            >
                                ▼
                            </button>
                        </span>
                    ) : null}
                </div>
            ) : null}
            {entries.length ? (
                // Buttons cannot be list items, so a legend of toggle buttons is a group.
                <div
                    className={styles.legend}
                    role={picking ? 'group' : 'list'}
                    aria-label="Categories"
                >
                    {entries.map((entry) => (
                        <LegendChip key={entryKey(entry)} entry={entry} picking={picking} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default ConversationBar;
