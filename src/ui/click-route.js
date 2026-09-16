/**
 * What a click on a message bubble is for.
 *
 * Message text can be selected and copied, and Qlik Sense switches text selection off everywhere, so
 * the bubble's own stylesheet turns it back on. A bubble is also a click target — it selects its
 * sender, recipient, conversation or message, or opens its details — and a mouse drag that selects
 * text ends in a click on the bubble. That click is the reader copying, not choosing: it selects
 * nothing. A click on a link in a markdown body opens the link, and nothing else.
 *
 * A click on a highlight selects its value instead of doing what a click on the message does, while
 * selecting by clicking is on. On a highlight whose field is locked it is still the highlight's click —
 * the reader is told the field is locked — since falling through would select something the reader did
 * not aim at.
 *
 * It decides; it does not act, and it never stops the event. Stopping it would also hide the click
 * from the Sense client's own document-level listeners.
 */

/** Links a click on which belongs to the link. */
const LINK = 'a[href]';

/**
 * Tell whether the reader has text selected inside an element.
 *
 * @param {Element} container - The bubble.
 * @returns {boolean} True for a selection that is more than a caret and starts or ends inside it.
 */
function hasTextSelectionIn(container) {
    const selection = container?.ownerDocument?.getSelection?.();
    if (!selection || selection.isCollapsed) return false;
    return (
        container.contains(selection.anchorNode ?? null) ||
        container.contains(selection.focusNode ?? null)
    );
}

/** Highlights, carrying the ordinal of the highlight a click on them means. */
const HIGHLIGHT = 'mark[data-h]';

/**
 * Work out what a click on a bubble is for.
 *
 * @param {object} event - The React mouse event; its `currentTarget` is the bubble.
 * @param {?string} [clickMode] - 'select' while a click on a highlight selects its value, 'locked'
 *     while its field is locked, null otherwise.
 * @returns {{kind: string, ordinal?: number, toggle?: boolean}} `{kind: 'none'}` for a click that
 *     ends a text selection or lands on a link; `{kind: 'highlight', ordinal, toggle}` for a click on a
 *     highlight; `{kind: 'container'}` otherwise.
 */
export function routeClick(event, clickMode = null) {
    const container = event?.currentTarget;
    if (!container) return { kind: 'container' };
    if (hasTextSelectionIn(container)) return { kind: 'none' };
    const target = event.target;
    const link = target?.closest?.(LINK);
    if (link && container.contains(link)) return { kind: 'none' };
    if (clickMode === 'select' || clickMode === 'locked') {
        const mark = target?.closest?.(HIGHLIGHT);
        const ordinal = Number(mark?.getAttribute('data-h'));
        if (mark && container.contains(mark) && Number.isInteger(ordinal) && ordinal >= 0) {
            return { kind: 'highlight', ordinal, toggle: Boolean(event.ctrlKey || event.metaKey) };
        }
    }
    return { kind: 'container' };
}
