/**
 * The conversation view: the bar, banners and details around the messages, and everything that finds
 * its way through them — search, stepping, the ruler, keyboard focus.
 *
 * The scrolling list itself, and keeping the reader's place in it, is src/ui/ConversationList.jsx; this
 * view reaches it through the list's handle, by message index.
 *
 * `role="list"` rather than `role="log"`: a Qlik chart re-renders wholesale on
 * every selection change, and a polite live region would announce the entire
 * conversation each time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './chat.module.css';
import { buildDayGroups, startsCluster } from '../chat/grouping';
import DetailReveal, { resolveRevealMode } from './DetailReveal';
import { resolveDensity } from './density';
import { canReceiveTabStop, isFindKey, keyAction, nextFocusIndex, stepDirection } from './keyboard';
import { readSnapshot, shouldRenderAll } from './snapshot';
import MessageRow from './render-message';
import ConversationBar from './ConversationBar';
import Notice from './Notice';
import HighlightRuler from './HighlightRuler';
import { isInView, scrollToElement } from './scroll';
import { counterText as stopCounterText, stepStop } from '../highlight/navigator';
import { rulerTicks } from '../highlight/ruler';
import { createConversationFinder, partOf } from '../highlight/conversation-finder';
import { drawnCount } from '../highlight/conversation-highlights';
import { legendEntries } from '../highlight/legend';
import { HIGHLIGHT_KINDS } from '../qix/highlight-source';
import { counted } from '../util/format';
import { readKindChipSettings } from '../chat/kind-chips';
import { Empty } from './states';
import ConversationList from './ConversationList';
import { bubbleKey } from './reader-place';

export { bubbleKey, messageAtTop, returnIndex } from './reader-place';

/** How long typing must pause before the query is searched, in milliseconds. */
const QUERY_DELAY_MS = 150;

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
 * @param {?object} [props.search] - The search box: `finder`, `initialQuery` and `onQueryChange(query)`;
 *   null to leave it out.
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
    search = null,
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

    // The scrolling list, whose handle scrolls to messages and says where the reader is.
    const bodyRef = useRef(null);

    /**
     * Report where the reader is when the list's first drawn message changes.
     *
     * @param {number} firstVisibleIndex - The index of the first message the list draws.
     * @returns {void}
     */
    const handleRange = (firstVisibleIndex) => {
        onViewState?.({ firstVisibleIndex, openId });
    };

    useEffect(() => {
        onViewState?.({ firstVisibleIndex: bodyRef.current?.firstVisibleIndex() ?? 0, openId });
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
        if (!revealed) bodyRef.current?.reveal(focusIndex);
        const frame = requestAnimationFrame(() => {
            const { list } = bodyRef.current?.container(focusIndex) ?? {};
            const node = list?.querySelector(`[data-message-index="${focusIndex}"]`);
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
    const live = snapshot === null;
    const gapSec = Number(settings.groupGapSec) >= 0 ? Number(settings.groupGapSec) : 120;
    const showAvatars = settings.showAvatars !== false;
    const chipSettings = readKindChipSettings(settings.kindChips);
    const kindChips = chipSettings.show ? chipSettings : null;

    // The search box: what is typed, and the query searched once typing pauses. The query outlives
    // the conversation: a selection searches the new messages for it.
    const searchable = live && search !== null;
    const [query, setQuery] = useState(search?.initialQuery ?? '');
    const [appliedQuery, setAppliedQuery] = useState(search?.initialQuery ?? '');
    const searchInputRef = useRef(null);
    const ownFinderRef = useRef(null);
    if (!search?.finder && !ownFinderRef.current) ownFinderRef.current = createConversationFinder();
    const finder = search?.finder ?? ownFinderRef.current;
    const onQueryChangeRef = useRef(null);
    onQueryChangeRef.current = search?.onQueryChange ?? null;
    useEffect(() => {
        if (query === appliedQuery) return undefined;
        const timer = setTimeout(() => setAppliedQuery(query), QUERY_DELAY_MS);
        return () => clearTimeout(timer);
    }, [query, appliedQuery]);
    useEffect(() => {
        onQueryChangeRef.current?.(appliedQuery);
    }, [appliedQuery]);
    const finds = searchable ? finder.find({ messages, query: appliedQuery, gapSec }) : null;

    // What stepping, the counter and the ruler go through: the search matches while a query is
    // typed, the highlights otherwise.
    const stops = finds ?? (highlightValues ? highlights.result : null);
    const stopKind = finds ? 'find' : 'highlight';
    const stopTotal = stops?.total ?? 0;
    const truncated = finds ? finds.truncated : Boolean(stops?.searchTruncated);
    const currentMessage =
        current !== null && current.stops === stops && current.kind === stopKind
            ? (stops.indexByKey.get(current.key) ?? -1)
            : -1;
    const currentStop =
        currentMessage >= 0 ? { messageIndex: currentMessage, ordinal: current.ordinal } : null;

    /**
     * Describe the current stop within one message, for drawing it.
     *
     * @param {number} index - The message's index.
     * @returns {?{kind: string, ordinal: number, part: string}} The current mark in the message: its
     *     kind, its ordinal within its part, and the part — author, recipients or body — or null.
     */
    const currentMarkIn = (index) => {
        if (currentStop?.messageIndex !== index) return null;
        if (stopKind === 'highlight') {
            return { kind: 'highlight', ordinal: currentStop.ordinal, part: 'body' };
        }
        const within = partOf(finds.byMessage[index], currentStop.ordinal);
        return within ? { kind: 'find', ordinal: within.ordinal, part: within.part } : null;
    };

    let counterText = '';
    if (finds || currentStop) {
        counterText = stopCounterText({
            kind: stopKind,
            index: currentStop
                ? stops.firstStop[currentStop.messageIndex] + currentStop.ordinal
                : -1,
            count: stopTotal,
            truncated,
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
                      styles: stopKind === 'highlight' ? (highlights?.styles ?? null) : null,
                  })
                : [],
        [showRuler, stops, stopTotal, messages.length, stopKind, highlights?.styles]
    );

    /**
     * Find the message the reader is at: the first one whose bottom is below the top of the view.
     *
     * @returns {number} Its index.
     */
    const readingIndex = () => bodyRef.current?.readingIndex() ?? 0;

    /**
     * Scroll the current mark into view once its message is drawn, unless it already is.
     *
     * @param {number} messageIndex - The message the mark is in.
     * @returns {void}
     */
    const revealMark = (messageIndex) => {
        const { list, scroller } = bodyRef.current?.container(messageIndex) ?? {};
        if (!list || !scroller) return;
        const row = `[data-row="${messageIndex}"]`;
        const target = list.querySelector(`${row} mark[data-current]`) ?? list.querySelector(row);
        if (target && !isInView(scroller, target)) scrollToElement(scroller, target);
    };

    /**
     * Make a stop current and bring it into view.
     *
     * @param {{messageIndex: number, ordinal: number}} next - The stop.
     * @param {object} stopsNow - The stops it is one of.
     * @param {string} kindNow - Their kind, 'highlight' or 'find'.
     * @param {boolean} moveFocus - Whether focus moves to the stop's message.
     * @returns {void}
     */
    const goTo = (next, stopsNow, kindNow, moveFocus) => {
        const { messageIndex } = next;
        setCurrent({
            kind: kindNow,
            key: bubbleKey(messages[messageIndex]),
            ordinal: next.ordinal,
            stops: stopsNow,
        });
        /**
         * Reveal the mark on the frame after its message is drawn.
         *
         * @returns {void}
         */
        const afterScroll = () => requestAnimationFrame(() => revealMark(messageIndex));
        bodyRef.current?.reveal(messageIndex, { behavior: 'auto', done: afterScroll });
        if (moveFocus && tabbable) {
            revealedRef.current = true;
            setFocusIndex(messageIndex);
        }
    };

    /**
     * Step to the next or the previous stop.
     *
     * @param {number} direction - 1 for the next stop, -1 for the previous one.
     * @param {boolean} fromList - Whether the step came from a key pressed in the list, which moves
     *     focus to the stop's message.
     * @param {?object} [stopsNow] - The stops to step through; the ones shown when not given.
     * @param {string} [kindNow] - Their kind.
     * @returns {boolean} True when there was a stop to step to.
     */
    const step = (direction, fromList, stopsNow = stops, kindNow = stopKind) => {
        if (!stopsNow || stopsNow.total === 0) return false;
        const from = focusIndex >= 0 ? focusIndex : readingIndex();
        const next = stepStop({
            stops: stopsNow,
            current: stopsNow === stops ? currentStop : null,
            direction,
            from,
        });
        if (next === null) return false;
        goTo(next, stopsNow, kindNow, fromList);
        return true;
    };

    // Once a query settles, the first match from where the reader is becomes current, and comes into
    // view if it is not. Focus stays in the search box.
    const settledRef = useRef(appliedQuery);
    useEffect(() => {
        if (settledRef.current === appliedQuery) return;
        settledRef.current = appliedQuery;
        if (!finds || finds.total === 0) return;
        const from = focusIndex >= 0 ? focusIndex : readingIndex();
        const next = stepStop({ stops: finds, current: null, direction: 1, from });
        if (next !== null) goTo(next, finds, 'find', false);
    }, [appliedQuery, finds]);

    /**
     * Find the marks for a message's detail quote.
     *
     * A markdown message's quote shows its source, whose offsets differ from the text the body renders,
     * so the values and the query are found in the source for the quote.
     *
     * @param {object} message - The message.
     * @param {number} index - Its index.
     * @returns {?object} The quote's `highlights`, `finds`, `describe` and `current`, and what a click on
     *     a highlight does; null with neither highlights nor a search.
     */
    const quoteFor = (message, index) => {
        if (!highlightValues && !finds) return null;
        const markdown = message.bodyFormat === 'markdown';
        let spans = [];
        if (highlightValues) {
            spans = markdown
                ? highlights.matchPlain(message.body)
                : (highlights.result.byMessage[index]?.spans ?? []);
        }
        let found = [];
        if (finds) {
            found = markdown
                ? finder.findPlain(message.body, appliedQuery)
                : finds.byMessage[index].body;
        }
        const here = markdown ? null : currentMarkIn(index);
        return {
            highlights: spans,
            finds: found,
            describe: highlights?.describe,
            current: here?.part === 'body' ? here : null,
            clickMode,
            onPick: highlights?.onSelectValues,
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
                stopKind === 'highlight' &&
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
     * Handle the keys the whole object answers: Ctrl/Cmd+F goes to the search box, and F3 or
     * Ctrl/Cmd+G steps from anywhere in it.
     *
     * With no search box, or nothing to step to, the keys keep their meaning in the browser.
     *
     * @param {object} event - The React keyboard event.
     * @returns {void}
     */
    const handleRootKeyDown = (event) => {
        if (searchable && isFindKey(event)) {
            event.preventDefault();
            searchInputRef.current?.focus();
            searchInputRef.current?.select?.();
            return;
        }
        const direction = stepDirection(event);
        if (direction === null) return;
        const fromList = Boolean(bodyRef.current?.contains(event.target));
        if (step(direction, fromList)) event.preventDefault();
    };

    /**
     * Handle Enter, Shift+Enter and Escape in the search box, on what is typed now.
     *
     * @param {object} event - The React keyboard event.
     * @returns {void}
     */
    const handleSearchKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            let stopsNow = stops;
            let kindNow = stopKind;
            // Enter acts on what is typed, not on what the pause would search.
            if (query !== appliedQuery) {
                settledRef.current = query;
                setAppliedQuery(query);
                const typed = query.trim() !== '';
                stopsNow = typed
                    ? finder.find({ messages, query, gapSec })
                    : highlightValues
                      ? highlights.result
                      : null;
                kindNow = typed ? 'find' : 'highlight';
            }
            step(event.shiftKey ? -1 : 1, false, stopsNow, kindNow);
            return;
        }
        if (event.key === 'Escape' || event.key === 'Esc') {
            event.preventDefault();
            event.stopPropagation();
            // The first Escape clears the query; the next hands focus back to Sense.
            if (query !== '' || appliedQuery !== '') {
                settledRef.current = '';
                setQuery('');
                setAppliedQuery('');
                setCurrent(null);
            } else {
                keyboard?.blur?.(true);
            }
        }
    };

    /**
     * Go to a message the ruler was clicked at.
     *
     * @param {number} index - The message's index.
     * @returns {void}
     */
    const jumpTo = (index) => {
        setCurrent(null);
        bodyRef.current?.jumpTo(index);
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
                    current={currentMarkIn(index)}
                    finds={finds ? finds.byMessage[index] : null}
                    kindChips={kindChips}
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
            {highlights || searchable ? (
                <ConversationBar
                    info={highlights?.placement?.bar ?? null}
                    entries={legend}
                    counter={counterText}
                    picking={picking}
                    search={
                        searchable
                            ? {
                                  query,
                                  inputRef: searchInputRef,
                                  tabbable,
                                  onChange: setQuery,
                                  onKeyDown: handleSearchKeyDown,
                              }
                            : null
                    }
                    stepper={
                        live && (stops || searchable)
                            ? {
                                  kind: finds || !highlightValues ? 'find' : 'highlight',
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
                <ConversationList
                    ref={bodyRef}
                    messages={messages}
                    dayGroups={dayGroups}
                    renderItem={renderRow}
                    renderAll={renderAll}
                    live={live}
                    initialIndex={snapshot?.firstVisibleIndex ?? 0}
                    label={`Conversation, ${messages.length} messages`}
                    busy={Boolean(reloading)}
                    onKeyDown={handleKeyDown}
                    onRange={handleRange}
                />
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
