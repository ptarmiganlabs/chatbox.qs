/**
 * Chatbox.qs — a Qlik Sense visualization extension that renders chat-style
 * conversations from the app's data model.
 *
 * This file owns lifecycle only. Data shaping lives in src/chat and src/qix;
 * rendering lives in src/ui behind the render-message adapter seam.
 */
import {
    useApp,
    useEffect,
    useElement,
    useInteractionState,
    useKeyboard,
    onContextMenu,
    onTakeSnapshot,
    useLayout,
    useModel,
    useRect,
    usePromise,
    useRef,
    useSelections,
    useStaleLayout,
    useState,
    useTheme,
} from '@nebula.js/stardust';

import definition from './object-properties';
import dataTargets from './data';
import ext from './ext/index';
import { normalize } from './chat/normalize';
import { readsFromEnd } from './chat/message-limit';
import { fetchAllRows } from './qix/paging';
import { ROLES, conversationModelOf, resolveRoles } from './qix/column-map';
import { buildSelection } from './qix/selection';
import { describeAssignments } from './qix/role-labels';
import { syncAttributeExpressions } from './qix/sync-attrs';
import {
    isSnapshot,
    readLaneSnapshot,
    shouldRenderAll,
    writeLaneSnapshot,
    writeSnapshot,
} from './ui/snapshot';
import { createBoardCache, laneKeys, readLaneSettings } from './chat/lanes';
import { reloadingView } from './ui/reload-view';
import { createHighlightLoader } from './qix/highlight-loader';
import { loadHighlightResult } from './highlight/highlight-result';
import { createHighlightView } from './highlight/highlight-view';
import { createConversationFinder } from './highlight/conversation-finder';
import {
    planCategorySelection,
    planValueSelection,
    selectionNotice,
} from './highlight/click-selection';
import { readTextToolSettings } from './highlight/settings';
import { selectInFieldBesideObjectSelections, stateNameOf } from './qix/field-selection';
import { render, destroy } from './ui/chat-renderer';
import ChatLog from './ui/ChatLog';
import { Empty, Failed, Loading, NotConfigured, emptyStateMessage } from './ui/states';
import { themeVars } from './ui/theme-vars';
import { extensionState } from './util/extension-state';
import logger, { PACKAGE_VERSION } from './util/logger';
import { copyConversation } from './export/copy-conversation';

/** How long a notice stays in the corner, in milliseconds. */
const NOTICE_MS = 5000;

/**
 * The supernova.
 *
 * @param {object} galaxy - The nebula environment.
 * @returns {object} The visualization definition.
 */
