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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GroupedVirtuoso, Virtuoso } from 'react-virtuoso';
import styles from './chat.module.css';
import { buildDayGroups, startsCluster } from '../chat/grouping';
import DetailReveal, { resolveRevealMode } from './DetailReveal';
import { resolveDensity } from './density';
import { canReceiveTabStop, keyAction, nextFocusIndex, stepDirection } from './keyboard';
import { readSnapshot, shouldRenderAll } from './snapshot';
import MessageRow from './render-message';
import ConversationBar from './ConversationBar';
import Notice from './Notice';
import HighlightRuler from './HighlightRuler';
import { isInView, scrollToElement } from './scroll';
import { counterText as stopCounterText, stepStop } from '../highlight/navigator';
import { rulerTicks } from '../highlight/ruler';
import { drawnCount } from '../highlight/conversation-highlights';
import { legendEntries } from '../highlight/legend';
import { HIGHLIGHT_KINDS } from '../qix/highlight-source';
import { counted } from '../util/format';
import { Empty } from './states';

/**
 * The key that identifies a bubble within the conversation.
 *
 * Message ids can repeat — two authors sharing one, or two messages that only
 * share an id — so the open detail, the React row key and the snapshot state all
 * key on this instead. normalize() sets it; the id is the fallback for a message
 * built by hand.
 *
 * @param {object} message - A normalized Message.
 * @returns {string} A key unique within the conversation.
 */
export function bubbleKey(message) {
    return message.key ?? message.id;
}

/**
 * Report whether a bubble can be clicked, for the configured selection target.
 *
 * The fallback for when the host passes no `isMessageSelectable` predicate. The
 * gate must test the element number of the cell that will ACTUALLY be selected:
 * checking the author's element number while selecting the message offers a
 * click that the engine then rejects. An action this cannot evaluate is not
 * offered at all, rather than guessed at.
 *
 * @param {object} message - A normalized Message.
 * @param {string} [mode] - The configured onBubbleClick mode.
 * @returns {boolean} True when the click will produce a valid selection.
 */
export function isSelectable(message, mode) {
    if (mode === 'selectMessage') return message.elem >= 0;
    if (mode === undefined || mode === 'selectAuthor') return (message.author?.elem ?? -1) >= 0;
    return false;
}

/**
 * A thin line across the top of the conversation while newer rows load.
 *
 * Determinate when the paging progress is known, a moving sliver otherwise. It overlays the top edge
 * rather than taking a row of its own, so the list does not shift down and back as it comes and goes.
 *
 * @param {object} props - Component props.
 * @param {{loaded: ?number, total: ?number}} props.reloading - The paging progress, when known.
 * @returns {object} The rendered line.
 */
function ReloadingLine({ reloading }) {
    const { loaded, total } = reloading;
    const known = Number.isFinite(loaded) && Number.isFinite(total) && total > 0;
    const fraction = known ? Math.min(1, Math.max(0, loaded / total)) : null;
    return (
        <div
            className={styles.reloading}
            role="progressbar"
            aria-label="Loading messages"
            aria-valuemin={known ? 0 : undefined}
            aria-valuemax={known ? total : undefined}
            aria-valuenow={known ? loaded : undefined}
        >
            <div
                className={known ? styles.reloadingBar : styles.reloadingSliver}
                style={known ? { '--cqs-progress': String(fraction) } : undefined}
            />
        </div>
    );
}

/**
 * Render the conversation.
 *
 * @param {object} props - Component props.
 * @param {object} props.conversation - A normalized Conversation.
 * @param {object} [props.settings] - The `chatbox` property bag.
 * @param {boolean} [props.canSelect] - Whether selections are permitted.
 * @param {Function} [props.onSelect] - Called with a message on click.
 * @param {Function} [props.isMessageSelectable] - Whether a click on a message would select
 *   anything; derived from the same builder the click runs.
 * @param {object} [props.rect] - The object's rect, for choosing a detail presentation.
 * @param {object} [props.keyboard] - The object returned by useKeyboard().
 * @param {object} [props.layout] - The object layout, for snapshot state.
 * @param {Function} [props.onViewState] - Reports { firstVisibleIndex, openId } as it changes.
 * @param {?{loaded: ?number, total: ?number}} [props.reloading] - Set while newer rows load and
 *   this is the conversation that was on screen; see src/ui/reload-view.js.
 * @param {?object} [props.highlights] - The highlights to draw, from src/highlight/highlight-view.js,
 *   with `onSelectValues(values, toggle)` and `onSelectCategory(name, toggle)`; null while off.
 * @param {?{id: number, text: string, level: string}} [props.notice] - A notice to show in the corner.
 * @returns {object} The rendered conversation.
 */
