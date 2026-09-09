/**
 * The normalization layer: raw engine output in, domain model out.
 *
 * This is the single boundary between Qlik's data shapes and the rest of the
 * extension. Nothing above it sees qMatrix, qAttrExps, qText, qElemNumber or
 * cId. That matters for three reasons:
 *
 *  - It is one choke point for untrusted data, so URL and colour validation
 *    happen in one testable place rather than scattered through components.
 *  - It is a pure function, so every failure mode the engine can produce
 *    (positional attribute drift, "NaN" strings, '-' sentinels, negative
 *    element numbers, missing columns) is unit-testable with no engine, no DOM
 *    and no React.
 *  - Problems are collected as diagnostics, never thrown. A merged-bubble
 *    warning renders a badge beside the conversation; it never blanks the chart.
 */
import { ATTR_IDS, attrValue, buildAttrMap } from '../qix/attr-map';
import { ROLES, resolveRoles } from '../qix/column-map';
import * as cell from '../qix/read-cell';
import { attrText, parseMediaRefs, qlikTimeToEpochMs, safeColor, safeUrl } from './sanitize';
import { colorForElem, paletteFromTheme, resolveRightSide } from './participants';

/** Severity levels for collected diagnostics. */
export const SEVERITY = { WARNING: 'warning', ERROR: 'error' };

/**
 * Build an empty conversation, used for the not-configured and empty states.
 *
 * @param {object[]} [diagnostics] - Diagnostics to attach.
 * @param {object} [meta] - Metadata overrides.
 * @returns {object} An empty Conversation.
 */
function emptyConversation(diagnostics = [], meta = {}) {
    return {
        messages: [],
        participants: new Map(),
        meta: { total: 0, loaded: 0, truncated: false, mergedCount: 0, ...meta },
        diagnostics,
    };
}

/**
 * Turn hypercube rows into a Conversation.
 *
 * @param {object} options - Inputs.
 * @param {object} options.layout - The object layout (from useStaleLayout).
 * @param {Array[]} options.rows - qMatrix rows, already paged and concatenated.
 * @param {object} [options.props] - The `chatbox` property bag.
 * @param {object} [options.theme] - The stardust theme, for the colour palette.
 * @param {object} [options.area] - The qArea of the first page, for row offsets.
 * @returns {object} The normalized Conversation.
 */
