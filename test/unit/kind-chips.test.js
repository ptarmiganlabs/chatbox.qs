import { describe, it, expect } from 'vitest';
import definition from '../../src/object-properties';
import {
    KINDS_KEPT_MAX,
    KIND_CHIPS_MAX,
    KIND_CHIP_DEFAULTS,
    clampKindChipsMax,
    kindChipsBag,
    mergeKinds,
    readKindChipSettings,
    splitKinds,
} from '../../src/chat/kind-chips';

describe('readKindChipSettings', () => {
    it('returns the defaults for an object saved before the settings existed', () => {
        expect(readKindChipSettings(undefined)).toEqual(KIND_CHIP_DEFAULTS);
        expect(readKindChipSettings({})).toEqual(KIND_CHIP_DEFAULTS);
    });

    it('keeps valid values', () => {
        const bag = { show: true, max: 7, separator: '|' };
        expect(readKindChipSettings(bag)).toEqual(bag);
    });

    it('falls back to the defaults for values of the wrong type', () => {
        expect(readKindChipSettings({ show: 'yes', max: 'lots', separator: '/' })).toEqual(
            KIND_CHIP_DEFAULTS
        );
        expect(readKindChipSettings({ show: 1, separator: '' }).separator).toBe(',');
    });

    it('never trims a separator into another one', () => {
        expect(readKindChipSettings({ separator: ' |' }).separator).toBe(',');
    });
});

describe('clampKindChipsMax', () => {
    it('keeps the count a whole number from 1 to the maximum', () => {
        expect(clampKindChipsMax(0)).toBe(1);
        expect(clampKindChipsMax(-3)).toBe(1);
        expect(clampKindChipsMax(2.7)).toBe(3);
        expect(clampKindChipsMax('5')).toBe(5);
        expect(clampKindChipsMax(99)).toBe(KIND_CHIPS_MAX);
    });

    it('falls back to the default for something that is not a number', () => {
        for (const value of ['', '  ', null, undefined, 'lots', NaN]) {
            expect(clampKindChipsMax(value), String(value)).toBe(KIND_CHIP_DEFAULTS.max);
        }
    });
});

describe('kindChipsBag', () => {
    it('is a mutable copy, and the object properties start from it', () => {
        const bag = kindChipsBag();
        bag.max = 9;
        expect(KIND_CHIP_DEFAULTS.max).toBe(3);
        expect(definition.chatbox.kindChips).toEqual(KIND_CHIP_DEFAULTS);
        expect(Object.isFrozen(definition.chatbox.kindChips)).toBe(false);
    });
});

describe('splitKinds', () => {
    it('splits on the separator, trimming each value', () => {
        expect(splitKinds('billing, urgent ,vip', ',')).toEqual({
            kinds: ['billing', 'urgent', 'vip'],
            capped: false,
        });
        expect(splitKinds('a;b', ';').kinds).toEqual(['a', 'b']);
        expect(splitKinds('a|b', '|').kinds).toEqual(['a', 'b']);
    });

    it('splits on the separator as text, never as a pattern', () => {
        expect(splitKinds('a|b,c', '|').kinds).toEqual(['a', 'b,c']);
    });

    it('keeps the whole text as one kind when it is not to be split', () => {
        expect(splitKinds('Billing, refunds', 'none').kinds).toEqual(['Billing, refunds']);
    });

    it('drops empty values and repeats, keeping the first-seen order', () => {
        expect(splitKinds(',urgent,,billing, urgent,', ',').kinds).toEqual(['urgent', 'billing']);
    });

    it('has no kinds for a message without one', () => {
        expect(splitKinds(null, ',')).toEqual({ kinds: [], capped: false });
        expect(splitKinds(undefined, ',').kinds).toEqual([]);
        expect(splitKinds(' , ', ',').kinds).toEqual([]);
    });

    it('keeps at most the first 100 distinct kinds, and says when there were more', () => {
        const many = Array.from({ length: KINDS_KEPT_MAX + 5 }, (_, i) => `k${i}`).join(',');
        const { kinds, capped } = splitKinds(many, ',');
        expect(kinds).toHaveLength(KINDS_KEPT_MAX);
        expect(kinds[0]).toBe('k0');
        expect(capped).toBe(true);

        const exact = Array.from({ length: KINDS_KEPT_MAX }, (_, i) => `k${i}`);
        expect(splitKinds([...exact, 'k0', 'k1'].join(','), ',').capped).toBe(false);
    });
});

describe('mergeKinds', () => {
    it('adds new kinds in order without repeating any', () => {
        expect(mergeKinds(['a', 'b'], ['b', 'c', ' a ', 'd'])).toEqual({
            kinds: ['a', 'b', 'c', 'd'],
            capped: false,
        });
    });

    it('leaves the list it was given as it was', () => {
        const kinds = ['a'];
        mergeKinds(kinds, ['b']);
        expect(kinds).toEqual(['a']);
    });

    it('carries a cap forward, and tolerates no more kinds', () => {
        expect(mergeKinds(['a'], null, true)).toEqual({ kinds: ['a'], capped: true });
    });
});
