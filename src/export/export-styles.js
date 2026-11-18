/**
 * The stylesheet of an exported conversation.
 *
 * An export is drawn outside the object: in a frame of its own for a PDF and a PNG, and opened from a
 * file for HTML. Neither has the object's CSS module, so the export carries this sheet instead, and it is
 * designed for reading and for a slide rather than for a tile on a sheet. The theme's colours arrive as
 * the object's own custom properties, set on the page element (`themeVars`), so a dark theme exports
 * dark.
 *
 * It is a constant: nothing from the data or the theme is ever written into it. Theme values reach the
 * page as an inline style, which the browser escapes when the page is written out.
 */

/** How wide one conversation is drawn, in CSS pixels: a column to read, never the width of the paper. */
export const SINGLE_WIDTH = 580;

/** How wide each conversation is drawn side by side, gutter included. */
export const LANE_WIDTH = 344;

/** How wide a slide is at the least, in CSS pixels; it is drawn at twice that, 1920 × 1080. */
export const SLIDE_MIN_WIDTH = 960;

/** Space around the conversation on a slide or a tall image. */
export const IMAGE_PADDING = { x: 48, top: 40, bottom: 28 };

/** How wide a PDF page's content is at the least, in CSS pixels, across A4 and Letter alike. */
export const PRINT_WIDTH = { portrait: 690, landscape: 960 };

