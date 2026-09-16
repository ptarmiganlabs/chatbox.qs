// Ported from textview.qs test/unit/match/differential.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { isWholeValue } from '../../../src/match/boundaries';
import { matchValues, prepareText } from '../../../src/match/index';
import { buildTerms } from '../../../src/match/terms';

// Compares the engine with a brute-force matcher on seeded random texts. The alphabet is chosen to
// hit every rule at once: letters that fold (A, Å), whitespace that collapses (space, line break),
// word characters that are not letters (_ and a combining accent), and a separator (.).
const ALPHABET = ['a', 'b', 'A', 'å', 'Å', ' ', '\n', '_', '.', '\u0301'];

/**
 * A small seeded pseudo-random generator, so a failure can be replayed.
 *
 * @param {number} seed - The seed.
 * @returns {function(): number} A generator of numbers in [0, 1).
 */
function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Brute force: try every term at every offset, then keep leftmost-longest without overlaps.
 *
 * @param {string} text - The text.
 * @param {Array<{value: string}>} rows - The values.
 * @param {object} options - Matching options.
 * @returns {Array<{start: number, end: number, values: string[]}>} The expected matches.
 */
function bruteForce(text, rows, options) {
    const prepared = prepareText(text, options);
    const { searchable } = prepared;
    const terms = buildTerms(rows, prepared.options);
    const matches = [];
    let reach = 0;
    for (let start = 0; start < searchable.length; start++) {
        let best = null;
        for (const term of terms) {
            if (!searchable.startsWith(term.key, start)) continue;
            const end = start + term.key.length;
            if (prepared.options.wholeValues && !isWholeValue(searchable, start, end, term))
                continue;
            if (best === null || end > best.end) best = { end, term };
        }
        if (best !== null && start >= reach) {
            matches.push({
                start: prepared.toOriginal(start),
                end: prepared.toOriginal(best.end - 1) + 1,
                values: best.term.values,
            });
            reach = best.end;
        }
    }
    return matches;
}

const OPTION_SETS = [
    { caseSensitive: false, wholeValues: true, flexibleWhitespace: true },
    { caseSensitive: true, wholeValues: false, flexibleWhitespace: false },
    { caseSensitive: false, wholeValues: false, flexibleWhitespace: true },
    { caseSensitive: true, wholeValues: true, flexibleWhitespace: false },
];

describe('matchValues against brute force', () => {
    for (const options of OPTION_SETS) {
        it(`agrees on 300 random cases with ${JSON.stringify(options)}`, () => {
            const random = mulberry32(20260915);
            const pick = () => ALPHABET[Math.floor(random() * ALPHABET.length)];
            for (let round = 0; round < 300; round++) {
                const text = Array.from({ length: 5 + Math.floor(random() * 60) }, pick).join('');
                const rows = Array.from({ length: 1 + Math.floor(random() * 5) }, () => ({
                    value: Array.from({ length: 1 + Math.floor(random() * 4) }, pick).join(''),
                }));
                const actual = matchValues(prepareText(text, options), rows).matches.map(
                    ({ start, end, values }) => ({ start, end, values })
                );
                expect(actual, JSON.stringify({ round, text, rows })).toEqual(
                    bruteForce(text, rows, options)
                );
            }
        });
    }
});
