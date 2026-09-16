/**
 * The highlight answer for one render, tagged with what it was worked out for.
 *
 * nebula's `usePromise` keeps the previous result while a newer promise runs, so a render can hold an
 * answer loaded for an older layout, or before the companion last changed. Tagging the answer with the
 * layout and the companion version it belongs to lets the render tell a current answer from one that
 * is still being replaced, and show the previous highlights meanwhile instead of none.
 *
 * Loading never rejects: a highlight that cannot be loaded must not fail the conversation. An image or
 * PDF export draws the object again on a server with no engine, so a snapshot layout gets no
 * highlights at all rather than an error.
 */
import { HIGHLIGHT_KINDS } from '../qix/highlight-source';
import { isSnapshot } from '../ui/snapshot';
import { readTextToolSettings } from './settings';

/**
 * Load the highlight answer for a layout.
 *
 * @param {object} request - The request.
 * @param {object} [request.layout] - The object layout.
 * @param {object} [request.app] - The enigma Doc.
 * @param {{load: function(object): Promise<?object>}} request.loader - The object's highlight loader.
 * @param {number} request.version - The companion version the load belongs to.
 * @param {function(): boolean} [request.isStale] - True once a newer load has started.
 * @returns {Promise<?{answer: object, derivedFrom: object, version: number}>} The tagged answer, or
 *     null without a layout or an app, or when the load went stale.
 */
export async function loadHighlightResult({ layout, app, loader, version, isStale = () => false }) {
    if (!layout) return null;
    /**
     * Tag an answer with what it was worked out for.
     *
     * @param {object} answer - The highlight answer.
     * @returns {{answer: object, derivedFrom: object, version: number}} The tagged answer.
     */
    const tag = (answer) => ({ answer, derivedFrom: layout, version });

    if (isSnapshot(layout)) return tag({ kind: HIGHLIGHT_KINDS.OFF });
    if (!app) return null;
    try {
        const answer = await loader.load({ app, layout, isStale });
        return answer === null ? null : tag(answer);
    } catch (error) {
        const { field } = readTextToolSettings(layout.chatbox).highlight;
        return tag({ kind: HIGHLIGHT_KINDS.ERROR, field, error });
    }
}

/**
 * Tell whether a tagged answer belongs to the current layout and companion version.
 *
 * @param {?object} result - A tagged answer.
 * @param {object} layout - The layout being rendered.
 * @param {number} version - The current companion version.
 * @returns {boolean} True when the answer is not still being replaced.
 */
export function isCurrentHighlightResult(result, layout, version) {
    return Boolean(result) && result.derivedFrom === layout && result.version === version;
}
