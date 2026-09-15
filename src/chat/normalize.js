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
 *
 * It runs in three steps: every row is read into a flat record, records that
 * belong to one message are collapsed into one bubble (see collapse.js), and
 * participants and sides are resolved over the result.
 */
import { ATTR_IDS, attrValue, buildAttrMap } from '../qix/attr-map';
import {
    ROLES,
    conversationModelOf,
    kpiColumns,
    resolveRoles,
    unassignedDimensions,
} from '../qix/column-map';
import * as cell from '../qix/read-cell';
import {
    NULL_SENTINEL,
    attrText,
    parseMediaRefs,
    qlikTimeToEpochMs,
    safeColor,
    safeUrl,
} from './sanitize';
import { assignBubbleKeys, collapseRecords, isPhantomRecord } from './collapse';
import { colorForElem, paletteFromTheme, resolveSides } from './participants';

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
        recipientElems: new Map(),
        meta: {
            total: 0,
            loaded: 0,
            rowsLoaded: 0,
            phantomRows: 0,
            truncated: false,
            mergedCount: 0,
            conflictCount: 0,
            ...meta,
        },
        diagnostics,
    };
}

/**
 * Read a recipient cell.
 *
 * A null recipient is a message nobody was named as receiving, not a person
 * called '-'; Others keeps its own text. Both are marked unknown, so they are
 * shown but never paired, counted or selected.
 *
 * @param {object} [recipientCell] - The recipient NxCell.
 * @returns {object} The recipient: { key, label, elem, unknown }.
 */
function readRecipient(recipientCell) {
    const elem = cell.elem(recipientCell);
    if (elem >= 0) {
        const text = cell.text(recipientCell);
        return { key: text, label: text || '(empty)', elem, unknown: false };
    }
    return {
        key: null,
        label: cell.optionalText(recipientCell) ?? '(no recipient)',
        elem,
        unknown: true,
    };
}

/**
 * Read one qMatrix row into a flat record.
 *
 * @param {Array} row - The qMatrix row.
 * @param {number} i - The row's index within the loaded rows.
 * @param {object} ctx - Resolved columns, attribute map and settings.
 * @returns {object} The record — a message as it looks before collapsing.
 */
function readRecord(row, i, ctx) {
    const idCell = row[ctx.idCol.col];
    const authorCell = row[ctx.authorCol.col];
    const threadCell = ctx.threadCol ? row[ctx.threadCol.col] : undefined;

    const dupCount = ctx.dupCol ? cell.num(row[ctx.dupCol.col]) : null;

    // Only() returns NULL when the value is not unique within the group, and
    // the engine renders that as its '-' sentinel. On a merged bubble that is
    // exactly what happens, so the raw sentinel must not reach the bubble as
    // if it were the message. The renderer explains the merge instead.
    const rawBody = cell.text(row[ctx.textCol.col]);

    // Qlik returns a DAY SERIAL here, not epoch milliseconds — see
    // qlikTimeToEpochMs. Storing the raw value silently disables every
    // time-based behaviour downstream.
    const tsValue = attrValue(idCell, ctx.attrMap, ATTR_IDS.TS);

    const mediaRaw = attrText(attrValue(idCell, ctx.attrMap, ATTR_IDS.MEDIA));

    return {
        id: cell.text(idCell) || `row-${i}`,
        elem: cell.elem(idCell),
        body: rawBody === NULL_SENTINEL ? '' : rawBody,
        // The raw probe value, kept so a phantom row (probe 0) can be told apart.
        probe: dupCount,
        rowCount: typeof dupCount === 'number' ? dupCount : 1,
        merged: typeof dupCount === 'number' && dupCount > 1,
        bodyFormat: ctx.bodyFormat,
        authorKey: cell.text(authorCell),
        authorElem: cell.elem(authorCell),
        avatar: safeUrl(attrValue(idCell, ctx.attrMap, ATTR_IDS.AVATAR)?.qText),
        ts: qlikTimeToEpochMs(tsValue?.qNum),
        tsText: attrText(attrValue(idCell, ctx.attrMap, ATTR_IDS.TS_TEXT)),
        threadId: threadCell ? cell.optionalText(threadCell) : null,
        threadElem: threadCell ? cell.elem(threadCell) : -1,
        // One per row; collapsing a message's rows gathers them into a list.
        // Null when there is no recipient role, so the view can tell the models apart.
        recipients: ctx.recipientCol ? [readRecipient(row[ctx.recipientCol.col])] : null,
        kind: attrText(attrValue(idCell, ctx.attrMap, ATTR_IDS.KIND)),
        media: parseMediaRefs(mediaRaw)
            .map((m) => ({ ...m, ref: m.ref }))
            .filter((m) => m.ref),
        accent: safeColor(attrValue(idCell, ctx.attrMap, ATTR_IDS.ACCENT)),
        badge: attrText(attrValue(idCell, ctx.attrMap, ATTR_IDS.BADGE)),
        sideHint: attrValue(idCell, ctx.attrMap, ATTR_IDS.SIDE)?.qNum ?? null,
        kpis: ctx.kpiCols.map((column) => ({
            key: column.cId || `msr-${column.col}`,
            label: column.label,
            text: cell.text(row[column.col]),
            num: cell.num(row[column.col]),
        })),
        state: cell.state(authorCell),
        rowIdx: cell.absoluteRow(ctx.area, i),
    };
}

