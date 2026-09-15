/**
 * Participant identity, colour and side resolution.
 *
 * Colour keys off `qElemNumber` — the field value's symbol rank in the Qlik
 * data model — rather than order of appearance. That rank is stable across
 * selections and across paging, so a participant keeps the same colour when
 * the user scrolls or filters. Keying off "index first seen" would recolour
 * people mid-scroll, which looks like a rendering bug and is very hard to
 * attribute once reported.
 */

/** Fallback palette, used when the Qlik theme exposes no data palette. */
const FALLBACK_PALETTE = [
    '#4477aa',
    '#ee6677',
    '#228833',
    '#ccbb44',
    '#66ccee',
    '#aa3377',
    '#bbbbbb',
    '#ee8866',
];

/** Colour for synthetic rows (Total, Null, Others) which have no real identity. */
const UNKNOWN_COLOR = '#9e9e9e';

/**
 * Pick a stable colour for a participant.
 *
 * @param {number} elem - The participant's qElemNumber.
 * @param {string[]} palette - Colours to choose from.
 * @returns {string} A colour from the palette, or the unknown-participant grey.
 */
export function colorForElem(elem, palette) {
    if (!Array.isArray(palette) || palette.length === 0) palette = FALLBACK_PALETTE;
    if (typeof elem !== 'number' || elem < 0) return UNKNOWN_COLOR;
    // Modulo twice so a negative input can never yield a negative index.
    const index = ((elem % palette.length) + palette.length) % palette.length;
    return palette[index];
}

/**
 * Extract a CATEGORICAL colour palette from a Qlik theme.
 *
 * `getDataColorPalettes()` returns a mixed list: sequential and single-colour
 * palettes sit alongside categorical ones, and the first entry is not reliably
 * categorical. Taking `[0]` blindly can yield a one-colour palette, which makes
 * every participant the same colour — the modulo always lands on index 0.
 *
 * So pick the richest flat colour array on offer, and only accept it if it has
 * enough distinct colours to actually distinguish participants.
 *
 * @param {object} [theme] - The stardust theme object.
 * @returns {string[]} Palette colours, falling back to a built-in set.
 */
export function paletteFromTheme(theme) {
    try {
        const palettes = theme?.getDataColorPalettes?.();
        if (!Array.isArray(palettes)) return FALLBACK_PALETTE;

        let best = [];
        for (const palette of palettes) {
            const raw = palette?.colors;
            if (!Array.isArray(raw) || raw.length === 0) continue;
            // A scale palette nests its colours one level deeper.
            const colors = Array.isArray(raw[0]) ? raw[raw.length - 1] : raw;
            if (!Array.isArray(colors)) continue;
            const flat = colors.filter((c) => typeof c === 'string' && c);
            if (flat.length > best.length) best = flat;
        }

        // Below four colours it is not a categorical palette worth using.
        if (best.length >= 4) return best;
    } catch {
        // A theme that throws is not worth failing a render over.
    }
    return FALLBACK_PALETTE;
}

/** Separator for pair keys. It cannot occur in engine text. */
const SEP = String.fromCharCode(0);

/**
 * Key an unordered pair of people.
 *
 * @param {string} a - One person.
 * @param {string} b - The other.
 * @returns {string} The same key whichever way round the pair is given.
 */
function pairKey(a, b) {
    return [a, b].sort().join(SEP);
}

/**
 * The real people a message was sent to, other than its sender.
 *
 * Unknown recipients (null, Others) are never people; a sender copying
 * themselves is not a counterpart.
 *
 * @param {object} message - A bubble.
 * @returns {string[]} Recipient keys.
 */
function realRecipients(message) {
    return (message.recipients ?? [])
        .filter((r) => !r.unknown && r.key !== message.authorKey)
        .map((r) => r.key);
}