export default function supernova(galaxy) {
    return {
        // Must match the .qext name slug or Sense cannot resolve the extension
        // once it has been placed on a sheet.
        name: __EXTENSION_TYPE__,

        qae: {
            properties: definition,
            data: dataTargets,
        },

        ext: ext(galaxy),

        /**
         * The visualization's render body. Owns lifecycle only.
         *
         * @returns {void}
         */
        component() {
            const element = useElement();
            const model = useModel();
            const app = useApp();
            const theme = useTheme();
            // Drives which detail presentation fits — a Sense object spans
            // roughly 300 to 4000 px, so this cannot be a fixed choice.
            const rect = useRect();
            const selections = useSelections();
            const interactions = useInteractionState();
            // Governs whether the conversation may hold a tab stop at all — see
            // canReceiveTabStop. A long list that ignores this puts one tab stop
            // per message into the sheet.
            const keyboard = useKeyboard();

            // Where the reader is in the conversation. Held in a ref because
            // the snapshot callback runs outside React's render and must read
            // the value as it is now, not as it was when the callback was made.
            const viewStateRef = useRef({ firstVisibleIndex: 0, openId: null });

            // Held in a ref so its identity is stable across renders. A fresh
            // function each render would change the `rangeChanged` prop on the
            // virtualizer every time, and re-run the effect that reports view
            // state — needless work on every frame of a drag-resize, which is
            // precisely when a long conversation can least afford it.
            const handleViewStateRef = useRef(null);
            if (!handleViewStateRef.current) {
                /**
                 * Record the view state reported by the conversation.
                 *
                 * @param {object} state - { firstVisibleIndex, openId }.
                 * @returns {void}
                 */
                handleViewStateRef.current = (state) => {
                    viewStateRef.current = state;
                };
            }

            // Sense does not photograph the live DOM: it captures this layout,
            // re-renders from it in a backend browser and photographs that. So
            // anything that must survive — scroll position, the open detail —
            // has to be written into the layout copy here.
            onTakeSnapshot(async (snapshotLayout) =>
                writeLaneSnapshot(
                    writeSnapshot(snapshotLayout, viewStateRef.current),
                    laneKeys(lastViewRef.current?.board ?? null)
                )
            );

            // Page against the STALE layout: it is pinned while a selection is
            // in progress, so an in-flight brush cannot restart a multi-round-trip
            // paging loop. The live layout is only used for the qState highlight.
            const staleLayout = useStaleLayout();
            const liveLayout = useLayout();

            const [progress, setProgress] = useState(null);

            // The props of the conversation last shown, so a reload after a selection can keep it
            // on screen instead of swapping in Loading — see src/ui/reload-view.js.
            const lastViewRef = useRef(null);

            // The conversation and its lanes, kept while what they are built from is unchanged. Every
            // step of a resize and every notice renders again, and new message arrays for the same
            // conversation would make each list look again for where the reader is, and each ruler
            // count its ticks again, for nothing.
            const conversationCacheRef = useRef(null);
            const boardCacheRef = useRef(null);
            if (!boardCacheRef.current) boardCacheRef.current = createBoardCache();

            // Highlighting keywords. The loader owns the companion object that reads the highlight
            // field; the view keeps the matched conversation between renders. Both live in refs,
            // because the conversation component can unmount and remount between renders.
            const loaderRef = useRef(null);
            if (!loaderRef.current) loaderRef.current = createHighlightLoader({ logger });
            const highlightViewRef = useRef(null);
            if (!highlightViewRef.current) highlightViewRef.current = createHighlightView();
            // Monotonic token for highlight loads, like runIdRef for rows.
            const highlightRunRef = useRef(0);

            // Copy the conversation shown, as text or JSON, from the object's context menu. The hook is
            // not in stardust's type declarations but is exported at runtime (7.4.0), as textview.qs
            // and QvsView.qs use it. The items appear only while a conversation is shown.
            onContextMenu((menu) => {
                const view = lastViewRef.current;
                if (!view?.conversation?.messages?.length) return;
                for (const [format, label] of [
                    ['text', 'Copy conversation as text'],
                    ['json', 'Copy conversation as JSON'],
                ]) {
                    menu.addItem({
                        translation: label,
                        tid: `chatbox-copy-${format}`,
                        icon: 'copy',
                        /**
                         * Copy the conversation last shown, and say how it went.
                         *
                         * @returns {Promise<void>} Resolves once the notice is set.
                         */
                        select: async () => {
                            const message = await copyConversation({
                                view: lastViewRef.current,
                                format,
                                projectionOf: highlightViewRef.current.projections.get,
                                version: PACKAGE_VERSION,
                            });
                            if (message) setNotice({ ...message, id: ++noticeIdRef.current });
                        },
                    });
                }
            });

            // Search: the finder shares the markdown projections with the highlighter, and the query
            // is kept here, so it survives the conversation component unmounting and mounting again.
            const finderRef = useRef(null);
            if (!finderRef.current) {
                finderRef.current = createConversationFinder({
                    projections: highlightViewRef.current.projections,
                });
            }
            const queryRef = useRef('');
            const handleQueryRef = useRef(null);
            if (!handleQueryRef.current) {
                /**
                 * Keep the query the reader searched for.
                 *
                 * @param {string} query - The query.
                 * @returns {void}
                 */
                handleQueryRef.current = (query) => {
                    queryRef.current = query;
                };
            }

            // A short notice in the corner: why a click selected nothing, or what a copy did. It clears
            // itself after a few seconds.
            const [notice, setNotice] = useState(null);
            const noticeIdRef = useRef(0);
            useEffect(() => {
                if (!notice) return undefined;
                const timer = setTimeout(() => setNotice(null), NOTICE_MS);
                /**
                 * Stop the timer when the notice is replaced or the object leaves the sheet.
                 *
                 * @returns {void}
                 */
                return () => clearTimeout(timer);
            }, [notice]);

            // Bumped when the companion changes: a selection in a highlight field that is not
            // associated with the messages leaves this object's own layout untouched.
            const [companionVersion, setCompanionVersion] = useState(0);
            useEffect(
                () =>
                    loaderRef.current.subscribe(() => {
                        setCompanionVersion((version) => version + 1);
                    }),
                []
            );
            useEffect(() => {
                /**
                 * Release the companion object when the object leaves the sheet.
                 *
                 * @returns {void}
                 */
                return () => {
                    highlightRunRef.current += 1;
                    loaderRef.current.destroy();
                };
            }, []);

            // Stash the enigma handles for property-panel callbacks, which run
            // outside hook scope and cannot call useModel()/useApp() themselves.
            extensionState.model = model;
            extensionState.app = app;

            // Monotonic run token. usePromise exposes no AbortSignal, so this is
            // the whole cancellation mechanism: a superseded run is detected
            // between pages and its rows are discarded rather than appended.
            const runIdRef = useRef(0);
            useEffect(() => {
                /**
                 * Invalidate any in-flight fetch when the object unmounts.
                 *
                 * @returns {void}
                 */
                return () => {
                    runIdRef.current += 1;
                };
            }, []);

            const settings = staleLayout?.chatbox ?? {};

            // Reconcile the panel's metadata expressions into the cube. The panel
            // cannot bind to the hypercube directly without manufacturing an
            // invalid dimension, so this is what makes those settings take effect.
            useEffect(() => {
                if (!model || !staleLayout) return;
                syncAttributeExpressions({
                    model,
                    layout: staleLayout,
                    // Never during a snapshot render. Edit mode should already
                    // be false there, but a render that patches properties is
                    // export-hostile enough to be worth guarding twice.
                    canEdit: Boolean(interactions?.edit) && !isSnapshot(staleLayout),
                });
            }, [model, staleLayout, interactions]);

            // The fetch lives in usePromise, not useEffect: nebula tracks pending
            // usePromise promises to decide the chart has finished rendering.
            // In a useEffect, exports would be declared complete before the data
            // arrived and would capture only the first page.
            const [page, fetchError] = usePromise(async () => {
                if (!model || !staleLayout?.qHyperCube) return null;
                const runId = ++runIdRef.current;
                setProgress(null);
                const result = await fetchAllRows({
                    model,
                    layout: staleLayout,
                    maxRows: Number(settings.maxMessages) || 5000,
                    // Newest first and lanes keep the newest rows when the limit cuts them short.
                    fromEnd: readsFromEnd(settings),
                    /**
                     * Report whether this run has been superseded.
                     *
                     * @returns {boolean} True when a newer run has started.
                     */
                    isStale: () => runIdRef.current !== runId,
                    /**
                     * Surface paging progress to the loading state.
                     *
                     * @param {number} loaded - Rows loaded so far.
                     * @param {number} total - Rows expected.
                     * @returns {void}
                     */
                    onProgress: (loaded, total) => setProgress({ loaded, total }),
                });
                // Tag the result with the layout it was fetched for. usePromise
                // keeps the PREVIOUS resolved value while a new promise is in
                // flight, so without this the old rows are normalized against
                // the new layout's column map — silently mismatched columns.
                return { ...result, derivedFrom: staleLayout };
            }, [staleLayout, model, settings.maxMessages]);

            // The highlight values load beside the rows, in usePromise for the same reason: nebula
            // waits for it before it declares the render complete. The conversation does not wait for
            // them, and the answer never rejects — see src/highlight/highlight-result.js.
            const [highlightResult] = usePromise(async () => {
                const run = ++highlightRunRef.current;
                return loadHighlightResult({
                    layout: staleLayout,
                    app,
                    loader: loaderRef.current,
                    version: companionVersion,
                    /**
                     * Report whether a newer highlight load has started.
                     *
                     * @returns {boolean} True when this load has been superseded.
                     */
                    isStale: () => highlightRunRef.current !== run,
                });
            }, [staleLayout, app, companionVersion]);

            useEffect(() => {
                if (!element) return undefined;

                const hc = staleLayout?.qHyperCube;
                const vars = themeVars(theme);
                for (const [key, value] of Object.entries(vars)) {
                    element.style.setProperty(key, value);
                }

                const conversationModel = conversationModelOf(settings);
                if (!hc) {
                    lastViewRef.current = null;
                    render(element, NotConfigured, { missing: [], conversationModel });
                    return undefined;
                }

                const { columns, byRole, missing } = resolveRoles(staleLayout, settings.roles, {
                    conversationModel,
                });
                if (missing.length) {
                    lastViewRef.current = null;
                    render(element, NotConfigured, {
                        missing,
                        conversationModel,
                        assigned: describeAssignments(columns, byRole, conversationModel),
                    });
                    return undefined;
                }

                // An aborted run is our own doing, not a failure to report.
                if (fetchError && fetchError.name !== 'AbortError') {
                    logger.warn('paging failed:', fetchError);
                    lastViewRef.current = null;
                    render(element, Failed, { error: fetchError });
                    return undefined;
                }

                if (!page || page.derivedFrom !== staleLayout) {
                    const reloading = reloadingView(lastViewRef.current, {
                        rect,
                        keyboard,
                        progress,
                        notice,
                    });
                    if (reloading) {
                        render(element, ChatLog, reloading);
                    } else {
                        render(element, Loading, {
                            loaded: progress?.loaded,
                            total: progress?.total,
                        });
                    }
                    return undefined;
                }

                const themeName = theme?.name?.();
                const cached = conversationCacheRef.current;
                if (
                    cached === null ||
                    cached.page !== page ||
                    cached.layout !== staleLayout ||
                    cached.themeName !== themeName
                ) {
                    conversationCacheRef.current = {
                        page,
                        layout: staleLayout,
                        themeName,
                        conversation: normalize({
                            layout: staleLayout,
                            rows: page.rows,
                            props: settings,
                            theme,
                            area: page.area,
                        }),
                    };
                }
                const { conversation } = conversationCacheRef.current;

                // The live layout carries current selection state; the stale one
                // does not, so the highlight reads from the live cube.
                const canSelect =
                    Boolean(interactions?.select) && settings.onBubbleClick !== 'none';

                /**
                 * Build the selection steps a click on this message would run.
                 *
                 * @param {object} message - The message.
                 * @returns {object[]} Steps; empty when the click selects nothing.
                 */
                const selectionFor = (message) =>
                    buildSelection({
                        action: settings.onBubbleClick,
                        message,
                        byRole,
                        participants: conversation.participants,
                        recipientElems: conversation.recipientElems,
                    });

                /**
                 * Report whether clicking a message would select anything.
                 *
                 * Derived from the same builder the click runs, so the view can
                 * never offer a click that then selects nothing.
                 *
                 * @param {object} message - The message.
                 * @returns {boolean} True when there is at least one step.
                 */
                const isMessageSelectable = (message) => selectionFor(message).length > 0;

                /**
                 * Apply a selection for a clicked message.
                 *
                 * @param {object} message - The message that was clicked.
                 * @returns {Promise<void>} Resolves once the selection is sent.
                 */
                const onSelect = async (message) => {
                    if (!canSelect || !selections) return;
                    const steps = selectionFor(message);
                    if (!steps.length) return;

                    try {
                        if (!selections.isActive()) await selections.begin(['/qHyperCubeDef']);
                        for (const { dimIdx, values, toggle } of steps) {
                            const ok = await selections.select({
                                method: 'selectHyperCubeValues',
                                params: ['/qHyperCubeDef', dimIdx, values, toggle],
                            });
                            // stardust resets every selection made in the session
                            // when a call fails, so a later step must not run on
                            // top of what is left: the steps succeed or fail together.
                            if (ok === false) break;
                        }
                    } catch (err) {
                        logger.warn('selection failed:', err);
                    }
                };

                if (!conversation.messages.length) {
                    // The engine's own calc-condition message is the most useful
                    // thing we can show here — it is what the app author wrote
                    // to explain why the chart is intentionally blank.
                    const calcMsg =
                        liveLayout?.qHyperCube?.qCalcCondMsg ||
                        staleLayout?.qHyperCube?.qCalcCondMsg ||
                        null;
                    lastViewRef.current = null;
                    render(element, Empty, { message: emptyStateMessage(conversation, calcMsg) });
                    return undefined;
                }

                // Conversations side by side: a board of lanes, whose order of messages everything below
                // follows — the highlights, search, stepping and copying count messages by their index in
                // it. An export shows the lanes a snapshot recorded, not the ones its size would fit.
                const laneSettings = readLaneSettings(settings.lanes);
                const hasThread = Boolean(byRole[ROLES.THREAD]);
                const board = boardCacheRef.current.get({
                    messages: conversation.messages,
                    settings: laneSettings,
                    hasThread,
                    width: rect?.width ?? 0,
                    keys: readLaneSnapshot(staleLayout)?.keys ?? null,
                    gapSec: settings.groupGapSec,
                });
                const shown = board ? { ...conversation, messages: board.messages } : conversation;

                // A click on a highlight or a chip selects in the highlight or category field: never in
                // an export render, whose server reports every interaction as allowed, nor in edit mode.
                const canSelectHighlights =
                    !isSnapshot(staleLayout) &&
                    readTextToolSettings(settings).highlight.clickToSelect &&
                    interactions?.active !== false &&
                    Boolean(interactions?.select) &&
                    !interactions?.edit;

                const highlightView = highlightViewRef.current.build({
                    tagged: highlightResult,
                    layout: staleLayout,
                    version: companionVersion,
                    messages: shown.messages,
                    theme,
                    renderAll: shouldRenderAll(staleLayout, settings),
                    canSelect: canSelectHighlights,
                });

                /**
                 * Carry out a selection a click on a highlight or a chip planned, and say when it
                 * did not happen.
                 *
                 * @param {object} plan - From planValueSelection or planCategorySelection.
                 * @returns {Promise<void>} Resolves once the selection is sent.
                 */
                const pick = async (plan) => {
                    const result = plan.locked
                        ? { outcome: 'locked' }
                        : await selectInFieldBesideObjectSelections({
                              selections,
                              app,
                              field: plan.field,
                              stateName: stateNameOf(staleLayout),
                              elemNumbers: plan.elemNumbers,
                              toggle: plan.toggle,
                              logger,
                          });
                    const message = selectionNotice(plan.field, result);
                    if (message) setNotice({ ...message, id: ++noticeIdRef.current });
                };

                const highlights = highlightView && {
                    ...highlightView,
                    /**
                     * Select every spelling of a highlight's value in the highlight field.
                     *
                     * @param {string[]} values - The spellings the highlight stands for.
                     * @param {boolean} toggle - Whether Ctrl or Cmd was held.
                     * @returns {Promise<void>} Resolves once the selection is sent.
                     */
                    onSelectValues: (values, toggle) =>
                        pick(planValueSelection(highlightView.answer, values, toggle)),
                    /**
                     * Select a category in the category field.
                     *
                     * @param {string} name - The category.
                     * @param {boolean} toggle - Whether Ctrl or Cmd was held.
                     * @returns {Promise<void>} Resolves once the selection is sent.
                     */
                    onSelectCategory: (name, toggle) =>
                        pick(planCategorySelection(highlightView.answer, name, toggle)),
                };

                const view = {
                    conversation: shown,
                    board,
                    // Lanes switched on without a thread to put in them: said in a banner, since the
                    // conversation then shows as one.
                    laneNotice:
                        laneSettings.show && !hasThread
                            ? 'Conversations side by side need a Conversation / thread dimension.'
                            : null,
                    settings,
                    canSelect,
                    onSelect,
                    isMessageSelectable,
                    rect,
                    keyboard,
                    layout: staleLayout,
                    onViewState: handleViewStateRef.current,
                    reloading: null,
                    highlights,
                    notice,
                    // The search box, where a reader can use it: never in an export render, nor where
                    // Sense allows no interaction with the object.
                    search:
                        !isSnapshot(staleLayout) &&
                        interactions?.active !== false &&
                        readTextToolSettings(settings).showSearch
                            ? {
                                  finder: finderRef.current,
                                  initialQuery: queryRef.current,
                                  onQueryChange: handleQueryRef.current,
                              }
                            : null,
                };
                lastViewRef.current = view;
                render(element, ChatLog, view);
                return undefined;
            }, [
                element,
                staleLayout,
                liveLayout,
                page,
                fetchError,
                progress,
                // theme.name(), not theme: the theme object identity is stable
                // across an app theme switch, so depending on it never re-renders.
                theme?.name?.(),
                rect?.width,
                rect?.height,
                keyboard?.active,
                keyboard?.enabled,
                interactions,
                selections,
                highlightResult,
                companionVersion,
                notice,
            ]);

            // Tear the root down when the object is removed from the sheet.
            useEffect(() => {
                /**
                 * Unmount the React root when the object leaves the sheet.
                 *
                 * @returns {void}
                 */
                return () => {
                    if (element) destroy(element);
                };
            }, [element]);
        },
    };
}