/**
 * Register every author seen in the records, in first-seen order.
 *
 * Colour keys off the author's element number, never off order of appearance;
 * the avatar is the first valid one any of the author's rows carries.
 *
 * @param {object[]} records - Records in cube order.
 * @param {string[]} palette - Colours to choose from.
 * @returns {Map<string, object>} Participants keyed by author text.
 */
function registerParticipants(records, palette) {
    const participants = new Map();
    for (const record of records) {
        let participant = participants.get(record.authorKey);
        if (!participant) {
            participant = {
                key: record.authorKey,
                elem: record.authorElem,
                label: record.authorKey || '(unknown)',
                color: colorForElem(record.authorElem, palette),
                avatarUrl: null,
                side: 'left',
                unknown: record.authorElem < 0,
            };
            participants.set(record.authorKey, participant);
        }
        if (record.avatar && !participant.avatarUrl) participant.avatarUrl = record.avatar;
    }
    return participants;
}

/**
 * Map each recipient to their element number in the RECIPIENT field.
 *
 * Kept apart from the participants' element numbers on purpose: those belong to
 * the author field. Selecting a person in the To field with their From-field
 * number would select somebody else entirely.
 *
 * @param {object[]} records - Records in cube order.
 * @returns {Map<string, number>} Recipient text → To-field element number.
 */
