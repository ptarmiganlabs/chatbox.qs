/**
 * The conversation view.
 *
 * Virtualization is react-virtuoso, which covers the two things that are
 * genuinely hard here in one zero-dependency package: variable-height rows
 * (message bubbles are never uniform) and stick-to-bottom that survives
 * container resize — and a Qlik object is resized constantly, by sheet edits,
 * grid drags and fullscreen.
 *
 * `role="list"` rather than `role="log"`: a Qlik chart re-renders wholesale on
 * every selection change, and a polite live region would announce the entire
 * conversation each time.
 */
import { Virtuoso } from 'react-virtuoso';
import styles from './chat.module.css';
import MessageRow from './render-message';
import { Empty } from './states';

/**
 * Decide whether a message continues the previous author's cluster.
 *
 * @param {object} message - The current message.
 * @param {?object} previous - The message before it, if any.
 * @param {number} gapSec - Maximum gap, in seconds, that still counts as one cluster.
 * @returns {boolean} True when the author header should be shown.
 */
export function startsCluster(message, previous, gapSec) {
    if (!previous) return true;
    if (previous.authorKey !== message.authorKey) return true;
    if (typeof message.ts === 'number' && typeof previous.ts === 'number') {
        return Math.abs(message.ts - previous.ts) > gapSec * 1000;
    }
    return false;
}

/**
 * Report whether a bubble can be clicked, for the configured selection target.
 *
 * The gate must test the element number of the cell that will ACTUALLY be
 * selected. Checking the author's element number while selecting the message
 * offers a click that the engine then rejects.
 *
 * @param {object} message - A normalized Message.
 * @param {string} [mode] - The configured onBubbleClick mode.
 * @returns {boolean} True when the click will produce a valid selection.
 */
export function isSelectable(message, mode) {
    if (mode === 'none') return false;
    if (mode === 'selectMessage') return message.elem >= 0;
    return (message.author?.elem ?? -1) >= 0;
}

/**
 * Render the conversation.
 *
 * @param {object} props - Component props.
 * @param {object} props.conversation - A normalized Conversation.
 * @param {object} [props.settings] - The `chatbox` property bag.
 * @param {boolean} [props.canSelect] - Whether selections are permitted.
 * @param {Function} [props.onSelect] - Called with a message on click.
 * @returns {object} The rendered conversation.
 */
export function ChatLog({ conversation, settings = {}, canSelect = false, onSelect }) {
    const { messages, diagnostics } = conversation;

    // Every warning is rendered, not just the first. Truncation and merged
    // bubbles can both be live at once, and showing only one silently hides
    // the fact that messages were dropped.
    const warnings = (diagnostics ?? []).filter((d) => d.severity === 'warning');
    const gapSec = Number(settings.groupGapSec) >= 0 ? Number(settings.groupGapSec) : 120;
    const showAvatars = settings.showAvatars !== false;

    if (!messages.length) {
        return (
            <div className={styles.root}>
                <Empty />
            </div>
        );
    }

    /**
     * Render one virtualized row.
     *
     * @param {number} index - Index of the message to render.
     * @returns {object} The rendered row.
     */
    const renderRow = (index) => {
        const message = messages[index];
        const previous = index > 0 ? messages[index - 1] : null;
        const showAuthor = startsCluster(message, previous, gapSec);
        return (
            <MessageRow
                message={message}
                showAuthor={showAuthor}
                showAvatar={showAvatars}
                selectable={canSelect && isSelectable(message, settings.onBubbleClick)}
                onSelect={onSelect}
            />
        );
    };

    return (
        <div className={styles.root}>
            {warnings.map((w) => (
                <div key={w.code} className={`${styles.banner} ${styles.bannerWarning}`}>
                    {w.message}
                </div>
            ))}
            <div className={styles.list} role="list" aria-label="Conversation">
                {settings.virtualize === false ? (
                    // Export and print re-render from the layout in a headless
                    // browser, where a virtualized window would capture only the
                    // rows that happened to be visible.
                    messages.map((_, i) => <div key={messages[i].id}>{renderRow(i)}</div>)
                ) : (
                    <Virtuoso
                        style={{ height: '100%' }}
                        totalCount={messages.length}
                        itemContent={renderRow}
                        followOutput="smooth"
                        increaseViewportBy={200}
                    />
                )}
            </div>
        </div>
    );
}

export default ChatLog;
