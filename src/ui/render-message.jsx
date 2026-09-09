/**
 * The renderer adapter seam.
 *
 * This is the only module that knows what the presentation layer is. Everything
 * below it (normalize, paging, the qix readers) deals in the domain model;
 * everything above it deals in layout. Swapping the bubble implementation — or
 * the list virtualizer, or dropping in a component kit — is a rewrite of this
 * file rather than of the extension.
 *
 * Message bodies are rendered as React children, never as HTML. Every chat-ish
 * Sense extension published so far interpolates cell text straight into the
 * DOM; since an extension runs on the hub's own origin inside the user's
 * session, that is a session-stealing XSS vector rather than a style choice.
 */
import styles from './chat.module.css';

/**
 * Initials for an avatar fallback.
 *
 * @param {string} label - The participant's display name.
 * @returns {string} One or two uppercase initials.
 */
function initials(label) {
    const parts = String(label || '?')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Render one message row.
 *
 * @param {object} props - Component props.
 * @param {object} props.message - A normalized Message.
 * @param {boolean} props.showAuthor - Whether to show the author header.
 * @param {boolean} props.showAvatar - Whether to render the avatar column.
 * @param {boolean} props.selectable - Whether clicking should select.
 * @param {Function} [props.onSelect] - Click handler receiving the message.
 * @returns {object} The rendered row.
 */
export function MessageRow({ message, showAuthor, showAvatar, selectable, onSelect }) {
    const own = message.side === 'right';
    const accent = message.accent || message.author?.color || 'transparent';

    const rowClass = [styles.row, own ? styles.rowOwn : ''].filter(Boolean).join(' ');
    const bubbleClass = [
        styles.bubble,
        own ? styles.bubbleOwn : '',
        message.merged ? styles.bubbleMerged : '',
        selectable ? styles.selectable : '',
        message.state === 'X' ? styles.dimmed : '',
    ]
        .filter(Boolean)
        .join(' ');

    /**
     * Forward a click to the selection handler.
     *
     * @returns {void}
     */
    const handleClick = () => {
        if (selectable) onSelect?.(message);
    };

    /**
     * Activate on Enter or Space, matching button semantics.
     *
     * @param {object} event - The keyboard event.
     * @returns {void}
     */
    const handleKeyDown = (event) => {
        if (!selectable) return;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect?.(message);
        }
    };

    let avatar = null;
    if (showAvatar) {
        if (!showAuthor) {
            avatar = <div className={styles.avatarSpacer} aria-hidden="true" />;
        } else if (message.author?.avatarUrl) {
            avatar = (
                <img
                    className={styles.avatar}
                    src={message.author.avatarUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{ '--cqs-accent': accent }}
                />
            );
        } else {
            avatar = (
                <div
                    className={`${styles.avatar} ${styles.avatarFallback}`}
                    style={{ '--cqs-accent': accent }}
                    aria-hidden="true"
                >
                    {initials(message.author?.label)}
                </div>
            );
        }
    }

    return (
        <div className={rowClass} role="listitem" style={{ '--cqs-accent': accent }}>
            {avatar}
            <div className={styles.bubbleWrap}>
                {showAuthor ? <div className={styles.author}>{message.author?.label}</div> : null}
                <div
                    className={bubbleClass}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    role={selectable ? 'button' : undefined}
                    tabIndex={selectable ? 0 : undefined}
                >
                    {/* React escapes children — the body is never markup. */}
                    <div className={styles.body}>{message.body}</div>
                    {message.tsText || message.badge || message.merged ? (
                        <div className={styles.meta}>
                            {message.tsText ? <span>{message.tsText}</span> : null}
                            {message.badge ? (
                                <span className={styles.badge}>{message.badge}</span>
                            ) : null}
                            {message.merged ? (
                                <span className={styles.badge} title="Message ID is not unique">
                                    merged
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default MessageRow;
