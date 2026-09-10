import { describe, it, expect } from 'vitest';
import { canReceiveTabStop, keyAction, nextFocusIndex } from '../../src/ui/keyboard';

describe('canReceiveTabStop', () => {
    it('allows tab stops when Sense is not managing keyboard handling', () => {
        expect(canReceiveTabStop({ enabled: false, active: false })).toBe(true);
    });

    it('allows tab stops when Sense has handed focus to this object', () => {
        expect(canReceiveTabStop({ enabled: true, active: true })).toBe(true);
    });

    it('REFUSES tab stops when Sense manages focus and has not given it to us', () => {
        // The whole point. Without this a 500-message conversation puts 500 tab
        // stops in the sheet and makes the entire dashboard unnavigable — not
        // just this object.
        expect(canReceiveTabStop({ enabled: true, active: false })).toBe(false);
    });

    it('defaults to allowing focus when there is no keyboard object', () => {
        // nebula serve, tests, and any host that does not provide one.
        expect(canReceiveTabStop(undefined)).toBe(true);
        expect(canReceiveTabStop(null)).toBe(true);
    });
});

describe('nextFocusIndex', () => {
    it('moves down and up by one', () => {
        expect(nextFocusIndex('ArrowDown', 0, 5)).toBe(1);
        expect(nextFocusIndex('ArrowUp', 3, 5)).toBe(2);
    });

    it('CLAMPS rather than wrapping at both ends', () => {
        // Wrapping reads as a glitch, and in a virtualized list it throws the
        // reader hundreds of rows away from where they were.
        expect(nextFocusIndex('ArrowDown', 4, 5)).toBe(4);
        expect(nextFocusIndex('ArrowUp', 0, 5)).toBe(0);
    });

    it('enters at the end on ArrowUp from nowhere', () => {
        // The most recent message is what a reader usually wants.
        expect(nextFocusIndex('ArrowUp', -1, 5)).toBe(4);
    });

    it('enters at the start on ArrowDown from nowhere', () => {
        expect(nextFocusIndex('ArrowDown', -1, 5)).toBe(0);
    });

    it('jumps to either end', () => {
        expect(nextFocusIndex('Home', 3, 5)).toBe(0);
        expect(nextFocusIndex('End', 1, 5)).toBe(4);
    });

    it('pages by ten, clamped', () => {
        expect(nextFocusIndex('PageDown', 0, 100)).toBe(10);
        expect(nextFocusIndex('PageUp', 5, 100)).toBe(0);
        expect(nextFocusIndex('PageDown', 95, 100)).toBe(99);
    });

    it('returns null for keys that are not movement', () => {
        for (const key of ['Enter', 'a', 'Tab', 'Escape', 'Shift']) {
            expect(nextFocusIndex(key, 0, 5)).toBeNull();
        }
    });

    it('returns null for an empty conversation', () => {
        expect(nextFocusIndex('ArrowDown', -1, 0)).toBeNull();
    });
});

describe('keyAction', () => {
    it('treats Enter and Space as activation', () => {
        expect(keyAction('Enter')).toBe('activate');
        expect(keyAction(' ')).toBe('activate');
        // Older browsers report the space bar this way.
        expect(keyAction('Spacebar')).toBe('activate');
    });

    it('treats Escape as dismissal, including the legacy name', () => {
        expect(keyAction('Escape')).toBe('dismiss');
        expect(keyAction('Esc')).toBe('dismiss');
    });

    it('ignores everything else', () => {
        expect(keyAction('ArrowDown')).toBeNull();
        expect(keyAction('x')).toBeNull();
    });
});
