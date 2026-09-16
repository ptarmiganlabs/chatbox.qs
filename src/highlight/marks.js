/**
 * How each piece of a marked text is drawn.
 *
 * A text — a message body, a name in the header line, the detail quote — can carry three layers of
 * marks: highlights, search matches, and the current one of either. A search match can fall inside a
 * highlight or straddle two, so the text is cut wherever any layer starts or ends, and each piece says
 * what it belongs to. The current mark can lie beyond the drawing cap, where no mark of its layer is
 * drawn; it is then drawn on its own, so stepping always shows where it is.
 *
 * A highlight's piece carries which highlight a click on it means (its ordinal in the text), whether the
 * highlight goes on before or after it (so a label box stays one box), its tooltip, and its colours as
 * custom properties. Its category label goes only on the piece where the highlight ends.
 *
 * Offsets in, descriptions out: it builds no DOM, and the same function serves plain text and the
 * markdown projection. Adapted from textview.qs `src/render/highlight-layer.js` at df84a5e, which drew
 * the same pieces into DOM rows.
 */
import { describeSpan } from './category-styles';
import { layeredPieces } from './segments';

/** No spans. Shared: never change it. */
export const NO_SPANS = Object.freeze([]);

/**
 * Describe a highlight by the values it stands for, when no category styles describe it.
 *
 * @param {{values?: string[]}} span - The highlight.
 * @returns {{title: string, label: null, style: null}} The values as the tooltip.
 */
export function describeByValues(span) {
    return {
        title: Array.isArray(span?.values) ? span.values.join(', ') : '',
        label: null,
        style: null,
    };
}

/**
 * Create the describer for one set of category styles.
 *
 * Every piece of a highlight asks for the same description, and every render asks again, so each span
 * is described once: the same span gets the very same description object back.
 *
 * @param {object} options - The describer.
 * @param {object} options.styles - From `categoryStyles`.
 * @param {string} [options.hint] - A second tooltip line saying what a click does; '' for none.
 * @returns {function(object): {title: string, label: ?string, style: ?object}} The describer.
 */
export function createDescriber({ styles, hint = '' }) {
    const described = new WeakMap();
    return (span) => {
        let description = described.get(span);
        if (description === undefined) {
            const base = describeSpan(span, styles);
            description =
                hint === ''
                    ? base
                    : { ...base, title: base.title ? `${base.title}\n${hint}` : hint };
            described.set(span, description);
        }
        return description;
    };
}

/**
 * Work out what one piece belongs to.
 *
 * @param {{start: number, end: number, spans: number[]}} piece - A piece from `layeredPieces`.
 * @param {object} layers - The layers the piece was cut from.
 * @param {Array<object>} layers.highlights - The highlights drawn.
 * @param {?{kind: string, ordinal: number}} layers.current - The current mark.
 * @param {?object} layers.currentSpan - The current mark's span.
 * @param {function(object): object} layers.describe - Describes a highlight span.
 * @returns {?object} The piece's mark, or null for plain text.
 */
function markOf(piece, { highlights, current, currentSpan, describe }) {
    const [inHighlight, inFind, inCurrent] = piece.spans;
    const isCurrent = inCurrent >= 0;
    let span = null;
    let ordinal = -1;
    if (inHighlight >= 0) {
        span = highlights[inHighlight];
        ordinal = inHighlight;
    } else if (isCurrent && current.kind === 'highlight') {
        span = currentSpan;
        ordinal = current.ordinal;
    }
    const found = inFind >= 0 || (isCurrent && current.kind === 'find');
    if (span === null && !found) return null;

    const mark = {
        highlight: span !== null,
        find: found,
        current: isCurrent,
        ordinal,
        cutStart: false,
        cutEnd: false,
        title: null,
        label: null,
        style: null,
    };
    if (span !== null) {
        mark.cutStart = piece.start > span.start;
        mark.cutEnd = piece.end < span.end;
        const { title, label, style } = describe(span);
        mark.title = title || null;
        mark.label = label && piece.end === span.end ? label : null;
        mark.style = style ?? null;
    }
    return mark;
}

/**
 * Cut part of a text into plain and marked pieces.
 *
 * @param {object} request - What to cut.
 * @param {number} [request.start] - Offset of the part's first character.
 * @param {number} request.end - Offset just past its last character.
 * @param {Array<{start: number, end: number}>} [request.highlights] - The text's highlights, in order.
 * @param {number} [request.drawn] - How many of them are drawn; all when not given.
 * @param {Array<{start: number, end: number}>} [request.finds] - The text's search matches, in order.
 * @param {?{kind: string, ordinal: number}} [request.current] - The current mark in this text: its
 *     kind, 'highlight' or 'find', and its ordinal among those; null for none.
 * @param {function(object): object} [request.describe] - Describes a highlight span.
 * @returns {Array<{start: number, end: number, mark: ?object}>} Pieces covering the part exactly.
 */
export function markPieces({
    start = 0,
    end,
    highlights = NO_SPANS,
    drawn = highlights.length,
    finds = NO_SPANS,
    current = null,
    describe = describeByValues,
}) {
    const shown = drawn >= highlights.length ? highlights : highlights.slice(0, Math.max(0, drawn));
    const currentSpan =
        current === null
            ? null
            : ((current.kind === 'find' ? finds : highlights)[current.ordinal] ?? null);
    const layers = [shown, finds, currentSpan === null ? NO_SPANS : [currentSpan]];
    const context = {
        highlights: shown,
        current: currentSpan === null ? null : current,
        currentSpan,
        describe,
    };
    return layeredPieces(start, end, layers).map((piece) => ({
        start: piece.start,
        end: piece.end,
        mark: markOf(piece, context),
    }));
}
