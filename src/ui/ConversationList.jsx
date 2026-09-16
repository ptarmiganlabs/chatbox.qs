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
 * comes in or goes out — scrolling to a message, where the reader is — uses the index in the whole
 * conversation; inside, the virtualizer counts from 0.
 *
 * Items: the virtualizer's items are the messages, or, given `rows`, rows of messages — conversations
 * side by side lined up in time, where one row holds a message from each of several lanes. Scrolling to a
 * message then scrolls to its row, and the reader's place is still kept by message.
 */
import { useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { GroupedVirtuoso, Virtuoso } from 'react-virtuoso';
import styles from './chat.module.css';
import { bubbleKey, messageAtTop, returnIndex } from './reader-place';
import { scrollToElement } from './scroll';

/**
 * Find the item a message is in.
 *
 * @param {?{of: Int32Array}} rows - The rows, or null when every message is an item.
 * @param {number} index - The message's index within the list.
 * @returns {number} The item's index.
 */
function itemOf(rows, index) {
    return rows ? (rows.of[index] ?? -1) : index;
}

/**
 * Find the first message of an item.
 *
 * @param {?{start: Int32Array}} rows - The rows, or null when every message is an item.
 * @param {number} item - The item's index.
 * @returns {number} The message's index within the list.
 */
function firstMessageOf(rows, item) {
    return rows ? (rows.start[item] ?? 0) : item;
}

/**
 * Render a list of messages.
 *
 * @param {object} props - Component props.
 * @param {object} [props.ref] - Receives the handle: `readingIndex()`, `firstVisibleIndex()`,
 *   `jumpTo(index)`, `reveal(index, options)`, `container(index)` and `contains(node)`.
 * @param {Array<object>} props.messages - The messages in this list, in display order.
 * @param {number} [props.offset] - The conversation index of the first of them.
 * @param {?{count: number, start: Int32Array, of: Int32Array}} [props.rows] - Rows of messages to show as
 *   the items, from src/chat/lanes.js; null to show each message as an item.
 * @param {?{groupCounts: number[], labels: string[]}} [props.dayGroups] - Day groups over the items, or
 *   null for no day headers.
 * @param {function(number): object} props.renderItem - Renders an item: the message at a conversation
 *   index, or given `rows`, the row at a row index.
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
    rows = null,
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
    // The first item the virtualizer draws. The fallback for where the reader is, where nothing is laid out.
    const firstVisibleRef = useRef(0);

    // The props as they are now, for the handle and the callbacks, which are made once.
    const latest = useRef(null);
    latest.current = { offset, rows, renderAll, onRange };

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
            const { offset: at, rows: items, onRange: report } = latest.current;
            report?.(at + firstMessageOf(items, firstVisibleRef.current));
        };
    }

    // Where the reader is: the messages on screen, and the index of the one at the top of the view. A
    // selection replaces the messages, and the reader's message can move to another index or go.
    // `shownRef` holds the messages on screen, with the offset and rows they were drawn with, and
    // `restoreRef` the place to return to — the message, and the item it was in — once new messages are
    // shown.
    const shownRef = useRef({ messages, offset, rows });
    const restoreRef = useRef(null);
    if (shownRef.current.messages !== messages) {
        // Read while rendering, while the rows on screen are still the messages the reader saw: once they
        // are replaced, the virtualizer keeps its pixel offset and reports whatever now sits there. Read
        // from the rows, because the virtualizer's range starts with rows drawn above the view, which a
        // selection may remove. Its range is the fallback where nothing is laid out.
        if (restoreRef.current === null) {
            const shown = shownRef.current;
            const atTop = renderAll ? -1 : messageAtTop(scrollerRef.current, listRef.current);
            const index =
                atTop >= 0
                    ? atTop - shown.offset
                    : firstMessageOf(shown.rows, firstVisibleRef.current);
            restoreRef.current = {
                messages: shown.messages,
                index,
                item: itemOf(shown.rows, index),
            };
        }
        shownRef.current = { messages, offset, rows };
    } else {
        shownRef.current.offset = offset;
        shownRef.current.rows = rows;
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
        if (index < 0) return;
        const item = itemOf(rows, index);
        // The virtualizer keeps its pixel offset, so an item at the place it was needs no scroll.
        if (item < 0 || item === place.item) return;
        firstVisibleRef.current = item;
        const location = { index: item, align: 'start' };
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
    }, [messages, rows, renderAll]);

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
                const { offset: at, rows: items } = latest.current;
                return atTop >= 0 ? atTop : at + firstMessageOf(items, firstVisibleRef.current);
            },

            /**
             * Tell the first message the virtualizer draws.
             *
             * @returns {number} Its conversation index.
             */
            firstVisibleIndex() {
                const { offset: at, rows: items } = latest.current;
                return at + firstMessageOf(items, firstVisibleRef.current);
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
                        index: itemOf(latest.current.rows, index - latest.current.offset),
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
                    index: itemOf(latest.current.rows, index - latest.current.offset),
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
     * @param {number} index - Index of the item.
     * @returns {?string} The label, or null when this item continues the day.
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
     * Render the virtualizer's item.
     *
     * @param {number} index - The item's index within this list.
     * @returns {object} The rendered item.
     */
    const itemContent = (index) => renderItem(rows ? index : offset + index);
    const itemCount = rows ? rows.count : messages.length;

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
                Array.from({ length: itemCount }, (_, i) => (
                    <div key={bubbleKey(messages[firstMessageOf(rows, i)])}>
                        {separatorBefore(i) ? (
                            <div className={styles.separator}>{separatorBefore(i)}</div>
                        ) : null}
                        {itemContent(i)}
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
                    totalCount={itemCount}
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