/** The sheet. Selectors are prefixed `cx-` so none can meet a class from the object or from Sense. */
export const EXPORT_CSS = `
body { margin: 0; }
.cx-page {
    box-sizing: border-box;
    margin: 0;
    padding: 40px 40px 28px;
    color: var(--cqs-text, #404040);
    background: var(--cqs-bg, #ffffff);
    font-family: var(--cqs-font-family, 'Segoe UI', Tahoma, sans-serif);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
.cx-page *, .cx-page *::before, .cx-page *::after { box-sizing: border-box; }
.cx-page { --cx-gutter: 20%; --cx-face: 0px; }
.cx-page[data-avatars='true'] { --cx-face: 40px; }
.cx-page[data-transparent='true'] { background: transparent; }
.cx-page[data-shape='slides'] {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 40px 48px 28px;
}
.cx-page[data-shape='tall'] { padding: 40px 48px 28px; }
.cx-page[data-format='html'] { min-height: 100vh; overflow-x: auto; }

.cx-sheet { margin: 0 auto; }
.cx-page[data-shape='slides'] .cx-sheet { flex: none; }

.cx-title { margin: 0 0 22px; }
.cx-title h1 {
    margin: 0 0 6px;
    font-size: 24px;
    line-height: 1.25;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow-wrap: anywhere;
}
.cx-facts { margin: 0; color: var(--cqs-muted, #6c6c6c); font-size: 13px; }
.cx-fact + .cx-fact::before { content: '\\00b7'; margin: 0 8px; opacity: 0.7; }
.cx-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--cqs-muted, #6c6c6c);
}
.cx-legend li { display: flex; align-items: center; gap: 6px; }
.cx-swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.cx-notes { margin: 12px 0 0; }
.cx-note {
    margin: 4px 0 0;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--cqs-muted, #6c6c6c);
    background: var(--cqs-groupbg, rgba(0, 0, 0, 0.055));
}

.cx-board { border-collapse: separate; border-spacing: 0; table-layout: fixed; margin: 0 auto; }
.cx-board td, .cx-board th { padding: 0; vertical-align: top; text-align: start; font-weight: inherit; }
.cx-board td + td, .cx-board th + th { padding-left: 24px; }
.cx-heads th { padding-bottom: 10px; }
.cx-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 0 2px 8px;
    border-bottom: 2px solid var(--cqs-border, #d9d9d9);
}
.cx-head-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 600;
}
.cx-head-count { flex: none; font-size: 12px; color: var(--cqs-muted, #6c6c6c); }

.cx-day td { padding: 14px 0 8px; }
.cx-day-label, .cx-lane-day {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--cqs-muted, #6c6c6c);
}
.cx-day-label::before, .cx-day-label::after, .cx-lane-day::before, .cx-lane-day::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--cqs-border, #d9d9d9);
}
.cx-lane-day { margin: 10px 0 8px; }

.cx-msg { padding-top: 3px; }
.cx-msg[data-first='true'] { padding-top: 12px; }
.cx-row:first-child .cx-msg[data-first='true'] { padding-top: 4px; }
.cx-msg[data-context='true'] .cx-line { opacity: 0.45; }
/* Which side a message is on has to read at a glance, in a lane as narrow as a third of a slide. A
   bubble that wraps fills its width, so the width cannot say it: each message keeps a gutter on the far
   side instead, and a message on the right also clears the avatar column of the left. Its edges then
   stand a fifth of the column away from a left message's, however long either is. */
.cx-line { display: flex; align-items: flex-end; gap: 10px; padding-inline-end: var(--cx-gutter); }
.cx-msg[data-own='true'] .cx-line {
    flex-direction: row-reverse;
    padding-inline-end: 0;
    padding-inline-start: calc(var(--cx-gutter) + var(--cx-face));
}
.cx-avatar {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    object-fit: cover;
    align-self: flex-start;
    margin-top: 22px;
}
.cx-avatar-space { flex: none; width: 30px; }
.cx-initials {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    background: var(--cx-accent, #9e9e9e);
}
.cx-stack { display: flex; flex-direction: column; min-width: 0; }
.cx-msg[data-own='true'] .cx-stack { align-items: flex-end; }
.cx-author {
    margin: 0 4px 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--cx-name, var(--cx-accent, var(--cqs-muted, #6c6c6c)));
    overflow-wrap: anywhere;
}
.cx-to { font-weight: 400; color: var(--cqs-muted, #6c6c6c); }
.cx-bubble {
    position: relative;
    padding: 8px 13px 7px;
    border-radius: 16px;
    background: var(--cqs-bubble-bg, #f2f2f2);
    box-shadow: 0 1px 1.5px rgba(0, 0, 0, 0.07);
    overflow-wrap: anywhere;
}
.cx-msg[data-first='true'] .cx-bubble { border-top-left-radius: 5px; }
.cx-msg[data-own='true'] .cx-bubble {
    background: var(--cqs-bubble-own-bg, #e3f1fb);
    border-top-left-radius: 16px;
}
.cx-msg[data-own='true'][data-first='true'] .cx-bubble { border-top-right-radius: 5px; }

.cx-body[data-format='text'] { white-space: pre-wrap; }
.cx-body[data-format='markdown'] { white-space: normal; }
.cx-body[data-format='markdown'] > div > :first-child { margin-top: 0; }
.cx-body[data-format='markdown'] > div > :last-child { margin-bottom: 0; }
.cx-body p { margin: 0 0 0.45em; }
.cx-body ul, .cx-body ol { margin: 0 0 0.45em; padding-inline-start: 1.3em; }
.cx-body h1, .cx-body h2, .cx-body h3, .cx-body h4 { margin: 0.2em 0 0.35em; font-size: 1.05em; line-height: 1.3; }
.cx-body blockquote {
    margin: 0 0 0.45em;
    padding-inline-start: 10px;
    border-inline-start: 3px solid var(--cqs-border, #d9d9d9);
    color: var(--cqs-muted, #6c6c6c);
}
.cx-body a { color: var(--cqs-focus, #3f8ab3); text-decoration: underline; }
.cx-body code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(127, 127, 127, 0.14);
}
.cx-body pre {
    margin: 0 0 0.45em;
    padding: 8px 10px;
    border-radius: 6px;
    white-space: pre-wrap;
    background: rgba(127, 127, 127, 0.14);
}
.cx-body pre code { padding: 0; background: none; }
.cx-body table { border-collapse: collapse; margin: 0 0 0.45em; }
.cx-body th, .cx-body td { border: 1px solid var(--cqs-border, #d9d9d9); padding: 2px 6px; }
.cx-body img { max-width: 100%; }
.cx-empty { font-style: italic; color: var(--cqs-muted, #6c6c6c); }

.cx-body mark {
    padding: 0 1px 2px;
    border-radius: 3px;
    color: inherit;
    background-color: var(--cqs-mark-fill, var(--cqs-highlight, rgba(255, 196, 0, 0.35)));
    background-image: var(
        --cqs-mark-line,
        linear-gradient(var(--cqs-highlight-line, #b58900), var(--cqs-highlight-line, #b58900))
    );
    background-position: left bottom;
    background-size: 100% 2px;
    background-repeat: no-repeat;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
}
.cx-body mark[data-cut-start] { border-top-left-radius: 0; border-bottom-left-radius: 0; }
.cx-body mark[data-cut-end] { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.cx-page[data-labels='true'] .cx-body mark {
    padding: 0 3px;
    border: 1px solid var(--cqs-mark-border, var(--cqs-highlight-line, #b58900));
    border-radius: 4px;
    background-image: none;
}
.cx-page[data-labels='true'] .cx-body mark[data-label]::after {
    content: attr(data-label);
    margin-left: 5px;
    color: var(--cqs-mark-ink, inherit);
    font-size: 0.75em;
    font-weight: 600;
}

.cx-kinds { display: flex; flex-wrap: wrap; gap: 4px; margin: 1px 0 5px; }
.cx-kind {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 7px;
    border: 1px solid var(--cqs-border, #d9d9d9);
    border-radius: 9px;
    font-size: 11px;
    line-height: 1.6;
    color: var(--cqs-muted, #6c6c6c);
}
.cx-meta {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--cqs-muted, #6c6c6c);
}
.cx-badge { padding: 0 6px; border: 1px solid var(--cqs-border, #d9d9d9); border-radius: 8px; }

.cx-footer {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin: 26px auto 0;
    font-size: 11px;
    color: var(--cqs-muted, #6c6c6c);
}
.cx-page[data-shape='slides'] .cx-footer { margin-top: auto; padding-top: 16px; width: 100%; }

.cx-print-only { display: none; }

@media print {
    html, body { margin: 0; padding: 0; background: var(--cx-page-bg, #ffffff); }
    /* The first page's top margin is the page's own padding; every later page's is the spacer row that
       the table repeats at the top of each page, which on the first page is the gap under the title. */
    .cx-page { padding: 12mm 12mm 0; zoom: var(--cx-zoom, 1); }
    .cx-title { margin-bottom: 0; }
    .cx-screen-only { display: none; }
    .cx-print-only { display: table-row; }
    .cx-space td { height: 12mm; padding: 0; }
    .cx-foot td { padding: 6mm 0 8mm; font-size: 10px; color: var(--cqs-muted, #6c6c6c); }
    .cx-title { break-after: avoid; }
    .cx-row, .cx-heads { break-inside: avoid; }
    .cx-day { break-after: avoid; }
}
`;
