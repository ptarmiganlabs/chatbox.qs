/**
 * The message body.
 *
 * Plain text by default, markdown only when the object opts in. Two reasons for
 * that default, and neither is timidity:
 *
 *  - Qlik field values routinely contain `*`, `_`, `#` and `|` as ordinary
 *    characters. Markdown would silently reformat them, so a chat log of shell
 *    commands or file paths would render wrong for everybody.
 *  - Plain text goes through React children, which escape. Nothing reaches the
 *    DOM as markup at all.
 *
 * Markdown deliberately runs WITHOUT rehype-raw, so raw HTML in a message is
 * rendered as text rather than parsed. That is what makes this safe without a
 * sanitizer: there is no HTML path to sanitize. Every chat-shaped Sense
 * extension published so far interpolates field data straight into an HTML
 * sink, and an extension runs on the hub's own origin inside the authenticated
 * user's session.
 *
 * Highlights keep all of that: a highlighted body is cut into pieces by offset,
 * and each piece is still a React child. The body is memoised, so stepping or a
 * resize redraws only the bodies whose own marks changed.
 */
import { memo } from 'react';
import Markdown from 'react-markdown';
import { REMARK_PLUGINS, rehypeHighlights } from '../highlight/markdown-projection';
import styles from './chat.module.css';
import HighlightedText from './HighlightedText';
import HighlightMark from './HighlightMark';
import { isSafeHref } from './links';

/**
 * Render a link that cannot navigate the Sense client away.
 *
 * @param {object} props - Component props from react-markdown.
 * @param {string} [props.href] - The link target.
 * @param {object} [props.children] - Link text.
 * @returns {object} The rendered anchor.
 */
function SafeLink({ href, children }) {
    const safe = isSafeHref(href) ? href : undefined;
    return (
        <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
            {children}
        </a>
    );
}

/**
 * Render a mark the highlight plugin drew into a markdown body.
 *
 * @param {object} props - Component props from react-markdown.
 * @param {object} [props.node] - The hast element, carrying the mark's description.
 * @param {object} [props.children] - The mark's text.
 * @returns {object} The rendered mark.
 */
function MarkdownMark({ node, children }) {
    const mark = node?.data?.cqsMark;
    return mark ? <HighlightMark mark={mark}>{children}</HighlightMark> : <mark>{children}</mark>;
}

/** The elements react-markdown renders with components of ours; one object, not one per render. */
const COMPONENTS = { a: SafeLink, mark: MarkdownMark };

/**
 * Render a message body.
 *
 * @param {object} props - Component props.
 * @param {string} props.body - The message text.
 * @param {string} [props.format] - 'text' or 'markdown'.
 * @param {?object} [props.highlights] - The message's highlights, from the conversation highlighter.
 * @param {number} [props.drawn] - How many of them are drawn.
 * @param {function(object): object} [props.describe] - Describes a highlight span.
 * @param {?{kind: string, ordinal: number}} [props.current] - The current mark in this body.
 * @param {?object} [props.finds] - The message's search matches; `body` and `text` are used here.
 * @returns {object} The rendered body.
 */
export function BubbleBody({
    body,
    format,
    highlights = null,
    drawn,
    describe,
    current = null,
    finds = null,
}) {
    const spans = highlights?.spans ?? [];
    const found = finds?.body ?? [];
    if (format !== 'markdown') {
        // React escapes children; the body can never become markup, highlighted or not.
        return (
            <div className={styles.body}>
                {spans.length || found.length ? (
                    <HighlightedText
                        text={body}
                        highlights={spans}
                        drawn={drawn}
                        finds={found}
                        current={current}
                        describe={describe}
                    />
                ) : (
                    body
                )}
            </div>
        );
    }

    // The marks are drawn into the tree react-markdown renders, in the text it renders; see
    // src/highlight/markdown-projection.js. Without marks, no plugin runs at all.
    const rehypePlugins =
        spans.length || found.length
            ? [
                  [
                      rehypeHighlights,
                      {
                          // Both were found in the body's projection; whichever there is says what it is.
                          expected: spans.length ? highlights.text : finds.text,
                          highlights: spans,
                          drawn,
                          finds: found,
                          current,
                          describe,
                      },
                  ],
              ]
            : undefined;
    return (
        <div className={`${styles.body} ${styles.bodyMarkdown}`}>
            <Markdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={rehypePlugins}
                components={COMPONENTS}
            >
                {body}
            </Markdown>
        </div>
    );
}

export default memo(BubbleBody);
