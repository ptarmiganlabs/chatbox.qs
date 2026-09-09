/**
 * The non-conversation render states.
 *
 * Kept as distinct components rather than one conditional blob because they are
 * genuinely different situations and conflating "not configured" with "loading"
 * produces a spinner that never resolves — a real and easily-shipped bug.
 */
import styles from './chat.module.css';

/**
 * Shown before the object has enough dimensions and measures to render.
 *
 * @param {object} props - Component props.
 * @param {string[]} [props.missing] - Roles that could not be resolved.
 * @returns {object} The rendered placeholder.
 */
export function NotConfigured({ missing = [] }) {
    return (
        <div className={styles.state}>
            <div className={styles.stateTitle}>Chatbox.qs</div>
            <div>
                Add a unique Message ID and a Participant dimension, plus a Message text measure.
            </div>
            {missing.length ? <div>Missing: {missing.join(', ')}</div> : null}
        </div>
    );
}

/**
 * Shown while pages are being fetched from the engine.
 *
 * @param {object} props - Component props.
 * @param {number} [props.loaded] - Rows loaded so far.
 * @param {number} [props.total] - Rows expected.
 * @returns {object} The rendered loading state.
 */
export function Loading({ loaded, total }) {
    return (
        <div className={styles.state}>
            <div>
                {total ? `Loading ${loaded ?? 0} of ${total} messages…` : 'Loading conversation…'}
            </div>
        </div>
    );
}

/**
 * Shown when the cube is valid but yields no rows.
 *
 * @param {object} props - Component props.
 * @param {?string} [props.message] - The engine's calc-condition message, if any.
 * @returns {object} The rendered empty state.
 */
export function Empty({ message }) {
    return (
        <div className={styles.state}>
            <div>{message || 'No messages for the current selection.'}</div>
        </div>
    );
}

/**
 * Shown when the paging request failed.
 *
 * @param {object} props - Component props.
 * @param {object} [props.error] - The error that ended the fetch.
 * @returns {object} The rendered error state.
 */
export function Failed({ error }) {
    return (
        <div className={styles.state}>
            <div className={styles.stateTitle}>Could not load the conversation</div>
            <div>{error?.message || 'Unknown error.'}</div>
        </div>
    );
}