/**
 * Decide which side every message sits on, one conversation at a time.
 *
 * A conversation is a thread (scope `threads`), the whole cube (scope
 * `single`), or the unordered From/To pair (scope `pairs`, which ignores
 * threads so two people keep their sides everywhere). Within one:
 *
 *   1. Own participant, matched case-insensitively, goes right — at any number
 *      of parties — and everyone else goes left.
 *   2. Otherwise only a two-party conversation has a right side. It goes to the
 *      party with more distinct counterparts across the loaded cube, so a hub —
 *      an agent, an inbox owner — stays on one side through all of them.
 *   3. A tie goes to whichever party sent the most recent message ANYWHERE in the
 *      loaded cube. A tie-break per conversation would swap two people between
 *      threads; this one keeps every two-person cube exactly as it always was.
 *   4. Three or more parties with no Own participant among them: all left.
 *
 * A group message (several real recipients) goes right only if its sender is
 * the right party in every pair it belongs to. A one-party message — a monologue
 * thread, a note to self, an unknown recipient — goes right if its sender is Own,
 * and otherwise only if the sender is right in every two-party conversation they
 * take part in. Synthetic authors are never parties and always sit left.
 *
 * The per-message side attribute is not considered here: the caller applies it
 * afterwards, because it outranks everything.
 *
 * @param {object} options - Resolution inputs.
 * @param {object[]} options.messages - Bubbles in cube order, before any reversal.
 * @param {string} options.scope - 'pairs' | 'threads' | 'single'.
 * @param {?string} [options.ownParticipant] - Configured "me" value, if any.
 * @param {Function} options.isReal - (authorKey) => whether that author is a person.
 * @returns {string[]} 'left' or 'right' for each message, by index.
 */
export function resolveSides({ messages, scope, ownParticipant, isReal }) {
    const list = Array.isArray(messages) ? messages : [];
    const own = typeof ownParticipant === 'string' ? ownParticipant.trim().toLowerCase() : '';

    /**
     * Report whether a person is the configured Own participant.
     *
     * @param {string} key - A person.
     * @returns {boolean} True when it matches, ignoring case.
     */
    const isOwn = (key) => Boolean(own) && typeof key === 'string' && key.toLowerCase() === own;

    // Pass 1: conversation membership, and each author's most recent message.
    const conversations = new Map();
    const conversationOf = new Array(list.length).fill(null);
    const lastSent = new Map();

    list.forEach((message, i) => {
        if (!isReal(message.authorKey)) return;
        lastSent.set(message.authorKey, i);

        let key;
        const parties = [message.authorKey];
        if (scope === 'pairs') {
            const others = realRecipients(message);
            if (others.length !== 1) return;
            parties.push(others[0]);
            key = pairKey(message.authorKey, others[0]);
        } else {
            key = scope === 'threads' ? (message.threadId ?? null) : '';
        }

        let conversation = conversations.get(key);
        if (!conversation) {
            conversation = { parties: new Set(), right: null };
            conversations.set(key, conversation);
        }
        for (const party of parties) conversation.parties.add(party);
        conversationOf[i] = conversation;
    });

    // Pass 2: distinct counterparts, over two-party conversations only.
    const counterparts = new Map();
    for (const { parties } of conversations.values()) {
        if (parties.size !== 2) continue;
        const [a, b] = [...parties];
        if (!counterparts.has(a)) counterparts.set(a, new Set());
        if (!counterparts.has(b)) counterparts.set(b, new Set());
        counterparts.get(a).add(b);
        counterparts.get(b).add(a);
    }

    // Pass 3: the right party of each conversation.
    for (const conversation of conversations.values()) {
        const parties = [...conversation.parties];
        const ownParty = parties.find(isOwn);
        if (ownParty !== undefined) {
            conversation.right = ownParty;
        } else if (parties.length === 2) {
            const [a, b] = parties;
            const countA = counterparts.get(a)?.size ?? 0;
            const countB = counterparts.get(b)?.size ?? 0;
            if (countA !== countB) conversation.right = countA > countB ? a : b;
            else conversation.right = (lastSent.get(a) ?? -1) >= (lastSent.get(b) ?? -1) ? a : b;
        }
    }

    // Pass 4: whether each person is right in every two-party conversation they are in.
    const rightEverywhere = new Map();
    for (const conversation of conversations.values()) {
        if (conversation.parties.size !== 2) continue;
        for (const party of conversation.parties) {
            const right = conversation.right === party;
            rightEverywhere.set(party, (rightEverywhere.get(party) ?? true) && right);
        }
    }

    // Pass 5: each message.
    return list.map((message, i) => {
        const author = message.authorKey;
        if (!isReal(author)) return 'left';

        const conversation = conversationOf[i];
        if (conversation) {
            if (conversation.right !== null)
                return conversation.right === author ? 'right' : 'left';
            if (conversation.parties.size === 1)
                return rightEverywhere.get(author) ? 'right' : 'left';
            return 'left';
        }

        // A group or one-party message in the pairs scope.
        if (isOwn(author)) return 'right';
        const known = realRecipients(message)
            .map((recipient) => conversations.get(pairKey(author, recipient)))
            .filter(Boolean);
        if (known.length) return known.every((c) => c.right === author) ? 'right' : 'left';
        return rightEverywhere.get(author) ? 'right' : 'left';
    });
}

export { FALLBACK_PALETTE, UNKNOWN_COLOR };