export function normalize({ layout, rows, props = {}, theme, area }) {
    const diagnostics = [];
    const hc = layout?.qHyperCube;

    if (!hc) return emptyConversation(diagnostics);

    const { byRole, missing } = resolveRoles(layout, props.roles);
    if (missing.length) {
        diagnostics.push({
            severity: SEVERITY.ERROR,
            code: 'missing-roles',
            message: `Not configured: missing ${missing.join(', ')}.`,
        });
        return emptyConversation(diagnostics, { total: hc.qSize?.qcy ?? 0 });
    }

    const idCol = byRole[ROLES.MESSAGE_ID];
    const authorCol = byRole[ROLES.AUTHOR];
    const textCol = byRole[ROLES.TEXT];
    const threadCol = byRole[ROLES.THREAD];
    const dupCol = byRole[ROLES.DUP_CHECK];

    // Attribute expressions ride on the message-id dimension. Build the
    // id -> index map once per layout; never index into qValues by a literal.
    const attrMap = buildAttrMap(idCol.info);

    const palette = paletteFromTheme(theme);
    const participants = new Map();
    const authorOrder = [];
    const messages = [];
    let mergedCount = 0;

    const source = Array.isArray(rows) ? rows : [];

    source.forEach((row, i) => {
        if (!Array.isArray(row)) return;

        const idCell = row[idCol.col];
        const authorCell = row[authorCol.col];
        const textCell = row[textCol.col];

        const authorKey = cell.text(authorCell);
        const authorElem = cell.elem(authorCell);

        if (!participants.has(authorKey)) {
            authorOrder.push(authorKey);
            participants.set(authorKey, {
                key: authorKey,
                elem: authorElem,
                label: authorKey || '(unknown)',
                color: colorForElem(authorElem, palette),
                avatarUrl: null,
                side: 'left',
                unknown: authorElem < 0,
            });
        }

        const dupCount = dupCol ? cell.num(row[dupCol.col]) : null;
        const merged = typeof dupCount === 'number' && dupCount > 1;
        if (merged) mergedCount += 1;

        const avatar = safeUrl(attrValue(idCell, attrMap, ATTR_IDS.AVATAR)?.qText);
        if (avatar && !participants.get(authorKey).avatarUrl) {
            participants.get(authorKey).avatarUrl = avatar;
        }

        // Qlik returns a DAY SERIAL here, not epoch milliseconds — see
        // qlikTimeToEpochMs. Storing the raw value silently disables every
        // time-based behaviour downstream.
        const tsValue = attrValue(idCell, attrMap, ATTR_IDS.TS);
        const ts = qlikTimeToEpochMs(tsValue?.qNum);

        const mediaRaw = attrText(attrValue(idCell, attrMap, ATTR_IDS.MEDIA));
        const media = parseMediaRefs(mediaRaw)
            .map((m) => ({ ...m, ref: m.ref }))
            .filter((m) => m.ref);

        messages.push({
            id: cell.text(idCell) || `row-${i}`,
            elem: cell.elem(idCell),
            body: cell.text(textCell),
            bodyFormat: props.bodyFormat === 'markdown' ? 'markdown' : 'text',
            authorKey,
            ts,
            tsText: attrText(attrValue(idCell, attrMap, ATTR_IDS.TS_TEXT)),
            threadId: threadCol ? cell.optionalText(row[threadCol.col]) : null,
            kind: attrText(attrValue(idCell, attrMap, ATTR_IDS.KIND)),
            media,
            accent: safeColor(attrValue(idCell, attrMap, ATTR_IDS.ACCENT)),
            badge: attrText(attrValue(idCell, attrMap, ATTR_IDS.BADGE)),
            sideHint: attrValue(idCell, attrMap, ATTR_IDS.SIDE)?.qNum ?? null,
            kpis: [],
            state: cell.state(authorCell),
            rowIdx: cell.absoluteRow(area, i),
            merged,
        });
    });

    // Side resolution needs the whole set, so it runs after the row loop.
    // Synthetic rows (Total, Null, Others) are not people. Counting them as
    // participants turns a genuine two-party chat into a three-party one and
    // silently disables two-sided alignment.
    const realAuthorKeys = authorOrder.filter((key) => !participants.get(key).unknown);
    const lastReal = [...messages].reverse().find((m) => !participants.get(m.authorKey)?.unknown);

    // Two-sided alignment is opt-in and only meaningful for exactly two people.
    const sidedAllowed = props.layoutMode === 'sided' && realAuthorKeys.length === 2;
    const rightKeys = sidedAllowed
        ? resolveRightSide({
              authorKeys: realAuthorKeys,
              ownParticipant: props.ownParticipant,
              lastAuthorKey: lastReal ? lastReal.authorKey : null,
          })
        : new Set();
    for (const [key, participant] of participants) {
        participant.side = rightKeys.has(key) ? 'right' : 'left';
    }
    for (const message of messages) {
        // A per-message `side` attribute expression outranks the participant default.
        if (message.sideHint === 1) message.side = 'right';
        else if (message.sideHint === 0) message.side = 'left';
        else message.side = participants.get(message.authorKey)?.side ?? 'left';
        message.author = participants.get(message.authorKey);
    }

    if (mergedCount > 0) {
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'merged-bubbles',
            message:
                `${mergedCount} bubble(s) combine more than one message. The Message ID ` +
                'dimension is not unique — separate messages are being merged.',
        });
    }

    const total = hc.qSize?.qcy ?? messages.length;
    const truncated = total > messages.length;
    if (truncated) {
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'truncated',
            message: `Showing ${messages.length} of ${total} messages. Filter to see the rest.`,
        });
    }

    if (props.order === 'newest') messages.reverse();

    return {
        messages,
        participants,
        meta: { total, loaded: messages.length, truncated, mergedCount },
        diagnostics,
    };
}

export default normalize;
