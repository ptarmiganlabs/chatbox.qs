import { describe, it, expect } from 'vitest';
import { categoryStyles, stripes } from '../../../src/highlight/category-styles';
import { RULER_BUCKETS, nearestTick, rulerTicks } from '../../../src/highlight/ruler';

const PALETTE = ['#4477aa', '#ee6677', '#228833', '#ccbb44'];
const styles = categoryStyles({
    categories: {
        problem: null,
        list: [
            { name: 'ops', elemNumber: 0, color: null },
            { name: 'email', elemNumber: 1, color: null },
        ],
    },
    palette: PALETTE,
});

/** Message highlights with the given categories and highlight counts. */
const entry = (counts, none = 0) => ({ byCategory: new Map(Object.entries(counts)), none });
const EMPTY = entry({});

describe('rulerTicks', () => {
    it('puts a tick at each message with stops, by its place among the messages', () => {
        const stops = {
            firstStop: Int32Array.from([0, 2, 2, 3]),
            byMessage: [entry({ ops: 2 }), EMPTY, entry({ email: 1 })],
        };
        const ticks = rulerTicks({ stops, count: 3, kind: 'highlight', styles });
        expect(ticks.map((t) => [t.messageIndex, t.position])).toEqual([
            [0, 0.5 / 3],
            [2, 2.5 / 3],
        ]);
        expect(ticks[0].title).toBe('2 highlights in 1 message: ops');
        expect(ticks[0].color).toBe(stripes([styles.byName.get('ops').line]));
    });

    it('gathers messages close together into one tick, striped in legend order', () => {
        const count = RULER_BUCKETS * 10;
        const firstStop = new Int32Array(count + 1);
        const byMessage = Array.from({ length: count }, () => EMPTY);
        byMessage[0] = entry({ ops: 1 });
        byMessage[1] = entry({ email: 1 }, 1);
        for (let i = 0; i < count; i++) firstStop[i + 1] = firstStop[i] + (i < 2 ? 2 : 0);
        const [tick] = rulerTicks({
            stops: { firstStop, byMessage },
            count,
            kind: 'highlight',
            styles,
        });
        expect(tick.title).toBe('4 highlights in 2 messages: email, ops, No category');
        expect(tick.color).toBe(
            stripes([
                styles.byName.get('email').line,
                styles.byName.get('ops').line,
                styles.none.line,
            ])
        );
    });

    it('covers one lane’s stretch of the messages, keeping their indices', () => {
        const stops = {
            firstStop: Int32Array.from([0, 1, 1, 1, 3, 3]),
            byMessage: [entry({ ops: 1 }), EMPTY, EMPTY, entry({ ops: 2 }), EMPTY],
        };
        // A lane of messages 2 to 4: the tick for message 3 sits in the middle of the lane.
        const ticks = rulerTicks({ stops, count: 3, kind: 'find', first: 2 });
        expect(ticks.map((t) => [t.messageIndex, t.position])).toEqual([[3, 1.5 / 3]]);
    });

    it('places messages that share a row at the row', () => {
        const stops = {
            firstStop: Int32Array.from([0, 1, 2, 2, 3]),
            byMessage: [EMPTY, EMPTY, EMPTY, EMPTY],
        };
        // Rows [0 1] [2] [3]: messages 0 and 1 share the first of three places.
        const of = [0, 0, 1, 2];
        const ticks = rulerTicks({ stops, count: 4, kind: 'find', slots: 3, slotOf: (i) => of[i] });
        expect(ticks.map((t) => [t.messageIndex, t.position])).toEqual([
            [0, 0.5 / 3],
            [3, 2.5 / 3],
        ]);
        expect(ticks[0].title).toBe('2 matches in 2 messages');
    });

    it('counts matches, in no category colour, for search', () => {
        const stops = { firstStop: Int32Array.from([0, 3]), byMessage: [EMPTY] };
        const [tick] = rulerTicks({ stops, count: 1, kind: 'find' });
        expect(tick).toMatchObject({ title: '3 matches in 1 message', color: null });
    });

    it('draws nothing for an empty conversation', () => {
        expect(
            rulerTicks({ stops: { firstStop: Int32Array.from([0]) }, count: 0, kind: 'find' })
        ).toEqual([]);
    });
});

describe('nearestTick', () => {
    const ticks = [{ position: 0.1 }, { position: 0.5 }, { position: 0.9 }];

    it('finds the tick a click landed on or near', () => {
        expect(nearestTick(ticks, 0.52, 0.05)).toBe(1);
        expect(nearestTick(ticks, 0.3, 0.05)).toBe(-1);
        expect(nearestTick([], 0.3, 1)).toBe(-1);
    });
});
