/**
 * A text with its highlights and search matches marked.
 *
 * The text is cut into plain and marked pieces by offset, and every piece is a React child, so a value
 * that looks like markup stays text and the text content is exactly the original: selecting and copying
 * it is unaffected, and a `pre-wrap` parent keeps its line breaks.
 */
import { Fragment } from 'react';
import { NO_SPANS, markPieces } from '../highlight/marks';
import HighlightMark from './HighlightMark';

/**
 * Render a text with its marks.
 *
 * @param {object} props - Component props.
 * @param {string} props.text - The text.
 * @param {Array<object>} [props.highlights] - Its highlights, in text order.
 * @param {number} [props.drawn] - How many highlights are drawn; all when not given.
 * @param {Array<object>} [props.finds] - Its search matches, in text order.
 * @param {?{kind: string, ordinal: number}} [props.current] - The current mark in this text.
 * @param {function(object): object} [props.describe] - Describes a highlight span.
 * @returns {object} The text, with marks where there are any.
 */
export function HighlightedText({
    text,
    highlights = NO_SPANS,
    drawn,
    finds = NO_SPANS,
    current = null,
    describe,
}) {
    if (typeof text !== 'string' || text === '') return text ?? null;
    if (highlights.length === 0 && finds.length === 0) return text;

    const pieces = markPieces({ end: text.length, highlights, drawn, finds, current, describe });
    return pieces.map((piece) => {
        const content = text.slice(piece.start, piece.end);
        return piece.mark === null ? (
            <Fragment key={piece.start}>{content}</Fragment>
        ) : (
            <HighlightMark key={piece.start} mark={piece.mark}>
                {content}
            </HighlightMark>
        );
    });
}

export default HighlightedText;
