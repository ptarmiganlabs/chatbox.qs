/**
 * The fonts and pictures an export draws with.
 *
 * A PNG is drawn as an SVG image, and an image loads nothing from the network: a font or a picture it
 * shows has to be inside it, as a data URL. So the theme's font is found among the page's own
 * `@font-face` rules and fetched once, and each avatar is fetched and inlined; one that cannot be fetched — another
 * site that does not allow it, say — is drawn as the person's initials instead. A PDF is printed from a
 * frame that has none of the page's fonts either, and gets the same rules with their addresses.
 *
 * The HTML file names the theme's font but carries none: a font file is not ours to hand out, and the
 * reader's own system font stands in.
 */

/** The most font files an export takes along. */
const MAX_FACES = 24;

/** The most font bytes an export takes along, all files together. */
const MAX_FONT_BYTES = 4000000;

/** The largest picture an export inlines. */
const MAX_AVATAR_BYTES = 1000000;

/** The most avatars an export fetches; the rest are initials. */
const MAX_AVATARS = 60;

/** How long a single fetch may take. */
const FETCH_MS = 5000;

/** What a `@font-face` descriptor may hold, for the ones copied as they are. */
const SAFE_DESCRIPTOR = /^[\w\s.,%+\-/]*$/;

/**
 * Read the families a CSS `font-family` names.
 *
 * @param {*} fontFamily - The value, e.g. "'QlikView Sans', 'Segoe UI', sans-serif".
 * @returns {Array<string>} The names, lower case and unquoted.
 */
