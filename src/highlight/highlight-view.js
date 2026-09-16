/**
 * Everything the conversation view needs to draw the highlights, worked out once per render.
 *
 * The object renders again on every layout change and every step of a resize, and the message bodies
 * are memoised on the highlight objects they are given. So this keeps what did not change the same
 * object from one render to the next: the highlighter answers the same result for the same messages,
 * category styles are kept while their key is unchanged, and so is the describer made from them. A
 * body then draws again only when its own highlights changed.
 *
 * It owns no engine handles and no DOM: `src/index.js` hands it the loaded answer and the conversation.
 */
import { HIGHLIGHT_KINDS } from '../qix/highlight-source';
import { paletteFromTheme } from '../theme/palette';
import { isDarkTheme } from '../ui/theme-vars';
import { categoryStyles } from './category-styles';
import { createConversationHighlighter } from './conversation-highlights';
import { createProjections } from './markdown-projection';
import { isCurrentHighlightResult } from './highlight-result';
import { createDescriber } from './marks';
import { readTextToolSettings } from './settings';
import { highlightSummary, summaryPlacement } from './summary';

/**
 * Create the highlight view for one chatbox object.
 *
 * @param {object} [options] - Options.
 * @param {{get: function(string): string}} [options.projections] - The markdown projections, shared by
 *     highlighting and search; a cache of its own when not given.
 * @param {object} [options.highlighter] - The conversation highlighter; a new one when not given.
 * @returns {{build: function(object): ?object, highlighter: object, projections: object}} The view.
 *     `build` answers null while highlighting is off or nothing is loaded yet.
 */
export function createHighlightView({
    projections = createProjections(),
    highlighter = createConversationHighlighter({ projections }),
} = {}) {
    let styles = null;
    let describe = null;

    /**
     * Keep the category styles, and the describer made from them, while their key is unchanged.
     *
     * @param {object} next - Freshly worked-out styles.
     * @returns {void}
     */
    function keepStyles(next) {
        if (styles !== null && styles.key === next.key) return;
        styles = next;
        describe = createDescriber({ styles });
    }

    /**
     * Work out the highlights for one render.
     *
     * @param {object} request - What to draw.
     * @param {?object} request.tagged - The loaded answer, tagged with the layout and version it
     *     belongs to; from `loadHighlightResult`.
     * @param {object} request.layout - The layout being rendered.
     * @param {number} request.version - The current companion version.
     * @param {Array<object>} request.messages - The conversation's messages, in display order.
     * @param {object} [request.theme] - The stardust theme.
     * @param {boolean} [request.renderAll] - Whether every message is rendered at once.
     * @returns {?object} `answer`, `pending` (a newer answer is loading), `settings`, `result`,
     *     `styles`, `describe`, `summary`, `placement`, `renderAll` and `matchPlain`; null while
     *     highlighting is off.
     */
    function build({ tagged, layout, version, messages, theme, renderAll = false }) {
        const answer = tagged?.answer ?? null;
        if (answer === null || answer.kind === HIGHLIGHT_KINDS.OFF) return null;

        const settings = readTextToolSettings(layout?.chatbox);
        const rows = answer.kind === HIGHLIGHT_KINDS.VALUES ? answer.rows : [];
        const result = highlighter.highlight({ messages, rows, options: settings.match });
        keepStyles(
            categoryStyles({
                categories: answer.categories ?? null,
                palette: paletteFromTheme(theme),
                dark: isDarkTheme(theme),
            })
        );
        const summary = highlightSummary(answer, result, {
            invalidColor: styles.invalidColor,
            renderAll,
        });
        return {
            answer,
            pending: !isCurrentHighlightResult(tagged, layout, version),
            settings,
            result,
            styles,
            describe,
            summary,
            placement: summaryPlacement(summary, { showSummary: settings.highlight.showSummary }),
            renderAll,
            matchPlain: highlighter.matchPlain,
        };
    }

    return { build, highlighter, projections };
}
