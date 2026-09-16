/**
 * One scrolling list of messages, and keeping the reader's place in it.
 *
 * Virtualization is react-virtuoso, which covers the two things that are genuinely hard here in one
 * zero-dependency package: variable-height rows (message bubbles are never uniform) and a list that
 * survives container resize — and a Qlik object is resized constantly, by sheet edits, grid drags and
 * fullscreen.
 *
 * The list knows nothing about what a row shows: the conversation view renders each one. It owns the
 * scrolling, and the rules for putting the reader back at their message once a selection replaces the
 * messages (GOTCHAS 28), so every list that shows messages keeps its place the same way.
 *
 * Indices: the messages given are a stretch of the conversation starting at `offset`. Everything that
 * comes in or goes out — rendering a row, scrolling to a message, where the reader is — uses the index
 * in the whole conversation; inside, the virtualizer counts from 0.
 */
import { useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { GroupedVirtuoso, Virtuoso } from 'react-virtuoso';
import styles from './chat.module.css';
import { bubbleKey, messageAtTop, returnIndex } from './reader-place';
import { scrollToElement } from './scroll';

/**
 * Render a list of messages.
 *
 * @param {object} props - Component props.
 * @param {object} [props.ref] - Receives the handle: `readingIndex()`, `firstVisibleIndex()`,
 *   `jumpTo(index)`, `reveal(index, options)`, `container(index)` and `contains(node)`.
 * @param {Array<object>} props.messages - The messages in this list, in display order.
 * @param {number} [props.offset] - The conversation index of the first of them.
 * @param {?{groupCounts: number[], labels: string[]}} [props.dayGroups] - Day groups over the messages,
 *   or null for no day headers.
 * @param {function(number): object} props.renderItem - Renders the message at a conversation index.
 * @param {boolean} [props.renderAll] - Render every message rather than virtualizing.
 * @param {boolean} [props.live] - Whether this is a live object, not an export render.
 * @param {number} [props.initialIndex] - The index within this list to start at.
 * @param {string} props.label - The list's accessible name.
 * @param {boolean} [props.busy] - Whether newer messages are loading.
 * @param {Function} [props.onKeyDown] - Keyboard handler for the list.
 * @param {function(number): void} [props.onRange] - Called with the conversation index of the first
 *   message the virtualizer draws, as it changes.
 * @param {object} [props.context] - Handed to the virtualizer as its context: which list it is.
 * @param {object} [props.scrollerStyle] - Style for the virtualizer's scrolling element, beside its height.
 * @returns {object} The rendered list.
 */
export function ConversationList({
    ref,
    messages,
    offset = 0,
    dayGroups = null,
    renderItem,
    renderAll = false,
    live = true,
    initialIndex = 0,
    label,
    busy = false,
    onKeyDown,
    onRange,
    context,
    scrollerStyle = null,
}) {
    const listRef = useRef(null);
    const virtuosoRef = useRef(null);
    // The element that scrolls: Virtuoso's scroller, or the list itself when every row is rendered.
    const scrollerRef = useRef(null);
    // The first row the virtualizer draws, within this list. The fallback for where the reader is, where
    // nothing is laid out.
    const firstVisibleRef = useRef(0);

    // The props as they are now, for the handle and the callbacks, which are made once.
    const latest = useRef(null);
    latest.current = { offset, renderAll, onRange };

    // Both handed to the virtualizer, and made once: a new function each render would change its props
    // on every frame of a drag-resize.
    const handleScrollerRef = useRef(null);
    if (!handleScrollerRef.current) {
        /**
         * Keep hold of the virtualizer's scrolling element.
         *
         * @param {?HTMLElement} node - The scroller, or null when it goes.
         * @returns {void}
         */
        handleScrollerRef.current = (node) => {
            scrollerRef.current = node;
        };
    }
    const handleRangeRef = useRef(null);
    if (!handleRangeRef.current) {
        /**
         * Record the visible range and report it upward.
         *
         * @param {object} range - Virtuoso's { startIndex, endIndex }.
         * @returns {void}
         */
        handleRangeRef.current = (range) => {
            firstVisibleRef.current = range?.startIndex ?? 0;
            latest.current.onRange?.(latest.current.offset + firstVisibleRef.current);
        };
    }

    // Where the reader is: the messages on screen, and the index of the one at the top of the view. A
    // selection replaces the messages, and the reader's message can move to another index or go.
    // `shownRef` holds the messages on screen and the offset they were drawn at, and `restoreRef` the
    // place to return to once new messages are shown.
    const shownRef = useRef({ messages, offset });
    const restoreRef = useRef(null);
    if (shownRef.current.messages !== messages) {
        // Read while rendering, while the rows on screen are still the messages the reader saw: once they
        // are replaced, the virtualizer keeps its pixel offset and reports whatever now sits there. Read
        // from the rows, because the virtualizer's range starts with rows drawn above the view, which a
        // selection may remove. Its range is the fallback where nothing is laid out.
        if (restoreRef.current === null) {
            const atTop = renderAll ? -1 : messageAtTop(scrollerRef.current, listRef.current);
            restoreRef.current = {
                messages: shownRef.current.messages,
                index: atTop >= 0 ? atTop - shownRef.current.offset : firstVisibleRef.current,
            };
        }
        shownRef.current = { messages, offset };
    } else {
        shownRef.current.offset = offset;
    }

    // When newer rows replace the messages, put the reader back at the message they were reading, or at
    // the nearest one still shown when the selection removed it. After a selection, the kept pixel
    // offset lands on whatever message now happens to sit there, or past the end of a shorter list. A
    // layout effect, so the jump back happens before the new messages are painted at the wrong place.
    useLayoutEffect(() => {
        const place = restoreRef.current;
        if (place === null) return;
        restoreRef.current = null;
        if (renderAll) return;
        const index = returnIndex(place, messages);
        if (index < 0 || index === place.index) return;
        firstVisibleRef.current = index;
        const location = { index, align: 'start' };
        virtuosoRef.current?.scrollToIndex?.(location);
        // Once more after this commit: the virtualizer draws the new list's height in an update of its
        // own, and until then a message further down than the old list reached is out of the browser's
        // reach, so the first scroll stops at the old end.
        let current = true;
        queueMicrotask(() => {
            if (current) virtuosoRef.current?.scrollToIndex?.(location);
        });
        return () => {
            current = false;
        };
    }, [messages, renderAll]);

    useImperativeHandle(
        ref,
        () => ({
            /**
             * Find the message the reader is at: the first one whose bottom is below the top of the view.
             *
             * @returns {number} Its conversation index.
             */
            readingIndex() {
                const list = listRef.current;
                const atTop = messageAtTop(
                    latest.current.renderAll ? list : scrollerRef.current,
                    list
                );
                return atTop >= 0 ? atTop : latest.current.offset + firstVisibleRef.current;
            },

            /**
             * Tell the first message the virtualizer draws.
             *
             * @returns {number} Its conversation index.
             */
            firstVisibleIndex() {
                return latest.current.offset + firstVisibleRef.current;
            },

            /**
             * Scroll a message to the top of the view.
             *
             * @param {number} index - The message's conversation index.
             * @returns {void}
             */
            jumpTo(index) {
                const list = listRef.current;
                if (!latest.current.renderAll) {
                    virtuosoRef.current?.scrollToIndex?.({
                        index: index - latest.current.offset,
                        align: 'start',
                        behavior: 'auto',
                    });
                    return;
                }
                const node = list?.querySelector(`[data-message-index="${index}"]`);
                if (node) scrollToElement(list, node, { position: 0 });
            },

            /**
             * Bring a message into view, where the virtualizer may not have drawn it yet.
             *
             * @param {number} index - The message's conversation index.
             * @param {object} [options] - Virtuoso's `scrollIntoView` options, `done` among them; with
             *   every row rendered, `done` is called at once.
             * @returns {void}
             */
            reveal(index, options = {}) {
                if (latest.current.renderAll) {
                    options.done?.();
                    return;
                }
                virtuosoRef.current?.scrollIntoView?.({
                    index: index - latest.current.offset,
                    ...options,
                });
            },

            /**
             * Tell where a message's row is drawn, and what scrolls it.
             *
             * @param {number} _index - The message's conversation index.
             * @returns {{list: ?HTMLElement, scroller: ?HTMLElement}} The list and its scrolling element.
             */
            container(_index) {
                const list = listRef.current;
                return { list, scroller: latest.current.renderAll ? list : scrollerRef.current };
            },

            /**
             * Tell whether a node is inside this list.
             *
             * @param {?Node} node - The node.
             * @returns {boolean} True when the list holds it.
             */
            contains(node) {
                return Boolean(listRef.current?.contains(node));
            },
        }),
        []
    );

    /**
     * Day label to show before a message, for the non-virtualized path.
     *
     * GroupedVirtuoso renders its own sticky headers, so this is only needed
     * where virtualization is off — the export path, which re-renders every row.
     *
     * @param {number} index - Index of the message within this list.
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
     * Render the virtualizer's item at an index within this list.
     *
     * @param {number} index - Index within this list.
     * @returns {object} The rendered row.
     */
    const itemContent = (index) => renderItem(offset + index);

    return (
        <div
            className={
                // Every row rendered in a live object: the list itself must scroll.
                renderAll && live ? `${styles.list} ${styles.listScroll}` : styles.list
            }
            role="list"
            aria-label={label}
            aria-busy={busy ? 'true' : undefined}
            ref={listRef}
            onKeyDown={onKeyDown}
        >
            {renderAll ? (
                // Export and print re-render from the layout in a headless
                // browser, where a virtualized window would capture only the
                // rows that happened to be visible.
                messages.map((message, i) => (
                    <div key={bubbleKey(message)}>
                        {separatorBefore(i) ? (
                            <div className={styles.separator}>{separatorBefore(i)}</div>
                        ) : null}
                        {renderItem(offset + i)}
                    </div>
                ))
            ) : dayGroups ? (
                // GroupedVirtuoso gives genuinely sticky day headers. A
                // separator rendered as an ordinary item cannot stick,
                // because the virtualizer positions items itself.
                <GroupedVirtuoso
                    ref={virtuosoRef}
                    initialTopMostItemIndex={initialIndex}
                    rangeChanged={handleRangeRef.current}
                    scrollerRef={handleScrollerRef.current}
                    // react-virtuoso makes its scroller tabbable by
                    // default. Left alone that is a second tab stop for
                    // the list, and it exists even when Sense has not
                    // handed focus to this object — so the roving
                    // tabindex would not actually be the only one.
                    tabIndex={-1}
                    style={{ height: '100%', ...scrollerStyle }}
                    context={context}
                    groupCounts={dayGroups.groupCounts}
                    groupContent={(groupIndex) => (
                        <div className={styles.separator}>{dayGroups.labels[groupIndex]}</div>
                    )}
                    itemContent={itemContent}
                    // No followOutput: a list short enough to fit counts as scrolled
                    // to the bottom, so following the rows a cleared selection brings
                    // back would carry the reader past their message (GOTCHAS 28).
                    increaseViewportBy={200}
                />
            ) : (
                <Virtuoso
                    ref={virtuosoRef}
                    initialTopMostItemIndex={initialIndex}
                    rangeChanged={handleRangeRef.current}
                    scrollerRef={handleScrollerRef.current}
                    // react-virtuoso makes its scroller tabbable by
                    // default. Left alone that is a second tab stop for
                    // the list, and it exists even when Sense has not
                    // handed focus to this object — so the roving
                    // tabindex would not actually be the only one.
                    tabIndex={-1}
                    style={{ height: '100%', ...scrollerStyle }}
                    context={context}
                    totalCount={messages.length}
                    itemContent={itemContent}
                    // No followOutput: a list short enough to fit counts as scrolled
                    // to the bottom, so following the rows a cleared selection brings
                    // back would carry the reader past their message (GOTCHAS 28).
                    increaseViewportBy={200}
                />
            )}
        </div>
    );
}

export default ConversationList;
