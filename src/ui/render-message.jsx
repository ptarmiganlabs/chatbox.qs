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
import { formatRecipients } from '../chat/recipients';
import BubbleBody from './BubbleBody';
import { routeClick } from './click-route';
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
 * @param {boolean} props.selectable - Whether clicking should act on the message.
 * @param {number} [props.index] - Position in the conversation, for focus management.
 * @param {boolean} [props.focused] - Whether this row currently holds roving focus.
 * @param {boolean} [props.tabbable] - Whether this row is the list's single tab stop.
 * @param {boolean} [props.expanded] - Whether this message's detail is open.
 * @param {Function} [props.onSelect] - Click handler receiving the message.
 * @param {Function} [props.onShowDetails] - Opens the detail view, when clicking selects instead.
 * @param {?object} [props.highlights] - This message's highlights, from the conversation highlighter.
 * @param {number} [props.drawn] - How many of them are drawn.
 * @param {function(object): object} [props.describe] - Describes a highlight span.
 * @returns {object} The rendered row.
 */
export function MessageRow({
    message,
    index,
    focused,
    tabbable,
    showAuthor,
    showAvatar,
    selectable,
    expanded,
    onSelect,
    onShowDetails,
    highlights = null,
    drawn,
    describe,
}) {
    const own = message.side === 'right';
    const groupSize = message.recipients?.length ?? 0;
    const accent = message.accent || message.author?.color || 'transparent';

    const rowClass = [styles.row, own ? styles.rowOwn : ''].filter(Boolean).join(' ');
    const bubbleClass = [
        styles.bubble,
        own ? styles.bubbleOwn : '',
        message.merged ? styles.bubbleMerged : '',
        selectable || onShowDetails ? styles.selectable : '',
        expanded ? styles.bubbleOpen : '',
        focused ? styles.bubbleFocused : '',
        // 'X' excluded and 'A' alternative are both "not currently possible".
        // Native Sense charts grey both; dimming only 'X' left alternative-state
        // values looking fully selectable.
        message.state === 'X' || message.state === 'A' ? styles.dimmed : '',
    ]
        .filter(Boolean)
        .join(' ');

    /**
     * Forward a click to the selection handler, unless it was for copying text or a link.
     *
     * @param {object} event - The React mouse event.
     * @returns {void}
     */
    const handleClick = (event) => {
        if (routeClick(event).kind === 'none') return;
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
        // Only when the list is not driving navigation. With roving focus the
        // container owns Enter and Space, and handling them here as well would
        // fire the action twice.
        if (tabbable === undefined && (event.key === 'Enter' || event.key === ' ')) {
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
                {showAuthor ? (
                    <div className={styles.author}>
                        <span>{message.author?.label}</span>
                        {message.recipients?.length ? (
                            <span
                                className={styles.recipients}
                                title={message.recipients.map((r) => r.label).join(', ')}
                            >
                                {/* The arrow is decoration; a screen reader hears "to". */}
                                <span aria-hidden="true"> → </span>
                                <span className={styles.srOnly}> to </span>
                                {formatRecipients(message.recipients, {
                                    partial: message.recipientsPartial,
                                })}
                            </span>
                        ) : null}
                    </div>
                ) : null}
                <div
                    className={bubbleClass}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    data-message-index={index}
                    role={selectable ? 'button' : undefined}
                    // Roving tabindex: only one row in the whole conversation is
                    // reachable by Tab; the rest are reachable by arrow key.
                    // Tabbing through hundreds of messages would otherwise make
                    // the entire sheet unnavigable.
                    tabIndex={tabbable ? 0 : -1}
                    aria-expanded={
                        onShowDetails || expanded !== undefined ? Boolean(expanded) : undefined
                    }
                >
                    {message.body ? (
                        <BubbleBody
                            body={message.body}
                            format={message.bodyFormat}
                            highlights={highlights}
                            drawn={drawn}
                            describe={describe}
                        />
                    ) : message.merged ? (
                        <div className={styles.bodyMissing}>
                            {message.rowCount} messages share this Message ID, so{' '}
                            <code>Only()</code> returns nothing. Use a unique id, or{' '}
                            <code>Concat()</code> to show them together.
                        </div>
                    ) : (
                        <div className={styles.body} />
                    )}
                    {message.tsText ||
                    message.badge ||
                    message.merged ||
                    message.idConflict ||
                    groupSize > 1 ||
                    onShowDetails ? (
                        <div className={styles.meta}>
                            {message.tsText ? <span>{message.tsText}</span> : null}
                            {message.badge ? (
                                <span className={styles.badge}>{message.badge}</span>
                            ) : null}
                            {groupSize > 1 ? (
                                <span className={styles.badge}>{groupSize} recipients</span>
                            ) : null}
                            {message.merged ? (
                                <span className={styles.badge} title="Message ID is not unique">
                                    merged
                                </span>
                            ) : null}
                            {message.idConflict ? (
                                <span
                                    className={styles.badge}
                                    title="A different message has the same Message ID"
                                >
                                    shared id
                                </span>
                            ) : null}
                            {onShowDetails ? (
                                <button
                                    type="button"
                                    className={styles.detailsLink}
                                    aria-expanded={Boolean(expanded)}
                                    onClick={(event) => {
                                        // The bubble itself is bound to selection.
                                        event.stopPropagation();
                                        onShowDetails(message);
                                    }}
                                >
                                    {expanded ? 'Hide details' : 'Details'}
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default MessageRow;
