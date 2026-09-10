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
import styles from './chat.module.css';
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
            <div className={styles.kpiValue}>{kpi.text || '—'}</div>
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
 * @returns {object} The rendered body.
 */
function DetailBody({ message, messages, index, showParticipant }) {
    const facts = [
        // Only where there is no header to name them already — repeating the
        // author immediately under its own heading is noise.
        ['Participant', showParticipant ? message.author?.label : null],
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

            {message.body ? <div className={styles.detailQuote}>{message.body}</div> : null}

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
 * @returns {object} The rendered detail view.
 */
export function DetailReveal({ message, messages, index, mode, onClose }) {
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
