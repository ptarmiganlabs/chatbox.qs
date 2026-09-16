/**
 * One marked piece of a message's text: a highlight, a search match, or the current one.
 *
 * Its look comes from classes and custom properties, and its category label from a data attribute that
 * the stylesheet shows as generated content, so a label is never selected or copied with the text. The
 * text itself is a React child, escaped like every other.
 */
import styles from './chat.module.css';

/**
 * Render a marked piece of text.
 *
 * @param {object} props - Component props.
 * @param {object} props.mark - What the piece is, from `markPieces`: `highlight`, `find`, `current`,
 *     `ordinal`, `cutStart`, `cutEnd`, `title`, `label` and `style`.
 * @param {object} [props.children] - The piece's text.
 * @returns {object} The rendered mark.
 */
export function HighlightMark({ mark, children }) {
    const className = [
        mark.highlight ? styles.mark : '',
        mark.find ? styles.find : '',
        mark.current ? styles.markCurrent : '',
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <mark
            className={className}
            data-h={mark.highlight ? mark.ordinal : undefined}
            data-cut-start={mark.cutStart ? '' : undefined}
            data-cut-end={mark.cutEnd ? '' : undefined}
            data-label={mark.label ?? undefined}
            data-current={mark.current ? '' : undefined}
            data-link={mark.link ? '' : undefined}
            title={mark.title ?? undefined}
            style={mark.style ?? undefined}
        >
            {children}
        </mark>
    );
}

export default HighlightMark;
