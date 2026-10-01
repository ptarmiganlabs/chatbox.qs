/**
 * The bar above the conversation: what the highlights come to, their legend, and the controls.
 *
 * The controls are grouped into pills — the find box, the keywords, the conversations side by side,
 * and the view. The tint behind a group, rather than a border on each control, is what says where one
 * group ends and the next begins, and it is the only thing that reads on a light and a dark theme
 * without a second rule. A reader who mistakes one group for another has been failed by the toolbar,
 * not by their attention: the find box steps with ▲▼ and the keywords with ◂▸.
 *
 * It takes no room of its own when it has nothing to say. The legend lists the categories with their
 * counts, and scrolls when it is taller than a few lines rather than squeezing the conversation.
 *
 * Category names and values are field data, and reach the DOM as React children and attributes only.
 */
import { categoryClickHint } from '../highlight/click-selection';
import { entrySummary } from '../highlight/legend';
import { fontSizeLabel } from '../highlight/settings';
import { formatCount } from '../util/format';
import { ICONS, ToolButton } from './controls';
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
 * Render a pair of step buttons.
 *
 * @param {object} props - Component props.
 * @param {string} props.noun - What is stepped through, for the buttons' names.
 * @param {string} props.back - The glyph for the previous one.
 * @param {string} props.forward - The glyph for the next one.
 * @param {boolean} props.canStep - Whether there is anything to step to.
 * @param {boolean} props.tabbable - Whether the buttons take the object's tab stop.
 * @param {?string} [props.backKeys] - The keys for the previous one.
 * @param {?string} [props.forwardKeys] - The keys for the next one.
 * @param {Function} props.onStep - Takes 1 for the next, -1 for the previous.
 * @returns {object} The rendered buttons.
 */
function Steps({
    noun,
    back,
    forward,
    canStep,
    tabbable,
    backKeys = undefined,
    forwardKeys = undefined,
    onStep,
}) {
    return (
        <>
            <ToolButton
                className={styles.step}
                label={`Previous ${noun}`}
                text={back}
                disabled={!canStep}
                tabbable={tabbable}
                keyShortcuts={backKeys}
                onClick={() => onStep(-1)}
            />
            <ToolButton
                className={styles.step}
                label={`Next ${noun}`}
                text={forward}
                disabled={!canStep}
                tabbable={tabbable}
                keyShortcuts={forwardKeys}
                onClick={() => onStep(1)}
            />
        </>
    );
}

/**
 * Render the bar above the conversation.
 *
 * @param {object} props - Component props.
 * @param {?{text: string, level: string}} [props.info] - The highlight summary, when it is shown here.
 * @param {Array<object>} [props.entries] - The legend's entries; none hides the legend.
 * @param {?object} [props.picking] - How chips select a category; null while they do not.
 * @param {?object} [props.find] - The find box: `query`, `inputRef`, `tabbable`, `counter`, `canStep`,
 *     `onChange(query)`, `onKeyDown(event)` and `onStep(direction)`; null to leave it out.
 * @param {?object} [props.keywords] - The keyword group: `counter`, `canStep`, `tabbable`, `swatch`
 *     and `onStep(direction)`; null to leave it out.
 * @param {?object} [props.lanes] - The conversation stepper: `label`, `canPrevious`, `canNext`,
 *     `tabbable` and `onStep(direction)`; null to leave it out.
 * @param {?object} [props.view] - The view group: `fontSize`, `sizes`, `tabbable`,
 *     `onPickFontSize(size)`, and optionally `whole` for the whole-conversations toggle.
 * @returns {?object} The rendered bar, or null when it has nothing to show.
 */
