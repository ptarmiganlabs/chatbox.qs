/**
 * Participant side resolution for the two-sided layout.
 *
 * Participant colours live in `src/theme/palette.js`, shared with highlight
 * categories, so both key off `qElemNumber` the same way.
 */

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

    // The whole-cube rule the participant model has always had: with exactly two
    // people in the cube, Own — or else whoever wrote last — goes right. A
    // one-party thread whose author has no two-party conversation to take a side
    // from takes this one instead; without it, two people who never share a
    // thread both sat left, where they always had two sides. From → To pairs
    // keep their own rules.
    const people = [...lastSent.keys()];
    let cubeRight = null;
    if (scope !== 'pairs' && people.length === 2) {
        const [a, b] = people;
        cubeRight = people.find(isOwn) ?? (lastSent.get(a) >= lastSent.get(b) ? a : b);
    }

    // Pass 5: each message.
    return list.map((message, i) => {
        const author = message.authorKey;
        if (!isReal(author)) return 'left';

        const conversation = conversationOf[i];
        if (conversation) {
            if (conversation.right !== null)
                return conversation.right === author ? 'right' : 'left';
            if (conversation.parties.size === 1) {
                if (rightEverywhere.has(author))
                    return rightEverywhere.get(author) ? 'right' : 'left';
                return author === cubeRight ? 'right' : 'left';
            }
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
