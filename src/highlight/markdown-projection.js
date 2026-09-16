/**
 * The text a markdown message renders, for matching and for drawing marks into it.
 *
 * A markdown body is not the text the reader sees: `**New** York` renders as "New York". Highlights and
 * search matches are found in the rendered text, and they are drawn into the tree react-markdown
 * renders, so both sides must agree exactly on what that text is. They do by construction: the same
 * processor react-markdown 10 builds (remark-parse, remark-gfm, remark-rehype with raw HTML kept as
 * nodes) turns a body into a tree, and one walker, `walkProjection`, turns a tree into text — once
 * when the conversation is matched, and again inside react-markdown, as a rehype plugin, when a body is
 * drawn. When the plugin's text differs from the text that was matched, it draws nothing rather than
 * marks in the wrong place.
 *
 * The walker's rules:
 * - Text and raw nodes contribute their value; react-markdown shows raw HTML as text.
 * - Blocks — paragraphs, list items, table cells, headings, code blocks — are separated by one NUL,
 *   which is not whitespace, bounds whole values, and never occurs in a parsed body. A value can match
 *   across bold, italic, links and inline code, never from one block into the next.
 * - Whitespace-only text between blocks is skipped; `br` contributes nothing, since the parser puts
 *   a line break after it.
 * - Images and checkboxes contribute nothing: alt text is not visible text. Generated footnote chrome
 *   — reference numbers, back-arrows, the "Footnotes" heading — is skipped.
 *
 * It builds no React: marks are hast `mark` elements carrying their description in `data.cqsMark`.
 */
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { isSafeHref } from '../ui/links';
import { markPieces } from './marks';

/** The remark plugins react-markdown is given; the projection must parse with the very same. */
export const REMARK_PLUGINS = [remarkGfm];

/** What separates blocks in the projection. */
export const BLOCK_SEPARATOR = String.fromCharCode(0);

/** Elements whose content stands apart from what comes before and after it. */
const BLOCKS = new Set([
    'address',
    'article',
    'aside',
    'blockquote',
    'dd',
    'details',
    'div',
    'dl',
    'dt',
    'figcaption',
    'figure',
    'footer',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hr',
    'li',
    'ol',
    'p',
    'pre',
    'section',
    'summary',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'ul',
]);

/** Most bodies whose projection is kept before the cache starts over. */
const PROJECTIONS_KEPT = 50_000;

/** Text of nothing but whitespace. */
const WHITESPACE_ONLY = /^\s*$/;

/**
 * The processor react-markdown 10 builds: it forces `allowDangerousHtml`, so raw HTML stays a node.
 */
const processor = unified()
    .use(remarkParse)
    .use(REMARK_PLUGINS)
    .use(remarkRehype, { allowDangerousHtml: true })
    .freeze();

/**
 * Tell whether an element is generated footnote chrome rather than content.
 *
 * @param {object} node - A hast element.
 * @returns {boolean} True for a footnote reference number, a back-arrow or the footnote heading.
 */
function isFootnoteChrome(node) {
    const properties = node.properties ?? {};
    if (node.tagName === 'a') {
        return Boolean(properties.dataFootnoteRef) || properties.dataFootnoteBackref !== undefined;
    }
    return node.tagName === 'h2' && properties.id === 'footnote-label';
}

/**
 * Turn a rendered markdown tree into its text, reporting where each text node's value sits.
 *
 * @param {object} tree - The hast root.
 * @param {function(object): void} [onSegment] - Called for each text or raw node that contributes,
 *     with `{node, parent, index, start, end, inLink}`: offsets into the projection, and whether the
 *     node is inside a link that opens.
 * @returns {string} The projection.
 */
