/**
 * The non-conversation render states.
 *
 * Kept as distinct components rather than one conditional blob because they are
 * genuinely different situations and conflating "not configured" with "loading"
 * produces a spinner that never resolves — a real and easily-shipped bug.
 */
import { CONVERSATION_MODELS } from '../qix/column-map';
import { roleLabel } from '../qix/role-labels';
import styles from './chat.module.css';

/**
 * Shown before the object has enough dimensions and measures to render.
 *
 * Switching the conversation model never rewrites the role a column already
 * has, so the current assignments are listed too — otherwise "Missing: To" after
 * a switch gives no hint that the third dimension is still the thread.
 *
 * @param {object} props - Component props.
 * @param {string[]} [props.missing] - Roles that could not be resolved.
 * @param {string} [props.conversationModel] - A CONVERSATION_MODELS value.
 * @param {object[]} [props.assigned] - { label, column } for each bound role.
 * @returns {object} The rendered placeholder.
 */
export function NotConfigured({ missing = [], conversationModel, assigned = [] }) {
    const fromTo = conversationModel === CONVERSATION_MODELS.FROM_TO;
    return (
        <div className={styles.state}>
            <div className={styles.stateTitle}>Chatbox.qs</div>
            <div>
                {fromTo
                    ? 'Add a unique Message ID, a From and a To dimension, plus a Message text measure.'
                    : 'Add a unique Message ID and a Participant dimension, plus a Message text measure.'}
            </div>
            {missing.length ? (
                <div>
                    Missing: {missing.map((role) => roleLabel(role, conversationModel)).join(', ')}
                </div>
            ) : null}
            {missing.length && assigned.length ? (
                <div>Assigned: {assigned.map((a) => `${a.label} = ${a.column}`).join(' · ')}</div>
            ) : null}
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
 * Choose the message for the empty state.
 *
 * The app author's calculation-condition message wins: it is what they wrote
 * to explain why the chart is intentionally blank. After that, a cube whose
 * rows were all phantoms says so — "No messages" would hide that the engine
 * returned rows and that they came from a linked table.
 *
 * @param {object} [conversation] - The normalized Conversation.
 * @param {?string} [calcMsg] - The engine's calc-condition message, if any.
 * @returns {?string} The message, or null for the default text.
 */
export function emptyStateMessage(conversation, calcMsg) {
    if (calcMsg) return calcMsg;
    const phantoms = conversation?.meta?.phantomRows ?? 0;
    if (phantoms > 0 && phantoms === conversation?.meta?.rowsLoaded) {
        return (
            `The data returned ${phantoms} row(s), but none of them is a message: each is a ` +
            'value from a linked table that has no messages.'
        );
    }
    return null;
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
