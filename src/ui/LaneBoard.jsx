/**
 * Conversations side by side: a lane per conversation, each headed by its name.
 *
 * With free scrolling every lane is a list of its own, which keeps its own place. With linked scrolling
 * the lanes are columns of one list, whose items are rows lined up in time: a row holds at most one
 * message per lane, and everything in it is later than everything above it, so every height on screen is
 * the same moment in all lanes. The conversation view reaches either through one handle, by message
 * index, as it reaches a single list.
 *
 * Conversation names are field data, and reach the DOM as React children and attributes only.
 */
import { useImperativeHandle, useRef } from 'react';
import { buildDayGroups } from '../chat/grouping';
import { rowDayGroups } from '../chat/lanes';
import { counted, formatCount } from '../util/format';
import ConversationList from './ConversationList';
import styles from './chat.module.css';

/**
 * Say how many conversations are shown, when some are not.
 *
 * Rows are read oldest first up to the message limit, so when the limit cut them short the conversations
 * with the latest activity are only the latest of those read, and the line says so.
 *
 * @param {object} board - The board.
 * @param {object} [meta] - The conversation's `meta`: `truncated`, `rowsLoaded` and `total`.
 * @returns {?string} For example "4 of 12 conversations"; null when every conversation is shown.
 */
export function laneCaption(board, meta = {}) {
    if (!board || board.lanes.length >= board.total) return null;
    const shown = `${board.lanes.length} of ${counted(board.total, 'conversation', 'conversations')}`;
    if (!meta?.truncated) return shown;
    return `${shown} among the first ${formatCount(meta.rowsLoaded)} of ${counted(meta.total, 'row', 'rows')}`;
}

/**
 * Render the conversations side by side.
 *
 * @param {object} props - Component props.
 * @param {object} [props.ref] - Receives the handle, the same as a `ConversationList`'s, by message index;
 *   `readingIndex(lane)` takes the lane to read, the one last scrolled, clicked or focused by default.
 * @param {object} props.board - The board, from `buildBoard`.
 * @param {function(number): object} props.renderRow - Renders the message at a board index.
 * @param {boolean} [props.dateSeparators] - Whether lanes have day headers.
 * @param {boolean} [props.renderAll] - Render every message rather than virtualizing.
 * @param {boolean} [props.live] - Whether this is a live object, not an export render.
 * @param {boolean} [props.busy] - Whether newer messages are loading.
 * @param {?string} [props.caption] - The line above the lanes, from `laneCaption`.
 * @param {Function} [props.onKeyDown] - Keyboard handler for the lists.
 * @param {function(number): void} [props.onRange] - Called with the board index of the first message a
 *   lane draws, as it changes.
 * @param {function(?number): ?object} [props.renderRuler] - Renders the overview ruler: a lane's, by lane
 *   number, with free scrolling; the one beside the rows, given null, with linked scrolling.
 * @returns {object} The rendered lanes.
 */
