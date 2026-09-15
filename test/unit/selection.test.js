import { describe, it, expect } from 'vitest';
import { buildSelection } from '../../src/qix/selection';
import { DEFAULT_CIDS, resolveRoles } from '../../src/qix/column-map';

const layout = (dimCIds) => ({
    qHyperCube: {
        qDimensionInfo: dimCIds.map((cId) => ({ cId })),
        qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
    },
});

const roles = (dimCIds, conversationModel) =>
    resolveRoles(layout(dimCIds), DEFAULT_CIDS, { conversationModel }).byRole;

const person = (name, elem) => ({ key: name, label: name, elem, unknown: false });

// Element numbers are per field: Ada is 0 in From but 9 in To, Bob 1 and 5.
const participants = new Map([
    ['Ada', { key: 'Ada', elem: 0, unknown: false }],
    ['Bob', { key: 'Bob', elem: 1, unknown: false }],
]);
const recipientElems = new Map([
    ['Ada', 9],
    ['Bob', 5],
    ['Cy', 6],
]);

const message = (over = {}) => ({
    id: '1',
    elem: 42,
    authorKey: 'Ada',
    author: participants.get('Ada'),
    recipients: null,
    threadElem: -1,
    ...over,
});

describe('buildSelection — the existing actions', () => {
    const participantRoles = roles(['d_msgid', 'd_author', 'd_thread']);

    it('selects the author, toggling, exactly as before', () => {
        expect(
            buildSelection({ action: 'selectAuthor', message: message(), byRole: participantRoles })
        ).toEqual([{ dimIdx: 1, values: [0], toggle: true }]);
    });

    it('treats an unset action as selecting the author', () => {
        expect(buildSelection({ message: message(), byRole: participantRoles })).toEqual([
            { dimIdx: 1, values: [0], toggle: true },
        ]);
    });

    it('selects the message, toggling, exactly as before', () => {
        expect(
            buildSelection({
                action: 'selectMessage',
                message: message(),
                byRole: participantRoles,
            })
        ).toEqual([{ dimIdx: 0, values: [42], toggle: true }]);
    });

    it('never sends an empty value list — the engine reads it as everything', () => {
        const synthetic = message({ elem: -2, author: { elem: -2 } });
        expect(
            buildSelection({ action: 'selectAuthor', message: synthetic, byRole: participantRoles })
        ).toEqual([]);
        expect(
            buildSelection({
                action: 'selectMessage',
                message: synthetic,
                byRole: participantRoles,
            })
        ).toEqual([]);
    });

    it('never selects through a column that is not a dimension', () => {
        const measureAsAuthor = { author: { col: 3, kind: 'msr' } };
        expect(
            buildSelection({ action: 'selectAuthor', message: message(), byRole: measureAsAuthor })
        ).toEqual([]);
    });

    it('selects nothing for actions that are not selections', () => {
        for (const action of ['showDetails', 'none', 'somethingNew']) {
            expect(
                buildSelection({ action, message: message(), byRole: participantRoles })
            ).toEqual([]);
        }
    });
});

describe('buildSelection — selectRecipient', () => {
    const fromToRoles = roles(['d_msgid', 'd_author', 'd_recipient'], 'fromTo');

    it('toggles a single recipient in the To field', () => {
        const m = message({ recipients: [person('Bob', 5)] });
        expect(
            buildSelection({ action: 'selectRecipient', message: m, byRole: fromToRoles })
        ).toEqual([{ dimIdx: 2, values: [5], toggle: true }]);
    });

    it('replaces the selection with a group’s recipients, skipping unknown ones', () => {
        // Toggling a set flips each value on its own, leaving a partial selection.
        const m = message({
            recipients: [
                person('Bob', 5),
                person('Cy', 6),
                { key: null, label: '(no recipient)', elem: -2, unknown: true },
            ],
        });
        expect(
            buildSelection({ action: 'selectRecipient', message: m, byRole: fromToRoles })
        ).toEqual([{ dimIdx: 2, values: [5, 6], toggle: false }]);
    });

    it('selects nothing without a recipient dimension', () => {
        const m = message({ recipients: [person('Bob', 5)] });
        expect(
            buildSelection({
                action: 'selectRecipient',
                message: m,
                byRole: roles(['d_msgid', 'd_author', 'd_thread']),
            })
        ).toEqual([]);
    });
});

describe('buildSelection — selectConversation', () => {
    it('selects the thread when the message has one', () => {
        const byRole = roles(['d_msgid', 'd_author', 'd_recipient', 'd_thread'], 'fromTo');
        const m = message({ recipients: [person('Bob', 5)], threadElem: 7 });
        expect(
            buildSelection({ action: 'selectConversation', message: m, byRole, participants })
        ).toEqual([{ dimIdx: 3, values: [7], toggle: true }]);
    });

    it('selects both people in both fields, each with that field’s own numbers — regression', () => {
        // Ada is 0 in From but 9 in To. Reusing her From number in the To field
        // would select whoever holds element 0 there.
        const byRole = roles(['d_msgid', 'd_author', 'd_recipient'], 'fromTo');
        const m = message({ recipients: [person('Bob', 5)] });
        const steps = buildSelection({
            action: 'selectConversation',
            message: m,
            byRole,
            participants,
            recipientElems,
        });
        expect(steps).toEqual([
            { dimIdx: 1, values: [0, 1], toggle: false },
            { dimIdx: 2, values: [9, 5], toggle: false },
        ]);
    });

    it('leaves out a person who never sent from the From field', () => {
        const byRole = roles(['d_msgid', 'd_author', 'd_recipient'], 'fromTo');
        const m = message({ recipients: [person('Cy', 6)] });
        const steps = buildSelection({
            action: 'selectConversation',
            message: m,
            byRole,
            participants,
            recipientElems,
        });
        expect(steps[0]).toEqual({ dimIdx: 1, values: [0], toggle: false });
        expect(steps[1]).toEqual({ dimIdx: 2, values: [9, 6], toggle: false });
    });

    it('includes every person of a group message', () => {
        const byRole = roles(['d_msgid', 'd_author', 'd_recipient'], 'fromTo');
        const m = message({ recipients: [person('Bob', 5), person('Cy', 6)] });
        const steps = buildSelection({
            action: 'selectConversation',
            message: m,
            byRole,
            participants,
            recipientElems,
        });
        expect(steps[1].values).toEqual([9, 5, 6]);
    });

    it('selects nothing when either field has no one to select', () => {
        const byRole = roles(['d_msgid', 'd_author', 'd_recipient'], 'fromTo');
        const m = message({ recipients: [person('Cy', 6)] });
        expect(
            buildSelection({
                action: 'selectConversation',
                message: m,
                byRole,
                participants,
                recipientElems: new Map(),
            })
        ).toEqual([]);
    });

    it('selects nothing in the participant model without a thread', () => {
        expect(
            buildSelection({
                action: 'selectConversation',
                message: message(),
                byRole: roles(['d_msgid', 'd_author']),
                participants,
            })
        ).toEqual([]);
    });
});
