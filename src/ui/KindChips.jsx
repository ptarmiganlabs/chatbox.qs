/**
 * A message's kinds, as chips above its text.
 *
 * A field can give a message a great many kinds, so a bubble shows only the first few and one more chip
 * saying how many it leaves out; hovering over that chip lists them. The chips sit inside the bubble,
 * which is a button while a click on it selects, so they are plain spans: a button holds no list.
 *
 * Kinds are field data, and reach the DOM as React children and attributes only.
 */
import { counted, formatCount } from '../util/format';
import styles from './chat.module.css';

/** The most hidden kinds the "+N" chip's tooltip names. */
export const HIDDEN_KINDS_LISTED = 20;

/**
 * Write the tooltip of the chip that stands for the kinds left out.
 *
 * @param {string[]} hidden - The kinds not shown as chips.
 * @param {boolean} capped - Whether there were more kinds than were kept.
 * @returns {string} The first {@link HIDDEN_KINDS_LISTED} of them, then how many more there are.
 */
export function hiddenKindsTitle(hidden, capped) {
    const listed = hidden.slice(0, HIDDEN_KINDS_LISTED).join(', ');
    const rest = hidden.length - HIDDEN_KINDS_LISTED;
    const over = capped ? 'over ' : '';
    if (rest > 0) return `${listed}, and ${over}${formatCount(rest)} more`;
    return capped ? `${listed}, and more` : listed;
}

/**
 * Render a message's kinds.
 *
 * @param {object} props - Component props.
 * @param {string[]} props.kinds - The message's kinds, distinct, in order.
 * @param {number} props.max - The most chips to show.
 * @param {boolean} [props.capped] - Whether the message had more kinds than were kept.
 * @returns {?object} The chips, or null when there are no kinds.
 */
export function KindChips({ kinds, max, capped = false }) {
    if (!Array.isArray(kinds) || kinds.length === 0) return null;
    const shown = kinds.slice(0, max);
    const hidden = kinds.slice(max);
    return (
        <div className={styles.kinds}>
            {shown.map((kind) => (
                <span key={kind} className={styles.kindChip} title={kind}>
                    {kind}
                </span>
            ))}
            {hidden.length > 0 || capped ? (
                <span
                    className={styles.kindChip}
                    data-more="true"
                    title={hiddenKindsTitle(hidden, capped)}
                >
                    <span aria-hidden="true">
                        +{hidden.length}
                        {capped ? '+' : ''}
                    </span>
                    <span className={styles.srOnly}>
                        {` and ${capped ? 'over ' : ''}${counted(hidden.length, 'more kind', 'more kinds')}`}
                    </span>
                </span>
            ) : null}
        </div>
    );
}

export default KindChips;