export function ConversationBar({
    info = null,
    entries = [],
    picking = null,
    find = null,
    keywords = null,
    lanes = null,
    view = null,
}) {
    const hasActions = find !== null || keywords !== null || lanes !== null || view !== null;
    if (!info && !hasActions && entries.length === 0) return null;
    return (
        <div className={styles.bar}>
            {info || hasActions ? (
                <div className={styles.toolStrip}>
                    <div className={styles.meta}>
                        {info ? (
                            <p className={styles.summary} title={info.text} data-level={info.level}>
                                {info.text}
                            </p>
                        ) : null}
                    </div>
                    {hasActions ? (
                        <div className={styles.actions}>
                            {find ? (
                                <div className={`${styles.group} ${styles.findBox}`} role="search">
                                    <input
                                        ref={find.inputRef}
                                        type="search"
                                        className={styles.search}
                                        placeholder="Search messages"
                                        aria-label="Search messages"
                                        autoComplete="off"
                                        spellCheck={false}
                                        value={find.query}
                                        tabIndex={find.tabbable ? 0 : -1}
                                        onChange={(event) => find.onChange(event.target.value)}
                                        onKeyDown={find.onKeyDown}
                                    />
                                    <span className={styles.counter} role="status">
                                        {find.counter}
                                    </span>
                                    <Steps
                                        noun="match"
                                        back="▲"
                                        forward="▼"
                                        canStep={find.canStep}
                                        tabbable={find.tabbable}
                                        backKeys="Shift+F3"
                                        forwardKeys="F3"
                                        onStep={find.onStep}
                                    />
                                </div>
                            ) : null}
                            {keywords ? (
                                <div
                                    className={`${styles.group} ${styles.keywordSteps}`}
                                    role="group"
                                    aria-label="Keywords"
                                >
                                    <span
                                        className={styles.keywordSwatch}
                                        style={keywords.swatch ?? undefined}
                                        aria-hidden="true"
                                    />
                                    <span className={styles.counter} role="status">
                                        {keywords.counter}
                                    </span>
                                    <Steps
                                        noun="keyword"
                                        back="◂"
                                        forward="▸"
                                        canStep={keywords.canStep}
                                        tabbable={keywords.tabbable}
                                        backKeys="Alt+Up"
                                        forwardKeys="Alt+Down"
                                        onStep={keywords.onStep}
                                    />
                                </div>
                            ) : null}
                            {lanes ? (
                                <div
                                    className={`${styles.group} ${styles.laneSteps}`}
                                    role="group"
                                    aria-label="Conversations shown"
                                >
                                    <ToolButton
                                        className={styles.step}
                                        label="Earlier conversations"
                                        text="◂"
                                        disabled={!lanes.canPrevious}
                                        tabbable={lanes.tabbable}
                                        onClick={() => lanes.onStep(-1)}
                                    />
                                    <span className={styles.counter} role="status">
                                        {lanes.label}
                                    </span>
                                    <ToolButton
                                        className={styles.step}
                                        label="Later conversations"
                                        text="▸"
                                        disabled={!lanes.canNext}
                                        tabbable={lanes.tabbable}
                                        onClick={() => lanes.onStep(1)}
                                    />
                                </div>
                            ) : null}
                            {view ? (
                                <div className={styles.group}>
                                    <select
                                        className={styles.fontSize}
                                        title="Text size"
                                        aria-label="Text size"
                                        value={String(view.fontSize)}
                                        tabIndex={view.tabbable ? 0 : -1}
                                        onChange={(event) =>
                                            view.onPickFontSize(Number(event.target.value))
                                        }
                                    >
                                        {view.sizes.map((size) => (
                                            <option key={size} value={String(size)}>
                                                {fontSizeLabel(size)}
                                            </option>
                                        ))}
                                    </select>
                                    {view.whole ? (
                                        <ToolButton
                                            className={styles.toggle}
                                            label="Show whole conversations"
                                            paths={ICONS.whole}
                                            pressed={view.whole.on}
                                            disabled={view.whole.disabled}
                                            tabbable={view.tabbable}
                                            onClick={view.whole.onToggle}
                                        />
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
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
