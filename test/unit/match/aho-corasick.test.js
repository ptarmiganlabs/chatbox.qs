// Ported from textview.qs test/unit/match/aho-corasick.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import { buildAutomaton } from '../../../src/match/aho-corasick';

/**
 * Collect every occurrence an automaton reports.
 *
 * @param {string[]} terms - The terms.
 * @param {string} text - The text to search.
 * @returns {Array<[number, number, string]>} Start, end and term text for each occurrence.
 */
function occurrences(terms, text) {
    const found = [];
    buildAutomaton(terms).search(text, (start, end, termId) => {
        found.push([start, end, terms[termId]]);
    });
    return found;
}

describe('buildAutomaton', () => {
    it('finds every occurrence of every term, overlapping ones included', () => {
        // The textbook example: in "ushers", "she", "he" and "hers" all occur.
        expect(occurrences(['he', 'she', 'his', 'hers'], 'ushers')).toEqual([
            [1, 4, 'she'],
            [2, 4, 'he'],
            [2, 6, 'hers'],
        ]);
    });

    it('reports occurrences in order of where they end, longest first at the same end', () => {
        expect(occurrences(['a', 'aa', 'aaa'], 'aaa')).toEqual([
            [0, 1, 'a'],
            [0, 2, 'aa'],
            [1, 2, 'a'],
            [0, 3, 'aaa'],
            [1, 3, 'aa'],
            [2, 3, 'a'],
        ]);
    });

    it('follows failure links after a partial match', () => {
        expect(occurrences(['abcd', 'bce'], 'abce')).toEqual([[1, 4, 'bce']]);
    });

    it('handles nodes with many children', () => {
        const terms = 'abcdefghijklmnop'.split('').map((letter) => `x${letter}`);
        const text = 'xa xp xk xz';
        expect(occurrences(terms, text).map(([, , term]) => term)).toEqual(['xa', 'xp', 'xk']);
    });

    it('finds terms made of non-ASCII and astral characters', () => {
        expect(occurrences(['åsa', '\u{10428}'], 'x åsa \u{10428}')).toEqual([
            [2, 5, 'åsa'],
            [6, 8, '\u{10428}'],
        ]);
    });

    it('reports the first index for duplicate terms and ignores empty terms', () => {
        const found = [];
        buildAutomaton(['', 'ab', 'ab']).search('ab', (start, end, termId) => {
            found.push(termId);
        });
        expect(found).toEqual([1]);
    });

    it('finds nothing without terms', () => {
        expect(occurrences([], 'anything')).toEqual([]);
    });

    it('stops when the callback returns false', () => {
        let calls = 0;
        const completed = buildAutomaton(['a']).search('aaaa', () => {
            calls++;
            return calls < 2;
        });
        expect(completed).toBe(false);
        expect(calls).toBe(2);
    });

    it('counts its nodes', () => {
        expect(buildAutomaton(['ab', 'ac']).nodeCount).toBe(4);
    });
});