export function walkProjection(tree, onSegment) {
    let text = '';
    let pending = false;

    /**
     * Visit a node and its children, in document order.
     *
     * @param {object} node - The node.
     * @param {?object} parent - Its parent.
     * @param {number} index - Its index among the parent's children.
     * @param {boolean} inLink - Whether it is inside a link that opens.
     * @returns {void}
     */
    const visit = (node, parent, index, inLink) => {
        if (node.type === 'text' || node.type === 'raw') {
            const value = typeof node.value === 'string' ? node.value : '';
            if (value === '' || (pending && WHITESPACE_ONLY.test(value))) return;
            if (pending) {
                if (text !== '') text += BLOCK_SEPARATOR;
                pending = false;
            }
            const start = text.length;
            text += value;
            onSegment?.({ node, parent, index, start, end: text.length, inLink });
            return;
        }
        if (node.type !== 'element' && node.type !== 'root') return;
        if (node.type === 'element' && isFootnoteChrome(node)) return;

        const block = node.type === 'element' && BLOCKS.has(node.tagName);
        if (block) pending = true;
        const link = inLink || (node.tagName === 'a' && isSafeHref(node.properties?.href));
        const children = Array.isArray(node.children) ? node.children : [];
        for (let child = 0; child < children.length; child++) {
            visit(children[child], node, child, link);
        }
        if (block) pending = true;
    };

    visit(tree, null, -1, false);
    return text;
}

/**
 * Work out the text a markdown body renders.
 *
 * @param {string} body - The markdown.
 * @returns {string} The projection.
 */
export function projectMarkdown(body) {
    return walkProjection(processor.runSync(processor.parse(String(body ?? ''))));
}

/**
 * Create a cache of projections, shared by highlighting and search.
 *
 * Parsing is the expensive step — about 0.07 ms a body — and a body's projection never changes, so it
 * is worked out once per body, whatever the values or the query.
 *
 * @param {object} [options] - Options.
 * @param {function(string): string} [options.project] - Works out a projection.
 * @returns {{get: function(string): string}} The cache.
 */
export function createProjections({ project = projectMarkdown } = {}) {
    let kept = new Map();

    /**
     * Get the projection of a body.
     *
     * @param {string} body - The markdown.
     * @returns {string} Its projection.
     */
    function get(body) {
        let text = kept.get(body);
        if (text === undefined) {
            // A long session over many conversations must not grow the cache without bound.
            if (kept.size >= PROJECTIONS_KEPT) kept = new Map();
            text = project(body);
            kept.set(body, text);
        }
        return text;
    }

    return { get };
}

/**
 * A rehype plugin that draws marks into the tree react-markdown renders.
 *
 * @param {object} options - What to draw.
 * @param {string} options.expected - The projection the marks were found in.
 * @param {Array<object>} [options.highlights] - Highlights, in projection offsets.
 * @param {number} [options.drawn] - How many highlights are drawn.
 * @param {Array<object>} [options.finds] - Search matches, in projection offsets.
 * @param {?{kind: string, ordinal: number}} [options.current] - The current mark.
 * @param {function(object): object} [options.describe] - Describes a highlight span.
 * @returns {function(object): void} The transformer.
 */
export function rehypeHighlights({ expected, highlights, drawn, finds, current, describe }) {
    return (tree) => {
        const segments = [];
        const projection = walkProjection(tree, (segment) => segments.push(segment));
        // Marks found in another text would land in the wrong place, and a click on one would
        // select the wrong value: draw none.
        if (projection !== expected) return;

        // Last to first, so replacing a node never shifts one still to come in the same parent.
        for (let at = segments.length - 1; at >= 0; at--) {
            const { node, parent, index, start, end, inLink } = segments[at];
            const pieces = markPieces({ start, end, highlights, drawn, finds, current, describe });
            if (pieces.every((piece) => piece.mark === null)) continue;
            const replacement = pieces.map((piece) => {
                const value = node.value.slice(piece.start - start, piece.end - start);
                if (piece.mark === null) return { type: 'text', value };
                // A mouse click on a mark inside a link belongs to the link, so its tooltip does not
                // say that a click selects.
                const mark = inLink
                    ? { ...piece.mark, link: true, title: piece.mark.linkTitle }
                    : piece.mark;
                // `properties` must exist: react-markdown reads it on every element it renders.
                return {
                    type: 'element',
                    tagName: 'mark',
                    properties: {},
                    data: { cqsMark: mark },
                    children: [{ type: 'text', value }],
                };
            });
            parent.children.splice(index, 1, ...replacement);
        }
    };
}