function collectRecipientElems(records) {
    const elems = new Map();
    for (const record of records) {
        for (const recipient of record.recipients ?? []) {
            if (!recipient.unknown && !elems.has(recipient.key)) {
                elems.set(recipient.key, recipient.elem);
            }
        }
    }
    return elems;
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

    const { columns, byRole, missing } = resolveRoles(layout, props.roles, {
        conversationModel: conversationModelOf(props),
    });
    if (missing.length) {
        diagnostics.push({
            severity: SEVERITY.ERROR,
            code: 'missing-roles',
            message: `Not configured: missing ${missing.join(', ')}.`,
        });
        return emptyConversation(diagnostics, { total: hc.qSize?.qcy ?? 0 });
    }

    const ctx = {
        idCol: byRole[ROLES.MESSAGE_ID],
        authorCol: byRole[ROLES.AUTHOR],
        textCol: byRole[ROLES.TEXT],
        threadCol: byRole[ROLES.THREAD],
        dupCol: byRole[ROLES.DUP_CHECK],
        recipientCol: byRole[ROLES.RECIPIENT],
        // Attribute expressions ride on the message-id dimension. Build the
        // id -> index map once per layout; never index into qValues by a literal.
        attrMap: buildAttrMap(byRole[ROLES.MESSAGE_ID].info),
        // Measures beyond the text and the integrity probe are per-message KPIs.
        kpiCols: kpiColumns(columns, byRole),
        bodyFormat: props.bodyFormat === 'markdown' ? 'markdown' : 'text',
        area,
    };

    const records = [];
    (Array.isArray(rows) ? rows : []).forEach((row, i) => {
        if (Array.isArray(row)) records.push(readRecord(row, i, ctx));
    });

    // Phantom rows go before anything else looks at the records: a phantom's
    // person must never be registered as a participant.
    const kept = records.filter((record) => !isPhantomRecord(record));
    const phantomRows = records.length - kept.length;

    const participants = registerParticipants(kept, paletteFromTheme(theme));
    const recipientElems = collectRecipientElems(kept);
    const { messages, conflictCount, lastBubble } = collapseRecords(kept);
    assignBubbleKeys(messages);
    const mergedCount = messages.filter((m) => m.merged).length;

    // Side resolution needs the whole set, so it runs after collapsing — and
    // before any newest-first reversal, since "most recent" means cube order.
    // Synthetic rows (Total, Null, Others) are not people. Counting them as
    // parties turns a genuine two-party chat into a three-party one.
    /**
     * Report whether an author is a person rather than a synthetic row.
     *
     * @param {string} key - An author key.
     * @returns {boolean} True for a registered, non-synthetic participant.
     */
    const isReal = (key) => participants.has(key) && !participants.get(key).unknown;

    const sides =
        props.layoutMode === 'sided'
            ? resolveSides({
                  messages,
                  scope: ctx.recipientCol ? 'pairs' : ctx.threadCol ? 'threads' : 'single',
                  ownParticipant: props.ownParticipant,
                  isReal,
              })
            : messages.map(() => 'left');

    // A participant's own side only means something when all their messages agree.
    const allRight = new Map();
    messages.forEach((message, i) => {
        const soFar = allRight.get(message.authorKey) ?? true;
        allRight.set(message.authorKey, soFar && sides[i] === 'right');
    });
    for (const [key, participant] of participants) {
        participant.side = allRight.get(key) ? 'right' : 'left';
    }

    messages.forEach((message, i) => {
        // A per-message `side` attribute expression outranks everything else.
        if (message.sideHint === 1) message.side = 'right';
        else if (message.sideHint === 0) message.side = 'left';
        else message.side = sides[i];
        message.author = participants.get(message.authorKey);
    });

    if (mergedCount > 0) {
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'merged-bubbles',
            message:
                `${mergedCount} bubble(s) combine more than one message. The Message ID ` +
                'dimension is not unique — separate messages are being merged.',
        });
    }

    if (conflictCount > 0) {
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'ambiguous-message-id',
            message:
                `${conflictCount} message(s) share a Message ID with a different message from ` +
                'the same sender. Make the id unique across conversations, not just within one.',
        });
    }

    const nullIds = messages.filter((m) => m.elem < 0).length;
    if (nullIds > 0) {
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'null-message-id',
            message:
                `${nullIds} message(s) have no Message ID, so they cannot be selected or told ` +
                'apart. Every message needs an id.',
        });
    }

    const unassigned = unassignedDimensions(columns, byRole);
    if (unassigned.length) {
        const names = unassigned.map((c) => c.label || `Dimension ${c.col + 1}`).join(', ');
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'unassigned-dimension',
            message:
                `Not used by the conversation: ${names}. An unused dimension still splits ` +
                'messages into extra rows — remove it.',
        });
    }

    // Truncation is a question about ROWS: the engine counts rows, and once rows
    // are collapsed a fully loaded cube holds fewer bubbles than qcy. Comparing
    // bubbles with qcy would report messages missing that are all on screen.
    // Phantom rows are loaded rows too — the engine counts them in qcy.
    const rowsLoaded = records.length;
    const total = hc.qSize?.qcy ?? rowsLoaded;
    const truncated = total > rowsLoaded;
    if (truncated) {
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'truncated',
            message:
                rowsLoaded === messages.length
                    ? `Showing ${messages.length} of ${total} messages. Filter to see the rest.`
                    : `Showing ${messages.length} messages from ${rowsLoaded} of ${total} rows. ` +
                      'Filter to see the rest.',
        });
    }

    // Phantoms only cost something when the cap cut the load short: then they
    // used up budget that real messages needed.
    if (truncated && phantomRows > 0) {
        diagnostics.push({
            severity: SEVERITY.WARNING,
            code: 'phantom-rows',
            message:
                `${phantomRows} loaded row(s) were not messages — a table linked to a dimension ` +
                'adds a row for each value that has none — and they count against the limit.',
        });
    }

    // The cap can fall part-way through a group message's rows, so the last
    // bubble loaded may be missing recipients the engine would still return.
    if (truncated && lastBubble?.recipients) lastBubble.recipientsPartial = true;

    if (props.order === 'newest') messages.reverse();

    return {
        messages,
        participants,
        recipientElems,
        meta: {
            total,
            loaded: messages.length,
            rowsLoaded,
            phantomRows,
            truncated,
            mergedCount,
            conflictCount,
        },
        diagnostics,
    };
}

export default normalize;
