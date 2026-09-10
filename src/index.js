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
import { fetchAllRows } from './qix/paging';
import { ROLES, dimensionIndex, resolveRoles } from './qix/column-map';
import { syncAttributeExpressions } from './qix/sync-attrs';
import { isSnapshot, writeSnapshot } from './ui/snapshot';
import { render, destroy } from './ui/chat-renderer';
import ChatLog from './ui/ChatLog';
import { Empty, Failed, Loading, NotConfigured } from './ui/states';
import { themeVars } from './ui/theme-vars';
import { extensionState } from './util/extension-state';
import logger from './util/logger';

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

            /**
             * Record the view state reported by the conversation.
             *
             * @param {object} state - { firstVisibleIndex, openId }.
             * @returns {void}
             */
            const handleViewState = (state) => {
                viewStateRef.current = state;
            };

            // Sense does not photograph the live DOM: it captures this layout,
            // re-renders from it in a backend browser and photographs that. So
            // anything that must survive — scroll position, the open detail —
            // has to be written into the layout copy here.
            onTakeSnapshot(async (snapshotLayout) =>
                writeSnapshot(snapshotLayout, viewStateRef.current)
            );

            // Page against the STALE layout: it is pinned while a selection is
            // in progress, so an in-flight brush cannot restart a multi-round-trip
            // paging loop. The live layout is only used for the qState highlight.
            const staleLayout = useStaleLayout();
            const liveLayout = useLayout();

            const [progress, setProgress] = useState(null);

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

            useEffect(() => {
                if (!element) return undefined;

                const hc = staleLayout?.qHyperCube;
                const vars = themeVars(theme);
                for (const [key, value] of Object.entries(vars)) {
                    element.style.setProperty(key, value);
                }

                if (!hc) {
                    render(element, NotConfigured, { missing: [] });
                    return undefined;
                }

                const { byRole, missing } = resolveRoles(staleLayout, settings.roles);
                if (missing.length) {
                    render(element, NotConfigured, { missing });
                    return undefined;
                }

                // An aborted run is our own doing, not a failure to report.
                if (fetchError && fetchError.name !== 'AbortError') {
                    logger.warn('paging failed:', fetchError);
                    render(element, Failed, { error: fetchError });
                    return undefined;
                }

                if (!page || page.derivedFrom !== staleLayout) {
                    render(element, Loading, { loaded: progress?.loaded, total: progress?.total });
                    return undefined;
                }

                const conversation = normalize({
                    layout: staleLayout,
                    rows: page.rows,
                    props: settings,
                    theme,
                    area: page.area,
                });

                // The live layout carries current selection state; the stale one
                // does not, so the highlight reads from the live cube.
                const canSelect =
                    Boolean(interactions?.select) && settings.onBubbleClick !== 'none';

                /**
                 * Apply a selection for a clicked message.
                 *
                 * @param {object} message - The message that was clicked.
                 * @returns {Promise<void>} Resolves once the selection is sent.
                 */
                const onSelect = async (message) => {
                    if (!canSelect || !selections) return;
                    const role =
                        settings.onBubbleClick === 'selectMessage'
                            ? ROLES.MESSAGE_ID
                            : ROLES.AUTHOR;
                    const column = byRole[role];
                    const dimIdx = dimensionIndex(column);
                    const elemNumber = role === ROLES.AUTHOR ? message.author?.elem : message.elem;

                    // Both guards matter: a negative element number is a synthetic
                    // row, and an unresolved column index would address the wrong
                    // field — the engine treats an empty index array as "everything".
                    if (dimIdx < 0 || typeof elemNumber !== 'number' || elemNumber < 0) return;

                    try {
                        if (!selections.isActive()) await selections.begin(['/qHyperCubeDef']);
                        await selections.select({
                            method: 'selectHyperCubeValues',
                            params: ['/qHyperCubeDef', dimIdx, [elemNumber], true],
                        });
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
                    render(element, Empty, { message: calcMsg });
                    return undefined;
                }

                render(element, ChatLog, {
                    conversation,
                    settings,
                    canSelect,
                    onSelect,
                    rect,
                    keyboard,
                    layout: staleLayout,
                    onViewState: handleViewState,
                });
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
