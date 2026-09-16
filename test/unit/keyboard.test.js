import { describe, it, expect } from 'vitest';
import {
    canReceiveTabStop,
    keyAction,
    laneFocusIndex,
    nextFocusIndex,
} from '../../src/ui/keyboard';
import { buildBoard } from '../../src/chat/lanes';

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

describe('stepDirection', () => {
    it('steps forward with F3 and Ctrl+G or Cmd+G, back with Shift', async () => {
        const { stepDirection } = await import('../../src/ui/keyboard');
        expect(stepDirection({ key: 'F3' })).toBe(1);
        expect(stepDirection({ key: 'F3', shiftKey: true })).toBe(-1);
        expect(stepDirection({ key: 'g', ctrlKey: true })).toBe(1);
        expect(stepDirection({ key: 'G', metaKey: true, shiftKey: true })).toBe(-1);
    });

    it('leaves other keys, a plain G and anything with Alt alone', async () => {
        const { stepDirection } = await import('../../src/ui/keyboard');
        expect(stepDirection({ key: 'g' })).toBeNull();
        expect(stepDirection({ key: 'F3', altKey: true })).toBeNull();
        expect(stepDirection({ key: 'Enter' })).toBeNull();
        expect(stepDirection(undefined)).toBeNull();
    });
});

describe('isFindKey', () => {
    it('is Ctrl+F or Cmd+F, and nothing else', async () => {
        const { isFindKey } = await import('../../src/ui/keyboard');
        expect(isFindKey({ key: 'f', ctrlKey: true })).toBe(true);
        expect(isFindKey({ key: 'F', metaKey: true })).toBe(true);
        expect(isFindKey({ key: 'f' })).toBe(false);
        expect(isFindKey({ key: 'f', ctrlKey: true, shiftKey: true })).toBe(false);
        expect(isFindKey({ key: 'f', ctrlKey: true, altKey: true })).toBe(false);
        expect(isFindKey(undefined)).toBe(false);
    });
});

describe('laneFocusIndex', () => {
    /** A message in a thread at a cube row. */
    const msg = (id, thread) => ({
        id,
        key: `k${id}`,
        threadId: thread,
        threadElem: thread.charCodeAt(0),
        rowIdx: Number(id),
        ts: null,
    });
    // Lanes by latest activity: A (row 7), B (row 6), C (row 5).
    const messages = [
        msg('1', 'A'),
        msg('2', 'B'),
        msg('3', 'A'),
        msg('4', 'A'),
        msg('5', 'C'),
        msg('6', 'B'),
        msg('7', 'A'),
    ];

    describe('with linked scrolling', () => {
        const board = buildBoard(messages, { max: 3, scroll: 'linked' });
        // Board order is display order: 1:A 2:B 3:A 4:A 5:C 6:B 7:A.
        // Rows: [1:A 2:B] [3:A] [4:A 5:C 6:B] [7:A].

        it('enters the most recent lane from nowhere', () => {
            expect(laneFocusIndex('ArrowDown', -1, board)).toBe(0);
            expect(laneFocusIndex('ArrowUp', -1, board)).toBe(6);
            expect(laneFocusIndex('ArrowRight', -1, board)).toBe(0);
        });

        it('moves up and down within the lane, clamped', () => {
            expect(laneFocusIndex('ArrowDown', 0, board)).toBe(2);
            expect(laneFocusIndex('ArrowDown', 1, board)).toBe(5);
            expect(laneFocusIndex('ArrowDown', 5, board)).toBe(5);
            expect(laneFocusIndex('Home', 6, board)).toBe(0);
            expect(laneFocusIndex('End', 0, board)).toBe(6);
        });

        it('goes to the neighbouring lane in the same row, else the nearest row, above on a tie', () => {
            expect(laneFocusIndex('ArrowRight', 0, board)).toBe(1);
            expect(laneFocusIndex('ArrowRight', 3, board)).toBe(5);
            // Row [3:A] has no B: rows above and below are one away, so the one above wins.
            expect(laneFocusIndex('ArrowRight', 2, board)).toBe(1);
            expect(laneFocusIndex('ArrowLeft', 4, board)).toBe(5);
            expect(laneFocusIndex('ArrowLeft', 0, board)).toBe(0);
            expect(laneFocusIndex('ArrowRight', 4, board)).toBe(4);
        });

        it('leaves other keys alone', () => {
            expect(laneFocusIndex('Enter', 0, board)).toBeNull();
            expect(laneFocusIndex('ArrowDown', 0, null)).toBeNull();
        });
    });

    describe('with free scrolling', () => {
        const board = buildBoard(messages, { max: 3, scroll: 'free' });
        // Board order is lane by lane: A 1,3,4,7 (0-3), B 2,6 (4-5), C 5 (6).

        it('moves within the lane, never into the next one', () => {
            expect(laneFocusIndex('ArrowDown', 3, board)).toBe(3);
            expect(laneFocusIndex('ArrowUp', 4, board)).toBe(4);
            expect(laneFocusIndex('PageDown', 4, board)).toBe(5);
        });

        it('goes to where the reader is in the neighbouring lane, else its first message', () => {
            expect(laneFocusIndex('ArrowRight', 1, board, { anchor: () => 5 })).toBe(5);
            // An anchor outside the lane is ignored.
            expect(laneFocusIndex('ArrowRight', 1, board, { anchor: () => 2 })).toBe(4);
            expect(laneFocusIndex('ArrowRight', 5, board)).toBe(6);
            expect(laneFocusIndex('ArrowLeft', 6, board, { anchor: () => -1 })).toBe(4);
        });
    });
});
