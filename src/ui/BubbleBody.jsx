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
 * extension published so far interpolates field data straight into innerHTML,
 * and an extension runs on the hub's own origin inside the authenticated user's
 * session.
 */
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './chat.module.css';

/** Rendered once, rather than a fresh array on every message. */
const PLUGINS = [remarkGfm];

/**
 * Render a link that cannot navigate the Sense client away.
 *
 * @param {object} props - Component props from react-markdown.
 * @param {string} [props.href] - The link target.
 * @param {object} [props.children] - Link text.
 * @returns {object} The rendered anchor.
 */
function SafeLink({ href, children }) {
    const safe = typeof href === 'string' && /^https?:\/\//i.test(href) ? href : undefined;
    return (
        <a href={safe} target="_blank" rel="noopener noreferrer nofollow">
            {children}
        </a>
    );
}

/**
 * Render a message body.
 *
 * @param {object} props - Component props.
 * @param {string} props.body - The message text.
 * @param {string} [props.format] - 'text' or 'markdown'.
 * @returns {object} The rendered body.
 */
export function BubbleBody({ body, format }) {
    if (format !== 'markdown') {
        // React escapes children; the body can never become markup.
        return <div className={styles.body}>{body}</div>;
    }

    return (
        <div className={`${styles.body} ${styles.bodyMarkdown}`}>
            <Markdown remarkPlugins={PLUGINS} components={{ a: SafeLink }}>
                {body}
            </Markdown>
        </div>
    );
}

export default BubbleBody;
