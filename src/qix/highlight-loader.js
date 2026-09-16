/**
 * Loading the highlights for one chatbox object: its settings, its companion object and the highlight
 * source, together.
 *
 * It owns the companion, so its changes can be passed on to the component: a selection in a highlight
 * field that is not associated with the messages leaves the object's own layout untouched, and only
 * the companion hears about it. Without a highlight field it releases the companion, so the engine
 * stops computing a cube nobody reads.
 *
 * It does not render and does not match anything against the messages.
 */
import { readTextToolSettings } from '../highlight/settings';
import { companionDefinition, createCompanion } from './companion';
import { stateNameOf } from './field-selection';
import { HIGHLIGHT_KINDS, createHighlightSource } from './highlight-source';

/**
 * Create the highlight loader for one chatbox object.
 *
 * @param {object} [options] - Options.
 * @param {{warn: Function}} [options.logger] - Where failures are reported.
 * @returns {{load: function(object): Promise<?object>, subscribe: function(Function): Function,
 *     destroy: function(): void}} The loader. `subscribe` calls its listener whenever the companion
 *     changed or closed, and returns an unsubscribe function.
 */
export function createHighlightLoader({ logger } = {}) {
    const companion = createCompanion({ logger });
    const source = createHighlightSource({ companion, logger });

    /**
     * Load the highlights a layout asks for.
     *
     * @param {object} request - The request.
     * @param {object} request.app - The enigma Doc.
     * @param {object} request.layout - The object layout, whose `chatbox` bag holds the settings.
     * @param {function(): boolean} [request.isStale] - True once a newer request has started.
     * @returns {Promise<?object>} The highlight source's answer, `{kind: 'off'}` without a highlight
     *     field, or null when the request went stale.
     */
    async function load({ app, layout, isStale = () => false }) {
        const settings = readTextToolSettings(layout?.chatbox);
        if (!settings.highlight.field) {
            companion.release();
            return { kind: HIGHLIGHT_KINDS.OFF };
        }
        const highlight = settings.highlight;
        // Categories belong to highlights: without a highlight field there is nothing to colour.
        const category = settings.category.field ? settings.category : null;
        const definition = companionDefinition({
            stateName: stateNameOf(layout),
            highlight,
            category,
        });
        return source.load({ app, definition, highlight, category, isStale });
    }

    return { load, subscribe: companion.subscribe, destroy: companion.destroy };
}
