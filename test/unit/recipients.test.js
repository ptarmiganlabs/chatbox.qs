import { describe, it, expect } from 'vitest';
import {
    addRecipients,
    formatRecipients,
    recipientIdentity,
    recipientsKey,
} from '../../src/chat/recipients';

const person = (name, elem = 0) => ({ key: name, label: name, elem, unknown: false });
const nobody = { key: null, label: '(no recipient)', elem: -2, unknown: true };

describe('recipientsKey', () => {
    it('ignores order', () => {
        expect(recipientsKey([person('Bob'), person('Cy')])).toBe(
            recipientsKey([person('Cy'), person('Bob')])
        );
    });

    it('is empty for no list, so the participant model never breaks a cluster', () => {
        expect(recipientsKey(null)).toBe('');
        expect(recipientsKey([])).toBe('');
    });

    it('identifies people by text, not by element number', () => {
        // The same person has a different element number in each field.
        expect(recipientIdentity(person('Bob', 3))).toBe(recipientIdentity(person('Bob', 7)));
    });

    it('never confuses an unknown recipient with a person of the same name', () => {
        const named = person('(no recipient)');
        expect(recipientIdentity(nobody)).not.toBe(recipientIdentity(named));
    });
});

describe('addRecipients', () => {
    it('keeps first-seen order and skips duplicates', () => {
        const list = [person('Bob')];
        addRecipients(list, [person('Cy'), person('Bob'), nobody, { ...nobody }]);
        expect(list.map((r) => r.label)).toEqual(['Bob', 'Cy', '(no recipient)']);
    });
});

describe('formatRecipients', () => {
    it('lists a short group in full', () => {
        expect(formatRecipients([person('Bob'), person('Cy')])).toBe('Bob, Cy');
    });

    it('summarises beyond the limit', () => {
        const five = ['Bob', 'Cy', 'Dan', 'Eve', 'Fay'].map((n) => person(n));
        expect(formatRecipients(five)).toBe('Bob, Cy, Dan and 2 more');
        expect(formatRecipients(five, { max: 50 })).toBe('Bob, Cy, Dan, Eve, Fay');
    });

    it('marks a list that may be incomplete', () => {
        expect(formatRecipients([person('Bob')], { partial: true })).toBe('Bob…');
    });

    it('is empty for nothing', () => {
        expect(formatRecipients(null)).toBe('');
    });
});
