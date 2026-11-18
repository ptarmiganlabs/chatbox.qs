/**
 * Drawing part of an export as a PNG.
 *
 * The page is copied into an SVG `foreignObject`, with its stylesheet and fonts beside it, and the SVG is
 * drawn onto a canvas as an image: the browser lays the HTML out itself, so the picture is the export as
 * it would print, at twice the resolution. Nothing is drawn by hand. An SVG image runs no script and loads
 * nothing, which is why every font and picture in it is a data URL (`export-assets.js`). The copy is
 * written out with `XMLSerializer`, which escapes every text and attribute it writes.
 */
import { IMAGE_SCALE } from './png-parts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/**
 * Wait for the next frame, so an image's fonts have been through a layout before it is drawn.
 *
 * Never for long: a tab in the background gets no animation frames at all, and an export the reader
 * left running while they read another tab must not wait for them to come back.
 *
 * @param {Window} win - The window.
 * @returns {Promise<void>} Resolves on the next animation frame, or after a short while without one.
 */
function nextFrame(win) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, 50);
        win?.requestAnimationFrame?.(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

/**
 * Write a page element as an SVG document.
 *
 * @param {Element} page - The export's page element, laid out in its frame.
 * @param {object} options - How.
 * @param {number} options.width - The image's width in CSS pixels.
 * @param {number} options.height - Its height.
 * @param {string} options.css - Every style the page needs, fonts included.
 * @param {number} [options.scale] - Device pixels per CSS pixel.
 * @returns {string} The SVG.
 */
export function pageSvg(page, { width, height, css, scale = IMAGE_SCALE }) {
    const doc = page.ownerDocument;
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(Math.round(width * scale)));
    svg.setAttribute('height', String(Math.round(height * scale)));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const object = doc.createElementNS(SVG_NS, 'foreignObject');
    object.setAttribute('x', '0');
    object.setAttribute('y', '0');
    object.setAttribute('width', String(width));
    object.setAttribute('height', String(height));
    const holder = doc.createElementNS(XHTML_NS, 'div');
    holder.setAttribute(
        'style',
        `width: ${width}px; height: ${height}px; margin: 0; overflow: hidden;`
    );
    const style = doc.createElementNS(XHTML_NS, 'style');
    style.textContent = css;
    holder.appendChild(style);
    holder.appendChild(page.cloneNode(true));
    object.appendChild(holder);
    svg.appendChild(object);
    return new XMLSerializer().serializeToString(svg);
}

/**
 * Draw a page element as a PNG.
 *
 * @param {Element} page - The export's page element, laid out in its frame.
 * @param {object} options - How.
 * @param {number} options.width - The image's width in CSS pixels.
 * @param {number} options.height - Its height.
 * @param {string} options.css - Every style the page needs, fonts included.
 * @param {number} [options.scale] - Device pixels per CSS pixel.
 * @param {Document} [options.doc] - The document to draw in.
 * @returns {Promise<Blob>} The PNG. Rejects when the browser will not draw it: an image it could not load,
 *     or a canvas it will not let out.
 */
export async function rasterize(
    page,
    { width, height, css, scale = IMAGE_SCALE, doc = globalThis.document }
) {
    const markup = pageSvg(page, { width, height, css, scale });
    const win = doc.defaultView ?? globalThis;
    const image = new win.Image();
    image.decoding = 'sync';
    const loaded = new Promise((resolve, reject) => {
        /**
         * Go on once the image has loaded.
         *
         * @returns {void}
         */
        image.onload = () => resolve();
        /**
         * Stop when the image would not load.
         *
         * @returns {void}
         */
        image.onerror = () =>
            reject(new Error('the browser could not draw the conversation as an image'));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await loaded;
    await image.decode?.().catch(() => undefined);
    await nextFrame(win);

    const canvas = doc.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('the browser has no canvas to draw the image on');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('the image was too large for the browser to write'));
            }, 'image/png');
        } catch (err) {
            reject(err);
        }
    });
}
