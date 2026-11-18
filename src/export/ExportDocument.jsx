/**
 * An exported conversation, drawn from the export model for every format.
 *
 * The page is a table: a column per conversation and a row per line of messages, so conversations side
 * by side line up in time, a printed page breaks only between rows, its lane headers repeat at the top of
 * every page, and an image is cut only between rows. Text is React children throughout, as in the object
 * itself; message bodies go through the object's own `BubbleBody`, so markdown and highlights are drawn
 * exactly as the object draws them, and links stay as safe as they are there.
 *
 * Classes are the export sheet's (`export-styles.js`), not the object's CSS module, which an export never
 * has. Only the highlight marks keep the module's class names, and the sheet styles them by element.
 */
import { formatRecipients } from '../chat/recipients';
import BubbleBody from '../ui/BubbleBody';
import { initials } from '../ui/render-message';
import { formatCount } from '../util/format';
import { initialsInk, readableOn } from './export-colors';
import { LANE_WIDTH, SINGLE_WIDTH } from './export-styles';

/**
 * Work out how wide the conversation is drawn.
 *
 * @param {object} model - The export model.
 * @returns {number} The table's width in CSS pixels.
 */
export function sheetWidth(model) {
    return model.columns.length > 1 ? model.columns.length * LANE_WIDTH - 24 : SINGLE_WIDTH;
}

/**
 * Draw a person's picture, or their initials when there is none to draw.
 *
 * @param {object} props - Component props.
 * @param {object} props.message - The message.
 * @param {string} props.accent - Their colour.
 * @param {?Map<string, ?string>} props.avatars - Pictures by URL, as they can be drawn; a URL that maps to
 *     null is drawn as initials.
 * @returns {object} The picture.
 */
function Avatar({ message, accent, avatars }) {
    const url = message.author?.avatarUrl ?? null;
    const src = url && avatars?.has(url) ? avatars.get(url) : url;
    if (src) {
        return <img className="cx-avatar" src={src} alt="" referrerPolicy="no-referrer" />;
    }
    return (
        <span
            className="cx-avatar cx-initials"
            style={{ '--cx-accent': accent, color: initialsInk(accent) }}
            aria-hidden="true"
        >
            {initials(message.author?.label)}
        </span>
    );
}

/**
 * Draw one message.
 *
 * @param {object} props - Component props.
 * @param {object} props.cell - The cell: `message`, `index`, `showAuthor` and `day`.
 * @param {?object} props.highlights - The highlight view the object drew with.
 * @param {boolean} props.showAvatars - Whether the column has pictures.
 * @param {?Map<string, ?string>} props.avatars - Pictures by URL.
 * @param {?number} props.kindsMax - How many kinds to show as chips; null for none.
 * @param {?string} props.background - The page's colour, which a name must stand out from.
 * @returns {object} The message.
 */
