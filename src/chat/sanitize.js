/**
 * Validation for values that arrive from the Qlik data model.
 *
 * Everything here treats its input as untrusted. Message bodies and metadata
 * routinely originate in email, Slack or ticketing exports, and an extension
 * runs inside the authenticated user's session on the hub's own origin — so a
 * bad URL scheme reaching an href is a real vector, not a theoretical one.
 */

/** What the engine puts in qText when a value is null. */
export const NULL_SENTINEL = '-';

/** URL schemes permitted for media and avatars. */
const ALLOWED_SCHEMES = new Set(['https:', 'data:']);

/** Same-origin path prefixes Qlik serves content from. */
const ALLOWED_PREFIXES = ['/content/', '/appcontent/'];

/**
 * Validate a URL or content-library path for use in an img/video/href.
 *
 * Accepts https:, data:image/, and Qlik's own same-origin content paths.
 * Rejects everything else — notably javascript:, vbscript: and data:text/html.
 *
 * Relative Qlik paths are returned unchanged so they resolve against the
 * document base, which is what makes them work under a prefixed virtual proxy.
 *
 * @param {*} value - The candidate URL or path.
 * @returns {?string} The URL when safe, or null when it must not be used.
 */
export function safeUrl(value) {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    // The engine's null-display sentinel. Without this it resolves as a relative
    // URL against the document and yields <img src="-">, which requests the hub
    // page and suppresses the initials fallback.
    if (raw === NULL_SENTINEL) return null;

    // Same-origin Qlik content. Keep relative so a virtual-proxy prefix applies.
    if (ALLOWED_PREFIXES.some((p) => raw.startsWith(p))) return raw;

    let parsed;
    try {
        parsed = new URL(raw, window?.location?.href ?? 'https://localhost/');
    } catch {
        return null;
    }

    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return null;

    // data: is only allowed for images — data:text/html is a script vector.
    if (parsed.protocol === 'data:' && !raw.toLowerCase().startsWith('data:image/')) return null;

    return raw;
}

/**
 * Parse a colour from an attribute expression.
 *
 * Qlik colour expressions return either a CSS string (`'#ff0000'`, `'rgb(…)'`)
 * or a packed ARGB integer, depending on how the author wrote them. Both are
 * normalised to a hex string here.
 *
 * @param {?object} value - An NxSimpleValue ({ qText, qNum }), or null.
 * @returns {?string} A hex colour, or null when absent or unparseable.
 */
export function safeColor(value) {
    if (!value) return null;

    const text = typeof value.qText === 'string' ? value.qText.trim() : '';
    if (text && text !== '-') {
        if (/^#[0-9a-f]{3,8}$/i.test(text)) return text;
        if (/^rgba?\(\s*[\d.\s,%/]+\)$/i.test(text)) return text;
    }

    const num = value.qNum;
    if (typeof num === 'number' && Number.isFinite(num)) return argbToHex(num);

    return null;
}

/**
 * Convert a packed ARGB integer to a hex colour string.
 *
 * @param {number} argb - The packed integer, as returned by Qlik colour functions.
 * @returns {string} A `#rrggbb` colour.
 */
export function argbToHex(argb) {
    const v = argb >>> 0;
    const r = (v >> 16) & 0xff;
    const g = (v >> 8) & 0xff;
    const b = v & 0xff;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Parse the media attribute expression into structured references.
 *
 * The value is a reference — a content-library path, a URL, or an opaque id
 * resolved later — never a pre-signed URL. Signed URLs minted at reload time
 * expire long before a user scrolls to the bubble that needs them.
 *
 * Accepts a pipe-separated list, each entry optionally `kind:ref` or
 * `kind:ref:caption`.
 *
 * @param {?string} raw - The attribute-expression text.
 * @returns {object[]} Media references; empty when there are none.
 */
export function parseMediaRefs(raw) {
    if (typeof raw !== 'string') return [];
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '-') return [];

    return trimmed
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const match = /^(image|video|audio|file):(.*)$/i.exec(entry);
            const kind = match ? match[1].toLowerCase() : 'image';
            const rest = match ? match[2] : entry;
            const sep = rest.lastIndexOf('::');
            const ref = sep === -1 ? rest : rest.slice(0, sep);
            const caption = sep === -1 ? null : rest.slice(sep + 2) || null;
            return { ref: ref.trim(), kind, caption, mime: null, sizeBytes: null };
        })
        .filter((m) => m.ref);
}

/**
 * Read an attribute-expression value as optional text.
 *
 * Attribute expressions are seeded empty and are frequently null for some rows,
 * and in both cases the engine returns its '-' sentinel rather than an empty
 * string. Passing that straight through renders a literal "-" as a timestamp,
 * a badge or a message kind under every bubble.
 *
 * @param {?object} value - An NxSimpleValue ({ qText, qNum }), or null.
 * @returns {?string} The text, or null when absent or a sentinel.
 */
export function attrText(value) {
    const text = typeof value?.qText === 'string' ? value.qText.trim() : '';
    if (!text || text === NULL_SENTINEL) return null;
    return text;
}

/**
 * Convert a Qlik numeric timestamp to epoch milliseconds.
 *
 * Qlik dates are DAY SERIALS — days since 1899-12-30, so a 2026 timestamp is
 * roughly 46273.34, not 1.79e12. The property panel documents
 * `Num(Min([SentAt]))` as the expression to use, and that returns a serial.
 * Comparing serials against a millisecond threshold silently disables every
 * time-based behaviour rather than erroring.
 *
 * A value already in epoch milliseconds is passed through: no plausible Qlik
 * day serial reaches 1e11 (that would be year 275,000), so the two ranges
 * cannot be confused.
 *
 * @param {?number} value - The numeric value from the timestamp attribute expression.
 * @returns {?number} Epoch milliseconds, or null when there is no usable value.
 */
export function qlikTimeToEpochMs(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (Math.abs(value) >= 1e11) return value;
    // 25569 is the Qlik/Excel day serial for 1970-01-01.
    //
    // Rounded, because the multiplication does not land on a whole millisecond:
    // a serial for midnight came back as ...999.9995, which Date truncates to
    // one millisecond BEFORE midnight — putting the message under the previous
    // day's separator. Sub-millisecond error is invisible until something groups
    // by day, and then it is wrong only for messages exactly on the boundary.
    return Math.round((value - 25569) * 86400000);
}
