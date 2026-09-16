/**
 * What a click on a message bubble is for.
 *
 * Message text can be selected and copied, and Qlik Sense switches text selection off everywhere, so
 * the bubble's own stylesheet turns it back on. A bubble is also a click target — it selects its
 * sender, recipient, conversation or message, or opens its details — and a mouse drag that selects
 * text ends in a click on the bubble. That click is the reader copying, not choosing: it selects
 * nothing. A click on a link in a markdown body opens the link, and nothing else.
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

/**
 * Work out what a click on a bubble is for.
 *
 * @param {object} event - The React mouse event; its `currentTarget` is the bubble.
 * @returns {{kind: string}} `{kind: 'none'}` for a click that ends a text selection or lands on a
 *     link, and `{kind: 'container'}` for a click that is for the bubble itself.
 */
export function routeClick(event) {
    const container = event?.currentTarget;
    if (!container) return { kind: 'container' };
    if (hasTextSelectionIn(container)) return { kind: 'none' };
    const link = event.target?.closest?.(LINK);
    if (link && container.contains(link)) return { kind: 'none' };
    return { kind: 'container' };
}
