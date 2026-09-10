/**
 * A KPI's value across the whole conversation, with one message marked.
 *
 * Inline SVG with no dependencies. A single message's KPI is one number and one
 * number is not worth a chart, so what is drawn is the KPI across every message
 * — which turns "42" into "42, and unusually high for this conversation".
 *
 * SVG rather than canvas because it scales with the container, respects the
 * theme through currentColor, and survives Sense's export path, which
 * re-renders from the layout in a headless browser.
 */
import styles from './chat.module.css';

const WIDTH = 120;
const HEIGHT = 24;
const PAD = 2;

/**
 * Map a series to SVG points, and locate the highlighted index.
 *
 * @param {number[]} values - The series, in conversation order.
 * @param {number} activeIndex - Index to highlight.
 * @returns {?object} { path, cx, cy } or null when there is nothing to draw.
 */
export function buildPath(values, activeIndex) {
    const usable = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (usable.length < 2) return null;

    const min = Math.min(...usable);
    const max = Math.max(...usable);
    // A flat series has no range to scale against; draw it down the middle
    // rather than dividing by zero.
    const span = max - min || 1;

    const innerW = WIDTH - PAD * 2;
    const innerH = HEIGHT - PAD * 2;
    const step = values.length > 1 ? innerW / (values.length - 1) : 0;

    let path = '';
    let cx = null;
    let cy = null;
    let started = false;

    values.forEach((value, i) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        const x = PAD + i * step;
        const y = PAD + innerH - ((value - min) / span) * innerH;
        path += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        started = true;
        if (i === activeIndex) {
            cx = x;
            cy = y;
        }
    });

    return started ? { path, cx, cy } : null;
}

/**
 * Render the sparkline.
 *
 * @param {object} props - Component props.
 * @param {number[]} props.values - The series across the conversation.
 * @param {number} props.activeIndex - Index of the message being shown.
 * @param {string} [props.label] - Accessible description of the series.
 * @returns {?object} The rendered sparkline, or null when there is too little data.
 */
export function Sparkline({ values, activeIndex, label }) {
    const shape = buildPath(values ?? [], activeIndex);
    if (!shape) return null;

    return (
        <svg
            className={styles.sparkline}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={label ? `${label} across the conversation` : 'Trend'}
        >
            <path d={shape.path} fill="none" stroke="currentColor" strokeWidth="1.5" />
            {shape.cx !== null ? (
                <circle cx={shape.cx} cy={shape.cy} r="2.5" fill="currentColor" />
            ) : null}
        </svg>
    );
}

export default Sparkline;
