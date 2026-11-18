import { describe, it, expect } from 'vitest';
import { colorFromText } from '../../src/theme/color-parse';
import {
    NAME_CONTRAST,
    contrastRatio,
    initialsInk,
    readableOn,
} from '../../src/export/export-colors';

const ratio = (one, other) => contrastRatio(colorFromText(one), colorFromText(other));

describe('export colours', () => {
    it('measures contrast as WCAG does', () => {
        expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 1);
        expect(ratio('#777777', '#777777')).toBe(1);
    });

    it('keeps a colour that already reads on the page', () => {
        expect(readableOn('#4477aa', '#ffffff')).toBe('#4477aa');
    });

    it('darkens a pale name on a light page until it reads', () => {
        const ink = readableOn('#66ccee', '#ffffff');
        expect(ink).not.toBe('#66ccee');
        expect(ratio(ink, '#ffffff')).toBeGreaterThanOrEqual(NAME_CONTRAST);
    });

    it('lightens a deep name on a dark page until it reads', () => {
        const ink = readableOn('#223355', '#1e2227');
        expect(ratio(ink, '#1e2227')).toBeGreaterThanOrEqual(NAME_CONTRAST);
    });

    it('leaves a colour it cannot read as it is', () => {
        expect(readableOn('var(--x)', '#ffffff')).toBe('var(--x)');
        expect(readableOn('#66ccee', 'transparent-ish')).toBe('#66ccee');
    });

    it('writes initials in white on a deep face and near-black on a pale one', () => {
        expect(initialsInk('#4477aa')).toBe('#ffffff');
        expect(initialsInk('#ccbb44')).toBe('#1f1f1f');
        expect(initialsInk('nonsense')).toBe('#ffffff');
    });
});