function ExportMessage({ cell, highlights, showAvatars, avatars, kindsMax, background }) {
    const { message, index, showAuthor, day } = cell;
    const own = message.side === 'right';
    const accent = message.accent || message.author?.color || '#9e9e9e';
    const entry = highlights?.result?.byMessage?.[index] ?? null;
    const kinds = kindsMax !== null && Array.isArray(message.kinds) ? message.kinds : [];
    let avatar = null;
    if (showAvatars && !own) {
        avatar = showAuthor ? (
            <Avatar message={message} accent={accent} avatars={avatars} />
        ) : (
            <span className="cx-avatar-space" aria-hidden="true" />
        );
    }
    return (
        <div
            className="cx-msg"
            data-own={own ? 'true' : 'false'}
            data-first={showAuthor ? 'true' : 'false'}
            data-context={message.context ? 'true' : undefined}
            style={{ '--cx-accent': accent, '--cx-name': readableOn(accent, background) }}
        >
            {day ? <div className="cx-lane-day">{day}</div> : null}
            <div className="cx-line">
                {avatar}
                <div className="cx-stack">
                    {showAuthor ? (
                        <div className="cx-author">
                            {message.author?.label ?? ''}
                            {message.recipients?.length ? (
                                <span className="cx-to">
                                    {' → '}
                                    {formatRecipients(message.recipients, {
                                        partial: message.recipientsPartial,
                                    })}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="cx-bubble">
                        {kinds.length ? (
                            <div className="cx-kinds">
                                {kinds.slice(0, kindsMax).map((kind) => (
                                    <span key={kind} className="cx-kind">
                                        {kind}
                                    </span>
                                ))}
                                {kinds.length > kindsMax || message.kindsCapped ? (
                                    <span className="cx-kind">
                                        +{formatCount(Math.max(0, kinds.length - kindsMax))}
                                        {message.kindsCapped ? '+' : ''}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                        {message.body ? (
                            <div
                                className="cx-body"
                                data-format={
                                    message.bodyFormat === 'markdown' ? 'markdown' : 'text'
                                }
                            >
                                <BubbleBody
                                    body={message.body}
                                    format={message.bodyFormat}
                                    highlights={entry}
                                    drawn={entry?.spans?.length ?? 0}
                                    describe={highlights?.describe}
                                />
                            </div>
                        ) : (
                            <div className="cx-empty">
                                {message.merged
                                    ? `${formatCount(message.rowCount)} messages share this Message ID`
                                    : '(no text)'}
                            </div>
                        )}
                        {message.tsText || message.badge ? (
                            <div className="cx-meta">
                                {message.badge ? (
                                    <span className="cx-badge">{message.badge}</span>
                                ) : null}
                                {message.tsText ? <span>{message.tsText}</span> : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Draw the title block: what the conversation is, who is in it, when, and what to know about it.
 *
 * @param {object} props - Component props.
 * @param {object} props.model - The export model.
 * @returns {object} The block.
 */
function TitleBlock({ model }) {
    return (
        <header className="cx-title">
            <h1>{model.heading}</h1>
            {model.facts.length ? (
                <p className="cx-facts">
                    {model.facts.map((fact) => (
                        <span key={fact} className="cx-fact">
                            {fact}
                        </span>
                    ))}
                </p>
            ) : null}
            {model.legend.length ? (
                <ul className="cx-legend">
                    {model.legend.map((entry) => (
                        <li key={entry.label}>
                            <span className="cx-swatch" style={{ background: entry.color }} />
                            {entry.label}
                        </li>
                    ))}
                </ul>
            ) : null}
            {model.notes.length ? (
                <div className="cx-notes">
                    {model.notes.map((note) => (
                        <p key={note.kind} className="cx-note" data-kind={note.kind}>
                            {note.text}
                        </p>
                    ))}
                </div>
            ) : null}
        </header>
    );
}

/**
 * Write the footer: when it was exported, and where this image falls among the others.
 *
 * @param {object} model - The export model.
 * @param {?{index: number, count: number}} part - Which image this is, for a PNG cut into several.
 * @param {boolean} titled - Whether the title block, which carries the notes, is drawn.
 * @returns {{left: string, right: ?string}} The footer's two ends.
 */
export function footerText(model, part, titled) {
    // Without the title block the notes are not drawn; what was left out is still said, briefly.
    const left =
        !titled && model.notes.some((note) => note.kind === 'truncated')
            ? `${model.footer} · Not every message is included`
            : model.footer;
    const right = part && part.count > 1 ? `${part.index + 1} of ${part.count}` : null;
    return { left, right };
}

/**
 * Draw an exported conversation, or one part of it.
 *
 * @param {object} props - Component props.
 * @param {object} props.model - The export model, from `buildExportModel`.
 * @param {string} props.format - 'pdf', 'png' or 'html'.
 * @param {object} props.theme - The theme's custom properties, from `themeVars`.
 * @param {?object} [props.highlights] - The highlight view the object drew with.
 * @param {boolean} [props.title] - Whether to draw the title block.
 * @param {?string} [props.shape] - For a PNG, 'slides' or 'tall'.
 * @param {boolean} [props.transparent] - For a PNG, whether the page has no background.
 * @param {?Array<object>} [props.rows] - The rows to draw, for one part; every row by default.
 * @param {?{index: number, count: number}} [props.part] - Which part this is, for a PNG.
 * @param {?{width: number, height: number}} [props.size] - The page's size, for a PNG.
 * @param {number} [props.fit] - How much a slide's content is scaled to fit it, 1 for not at all.
 * @param {number} [props.zoom] - How much a printed page is scaled to fit the paper, 1 for not at all.
 * @param {?Map<string, ?string>} [props.avatars] - Pictures by URL, as they can be drawn.
 * @param {?number} [props.kindsMax] - How many kinds to show as chips; null for none.
 * @returns {object} The page.
 */
export function ExportDocument({
    model,
    format,
    theme,
    highlights = null,
    title = true,
    shape = null,
    transparent = false,
    rows = null,
    part = null,
    size = null,
    fit = 1,
    zoom = 1,
    avatars = null,
    kindsMax = null,
}) {
    const drawn = rows ?? model.rows;
    const titled = title && (part === null || part.index === 0);
    const columns = model.columns.length;
    const width = sheetWidth(model);
    const footer = footerText(model, part, titled);
    const style = { ...theme };
    if (zoom !== 1) style['--cx-zoom'] = String(zoom);
    if (size) {
        style.width = `${size.width}px`;
        if (shape === 'slides') style.height = `${size.height}px`;
    }
    // Zoom rather than a transform, so a slide's content that is scaled to fit takes the room it is
    // drawn in, and the footer stays at the foot of the slide.
    const sheetStyle = { width: `${width}px` };
    if (fit !== 1) sheetStyle.zoom = String(fit);
    return (
        <div
            className="cx-page"
            data-format={format}
            data-shape={shape ?? undefined}
            data-transparent={transparent ? 'true' : undefined}
            data-labels={model.showLabels ? 'true' : undefined}
            data-avatars={model.avatars ? 'true' : undefined}
            style={style}
        >
            <div className="cx-sheet" style={sheetStyle}>
                {titled ? <TitleBlock model={model} /> : null}
                <table className="cx-board" style={{ width: `${width}px` }}>
                    <colgroup>
                        {model.columns.map((column, number) => (
                            <col key={number} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr className="cx-space cx-print-only" aria-hidden="true">
                            <td colSpan={columns} />
                        </tr>
                        {model.headed ? (
                            <tr className="cx-heads">
                                {model.columns.map((column, number) => (
                                    <th key={number} scope="col">
                                        <div className="cx-head">
                                            <span className="cx-head-name">{column.label}</span>
                                            <span className="cx-head-count">
                                                {formatCount(column.count)}
                                            </span>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        ) : null}
                    </thead>
                    <tbody>
                        {drawn.map((row) =>
                            row.kind === 'day' ? (
                                <tr key={row.key} className="cx-day" data-row={row.key}>
                                    <td colSpan={columns}>
                                        <div className="cx-day-label">{row.label}</div>
                                    </td>
                                </tr>
                            ) : (
                                <tr key={row.key} className="cx-row" data-row={row.key}>
                                    {row.cells.map((cell, number) => (
                                        <td key={number}>
                                            {cell ? (
                                                <ExportMessage
                                                    cell={cell}
                                                    highlights={highlights}
                                                    showAvatars={model.avatars}
                                                    avatars={avatars}
                                                    kindsMax={kindsMax}
                                                    background={theme?.['--cqs-bg'] ?? '#ffffff'}
                                                />
                                            ) : null}
                                        </td>
                                    ))}
                                </tr>
                            )
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="cx-foot cx-print-only">
                            <td colSpan={columns}>{footer.left}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {format === 'pdf' ? null : (
                <div
                    className="cx-footer cx-screen-only"
                    style={shape === 'slides' ? undefined : { width: `${width}px` }}
                >
                    <span>{footer.left}</span>
                    {footer.right ? <span>{footer.right}</span> : null}
                </div>
            )}
        </div>
    );
}

export default ExportDocument;
