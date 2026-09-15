import { describe, it, expect } from 'vitest';
import { resolveSides } from '../../src/chat/participants';

const person = (name) => ({ key: name, label: name, unknown: false });

/** A bubble: author, optional recipients, optional thread. */
const msg = (authorKey, { to, thread = null } = {}) => ({
    authorKey,
    recipients: to ? to.map(person) : null,
    threadId: thread,
});

const sides = (messages, { scope, own = '', synthetic = [] } = {}) =>
    resolveSides({
        messages,
        scope,
        ownParticipant: own,
        isReal: (key) => !synthetic.includes(key),
    });

describe('resolveSides — one conversation', () => {
    it('puts the most recent sender right when two people tie', () => {
        // Exactly today's rule for a two-person chat.
        expect(sides([msg('Ada'), msg('Bob')], { scope: 'single' })).toEqual(['left', 'right']);
    });

    it('puts Own participant right even when they are the only party', () => {
        expect(sides([msg('Ada'), msg('Ada')], { scope: 'single', own: 'ada' })).toEqual([
            'right',
            'right',
        ]);
    });

    it('puts Own participant right among three or more', () => {
        expect(sides([msg('Ada'), msg('Bob'), msg('Cy')], { scope: 'single', own: 'BOB' })).toEqual(
            ['left', 'right', 'left']
        );
    });

    it('keeps three or more people left when nobody is Own', () => {
        expect(sides([msg('Ada'), msg('Bob'), msg('Cy')], { scope: 'single' })).toEqual([
            'left',
            'left',
            'left',
        ]);
    });

    it('never counts a synthetic author as a party', () => {
        expect(
            sides([msg('Ada'), msg('Bob'), msg('')], { scope: 'single', synthetic: [''] })
        ).toEqual(['left', 'right', 'left']);
    });

    it('falls back to the automatic rule when Own is not a party', () => {
        expect(sides([msg('Ada'), msg('Bob')], { scope: 'single', own: 'Zed' })).toEqual([
            'left',
            'right',
        ]);
    });
});

describe('resolveSides — threads', () => {
    it('keeps two people on one side across threads with different last speakers — regression', () => {
        // Bob speaks last in T1, Ada last in T2 and last overall. A per-thread
        // tie-break would swap them between threads; today they never swap.
        const messages = [
            msg('Ada', { thread: 'T1' }),
            msg('Bob', { thread: 'T1' }),
            msg('Bob', { thread: 'T2' }),
            msg('Ada', { thread: 'T2' }),
        ];
        expect(sides(messages, { scope: 'threads' })).toEqual(['right', 'left', 'left', 'right']);
    });

    it('keeps a hub right in every thread, whoever spoke last', () => {
        const messages = ['C1', 'C2', 'C3'].flatMap((customer) => [
            msg('Agent', { thread: customer }),
            msg(customer, { thread: customer }),
        ]);
        expect(sides(messages, { scope: 'threads' })).toEqual([
            'right',
            'left',
            'right',
            'left',
            'right',
            'left',
        ]);
    });

    it('puts a monologue thread on the side its author has elsewhere', () => {
        const messages = [
            msg('Bob', { thread: 'T1' }),
            msg('Ada', { thread: 'T1' }),
            msg('Ada', { thread: 'notes' }),
        ];
        expect(sides(messages, { scope: 'threads' })).toEqual(['left', 'right', 'right']);
    });

    it('keeps a two-person cube two-sided when the two never share a thread — regression', () => {
        // Every thread holds one person, so nobody has a two-party conversation.
        // The two-person cube rule still applies, as it always did: whoever wrote
        // last goes right.
        const messages = [msg('Ada', { thread: 'T1' }), msg('Bob', { thread: 'T2' })];
        expect(sides(messages, { scope: 'threads' })).toEqual(['left', 'right']);
        expect(sides(messages, { scope: 'threads', own: 'ada' })).toEqual(['right', 'left']);
    });

    it('keeps three people in separate threads left, as before', () => {
        const messages = [
            msg('Ada', { thread: 'T1' }),
            msg('Bob', { thread: 'T2' }),
            msg('Cy', { thread: 'T3' }),
        ];
        expect(sides(messages, { scope: 'threads' })).toEqual(['left', 'left', 'left']);
    });

    it('treats messages without a thread as one conversation', () => {
        expect(sides([msg('Ada'), msg('Bob')], { scope: 'threads' })).toEqual(['left', 'right']);
    });
});

