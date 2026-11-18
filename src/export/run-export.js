/**
 * Exporting a conversation as a PDF, a PNG or an HTML file, from the export dialog.
 *
 * Sense's own image and PDF export draws the object once, at one size, in a browser on the server: a long
 * conversation is cut at the object's frame, and a PDF is one page. So the object makes these files
 * itself, in the reader's browser, from every message it holds:
 *
 * - **PDF**: the export is printed from a hidden frame, and the reader saves it from the print dialog.
 *   The browser paginates, the text stays text, and every script and emoji prints as it reads.
 * - **PNG**: the export is drawn as images, sized for a 16:9 slide or as one tall image, and cut between
 *   rows where one image cannot hold it all; several images download together as a zip.
 * - **HTML**: one file that opens anywhere, with no script in it.
 *
 * It runs outside the object's render, on the view the object last drew, and never throws: whatever
 * happens, the reader is told in the corner of the object.
 */
import { createElement } from 'react';
import { localWallClock } from '../chat/grouping';
import { readKindChipSettings } from '../chat/kind-chips';
import { counted } from '../util/format';
import { escapeHtml } from '../util/escape-html';
import logger from '../util/logger';
import { saveFile } from './download';
import ExportDocument, { sheetWidth } from './ExportDocument';
import {
    avatarUrls,
    fontFaceCss,
    fontFamilies,
    inlineAvatars,
    themeFontFaces,
} from './export-assets';
import { openExportFrame, settle } from './export-frame';
import { buildExportModel } from './export-model';
import { EXPORT_CSS, IMAGE_PADDING, PRINT_WIDTH } from './export-styles';
import { exportFileBase, partFileName } from './file-name';
import { SLIDE_SHRINK, fitFactor, planParts, slideSize, tallLimit } from './png-parts';
import { rasterize } from './rasterize';
import { createZip } from './zip';

/** The longest a printed frame is kept for a print dialog that never says it closed. */
const PRINT_KEEP_MS = 10 * 60 * 1000;

/** The frame of the last PDF, taken away when the next export starts. */
let printFrame = null;

/**
 * Write the HTML file around an exported page.
 *
 * @param {object} parts - What goes in.
 * @param {string} parts.lang - The document's language.
 * @param {string} parts.title - Its title.
 * @param {string} parts.page - The page, as `XMLSerializer` wrote it.
 * @returns {string} A complete HTML document, with the export's own sheet and no script.
 */