export function ChatLog({
    conversation,
    settings = {},
    canSelect = false,
    onSelect,
    isMessageSelectable,
    rect,
    keyboard,
    layout,
    onViewState,
    reloading = null,
    highlights = null,
    notice = null,
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
        setOpenId((current) => (current === bubbleKey(message) ? null : bubbleKey(message)));
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
    const listRef = useRef(null);
    const virtuosoRef = useRef(null);
    // The element that scrolls: Virtuoso's scroller, or the list itself when every row is rendered.
    const scrollerRef = useRef(null);
    /**
     * Keep hold of the virtualizer's scrolling element.
     *
     * @param {?HTMLElement} node - The scroller, or null when it goes.
     * @returns {void}
     */
    const handleScrollerRef = useCallback((node) => {
        scrollerRef.current = node;
    }, []);

    // Where the reader is, by message key. A selection replaces the messages, and the reader's message
    // can move to another index or go; the key is what finds it again. `shownRef` holds the messages
    // the key was read against, and `restoreRef` the key to return to once new messages are shown.
    const anchorKeyRef = useRef(null);
    const shownRef = useRef(messages);
    const restoreRef = useRef(null);
    if (shownRef.current !== messages) {
        // Captured while rendering, before the virtualizer can report a range for the new messages:
        // it keeps its pixel offset across a data change and reports whatever now sits there, which
        // would otherwise overwrite where the reader actually was.
        if (restoreRef.current === null) restoreRef.current = anchorKeyRef.current;
        shownRef.current = messages;
    }

    /**
     * Record the visible range and report it upward.
     *
     * @param {object} range - Virtuoso's { startIndex, endIndex }.
     * @returns {void}
     */
    const handleRangeChanged = useCallback(
        (range) => {
            firstVisibleRef.current = range?.startIndex ?? 0;
            // While a return to the reader's message is pending, a range is not where they were.
            if (restoreRef.current === null) {
                const first = shownRef.current[firstVisibleRef.current];
                anchorKeyRef.current = first ? bubbleKey(first) : null;
            }
            onViewState?.({ firstVisibleIndex: firstVisibleRef.current, openId });
        },
        [onViewState, openId]
    );

    // When newer rows replace the messages, put the reader back at the message they were reading.
    // After a selection, the kept pixel offset lands on whatever message now happens to sit there. A
    // message the selection removed cannot be returned to; the list then stays where it is. A layout
    // effect, so the jump back happens before the new messages are painted at the wrong place.
    useLayoutEffect(() => {
        const key = restoreRef.current;
        if (key === null) return;
        restoreRef.current = null;
        if (renderAll) return;
        const index = messages.findIndex((m) => bubbleKey(m) === key);
        if (index < 0) return;
        anchorKeyRef.current = key;
        if (index !== firstVisibleRef.current) {
            firstVisibleRef.current = index;
            virtuosoRef.current?.scrollToIndex?.({ index, align: 'start' });
        }
    }, [messages, renderAll]);

    useEffect(() => {
        onViewState?.({ firstVisibleIndex: firstVisibleRef.current, openId });
    }, [onViewState, openId]);

    // Roving tabindex: exactly one message is tabbable at a time, so the whole
    // conversation costs the sheet a single tab stop instead of one per message.
    const [focusIndex, setFocusIndex] = useState(-1);
    const tabbable = canReceiveTabStop(keyboard);
    // Set when a step has already scrolled to the message focus moves to.
    const revealedRef = useRef(false);

    // Move real DOM focus after the index changes. In a virtualized list the
    // target may not be mounted yet, so scroll it into view first and focus on
    // the next frame once it exists. Focus never scrolls on its own: that would
    // undo a step's scroll to its mark, and can scroll the Sense sheet.
    useEffect(() => {
        if (focusIndex < 0 || !tabbable) return undefined;
        const revealed = revealedRef.current;
        revealedRef.current = false;
        if (!revealed) virtuosoRef.current?.scrollIntoView?.({ index: focusIndex });
        const frame = requestAnimationFrame(() => {
            const node = listRef.current?.querySelector(`[data-message-index="${focusIndex}"]`);
            node?.focus?.({ preventScroll: true });
        });
        return () => cancelAnimationFrame(frame);
    }, [focusIndex, tabbable]);

    // The current stop: the highlight the reader stepped to, by the message it is in. It counts
    // only while the stops it was found among are the ones shown, so new highlights or a new
    // conversation leave no current stop, without any bookkeeping on each path.
    const [current, setCurrent] = useState(null);

    // Every warning is rendered, not just the first. Truncation and merged
    // bubbles can both be live at once, and showing only one silently hides
    // the fact that messages were dropped.
    const warnings = (diagnostics ?? []).filter((d) => d.severity === 'warning');
    // A highlight problem stays in sight whatever the switches say: without it, "no highlights" looks
    // like "nothing to highlight".
    const highlightBanner = highlights?.placement?.banner ?? null;
    if (highlightBanner) {
        warnings.push({
            code: 'highlights',
            message: highlightBanner.text,
            level: highlightBanner.level,
        });
    }

    const highlightValues = highlights?.answer?.kind === HIGHLIGHT_KINDS.VALUES;
    const legend =
        highlights && highlights.settings.category.showLegend
            ? legendEntries(
                  highlights.styles,
                  highlights.result,
                  highlights.answer.categories?.list ?? []
              )
            : [];
    const showLabels = Boolean(
        highlights?.styles?.enabled && highlights.settings.category.showLabels
    );
    // Nothing is selected while the rows shown are the ones before a selection.
    const clickMode = reloading ? null : (highlights?.clickMode ?? null);

    // What stepping, the counter and the ruler go through: the highlights.
    const live = snapshot === null;
    const stops = highlightValues ? highlights.result : null;
    const stopKind = 'highlight';
    const stopTotal = stops?.total ?? 0;
    const currentMessage =
        current !== null && current.stops === stops && current.kind === stopKind
            ? (stops.indexByKey.get(current.key) ?? -1)
            : -1;
    const currentStop =
        currentMessage >= 0 ? { messageIndex: currentMessage, ordinal: current.ordinal } : null;
    let counterText = '';
    if (stops && currentStop) {
        counterText = stopCounterText({
            kind: stopKind,
            index: stops.firstStop[currentStop.messageIndex] + currentStop.ordinal,
            count: stopTotal,
            truncated: stops.searchTruncated,
        });
    } else if (stops && !highlights.placement.bar && !highlightBanner) {
        // The summary counts the highlights where it is shown; otherwise the counter does.
        counterText = counted(stopTotal, 'highlight', 'highlights');
    }

    const showRuler = settings.showRuler !== false;
    const ticks = useMemo(
        () =>
            showRuler && stops && stopTotal > 0
                ? rulerTicks({
                      stops,
                      count: messages.length,
                      kind: stopKind,
                      styles: highlights?.styles ?? null,
                  })
                : [],
        [showRuler, stops, stopTotal, messages.length, highlights?.styles]
    );

    /**
     * Find the marks for a message's detail quote.
     *
     * A markdown message's quote shows its source, whose offsets differ from the text the body renders,
     * so the values are matched in the source for the quote.
     *
     * @param {object} message - The message.
     * @param {number} index - Its index.
     * @returns {?object} The quote's `highlights` and `describe`, or null without highlights.
     */
    const quoteFor = (message, index) => {
        if (!highlightValues) return null;
        const spans =
            message.bodyFormat === 'markdown'
                ? highlights.matchPlain(message.body)
                : highlights.result.byMessage[index]?.spans;
        const here =
            message.bodyFormat !== 'markdown' && currentStop?.messageIndex === index
                ? { kind: stopKind, ordinal: currentStop.ordinal }
                : null;
        return {
            highlights: spans,
            describe: highlights.describe,
            current: here,
            clickMode,
            onPick: highlights.onSelectValues,
        };
    };

    /**
     * Select the value of a highlight a message's click landed on.
     *
     * @param {number} index - The message's index.
     * @param {number} ordinal - The highlight's ordinal in the message.
     * @param {boolean} toggle - Whether Ctrl or Cmd was held.
     * @returns {void}
     */
    const handleHighlightClick = (index, ordinal, toggle) => {
        const span = highlights?.result?.byMessage?.[index]?.spans?.[ordinal];
        if (span) highlights.onSelectValues?.(span.values, toggle);
    };

    // Chips select their category while a click on a highlight selects; "No category" never does.
    const categoryList = highlights?.answer?.categories?.list ?? [];
    const picking =
        clickMode && legend.length && highlights.onSelectCategory
            ? {
                  locked: highlights.answer.locked?.category === true,
                  field: highlights.answer.categories.field,
                  selectedCount: categoryList.filter((category) => category.selected).length,
                  tabbable: canReceiveTabStop(keyboard),
                  /**
                   * Select a chip's category.
                   *
                   * @param {{name: string}} entry - The chip's entry.
                   * @param {boolean} toggle - Whether Ctrl or Cmd was held.
                   * @returns {void}
                   */
                  onPick: (entry, toggle) => highlights.onSelectCategory(entry.name, toggle),
              }
            : null;
    const gapSec = Number(settings.groupGapSec) >= 0 ? Number(settings.groupGapSec) : 120;
    const showAvatars = settings.showAvatars !== false;

    const openIndex = openId ? messages.findIndex((m) => bubbleKey(m) === openId) : -1;
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
            // Moving on leaves the stop the reader stepped to.
            setCurrent(null);
            setFocusIndex(moved);
            return;
        }

        const action = keyAction(event.key);
        if (action === 'activate' && focusIndex >= 0) {
            event.preventDefault();
            // Enter on a message holding the highlight stepped to selects its value; otherwise, and
            // with Space, it opens the details as it always has.
            if (
                event.key === 'Enter' &&
                clickMode === 'select' &&
                currentStop?.messageIndex === focusIndex
            ) {
                const span = stops.byMessage[focusIndex].spans[currentStop.ordinal];
                highlights.onSelectValues?.(span.values, Boolean(event.ctrlKey || event.metaKey));
                return;
            }
            toggleDetail(messages[focusIndex]);
            return;
        }
        if (action === 'dismiss') {
            event.preventDefault();
            // Escape closes the detail if one is open, then lets go of the stop stepped to; the
            // next Escape hands focus back to Sense so the reader can carry on tabbing the sheet
            // rather than being trapped in the conversation.
            if (openId) {
                closeDetail();
            } else if (currentStop) {
                setCurrent(null);
            } else {
                setFocusIndex(-1);
                keyboard?.blur?.(true);
            }
        }
    };

    /**
     * Find the message the reader is at: the first one whose bottom is below the top of the view.
     *
     * @returns {number} Its index.
     */
    const readingIndex = () => {
        const scroller = renderAll ? listRef.current : scrollerRef.current;
        const top = scroller?.getBoundingClientRect?.().top;
        const nodes = listRef.current?.querySelectorAll?.('[data-message-index]') ?? [];
        if (typeof top === 'number') {
            for (const node of nodes) {
                if (node.getBoundingClientRect().bottom > top) {
                    return Number(node.getAttribute('data-message-index'));
                }
            }
        }
        return firstVisibleRef.current;
    };

    /**
     * Scroll a stop's mark into view once its message is drawn, unless it already is.
     *
     * @param {number} messageIndex - The message the stop is in.
     * @param {number} ordinal - The stop's ordinal in the message.
     * @returns {void}
     */
    const revealMark = (messageIndex, ordinal) => {
        const list = listRef.current;
        const scroller = renderAll ? list : scrollerRef.current;
        if (!list || !scroller) return;
        const row = `[data-message-index="${messageIndex}"]`;
        const target =
            list.querySelector(`${row} mark[data-h="${ordinal}"]`) ?? list.querySelector(row);
        if (target && !isInView(scroller, target)) scrollToElement(scroller, target);
    };

    /**
     * Step to the next or the previous stop.
     *
     * @param {number} direction - 1 for the next stop, -1 for the previous one.
     * @param {boolean} fromList - Whether the step came from a key pressed in the list, which moves
     *     focus to the stop's message.
     * @returns {boolean} True when there was a stop to step to.
     */
    const step = (direction, fromList) => {
        if (!stops || stopTotal === 0) return false;
        const from = focusIndex >= 0 ? focusIndex : readingIndex();
        const next = stepStop({ stops, current: currentStop, direction, from });
        if (next === null) return false;
        setCurrent({
            kind: stopKind,
            key: bubbleKey(messages[next.messageIndex]),
            ordinal: next.ordinal,
            stops,
        });
        const { messageIndex, ordinal } = next;
        /**
         * Reveal the mark on the frame after its message is drawn.
         *
         * @returns {void}
         */
        const afterScroll = () => requestAnimationFrame(() => revealMark(messageIndex, ordinal));
        if (renderAll) afterScroll();
        else {
            virtuosoRef.current?.scrollIntoView?.({
                index: messageIndex,
                behavior: 'auto',
                done: afterScroll,
            });
        }
        if (fromList && tabbable) {
            revealedRef.current = true;
            setFocusIndex(messageIndex);
        }
        return true;
    };

    /**
     * Step with F3 or Ctrl/Cmd+G, from anywhere in the object.
     *
     * With nothing to step to, the keys keep their meaning in the browser.
     *
     * @param {object} event - The React keyboard event.
     * @returns {void}
     */
    const handleRootKeyDown = (event) => {
        const direction = stepDirection(event);
        if (direction === null) return;
        const fromList = Boolean(listRef.current?.contains(event.target));
        if (step(direction, fromList)) event.preventDefault();
    };

    /**
     * Go to a message the ruler was clicked at.
     *
     * @param {number} index - The message's index.
     * @returns {void}
     */
    const jumpTo = (index) => {
        setCurrent(null);
        if (!renderAll) {
            virtuosoRef.current?.scrollToIndex?.({ index, align: 'start', behavior: 'auto' });
            return;
        }
        const node = listRef.current?.querySelector(`[data-message-index="${index}"]`);
        if (node) scrollToElement(listRef.current, node, { position: 0 });
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
        const isOpen = bubbleKey(message) === openId;
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
                        (canSelect &&
                            (isMessageSelectable
                                ? isMessageSelectable(message)
                                : isSelectable(message, settings.onBubbleClick)))
                    }
                    expanded={isOpen}
                    onSelect={detailsOnClick ? toggleDetail : onSelect}
                    onShowDetails={detailsOnClick ? undefined : toggleDetail}
                    highlights={highlightValues ? highlights.result.byMessage[index] : null}
                    drawn={
                        highlightValues
                            ? drawnCount(highlights.result, index, renderAll)
                            : undefined
                    }
                    describe={highlights?.describe}
                    highlightClick={clickMode}
                    onHighlightClick={handleHighlightClick}
                    current={
                        currentStop?.messageIndex === index
                            ? { kind: stopKind, ordinal: currentStop.ordinal }
                            : null
                    }
                />
                {isOpen && revealMode === 'inline' ? (
                    <DetailReveal
                        message={message}
                        messages={messages}
                        index={index}
                        mode="inline"
                        onClose={closeDetail}
                        quote={quoteFor(message, index)}
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
                quote={quoteFor(openMessage, openIndex)}
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
        <div
            className={rootClass}
            data-density={density}
            data-labels={showLabels ? 'true' : undefined}
            data-marks={clickMode ?? undefined}
            onKeyDown={handleRootKeyDown}
        >
            {reloading ? <ReloadingLine reloading={reloading} /> : null}
            <Notice notice={notice} />
            {warnings.map((w) => (
                <div
                    key={w.code}
                    className={`${styles.banner} ${styles.bannerWarning}`}
                    data-level={w.level}
                >
                    {w.message}
                </div>
            ))}
            {highlights ? (
                <ConversationBar
                    info={highlights.placement.bar}
                    entries={legend}
                    counter={counterText}
                    picking={picking}
                    stepper={
                        live && stops
                            ? {
                                  kind: stopKind,
                                  canStep: stopTotal > 0,
                                  tabbable,
                                  /**
                                   * Step from the bar's buttons, leaving focus on the button.
                                   *
                                   * @param {number} direction - 1 for next, -1 for previous.
                                   * @returns {void}
                                   */
                                  onStep: (direction) => {
                                      step(direction, false);
                                  },
                              }
                            : null
                    }
                />
            ) : null}
            <div className={styles.main}>
                <div
                    className={
                        // Every row rendered in a live object: the list itself must scroll.
                        renderAll && live ? `${styles.list} ${styles.listScroll}` : styles.list
                    }
                    role="list"
                    aria-label={`Conversation, ${messages.length} messages`}
                    aria-busy={reloading ? 'true' : undefined}
                    ref={listRef}
                    onKeyDown={handleKeyDown}
                >
                    {renderAll ? (
                        // Export and print re-render from the layout in a headless
                        // browser, where a virtualized window would capture only the
                        // rows that happened to be visible.
                        messages.map((_, i) => (
                            <div key={bubbleKey(messages[i])}>
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
                            scrollerRef={handleScrollerRef}
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
                            scrollerRef={handleScrollerRef}
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
                {ticks.length ? (
                    <HighlightRuler
                        ticks={ticks}
                        count={messages.length}
                        kind={stopKind}
                        interactive={live}
                        onJump={jumpTo}
                    />
                ) : null}
                {detail}
            </div>
        </div>
    );
}

export default ChatLog;
