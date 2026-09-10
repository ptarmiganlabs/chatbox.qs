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
import { useCallback, useEffect, useRef, useState } from 'react';
import { GroupedVirtuoso, Virtuoso } from 'react-virtuoso';
import styles from './chat.module.css';
import { buildDayGroups, startsCluster } from '../chat/grouping';
import DetailReveal, { resolveRevealMode } from './DetailReveal';
import { resolveDensity } from './density';
import { canReceiveTabStop, keyAction, nextFocusIndex } from './keyboard';
import { readSnapshot, shouldRenderAll } from './snapshot';
import MessageRow from './render-message';
import { Empty } from './states';

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
 * @param {object} [props.rect] - The object's rect, for choosing a detail presentation.
 * @param {object} [props.keyboard] - The object returned by useKeyboard().
 * @param {object} [props.layout] - The object layout, for snapshot state.
 * @param {Function} [props.onViewState] - Reports { firstVisibleIndex, openId } as it changes.
 * @returns {object} The rendered conversation.
 */
export function ChatLog({
    conversation,
    settings = {},
    canSelect = false,
    onSelect,
    rect,
    keyboard,
    layout,
    onViewState,
}) {
    // State captured when a snapshot was taken. Null for a normal render.
    const snapshot = readSnapshot(layout);
    const renderAll = shouldRenderAll(layout, settings);
    const { messages, diagnostics } = conversation;

    // Which message's detail is open, by id. Held here rather than per-row so
    // opening one closes any other, and so the pane and overlay presentations
    // have somewhere to read from.
    const [openId, setOpenId] = useState(snapshot?.openId ?? null);

    const revealMode = resolveRevealMode(rect, settings.revealMode);
    const density = resolveDensity(rect, settings.density);

    // Null when nothing can be dated — also the signal to fall back to the
    // ungrouped list rather than show a heading that means nothing.
    const dayGroups =
        settings.dateSeparators === false ? null : buildDayGroups(conversation.messages);
    const detailsOnClick = settings.onBubbleClick === 'showDetails';

    /**
     * Open, close or toggle the detail for a message.
     *
     * @param {object} message - The message that was activated.
     * @returns {void}
     */
    const toggleDetail = useCallback((message) => {
        setOpenId((current) => (current === message.id ? null : message.id));
    }, []);

    /**
     * Dismiss the open detail.
     *
     * @returns {void}
     */
    const closeDetail = useCallback(() => setOpenId(null), []);

    // The first visible row, reported upward so a snapshot can capture where the
    // reader was. Kept in a ref as well: the snapshot callback runs outside
    // React and needs the current value, not the one from its closure.
    const firstVisibleRef = useRef(0);

    /**
     * Record the visible range and report it upward.
     *
     * @param {object} range - Virtuoso's { startIndex, endIndex }.
     * @returns {void}
     */
    const handleRangeChanged = useCallback(
        (range) => {
            firstVisibleRef.current = range?.startIndex ?? 0;
            onViewState?.({ firstVisibleIndex: firstVisibleRef.current, openId });
        },
        [onViewState, openId]
    );

    useEffect(() => {
        onViewState?.({ firstVisibleIndex: firstVisibleRef.current, openId });
    }, [onViewState, openId]);

    // Roving tabindex: exactly one message is tabbable at a time, so the whole
    // conversation costs the sheet a single tab stop instead of one per message.
    const [focusIndex, setFocusIndex] = useState(-1);
    const listRef = useRef(null);
    const virtuosoRef = useRef(null);
    const tabbable = canReceiveTabStop(keyboard);

    // Move real DOM focus after the index changes. In a virtualized list the
    // target may not be mounted yet, so scroll it into view first and focus on
    // the next frame once it exists.
    useEffect(() => {
        if (focusIndex < 0 || !tabbable) return undefined;
        let frame = 0;
        virtuosoRef.current?.scrollIntoView?.({ index: focusIndex });
        frame = requestAnimationFrame(() => {
            const node = listRef.current?.querySelector(`[data-message-index="${focusIndex}"]`);
            node?.focus?.();
        });
        return () => cancelAnimationFrame(frame);
    }, [focusIndex, tabbable]);

    // Every warning is rendered, not just the first. Truncation and merged
    // bubbles can both be live at once, and showing only one silently hides
    // the fact that messages were dropped.
    const warnings = (diagnostics ?? []).filter((d) => d.severity === 'warning');
    const gapSec = Number(settings.groupGapSec) >= 0 ? Number(settings.groupGapSec) : 120;
    const showAvatars = settings.showAvatars !== false;

    const openIndex = openId ? messages.findIndex((m) => m.id === openId) : -1;
    // A selection can remove the open message from the cube entirely, which
    // would otherwise leave a pane rendering a stale bubble.
    const openMessage = openIndex >= 0 ? messages[openIndex] : null;

    if (!messages.length) {
        return (
            <div className={styles.root}>
                <Empty />
            </div>
        );
    }

    /**
     * Handle keyboard navigation for the whole list.
     *
     * Bound on the container rather than per row, so it keeps working while
     * focus is on a row that virtualization is about to unmount.
     *
     * @param {object} event - The React keyboard event.
     * @returns {void}
     */
    const handleKeyDown = (event) => {
        if (!tabbable) return;

        const moved = nextFocusIndex(event.key, focusIndex, messages.length);
        if (moved !== null) {
            event.preventDefault();
            setFocusIndex(moved);
            return;
        }

        const action = keyAction(event.key);
        if (action === 'activate' && focusIndex >= 0) {
            event.preventDefault();
            toggleDetail(messages[focusIndex]);
            return;
        }
        if (action === 'dismiss') {
            event.preventDefault();
            // Escape closes the detail if one is open; a second Escape hands
            // focus back to Sense so the reader can carry on tabbing the sheet
            // rather than being trapped in the conversation.
            if (openId) {
                closeDetail();
            } else {
                setFocusIndex(-1);
                keyboard?.blur?.(true);
            }
        }
    };

    /**
     * Day label to show before a message, for the non-virtualized path.
     *
     * GroupedVirtuoso renders its own sticky headers, so this is only needed
     * where virtualization is off — the export path, which re-renders every row.
     *
     * @param {number} index - Index of the message.
     * @returns {?string} The label, or null when this message continues the day.
     */
    const separatorBefore = (index) => {
        if (!dayGroups) return null;
        let seen = 0;
        for (let g = 0; g < dayGroups.groupCounts.length; g += 1) {
            if (index === seen) return dayGroups.labels[g] || null;
            seen += dayGroups.groupCounts[g];
        }
        return null;
    };

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
        const isOpen = message.id === openId;
        return (
            <>
                <MessageRow
                    message={message}
                    index={index}
                    focused={index === focusIndex}
                    tabbable={tabbable && (focusIndex === -1 ? index === 0 : index === focusIndex)}
                    showAuthor={showAuthor}
                    showAvatar={showAvatars}
                    selectable={
                        detailsOnClick ||
                        (canSelect && isSelectable(message, settings.onBubbleClick))
                    }
                    expanded={isOpen}
                    onSelect={detailsOnClick ? toggleDetail : onSelect}
                    onShowDetails={detailsOnClick ? undefined : toggleDetail}
                />
                {isOpen && revealMode === 'inline' ? (
                    <DetailReveal
                        message={message}
                        messages={messages}
                        index={index}
                        mode="inline"
                        onClose={closeDetail}
                    />
                ) : null}
            </>
        );
    };

    const detail =
        openMessage && revealMode !== 'inline' ? (
            <DetailReveal
                message={openMessage}
                messages={messages}
                index={openIndex}
                mode={revealMode}
                onClose={closeDetail}
            />
        ) : null;

    const rootClass = [
        styles.root,
        styles[`density${density[0].toUpperCase()}${density.slice(1)}`],
        revealMode === 'pane' && detail ? styles.rootPaned : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={rootClass} data-density={density}>
            {warnings.map((w) => (
                <div key={w.code} className={`${styles.banner} ${styles.bannerWarning}`}>
                    {w.message}
                </div>
            ))}
            <div className={styles.main}>
                <div
                    className={styles.list}
                    role="list"
                    aria-label={`Conversation, ${messages.length} messages`}
                    ref={listRef}
                    onKeyDown={handleKeyDown}
                >
                    {renderAll ? (
                        // Export and print re-render from the layout in a headless
                        // browser, where a virtualized window would capture only the
                        // rows that happened to be visible.
                        messages.map((_, i) => (
                            <div key={messages[i].id}>
                                {separatorBefore(i) ? (
                                    <div className={styles.separator}>{separatorBefore(i)}</div>
                                ) : null}
                                {renderRow(i)}
                            </div>
                        ))
                    ) : dayGroups ? (
                        // GroupedVirtuoso gives genuinely sticky day headers. A
                        // separator rendered as an ordinary item cannot stick,
                        // because the virtualizer positions items itself.
                        <GroupedVirtuoso
                            ref={virtuosoRef}
                            initialTopMostItemIndex={snapshot?.firstVisibleIndex ?? 0}
                            rangeChanged={handleRangeChanged}
                            // react-virtuoso makes its scroller tabbable by
                            // default. Left alone that is a second tab stop for
                            // the list, and it exists even when Sense has not
                            // handed focus to this object — so the roving
                            // tabindex below would not actually be the only one.
                            tabIndex={-1}
                            style={{ height: '100%' }}
                            groupCounts={dayGroups.groupCounts}
                            groupContent={(groupIndex) => (
                                <div className={styles.separator}>
                                    {dayGroups.labels[groupIndex]}
                                </div>
                            )}
                            itemContent={renderRow}
                            followOutput="smooth"
                            increaseViewportBy={200}
                        />
                    ) : (
                        <Virtuoso
                            ref={virtuosoRef}
                            initialTopMostItemIndex={snapshot?.firstVisibleIndex ?? 0}
                            rangeChanged={handleRangeChanged}
                            // react-virtuoso makes its scroller tabbable by
                            // default. Left alone that is a second tab stop for
                            // the list, and it exists even when Sense has not
                            // handed focus to this object — so the roving
                            // tabindex below would not actually be the only one.
                            tabIndex={-1}
                            style={{ height: '100%' }}
                            totalCount={messages.length}
                            itemContent={renderRow}
                            followOutput="smooth"
                            increaseViewportBy={200}
                        />
                    )}
                </div>
                {detail}
            </div>
        </div>
    );
}

export default ChatLog;