export function htmlFile({ lang, title, page }) {
    return [
        '<!DOCTYPE html>',
        `<html lang="${escapeHtml(lang || 'en')}">`,
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${escapeHtml(title)}</title>`,
        `<style>${EXPORT_CSS}</style>`,
        '</head>',
        `<body>${page}</body>`,
        '</html>',
        '',
    ].join('\n');
}

/**
 * Read the language of the page the object is on.
 *
 * @param {Document} doc - The page.
 * @returns {string} Its language, or English.
 */
function pageLang(doc) {
    return doc?.documentElement?.getAttribute('lang') || 'en';
}

/**
 * Export the conversation as an HTML file.
 *
 * @param {object} job - The export.
 * @returns {Promise<string>} What was saved, for the notice.
 */
async function exportHtml(job) {
    const { model, doc, base, props } = job;
    const avatars = await inlineAvatars(avatarUrls(model));
    const frame = openExportFrame({
        doc,
        width: sheetWidth(model) + 2 * IMAGE_PADDING.x,
        title: base,
    });
    try {
        const page = frame.render(
            createElement(ExportDocument, { ...props, format: 'html', avatars })
        );
        const file = htmlFile({
            lang: pageLang(doc),
            title: model.heading,
            page: new XMLSerializer().serializeToString(page),
        });
        saveFile(new Blob([file], { type: 'text/html;charset=utf-8' }), `${base}.html`, doc);
    } finally {
        frame.close();
    }
    return `Saved ${counted(model.messageCount, 'message', 'messages')} as HTML`;
}

/**
 * Export the conversation as a PDF, through the browser's print dialog.
 *
 * @param {object} job - The export.
 * @returns {Promise<string>} What was done, for the notice.
 */
async function exportPdf(job) {
    const { model, doc, base, props, fonts } = job;
    const orientation = model.columns.length > 1 ? 'landscape' : 'portrait';
    const zoom = Math.min(1, PRINT_WIDTH[orientation] / sheetWidth(model));
    const css = await fontFaceCss(fonts, { inline: false });
    const avatars = await inlineAvatars(avatarUrls(model));
    const frame = openExportFrame({ doc, width: 1100, title: base, css });
    // Constants only: the orientation is one of two words.
    frame.addCss(`@page { size: ${orientation}; margin: 0; }`);
    frame.doc.documentElement.style.setProperty(
        '--cx-page-bg',
        props.theme['--cqs-bg'] ?? '#ffffff'
    );
    const page = frame.render(
        createElement(ExportDocument, { ...props, format: 'pdf', zoom, avatars })
    );
    if (!page) {
        frame.close();
        throw new Error('nothing was drawn to print');
    }
    await settle(frame.doc);
    printFrame?.close();
    printFrame = frame;
    let timer = null;
    /**
     * Take the frame away once printing is over.
     *
     * @returns {void}
     */
    const done = () => {
        clearTimeout(timer);
        frame.close();
        if (printFrame === frame) printFrame = null;
    };
    timer = setTimeout(done, PRINT_KEEP_MS);
    frame.win.addEventListener('afterprint', () => setTimeout(done, 1000), { once: true });
    frame.win.focus();
    frame.win.print();
    return `Opened the print dialog for ${counted(model.messageCount, 'message', 'messages')}`;
}

/**
 * Measure what a page of the export holds besides its rows.
 *
 * @param {Element} page - The page, drawn with every row.
 * @param {boolean} titled - Whether it has the title block.
 * @returns {{rows: Array<number>, title: number, head: number, footer: number}} Heights in CSS pixels.
 */
function measure(page, titled) {
    /**
     * Measure an element's height.
     *
     * @param {?Element} element - The element.
     * @returns {number} Its height in CSS pixels; 0 when there is none.
     */
    const height = (element) => element?.getBoundingClientRect().height ?? 0;
    const title = page.querySelector('.cx-title');
    const footer = page.querySelector('.cx-footer');
    const footerStyle = footer ? page.ownerDocument.defaultView.getComputedStyle(footer) : null;
    const footerSpace =
        (parseFloat(footerStyle?.marginTop) || 0) + (parseFloat(footerStyle?.paddingTop) || 0);
    return {
        rows: [...page.querySelectorAll('.cx-board > tbody > tr')].map(height),
        title: titled && title ? height(title) + 22 : 0,
        head: height(page.querySelector('.cx-board > thead')),
        // On a slide the footer is pushed to the foot by an automatic margin, and its own padding is the
        // space above it; elsewhere the margin is the space.
        footer: height(footer) + (footer?.closest('[data-shape="slides"]') ? 0 : footerSpace),
    };
}

/**
 * Export the conversation as PNG images.
 *
 * @param {object} job - The export.
 * @returns {Promise<string>} What was saved, for the notice.
 */
async function exportPng(job) {
    const { model, doc, base, props, fonts, choice, onProgress, now } = job;
    const shape = choice.shape === 'tall' ? 'tall' : 'slides';
    const sheet = sheetWidth(model);
    const size =
        shape === 'slides'
            ? slideSize(sheet)
            : { width: Math.ceil(sheet + 2 * IMAGE_PADDING.x), height: null };
    const [fontCss, avatars] = await Promise.all([
        fontFaceCss(fonts, { inline: true }),
        inlineAvatars(avatarUrls(model)),
    ]);
    const frame = openExportFrame({
        doc,
        width: size.width,
        height: size.height ?? 1000,
        css: fontCss,
    });
    try {
        const pageProps = {
            ...props,
            format: 'png',
            shape,
            transparent: Boolean(choice.transparent),
            avatars,
            size,
        };
        const titled = props.title !== false;
        const whole = frame.render(createElement(ExportDocument, pageProps));
        await settle(frame.doc);
        const heights = measure(whole, titled);
        const pads = IMAGE_PADDING.top + IMAGE_PADDING.bottom;
        const fixed = pads + heights.head + heights.footer;
        const limit = shape === 'slides' ? size.height : tallLimit(size.width);
        const rows = model.rows.map((row, index) => ({
            kind: row.kind,
            height: heights.rows[index] ?? 0,
        }));
        const parts = planParts(rows, {
            first: limit - fixed - heights.title,
            rest: limit - fixed,
            shrink: shape === 'slides' ? SLIDE_SHRINK : 1,
        });

        const css = `${fontCss}\n${EXPORT_CSS}`;
        const images = [];
        for (const [index, range] of parts.entries()) {
            onProgress?.(index + 1, parts.length);
            const partProps = {
                ...pageProps,
                rows: model.rows.slice(range.start, range.end),
                part: { index, count: parts.length },
            };
            let page = frame.render(createElement(ExportDocument, partProps));
            let height = size.height;
            if (shape === 'slides') {
                // A slide that took one more row shrinks a little to hold it, and one row taller than a
                // slide shrinks to fit it, rather than being cut.
                const sheetElement = page.querySelector('.cx-sheet');
                const room = size.height - pads - heights.footer;
                const fit = fitFactor(sheetElement?.getBoundingClientRect().height ?? 0, room);
                if (fit < 1)
                    page = frame.render(createElement(ExportDocument, { ...partProps, fit }));
            } else {
                height = Math.min(limit, Math.ceil(page.getBoundingClientRect().height));
            }
            images.push(await rasterize(page, { width: size.width, height, css, doc }));
        }

        if (images.length === 1) {
            saveFile(images[0], `${base}.png`, doc);
            return `Saved ${counted(model.messageCount, 'message', 'messages')} as an image`;
        }
        const files = await Promise.all(
            images.map(async (image, index) => ({
                name: partFileName(base, index, images.length),
                data: new Uint8Array(await image.arrayBuffer()),
            }))
        );
        const zip = createZip(files, { wallClock: localWallClock(now) });
        saveFile(new Blob([zip], { type: 'application/zip' }), `${base}.zip`, doc);
        return `Saved ${counted(model.messageCount, 'message', 'messages')} as ${images.length} images in a zip`;
    } finally {
        frame.close();
    }
}

/**
 * Export the conversation the object last showed.
 *
 * @param {object} request - The export.
 * @param {?object} request.view - The props the object last rendered with, with `exportTheme`.
 * @param {object} request.choice - From the dialog: `format` ('pdf', 'png' or 'html'), `lane` (a lane's
 *     index to export it alone, or null for everything shown), `title`, `shape` and `transparent`.
 * @param {function(number, number): void} [request.onProgress] - Told which image is being drawn, of how
 *     many.
 * @param {number} [request.now] - When, in epoch milliseconds.
 * @param {Document} [request.doc] - The page the object is on.
 * @returns {Promise<?{level: string, text: string}>} The notice to show; null with nothing to export.
 */
export async function runExport({
    view,
    choice,
    onProgress,
    now = Date.now(),
    doc = globalThis.document,
}) {
    const model = buildExportModel(view, { lane: choice?.lane ?? null, now });
    if (!model) return null;
    const theme = view.exportTheme ?? {};
    const chips = readKindChipSettings(view.settings?.kindChips);
    const job = {
        model,
        doc,
        now,
        choice,
        onProgress,
        base: exportFileBase(model, now),
        fonts: themeFontFaces(doc, fontFamilies(theme['--cqs-font-family'])),
        props: {
            model,
            theme,
            highlights: view.highlights ?? null,
            title: choice?.title !== false,
            kindsMax: chips.show ? chips.max : null,
        },
    };
    printFrame?.close();
    printFrame = null;
    try {
        if (choice?.format === 'pdf') return { level: 'info', text: await exportPdf(job) };
        if (choice?.format === 'png') return { level: 'info', text: await exportPng(job) };
        return { level: 'info', text: await exportHtml(job) };
    } catch (err) {
        logger.warn('export failed:', err);
        const refused = err?.name === 'SecurityError';
        return {
            level: 'error',
            text: refused
                ? 'This browser would not let the conversation be saved as an image. Try PDF or HTML.'
                : `The export did not work: ${err?.message || 'the browser refused it'}`,
        };
    }
}
