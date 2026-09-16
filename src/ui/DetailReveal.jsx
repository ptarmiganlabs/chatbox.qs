/**
 * The per-message detail view.
 *
 * Three presentations of the same content, chosen by how much room the object
 * has. A Qlik object spans roughly 300 to 4000 px, so one presentation cannot
 * serve both ends: a side pane is unusable at 320 px wide, and an inline
 * accordion wastes a 1600 px sheet.
 *
 * All three render INSIDE the extension's own element. Nebula's rule is to never
 * modify DOM outside `element`, and anything in a floating layer attached to
 * document.body is invisible in PDF and image export, unreachable on touch, and
 * lost to keyboard users.
 */
import { formatRecipients } from '../chat/recipients';
import styles from './chat.module.css';
import HighlightedText from './HighlightedText';
import { routeClick } from './click-route';
import Sparkline from './Sparkline';

/** Width below which a side pane cannot work. */
const PANE_MIN_WIDTH = 720;

/** Below this, even an overlay sheet crowds the conversation out. */
const OVERLAY_MIN_WIDTH = 360;

/** Below this height an overlay has nowhere to sit. */
const OVERLAY_MIN_HEIGHT = 220;

/**
 * Choose a presentation for the space available.
 *
 * @param {object} [rect] - The object's rect from useRect().
 * @param {string} [configured] - The revealMode property: auto|inline|overlay|pane.
 * @returns {string} One of 'inline', 'overlay', 'pane'.
 */
export function resolveRevealMode(rect, configured) {
    if (configured && configured !== 'auto') return configured;
    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;
    if (width >= PANE_MIN_WIDTH) return 'pane';
    if (width >= OVERLAY_MIN_WIDTH && height >= OVERLAY_MIN_HEIGHT) return 'overlay';
    return 'inline';
}

/**
 * Render one KPI row.
 *
 * @param {object} props - Component props.
 * @param {object} props.kpi - A normalized KPI.
 * @param {number[]} props.series - That KPI across the conversation.
 * @param {number} props.activeIndex - Index of the message being shown.
 * @returns {object} The rendered KPI.
 */
function KpiRow({ kpi, series, activeIndex }) {
    return (
        <div className={styles.kpi}>
            <div className={styles.kpiLabel}>{kpi.label}</div>
            {kpi.varies ? (
                // Collapsed rows disagreed on this measure — typically a value per
                // recipient — so there is no single number to show.
                <div className={styles.kpiValue} title="Different on each row this message spans">
                    Varies
                </div>
            ) : (
                <div className={styles.kpiValue}>{kpi.text || '—'}</div>
            )}
            <Sparkline values={series} activeIndex={activeIndex} label={kpi.label} />
        </div>
    );
}

/**
 * Render the detail body — shared by all three presentations.
 *
 * @param {object} props - Component props.
 * @param {object} props.message - The message being shown.
 * @param {object[]} props.messages - The whole conversation, for KPI series.
 * @param {number} props.index - Index of the message being shown.
 * @param {boolean} props.showParticipant - Include the participant row.
 * @param {?object} [props.quote] - Marks for the quoted body: `highlights`, `describe`, and for
 *   clicking them `clickMode` and `onPick(values, toggle)`.
 * @returns {object} The rendered body.
 */
function DetailBody({ message, messages, index, showParticipant, quote = null }) {
    const facts = [
        // Only where there is no header to name them already — repeating the
        // author immediately under its own heading is noise.
        [
            message.recipients ? 'From' : 'Participant',
            showParticipant ? message.author?.label : null,
        ],
        [
            'To',
            message.recipients?.length
                ? formatRecipients(message.recipients, {
                      max: 50,
                      partial: message.recipientsPartial,
                  })
                : null,
        ],
        ['Sent', message.tsText],
        ['Thread', message.threadId],
        ['Kind', message.kind],
        ['Badge', message.badge],
    ].filter(([, value]) => value);

    return (
        <div className={styles.detailBody}>
            {message.merged ? (
                <div className={styles.detailWarning}>
                    This bubble combines {message.rowCount} messages, because the Message ID is not
                    unique.
                </div>
            ) : null}

            {message.recipientsPartial ? (
                <div className={styles.detailWarning}>
                    Some recipients may be missing: the conversation stopped at the message limit
                    part-way through this message.
                </div>
            ) : null}

            {message.idConflict ? (
                <div className={styles.detailWarning}>
                    A different message from the same sender has this Message ID. Make the id unique
                    across conversations, not just within one.
                </div>
            ) : null}

            {message.body ? (
                // A click on a highlight in the quote selects its value, as in the bubble. The quote
                // has no click action of its own, so anything else does nothing.
                <div
                    className={styles.detailQuote}
                    onClick={(event) => {
                        const route = routeClick(event, quote?.clickMode ?? null);
                        const span = quote?.highlights?.[route.ordinal];
                        if (route.kind === 'highlight' && span) {
                            quote.onPick?.(span.values, route.toggle);
                        }
                    }}
                >
                    <HighlightedText
                        text={message.body}
                        highlights={quote?.highlights}
                        describe={quote?.describe}
                    />
                </div>
            ) : null}

            {facts.length ? (
                <dl className={styles.detailFacts}>
                    {facts.map(([label, value]) => (
                        <div key={label} className={styles.detailFact}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}

            {message.kpis?.length ? (
                <div className={styles.kpiList}>
                    {message.kpis.map((kpi, k) => (
                        <KpiRow
                            key={kpi.key}
                            kpi={kpi}
                            activeIndex={index}
                            series={messages.map((m) => m.kpis?.[k]?.num ?? null)}
                        />
                    ))}
                </div>
            ) : null}

            {message.media?.length ? (
                <div className={styles.detailFacts}>
                    <div className={styles.detailFact}>
                        <dt>Media</dt>
                        <dd>
                            {message.media.length} attachment
                            {message.media.length === 1 ? '' : 's'} (rendering not yet supported)
                        </dd>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/**
 * Render the detail view in the presentation the space allows.
 *
 * @param {object} props - Component props.
 * @param {object} props.message - The message to show.
 * @param {object[]} props.messages - The whole conversation.
 * @param {number} props.index - Index of the message being shown.
 * @param {string} props.mode - 'inline' | 'overlay' | 'pane'.
 * @param {Function} props.onClose - Called to dismiss the detail.
 * @param {?object} [props.quote] - Marks for the quoted body: `highlights` and `describe`.
 * @returns {object} The rendered detail view.
 */
export function DetailReveal({ message, messages, index, mode, onClose, quote = null }) {
    const title = message.author?.label || 'Message';

    const header = (
        <div className={styles.detailHeader}>
            <span className={styles.detailTitle}>{title}</span>
            <button
                type="button"
                className={styles.detailClose}
                onClick={onClose}
                aria-label="Close details"
            >
                ×
            </button>
        </div>
    );

    const body = (
        <DetailBody
            message={message}
            messages={messages}
            index={index}
            showParticipant={mode === 'inline'}
            quote={quote}
        />
    );

    if (mode === 'inline') {
        // No header chrome: the bubble it expands from is its own label.
        return (
            <div className={styles.detailInline}>
                {body}
                <button type="button" className={styles.detailInlineClose} onClick={onClose}>
                    Close
                </button>
            </div>
        );
    }

    return (
        <aside
            className={mode === 'pane' ? styles.detailPane : styles.detailOverlay}
            aria-label="Message details"
        >
            {header}
            {body}
        </aside>
    );
}

export default DetailReveal;
