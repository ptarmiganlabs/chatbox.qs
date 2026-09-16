/**
 * What to show while a newer page of rows loads after a selection.
 *
 * Every selection changes the layout, and the rows for the new layout take a round trip to arrive.
 * Rendering the Loading state meanwhile swapped the conversation component out and back in, which
 * threw away everything it held — the scroll position first: the list jumped back to its first
 * message after every click. Rendering the conversation that was on screen instead, marked as
 * reloading, keeps the component and the reader's place; the new rows replace it when they arrive.
 *
 * Only a conversation that was actually shown can stand in. After a Not configured, Failed or Empty
 * state there is nothing to keep, and Loading is right. Selecting is off while the old rows are shown,
 * since a click would act on a message the new selection may have removed.
 *
 * Pure, so it is testable without a Sense client.
 */

/**
 * Build the conversation props to render while newer rows load.
 *
 * @param {?object} previous - The props of the last conversation rendered, or null when the last
 *     render was not a conversation.
 * @param {object} now - What has changed since.
 * @param {object} [now.rect] - The object's current rect.
 * @param {object} [now.keyboard] - The current useKeyboard() state.
 * @param {?{loaded: number, total: number}} [now.progress] - Paging progress, when known.
 * @returns {?object} The props to render the previous conversation with, or null to render Loading.
 */
export function reloadingView(previous, { rect, keyboard, progress } = {}) {
    if (!previous?.conversation) return null;
    return {
        ...previous,
        rect,
        keyboard,
        canSelect: false,
        reloading: {
            loaded: Number.isFinite(progress?.loaded) ? progress.loaded : null,
            total: Number.isFinite(progress?.total) ? progress.total : null,
        },
    };
}
