/**
 * Scrolling the conversation to a message or a mark, without scrolling anything around it.
 *
 * `element.scrollIntoView` scrolls every scrollable ancestor, and in Qlik Sense that includes the sheet,
 * so the list sets its own `scrollTop` instead. A message's place can move once the messages around it
 * are measured, so the position is corrected over a few animation frames, until it stays put; a newer
 * scroll cancels the corrections of an older one.
 *
 * Ported from textview.qs `src/render/scroll.js` at df84a5e: `scrollToElement` and `isInView`.
 */

/** The latest scroll per container; corrections for any other scroll stop. */
const latest = new WeakMap();

/** How many animation frames a scroll may spend correcting itself. */
const CORRECTION_FRAMES = 6;

/**
 * Scroll a container so that an element inside it sits a third of the way down.
 *
 * @param {HTMLElement} container - The scrolling element.
 * @param {HTMLElement} element - The element to bring into view.
 * @param {object} [options] - Options.
 * @param {number} [options.position] - Where the element should end up, as a fraction of the
 *     container's height.
 * @returns {void}
 */
export function scrollToElement(container, element, { position = 1 / 3 } = {}) {
    const token = {};
    latest.set(container, token);
    const view = container.ownerDocument?.defaultView;
    let frames = CORRECTION_FRAMES;

    /**
     * Move the element to its place, and check again on the next frame if it moved.
     *
     * @returns {void}
     */
    const place = () => {
        if (latest.get(container) !== token) return;
        const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
        const delta = offset - container.clientHeight * position;
        if (Math.abs(delta) < 1) return;
        const before = container.scrollTop;
        container.scrollTop = before + delta;
        frames -= 1;
        // Stop at either end of the text, where the container cannot scroll any further.
        if (container.scrollTop === before || frames === 0) return;
        if (typeof view?.requestAnimationFrame === 'function') view.requestAnimationFrame(place);
    };
    place();
}

/**
 * Tell whether an element is fully in view inside a container.
 *
 * @param {HTMLElement} container - The scrolling element.
 * @param {HTMLElement} element - The element.
 * @param {object} [options] - Options.
 * @param {number} [options.inset] - Pixels on the left covered by something stuck there.
 * @returns {boolean} True when the element lies within the container's visible area.
 */
export function isInView(container, element, { inset = 0 } = {}) {
    const box = container.getBoundingClientRect();
    const target = element.getBoundingClientRect();
    return (
        target.top >= box.top &&
        target.bottom <= box.top + container.clientHeight &&
        target.left >= box.left + inset &&
        target.right <= box.left + container.clientWidth
    );
}
