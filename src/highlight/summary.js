/**
 * What the object says about the highlights, and where it says it.
 *
 * Every state the highlight source reports gets a sentence of its own, and so does every limit that
 * leaves something out: the value limit, the drawing cap and the search budget. So does every problem
 * with the categories — the field, the engine, the colour expression, a colour that is not one — and
 * those come first, because they matter more than the counts. A message carries a level: info, warning
 * or error.
 *
 * Info is a quiet line in the bar above the conversation, which the Show highlight summary switch can
 * turn off. Warnings and errors are banners above the conversation whatever the switches say: a
 * misspelt field, an engine error or values left out must stay in sight, or "no highlights" looks like
 * "nothing to highlight".
 *
 * Counts are formatted the same way on every host. It does not render. Adapted from textview.qs
 * `src/render/highlight-summary.js` at df84a5e: counts are across the conversation, and name messages.
 */
import { HIGHLIGHT_KINDS, MAX_CATEGORY_ROWS } from '../qix/highlight-source';
import { counted, formatCount } from '../util/format';
import { MAX_DRAWN_HIGHLIGHTS } from './conversation-highlights';

/**
 * Describe what went wrong with the categories.
 *
 * @param {?object} categories - The highlight source's categories: the field, its `problem` and the
 *     colour expression's `expression` problem.
 * @param {?string} invalidColor - The first colour expression answer that is not a colour, if any.
 * @returns {string[]} One sentence per problem, none when the categories are sound or not in use.
 */
function categoryProblems(categories, invalidColor) {
    if (!categories) return [];
    const { field, problem, expression } = categories;
    const messages = [];
    if (problem?.kind === 'field-missing') {
        messages.push(`The category field ${field} is not in the data model`);
    } else if (problem?.kind === 'error') {
        const code = problem.error?.qErrorCode ?? problem.error?.code;
        messages.push(
            code === undefined || code === null
                ? 'The categories could not be read from the Qlik engine'
                : `The categories could not be calculated: Qlik engine error ${code}`
        );
    }
    if (expression?.kind === 'syntax') {
        messages.push(`The colour expression has an error: ${expression.message}`);
    } else if (expression?.kind === 'unknown-fields') {
        const fields = expression.names.length === 1 ? 'a field' : 'fields';
        messages.push(
            `The colour expression names ${fields} not in the data model: ${expression.names.join(', ')}`
        );
    } else if (invalidColor !== null && invalidColor !== undefined) {
        messages.push(`The colour expression returned "${invalidColor}", which is not a colour`);
    }
    return messages;
}

/**
 * Describe the highlights in one line.
 *
 * @param {?object} answer - The highlight source's answer.
 * @param {object} result - What the conversation highlighter found: `total`, `messagesWith` and
 *     `searchTruncated`.
 * @param {object} [details] - What else is known.
 * @param {?string} [details.invalidColor] - The first colour expression answer that is not a colour.
 * @param {boolean} [details.renderAll] - Whether every message is rendered at once, which caps drawing.
 * @returns {?{text: string, level: string}} The message, or null when highlights are off.
 */
export function highlightSummary(answer, result, { invalidColor = null, renderAll = false } = {}) {
    switch (answer?.kind) {
        case HIGHLIGHT_KINDS.FIELD_MISSING:
            return {
                level: 'error',
                text: `The highlight field ${answer.field} is not in the data model`,
            };
        case HIGHLIGHT_KINDS.ERROR: {
            const code = answer.error?.qErrorCode ?? answer.error?.code;
            return {
                level: 'error',
                text:
                    code === undefined || code === null
                        ? 'The highlights could not be read from the Qlik engine'
                        : `The highlights could not be calculated: Qlik engine error ${code}`,
            };
        }
        case HIGHLIGHT_KINDS.NO_SELECTION:
            return { level: 'info', text: `Select values in ${answer.field} to highlight them` };
        case HIGHLIGHT_KINDS.NONE_POSSIBLE:
            return {
                level: 'info',
                text: `No values of ${answer.field} are possible with the current selections`,
            };
        case HIGHLIGHT_KINDS.EXCLUDED:
            return {
                level: 'warning',
                text: `${counted(answer.excluded, 'value', 'values')} selected in ${answer.field}, but excluded by other selections`,
            };
        case HIGHLIGHT_KINDS.VALUES: {
            const [one, many] =
                answer.source === 'possible'
                    ? ['possible value', 'possible values']
                    : ['selected value', 'selected values'];
            // Values in several categories can leave fewer values than the limit: say how many, and why.
            let values = answer.truncated
                ? `The first ${formatCount(answer.values.length)} of ${counted(answer.total, one, many)}`
                : counted(answer.values.length, one, many);
            if (answer.truncated && answer.rowsFull) {
                values += `: their categories filled ${formatCount(MAX_CATEGORY_ROWS)} rows`;
            }

            const total = result?.total ?? 0;
            const capped = renderAll && total > MAX_DRAWN_HIGHLIGHTS;
            let found;
            if (total === 0) found = 'none found in these messages';
            else {
                found = `${counted(total, 'highlight', 'highlights')} in ${counted(result.messagesWith, 'message', 'messages')}`;
                if (capped) {
                    found += `, the first ${formatCount(MAX_DRAWN_HIGHLIGHTS)} of them marked`;
                }
            }

            const problems = categoryProblems(answer.categories, invalidColor);
            const parts = [...problems, values, found];
            if (result?.searchTruncated) parts.push('the search stopped early');
            const limited = answer.truncated || capped || Boolean(result?.searchTruncated);
            return {
                level: limited || problems.length > 0 ? 'warning' : 'info',
                text: parts.join(' · '),
            };
        }
        default:
            return null;
    }
}

/**
 * Decide where a summary is shown.
 *
 * @param {?{text: string, level: string}} summary - From {@link highlightSummary}.
 * @param {object} options - The switches.
 * @param {boolean} options.showSummary - Whether the summary line is switched on.
 * @returns {{bar: ?{text: string, level: string}, banner: ?{text: string, level: string}}} Info for
 *     the bar, when switched on; warnings and errors for a banner, always.
 */
export function summaryPlacement(summary, { showSummary }) {
    if (summary === null || summary === undefined) return { bar: null, banner: null };
    if (summary.level !== 'info') return { bar: null, banner: summary };
    return { bar: showSummary ? summary : null, banner: null };
}