describe('resolveSides — From → To pairs', () => {
    // The approved mockup: Ada talks to Bob and to Cy, and sends one message to both.
    const mockup = () => [
        msg('Ada', { to: ['Bob'] }),
        msg('Bob', { to: ['Ada'] }),
        msg('Ada', { to: ['Bob', 'Cy'] }),
        msg('Cy', { to: ['Ada'] }),
        msg('Bob', { to: ['Ada'] }),
    ];

    it('keeps the busier party right in every pair, and her group message with her', () => {
        expect(sides(mockup(), { scope: 'pairs' })).toEqual([
            'right',
            'left',
            'right',
            'left',
            'left',
        ]);
    });

    it('follows Own participant, leaving a group message from someone else left', () => {
        expect(sides(mockup(), { scope: 'pairs', own: 'Bob' })).toEqual([
            'left',
            'right',
            'left',
            'left',
            'right',
        ]);
    });

    it('lets a recipient who never wrote lose the tie', () => {
        expect(sides([msg('Ada', { to: ['Bob'] })], { scope: 'pairs' })).toEqual(['right']);
    });

    it('sends a hub’s broadcast right, and a customer copying another customer left', () => {
        const messages = [
            msg('Agent', { to: ['C1'] }),
            msg('C1', { to: ['Agent'] }),
            msg('Agent', { to: ['C2'] }),
            msg('C2', { to: ['Agent'] }),
            msg('Agent', { to: ['C1', 'C2'] }),
            msg('C1', { to: ['Agent', 'C2'] }),
        ];
        const result = sides(messages, { scope: 'pairs' });
        expect(result[4]).toBe('right');
        expect(result[5]).toBe('left');
    });

    it('decides a group message by the pairs it belongs to, not by every pair its sender has', () => {
        // Mid is left against the hub but right against Small. A message from Mid
        // to Small and a stranger belongs only to the Mid/Small pair.
        const messages = [
            msg('Hub', { to: ['Mid'] }),
            msg('Hub', { to: ['X'] }),
            msg('Hub', { to: ['Y'] }),
            msg('Mid', { to: ['Small'] }),
            msg('Mid', { to: ['Small', 'Stranger'] }),
        ];
        const result = sides(messages, { scope: 'pairs' });
        expect(result[3]).toBe('right');
        expect(result[4]).toBe('right');
    });

    it('treats a sender copying themselves as a one-to-one message', () => {
        const messages = [msg('Ada', { to: ['Ada', 'Bob'] }), msg('Bob', { to: ['Ada'] })];
        expect(sides(messages, { scope: 'pairs' })).toEqual(['left', 'right']);
    });

    it('puts a note to self on the side its author has in their pairs', () => {
        const messages = [
            msg('Bob', { to: ['Ada'] }),
            msg('Ada', { to: ['Bob'] }),
            msg('Ada', { to: ['Ada'] }),
        ];
        expect(sides(messages, { scope: 'pairs' })).toEqual(['left', 'right', 'right']);
    });

    it('never pairs anyone with an unknown recipient', () => {
        const messages = [
            {
                authorKey: 'Ada',
                recipients: [{ key: null, label: '(no recipient)', unknown: true }],
            },
        ];
        expect(sides(messages, { scope: 'pairs' })).toEqual(['left']);
    });
});