export function LaneBoard({
    ref,
    board,
    renderRow,
    dateSeparators = true,
    renderAll = false,
    live = true,
    busy = false,
    caption = null,
    onKeyDown,
    onRange,
    renderRuler,
}) {
    const rootRef = useRef(null);
    // Each lane's list, by lane key: a lane that stays keeps its list, and its place, whatever lanes
    // come or go beside it.
    const lists = useRef(new Map());
    const refs = useRef(new Map());
    // The lane the reader last scrolled, clicked or focused: where "where the reader is" is read.
    const activeRef = useRef(0);

    // The one list of rows, with linked scrolling.
    const rowsRef = useRef(null);

    const latest = useRef(null);
    latest.current = { board };

    /**
     * Get the handle of the list a message is in: its lane's, or the list of rows.
     *
     * @param {number} index - The message's board index.
     * @returns {?object} The list handle.
     */
    const listOf = (index) => {
        const { board: now } = latest.current;
        if (now.rows) return rowsRef.current;
        const lane = now.lanes[now.laneOf[index]];
        return lane ? (lists.current.get(lane.key) ?? null) : null;
    };

    /**
     * Get a stable ref callback for a lane's list.
     *
     * @param {string} key - The lane key.
     * @returns {function(?object): void} The callback.
     */
    const refFor = (key) => {
        if (!refs.current.has(key)) {
            refs.current.set(
                key,
                /**
                 * Keep hold of a lane's list handle.
                 *
                 * @param {?object} handle - The handle, or null when the lane goes.
                 * @returns {void}
                 */
                (handle) => {
                    if (handle) lists.current.set(key, handle);
                    else lists.current.delete(key);
                }
            );
        }
        return refs.current.get(key);
    };

    useImperativeHandle(
        ref,
        () => ({
            /**
             * Find the message the reader is at in a lane.
             *
             * @param {number} [lane] - The lane; the one last used by default.
             * @returns {number} The message's board index.
             */
            readingIndex(lane = activeRef.current) {
                const { board: now } = latest.current;
                if (now.rows) {
                    // A row's messages share its height: the reader is at the row's first.
                    const index = rowsRef.current?.readingIndex() ?? 0;
                    return now.rows.start[now.rows.of[index] ?? 0] ?? 0;
                }
                const target = now.lanes[lane] ?? now.lanes[0];
                const list = target ? lists.current.get(target.key) : null;
                return list ? list.readingIndex() : (target?.start ?? 0);
            },

            /**
             * Tell the first message the lane last used draws.
             *
             * @returns {number} Its board index.
             */
            firstVisibleIndex() {
                const { board: now } = latest.current;
                if (now.rows) return rowsRef.current?.firstVisibleIndex() ?? 0;
                const target = now.lanes[activeRef.current] ?? now.lanes[0];
                return lists.current.get(target?.key)?.firstVisibleIndex() ?? 0;
            },

            /**
             * Scroll a message to the top of its lane.
             *
             * @param {number} index - The message's board index.
             * @returns {void}
             */
            jumpTo(index) {
                listOf(index)?.jumpTo(index);
            },

            /**
             * Bring a message into view in its lane.
             *
             * @param {number} index - The message's board index.
             * @param {object} [options] - Virtuoso's `scrollIntoView` options, `done` among them.
             * @returns {void}
             */
            reveal(index, options = {}) {
                const list = listOf(index);
                if (list) list.reveal(index, options);
                else options.done?.();
            },

            /**
             * Tell where a message's row is drawn, and what scrolls it.
             *
             * @param {number} index - The message's board index.
             * @returns {{list: ?HTMLElement, scroller: ?HTMLElement}} Its lane's list and scrolling element.
             */
            container(index) {
                return listOf(index)?.container(index) ?? { list: null, scroller: null };
            },

            /**
             * Tell whether a node is inside the lanes.
             *
             * @param {?Node} node - The node.
             * @returns {boolean} True when the lanes hold it.
             */
            contains(node) {
                return Boolean(rootRef.current?.contains(node));
            },
        }),
        []
    );

    const captionLine = caption ? (
        <div
            className={styles.laneCaption}
            title="The conversations with the latest activity. Select conversations to choose which are shown."
        >
            {caption}
        </div>
    ) : null;

    /**
     * Render a lane's header: its name and how many messages it has.
     *
     * @param {object} lane - The lane.
     * @returns {object} The header.
     */
    const header = (lane) => (
        <div className={styles.laneHeader} title={lane.label}>
            <span className={styles.laneName}>{lane.label}</span>
            <span className={styles.laneCount}>{formatCount(lane.count)}</span>
        </div>
    );

    if (board.rows) {
        const { rows, laneOf, lanes } = board;
        const ruler = renderRuler?.(null) ?? null;
        /**
         * Render a row: a cell per lane, holding the lane's message in the row or nothing.
         *
         * @param {number} row - The row's index.
         * @returns {object} The row.
         */
        const renderCells = (row) => {
            const cells = new Array(lanes.length).fill(-1);
            for (let index = rows.start[row]; index < rows.start[row + 1]; index++) {
                cells[laneOf[index]] = index;
            }
            return (
                <div className={styles.laneRow} data-lane-row={row}>
                    {cells.map((index, number) => (
                        <div key={lanes[number].key} className={styles.laneCell}>
                            {index >= 0 ? renderRow(index) : null}
                        </div>
                    ))}
                </div>
            );
        };
        return (
            <div
                className={styles.lanes}
                ref={rootRef}
                data-scroll={board.scroll}
                style={{ '--cqs-lanes': String(lanes.length) }}
            >
                {captionLine}
                <div className={styles.laneHeaders} data-ruler={ruler ? 'true' : undefined}>
                    {lanes.map((lane) => (
                        <section key={lane.key} aria-label={lane.label}>
                            {header(lane)}
                        </section>
                    ))}
                </div>
                <div className={styles.laneBody}>
                    <ConversationList
                        ref={rowsRef}
                        messages={board.messages}
                        rows={rows}
                        dayGroups={dateSeparators ? rowDayGroups(board.messages, rows) : null}
                        renderItem={renderCells}
                        renderAll={renderAll}
                        live={live}
                        label={`Conversations side by side, ${counted(board.messages.length, 'message', 'messages')}`}
                        busy={busy}
                        onKeyDown={onKeyDown}
                        onRange={onRange}
                        context={{ lane: 'linked' }}
                        // The headers above reserve the same gutter, so their columns line up with the rows.
                        scrollerStyle={{ scrollbarGutter: 'stable' }}
                    />
                    {ruler}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.lanes} ref={rootRef} data-scroll={board.scroll}>
            {captionLine}
            <div className={styles.laneColumns}>
                {board.lanes.map((lane, number) => {
                    /**
                     * Make this lane the one the reader is in.
                     *
                     * @returns {void}
                     */
                    const use = () => {
                        activeRef.current = number;
                    };
                    return (
                        <section
                            key={lane.key}
                            className={styles.lane}
                            aria-label={lane.label}
                            onPointerDown={use}
                            onWheel={use}
                            onFocusCapture={use}
                        >
                            {header(lane)}
                            <div className={styles.laneBody}>
                                <ConversationList
                                    ref={refFor(lane.key)}
                                    messages={lane.messages}
                                    offset={lane.start}
                                    dayGroups={
                                        dateSeparators ? buildDayGroups(lane.messages) : null
                                    }
                                    renderItem={renderRow}
                                    renderAll={renderAll}
                                    live={live}
                                    label={`${lane.label}, ${counted(lane.count, 'message', 'messages')}`}
                                    busy={busy}
                                    onKeyDown={onKeyDown}
                                    onRange={onRange}
                                    context={{ lane: lane.key }}
                                />
                                {renderRuler?.(number) ?? null}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}

export default LaneBoard;