export function fontFamilies(fontFamily) {
    if (typeof fontFamily !== 'string') return [];
    return fontFamily
        .split(',')
        .map((name) =>
            name
                .trim()
                .replace(/^(['"])(.*)\1$/, '$2')
                .trim()
                .toLowerCase()
        )
        .filter(Boolean);
}

/**
 * Write a CSS string.
 *
 * @param {string} text - The text.
 * @returns {string} The text quoted, with quotes, backslashes and line breaks escaped.
 */
export function cssString(text) {
    return `"${String(text).replace(/["\\\n\r]/g, (ch) => `\\${ch.charCodeAt(0).toString(16)} `)}"`;
}

/**
 * Report whether a rule is a `@font-face` rule, from whichever frame it came.
 *
 * @param {object} rule - A CSS rule.
 * @returns {boolean} True for a `@font-face` rule.
 */
function isFontFace(rule) {
    return rule?.type === 5 || rule?.constructor?.name === 'CSSFontFaceRule';
}

/**
 * Find the `@font-face` rules of some families among a document's stylesheets.
 *
 * @param {Document} doc - The document.
 * @param {Array<string>} families - The families, as {@link fontFamilies} reads them.
 * @returns {Array<object>} Each face: `family`, `style`, `weight`, `stretch`, `unicodeRange` and `sources`
 *     (absolute `url` and `format`), at most {@link MAX_FACES}.
 */
export function collectFontFaces(doc, families) {
    const wanted = new Set(families);
    const faces = [];
    /**
     * Walk a list of rules, into the rules grouped inside them and the sheets they import.
     *
     * @param {CSSRuleList} rules - The rules.
     * @param {string} base - The address their URLs are relative to.
     * @returns {void}
     */
    const walk = (rules, base) => {
        for (const rule of rules ?? []) {
            if (faces.length >= MAX_FACES) return;
            if (isFontFace(rule)) {
                const face = readFace(rule.style, base);
                if (face && wanted.has(face.family.toLowerCase())) faces.push(face);
            } else if (rule?.styleSheet) {
                walk(readRules(rule.styleSheet), rule.styleSheet.href || base);
            } else if (rule?.cssRules) {
                walk(rule.cssRules, base);
            }
        }
    };
    for (const sheet of doc?.styleSheets ?? []) {
        walk(readRules(sheet), sheet.href || doc.baseURI);
    }
    return faces;
}

/**
 * Read a stylesheet's rules, which another origin's sheet does not give.
 *
 * @param {CSSStyleSheet} sheet - The sheet.
 * @returns {?CSSRuleList} The rules, or null.
 */
function readRules(sheet) {
    try {
        return sheet.cssRules;
    } catch {
        return null;
    }
}

/**
 * Read one `@font-face` rule.
 *
 * @param {CSSStyleDeclaration} style - The rule's descriptors.
 * @param {string} base - The address its URLs are relative to.
 * @returns {?object} The face; null without a family or a source.
 */
function readFace(style, base) {
    const family = style
        ?.getPropertyValue('font-family')
        ?.trim()
        .replace(/^(['"])(.*)\1$/, '$2');
    if (!family) return null;
    const src = style.getPropertyValue('src') ?? '';
    const sources = [];
    for (const match of src.matchAll(
        /url\(\s*(['"]?)([^'")]+)\1\s*\)(?:\s*format\(\s*(['"]?)([\w-]+)\3\s*\))?/g
    )) {
        try {
            const url = new URL(match[2], base);
            if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'data:') {
                sources.push({ url: url.href, format: match[4] ?? null });
            }
        } catch {
            // An address that does not resolve is not a source.
        }
    }
    if (sources.length === 0) return null;
    /**
     * Read a descriptor, when it holds nothing but what such a descriptor holds.
     *
     * @param {string} name - The descriptor.
     * @returns {?string} Its value, or null.
     */
    const descriptor = (name) => {
        const value = style.getPropertyValue(name)?.trim();
        return value && SAFE_DESCRIPTOR.test(value) ? value : null;
    };
    return {
        family,
        style: descriptor('font-style'),
        weight: descriptor('font-weight'),
        stretch: descriptor('font-stretch'),
        unicodeRange: descriptor('unicode-range'),
        sources,
    };
}

/** Weights a font file's name can say, most specific first: "semibold" before "bold". */
const WEIGHT_WORDS = [
    [/(extra|ultra)light/, '200'],
    [/(semi|demi)bold/, '600'],
    [/(extra|ultra)bold/, '800'],
    [/hairline|thin/, '100'],
    [/light/, '300'],
    [/medium/, '500'],
    [/black|heavy/, '900'],
    [/bold/, '700'],
];

/** The font file types a browser loads, and the format each is declared as. */
const FONT_FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/**
 * Find a family's font files among the files the page has loaded.
 *
 * Qlik Sense registers its theme fonts from script rather than from `@font-face` rules, so a stylesheet
 * names none of them; the files themselves are still among what the page has loaded, named after the
 * family and the weight, e.g. `SourceSansPro-SemiBold.woff`. A file is taken for a family when its name,
 * without spaces and punctuation, starts with the family's; its weight and style are read from the rest.
 *
 * @param {Array<string>} urls - The addresses the page has loaded.
 * @param {Array<string>} families - The families, as {@link fontFamilies} reads them.
 * @returns {Array<object>} A face for each file found, as {@link collectFontFaces} answers them.
 */
export function facesFromFiles(urls, families) {
    const wanted = families
        .map((family) => ({ family, compact: family.replace(/[^a-z0-9]/g, '') }))
        .filter((entry) => entry.compact.length >= 3);
    const faces = [];
    const seen = new Set();
    for (const url of urls) {
        const match = /\/([^/?#]+)\.(woff2|woff|ttf|otf)(?:[?#]|$)/i.exec(url);
        if (!match || seen.has(url)) continue;
        const name = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        const entry = wanted.find((each) => name.startsWith(each.compact));
        if (!entry) continue;
        seen.add(url);
        const rest = name.slice(entry.compact.length);
        const weight = WEIGHT_WORDS.find(([pattern]) => pattern.test(rest))?.[1] ?? '400';
        faces.push({
            family: entry.family,
            style: /italic|oblique/.test(rest) ? 'italic' : 'normal',
            weight,
            stretch: null,
            unicodeRange: null,
            sources: [{ url, format: FONT_FORMATS[match[2].toLowerCase()] }],
        });
    }
    return faces;
}

/**
 * List what the page has loaded, from the browser's own record of it.
 *
 * @param {Document} doc - The page.
 * @returns {Array<string>} The addresses; none where the browser keeps no record.
 */
function loadedFiles(doc) {
    try {
        return (doc?.defaultView?.performance?.getEntriesByType?.('resource') ?? []).map(
            (entry) => entry.name
        );
    } catch {
        return [];
    }
}

/**
 * Find the faces of the theme's font, wherever the page declared them.
 *
 * @param {Document} doc - The page.
 * @param {Array<string>} families - The families, as {@link fontFamilies} reads them.
 * @returns {Array<object>} The faces: from `@font-face` rules where a family has them, and otherwise
 *     from the font files the page has loaded; at most {@link MAX_FACES}.
 */
export function themeFontFaces(doc, families) {
    const declared = collectFontFaces(doc, families);
    const covered = new Set(declared.map((face) => face.family.toLowerCase()));
    const rest = families.filter((family) => !covered.has(family));
    const found = rest.length ? facesFromFiles(loadedFiles(doc), rest) : [];
    return [...declared, ...found].slice(0, MAX_FACES);
}

/**
 * Pick the source a face is best taken from: woff2 when there is one.
 *
 * @param {object} face - The face.
 * @returns {object} The source.
 */
function bestSource(face) {
    return face.sources.find((source) => source.format === 'woff2') ?? face.sources[0];
}

/**
 * Write `@font-face` rules for some faces.
 *
 * @param {Array<object>} faces - From {@link collectFontFaces}.
 * @param {object} [options] - Options.
 * @param {boolean} [options.inline] - Whether to put each font in the rule as a data URL, for an image.
 * @param {Function} [options.fetchImpl] - Fetches a URL.
 * @returns {Promise<string>} The rules; a face that could not be fetched is left out.
 */
export async function fontFaceCss(faces, { inline = false, fetchImpl = globalThis.fetch } = {}) {
    const rules = [];
    let bytes = 0;
    for (const face of faces) {
        const source = bestSource(face);
        let url = source.url;
        if (inline && !url.startsWith('data:')) {
            const blob = await fetchBlob(url, { fetchImpl, maxBytes: MAX_FONT_BYTES - bytes });
            if (!blob) continue;
            bytes += blob.size;
            url = await blobToDataUrl(blob);
            if (!url) continue;
        }
        const lines = [
            `font-family: ${cssString(face.family)}`,
            `src: url(${cssString(url)})${source.format ? ` format(${cssString(source.format)})` : ''}`,
        ];
        if (face.style) lines.push(`font-style: ${face.style}`);
        if (face.weight) lines.push(`font-weight: ${face.weight}`);
        if (face.stretch) lines.push(`font-stretch: ${face.stretch}`);
        if (face.unicodeRange) lines.push(`unicode-range: ${face.unicodeRange}`);
        rules.push(`@font-face { ${lines.join('; ')}; }`);
    }
    return rules.join('\n');
}

/**
 * Fetch a URL as a blob, within a time and a size.
 *
 * @param {string} url - The address.
 * @param {object} options - Options.
 * @param {Function} options.fetchImpl - Fetches a URL.
 * @param {number} options.maxBytes - The largest answer taken.
 * @param {?RegExp} [options.type] - The content type the answer must have.
 * @returns {Promise<?Blob>} The answer; null when it failed, took too long, was too big or of another type.
 */
async function fetchBlob(url, { fetchImpl, maxBytes, type = null }) {
    if (typeof fetchImpl !== 'function' || maxBytes <= 0) return null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), FETCH_MS);
    try {
        const response = await fetchImpl(url, {
            mode: 'cors',
            credentials: 'same-origin',
            referrerPolicy: 'no-referrer',
            signal: controller?.signal,
        });
        if (!response?.ok) return null;
        const blob = await response.blob();
        if (blob.size > maxBytes) return null;
        if (type && !type.test(blob.type)) return null;
        return blob;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Read a blob as a data URL.
 *
 * @param {Blob} blob - The blob.
 * @returns {Promise<?string>} The data URL, or null when it could not be read.
 */
export function blobToDataUrl(blob) {
    return new Promise((resolve) => {
        try {
            const reader = new FileReader();
            /**
             * Answer what was read.
             *
             * @returns {void}
             */
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
            /**
             * Answer that nothing could be read.
             *
             * @returns {void}
             */
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        } catch {
            resolve(null);
        }
    });
}

/**
 * List the avatars an export shows.
 *
 * @param {object} model - The export model.
 * @returns {Array<string>} Each picture's URL once.
 */
export function avatarUrls(model) {
    if (!model?.avatars) return [];
    const urls = new Set();
    for (const row of model.rows) {
        for (const cell of row.cells ?? []) {
            const url = cell?.showAuthor ? cell.message.author?.avatarUrl : null;
            if (url) urls.add(url);
        }
    }
    return [...urls];
}

/**
 * Fetch avatars and inline them.
 *
 * @param {Array<string>} urls - The pictures.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - Fetches a URL.
 * @returns {Promise<Map<string, ?string>>} Each URL's data URL, or null where it could not be had.
 */
export async function inlineAvatars(urls, { fetchImpl = globalThis.fetch } = {}) {
    const out = new Map();
    const fetched = urls.slice(0, MAX_AVATARS);
    const results = await Promise.all(
        fetched.map(async (url) => {
            if (url.startsWith('data:')) return url;
            const blob = await fetchBlob(url, {
                fetchImpl,
                maxBytes: MAX_AVATAR_BYTES,
                type: /^image\//,
            });
            return blob ? blobToDataUrl(blob) : null;
        })
    );
    fetched.forEach((url, index) => out.set(url, results[index]));
    for (const url of urls.slice(MAX_AVATARS)) out.set(url, null);
    return out;
}
