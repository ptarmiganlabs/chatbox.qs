/**
 * A hidden frame to draw an export in.
 *
 * An export is drawn away from the sheet: Sense's own stylesheets would otherwise reach it, a PDF is
 * printed from a document of its own, and an image is measured and cut from a layout that is not the
 * object's. The frame is a same-origin blank document, off screen, filled through the DOM — React renders
 * into it, and the stylesheet is a `<style>` element's text — so no string is ever parsed as markup.
 */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { EXPORT_CSS } from './export-styles';

/** How long an export waits for fonts and pictures before it draws without them. */
const SETTLE_MS = 8000;

/**
 * Open a hidden frame and get it ready to draw into.
 *
 * @param {object} [options] - Options.
 * @param {Document} [options.doc] - The document to open it in.
 * @param {number} [options.width] - The frame's width in CSS pixels, which is the width the export lays out
 *     in.
 * @param {number} [options.height] - Its height.
 * @param {string} [options.title] - The frame document's title; the name a PDF is saved under by default.
 * @param {string} [options.css] - More style, after the export's own sheet.
 * @returns {object} The frame: `doc`, `win`, `render(element)` (renders synchronously and answers the page
 *     element), `addCss(text)` and `close()`.
 */
export function openExportFrame({
    doc = globalThis.document,
    width = 1200,
    height = 900,
    title = '',
    css = '',
} = {}) {
    const frame = doc.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('title', 'Chatbox.qs export');
    Object.assign(frame.style, {
        position: 'fixed',
        left: '-30000px',
        top: '0',
        width: `${Math.ceil(width)}px`,
        height: `${Math.ceil(height)}px`,
        border: '0',
        opacity: '0',
        pointerEvents: 'none',
    });
    doc.body.appendChild(frame);
    const frameDoc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!frameDoc || !win) {
        frame.remove();
        throw new Error('the browser would not open a frame to draw the export in');
    }
    const html = frameDoc.documentElement;
    html.setAttribute('lang', doc.documentElement?.getAttribute('lang') || 'en');
    const head =
        frameDoc.head ?? html.insertBefore(frameDoc.createElement('head'), html.firstChild);
    const body = frameDoc.body ?? html.appendChild(frameDoc.createElement('body'));
    const charset = frameDoc.createElement('meta');
    charset.setAttribute('charset', 'utf-8');
    head.appendChild(charset);
    frameDoc.title = title;

    /**
     * Add style to the frame.
     *
     * @param {string} text - CSS.
     * @returns {void}
     */
    const addCss = (text) => {
        if (!text) return;
        const style = frameDoc.createElement('style');
        style.textContent = text;
        head.appendChild(style);
    };
    addCss(EXPORT_CSS);
    addCss(css);

    const mount = frameDoc.createElement('div');
    body.appendChild(mount);
    const root = createRoot(mount);
    let closed = false;

    return {
        frame,
        doc: frameDoc,
        win,
        addCss,
        /**
         * Draw an element into the frame, at once.
         *
         * @param {object} element - A React element, or a component and its props.
         * @param {object} [props] - The props, when `element` is a component.
         * @returns {?Element} The element drawn.
         */
        render(element, props) {
            const tree = props === undefined ? element : createElement(element, props);
            flushSync(() => root.render(tree));
            return mount.firstElementChild;
        },
        /**
         * Take the frame away.
         *
         * @returns {void}
         */
        close() {
            if (closed) return;
            closed = true;
            try {
                root.unmount();
            } catch {
                // The frame goes either way.
            }
            frame.remove();
        },
    };
}

/**
 * Wait until a frame's fonts and pictures are ready, or until it is too long to wait.
 *
 * @param {Document} frameDoc - The frame's document.
 * @param {number} [timeoutMs] - The longest to wait.
 * @returns {Promise<void>} Resolves when they are ready or the time is up; never rejects.
 */
export async function settle(frameDoc, timeoutMs = SETTLE_MS) {
    // Ask for every font the export carries, rather than wait for text to need one: in a frame that is
    // off screen, the browser may not have asked for any by the time the page is printed or measured,
    // and a print then falls back to another font (seen in Qlik Sense, with the theme's font).
    frameDoc.body?.getBoundingClientRect();
    for (const face of frameDoc.fonts ?? []) {
        if (face.status === 'unloaded') face.load().catch(() => undefined);
    }
    const images = [...(frameDoc.images ?? [])].map((image) =>
        image.complete ? null : image.decode?.().catch(() => undefined)
    );
    const ready = Promise.all([frameDoc.fonts?.ready, ...images]).catch(() => undefined);
    let timer = null;
    const late = new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([ready, late]);
    clearTimeout(timer);
}
