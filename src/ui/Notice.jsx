/**
 * A short notice in the corner of the conversation: why a click selected nothing, or what a copy did.
 *
 * A click that silently does nothing looks like a broken object, so every way a selection can fail is
 * said here for a few seconds. It is a polite status region: a screen reader announces it without
 * interrupting.
 */
import styles from './chat.module.css';

/**
 * Render the notice.
 *
 * @param {object} props - Component props.
 * @param {?{id: number, text: string, level: string}} [props.notice] - What to say, or null.
 * @returns {object} The rendered notice region, empty when there is nothing to say.
 */
export function Notice({ notice = null }) {
    return (
        <div className={styles.notice} role="status" aria-live="polite">
            {notice ? (
                <span key={notice.id} className={styles.noticeText} data-level={notice.level}>
                    {notice.text}
                </span>
            ) : null}
        </div>
    );
}

export default Notice;
