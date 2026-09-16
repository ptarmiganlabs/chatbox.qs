// Ported from textview.qs test/unit/match/scale.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { matchValues, prepareText } from '../../../src/match/index';
import { fastestTime } from '../../helpers/timing';

// Scale tests assert how time grows, never how long something takes: a wall-clock budget fails on a
// busy runner, while a ratio between two input sizes cancels out the machine and its load. The input
// grows 4×, which puts linear growth near 4× and quadratic growth near 16×. Measured for text length
// on Node 24 (2026-09-15): 3.7-5.3×. Timed by the fastest run rather than textview's median, since
// chatbox.qs runs these beside many other test files.

const LINE = 'Rad med anna.svensson@example.se, pnr 900101-1239, tel 070-123 45 67.\n';
const ROWS = [
    { value: 'anna.svensson@example.se', category: 'email' },
    { value: '900101-1239', category: 'se-personnummer' },
    { value: '070-123 45 67', category: 'se-phone' },
];

describe('matching at scale', () => {
    it('grows linearly with the length of the text', () => {
        const small = LINE.repeat(2500);
        const large = LINE.repeat(10000);
        const run = (text) => matchValues(prepareText(text), ROWS);

        expect(run(large).matches).toHaveLength(30000);
        const ratio = fastestTime(() => run(large)) / fastestTime(() => run(small));
        expect(ratio).toBeLessThan(8);
    });

    it('barely slows down with four times as many selected values', () => {
        // The values do not occur in the text, so what is measured is the cost of searching for
        // more of them: a bigger automaton to build, and longer failure-link walks on partial
        // matches. Measured at 1.15-1.25× on Node 24 (2026-09-15); 2.5 leaves room for a busy runner.
        const prepared = prepareText(LINE.repeat(5000));
        const rows = (count) =>
            Array.from({ length: count }, (_, i) => ({
                value: `term${String(i).padStart(5, '0')}`,
            }));
        const fewer = rows(500);
        const more = rows(2000);

        const ratio =
            fastestTime(() => matchValues(prepared, more)) /
            fastestTime(() => matchValues(prepared, fewer));
        expect(ratio).toBeLessThan(2.5);
    });
});
