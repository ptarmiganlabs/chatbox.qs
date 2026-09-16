import { describe, it, expect } from 'vitest';
import { counterText, stepStop, stopAt } from '../../../src/highlight/navigator';

/** Stops for messages holding 2, 0, 0, 3 and 1 stops. */
const stops = { firstStop: Int32Array.from([0, 2, 2, 2, 5, 6]), total: 6 };

describe('stopAt', () => {
    it('finds the message a stop is in, skipping messages without stops', () => {
        expect(stopAt(stops, 0)).toEqual({ messageIndex: 0, ordinal: 0 });
        expect(stopAt(stops, 1)).toEqual({ messageIndex: 0, ordinal: 1 });
        expect(stopAt(stops, 2)).toEqual({ messageIndex: 3, ordinal: 0 });
        expect(stopAt(stops, 4)).toEqual({ messageIndex: 3, ordinal: 2 });
        expect(stopAt(stops, 5)).toEqual({ messageIndex: 4, ordinal: 0 });
    });
});

describe('stepStop', () => {
    it('steps to the next and the previous stop, across messages', () => {
        expect(stepStop({ stops, current: { messageIndex: 0, ordinal: 1 }, direction: 1 })).toEqual(
            {
                messageIndex: 3,
                ordinal: 0,
                index: 2,
            }
        );
        expect(
            stepStop({ stops, current: { messageIndex: 3, ordinal: 0 }, direction: -1 })
        ).toEqual({
            messageIndex: 0,
            ordinal: 1,
            index: 1,
        });
    });

    it('wraps around at either end', () => {
        expect(
            stepStop({ stops, current: { messageIndex: 4, ordinal: 0 }, direction: 1 }).index
        ).toBe(0);
        expect(
            stepStop({ stops, current: { messageIndex: 0, ordinal: 0 }, direction: -1 }).index
        ).toBe(5);
    });

    it('starts from the message the reader is at when there is no current stop', () => {
        // At message 1, which has none: forward reaches message 3, back reaches message 0's last.
        expect(stepStop({ stops, current: null, direction: 1, from: 1 })).toMatchObject({
            messageIndex: 3,
            ordinal: 0,
        });
        expect(stepStop({ stops, current: null, direction: -1, from: 1 })).toMatchObject({
            messageIndex: 0,
            ordinal: 1,
        });
        // Past the last stop, forward wraps to the first.
        expect(stepStop({ stops, current: null, direction: 1, from: 5 }).index).toBe(0);
        expect(stepStop({ stops, current: null, direction: -1, from: 0 }).index).toBe(5);
    });

    it('has nowhere to step without stops', () => {
        expect(
            stepStop({
                stops: { firstStop: Int32Array.from([0, 0]), total: 0 },
                current: null,
                direction: 1,
            })
        ).toBeNull();
        expect(stepStop({ stops: null, current: null, direction: 1 })).toBeNull();
    });
});

describe('counterText', () => {
    it('says which stop is current', () => {
        expect(counterText({ kind: 'highlight', index: 2, count: 12 })).toBe('3 of 12');
        expect(counterText({ kind: 'find', index: 0, count: 1500, truncated: true })).toBe(
            '1 of 1,500+'
        );
    });

    it('counts search matches before the first step, and leaves highlights to the summary', () => {
        expect(counterText({ kind: 'find', index: -1, count: 12 })).toBe('12 matches');
        expect(counterText({ kind: 'find', index: -1, count: 1 })).toBe('1 match');
        expect(counterText({ kind: 'find', index: -1, count: 0 })).toBe('No matches');
        expect(counterText({ kind: 'find', index: -1, count: 9, truncated: true })).toBe(
            '9+ matches'
        );
        expect(counterText({ kind: 'highlight', index: -1, count: 12 })).toBe('');
    });
});
