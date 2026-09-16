import { describe, it, expect, vi } from 'vitest';

// Count automaton builds without changing what they build.
vi.mock('../../../src/match/aho-corasick', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, buildAutomaton: vi.fn(actual.buildAutomaton) };
});

const { buildAutomaton } = await import('../../../src/match/aho-corasick');
const { createValueMatcher, matchValues, prepareText } = await import('../../../src/match/index');

/** Every combination of the three matching switches. */
const OPTION_SETS = [false, true].flatMap((caseSensitive) =>
    [false, true].flatMap((wholeValues) =>
        [false, true].map((flexibleWhitespace) => ({
            caseSensitive,
            wholeValues,
            flexibleWhitespace,
        }))
    )
);

const ROWS = [
    { value: 'reload', category: 'ops' },
    { value: 'Reload task', category: 'ops' },
    { value: '070-123 45 67', category: 'phone' },
    { value: 'Åsa', category: 'name' },
    { value: 'a', category: null },
];

const TEXTS = [
    'The reload failed; retry the Reload task at 07:00.',
    'Call Åsa on 070-123\n45 67, or Åsaka about the reloads.',
    'a a a banana A',
    '',
    'nothing here',
];

describe('createValueMatcher', () => {
    it('finds exactly what matchValues finds, text after text, for every option set', () => {
        for (const options of OPTION_SETS) {
            const matcher = createValueMatcher(ROWS, options);
            for (const text of TEXTS) {
                const prepared = prepareText(text, options);
                const expected = matchValues(prepared, ROWS);
                const actual = matcher.match(prepared);
                expect(actual.matches).toEqual(expected.matches);
                expect(actual.truncated).toBe(expected.truncated);
            }
        }
    });

    it('builds its automaton once, however many texts it matches', () => {
        buildAutomaton.mockClear();
        const options = { caseSensitive: false, wholeValues: true, flexibleWhitespace: true };
        const matcher = createValueMatcher(ROWS, options);
        for (let i = 0; i < 200; i++)
            matcher.match(prepareText(`message ${i} about reload`, options));
        expect(buildAutomaton).toHaveBeenCalledTimes(1);
    });

    it('builds nothing and matches nothing when there are no values', () => {
        buildAutomaton.mockClear();
        const matcher = createValueMatcher([{ value: '' }, { value: null }], undefined);
        expect(matcher.termCount).toBe(0);
        expect(matcher.match(prepareText('anything'))).toEqual({
            matches: [],
            truncated: false,
            occurrences: 0,
        });
        expect(buildAutomaton).not.toHaveBeenCalled();
    });

    it('prepares a text again when it was prepared with other case or whitespace options', () => {
        const strict = { caseSensitive: true, wholeValues: true, flexibleWhitespace: false };
        const matcher = createValueMatcher([{ value: 'reload task' }], {
            caseSensitive: false,
            wholeValues: true,
            flexibleWhitespace: true,
        });
        const { matches } = matcher.match(prepareText('RELOAD\n  TASK now', strict));
        expect(matches).toHaveLength(1);
        expect(matches[0]).toMatchObject({ start: 0, end: 13, values: ['reload task'] });
    });

    it('reports its own options, filled in', () => {
        expect(createValueMatcher(ROWS, { caseSensitive: true }).options).toEqual({
            caseSensitive: true,
            wholeValues: true,
            flexibleWhitespace: true,
        });
    });

    it('counts collected occurrences, overlapping ones included, and stops at the limit', () => {
        const options = { caseSensitive: false, wholeValues: false, flexibleWhitespace: true };
        const matcher = createValueMatcher([{ value: 'aa' }], options);
        const prepared = prepareText('aaaa', options);

        const all = matcher.match(prepared);
        // "aa" occurs at 0, 1 and 2; leftmost-longest keeps 0 and 2.
        expect(all.occurrences).toBe(3);
        expect(all.matches.map((match) => match.start)).toEqual([0, 2]);
        expect(all.truncated).toBe(false);

        const limited = matcher.match(prepared, { occurrenceLimit: 2 });
        expect(limited.occurrences).toBe(2);
        expect(limited.truncated).toBe(true);

        const none = matcher.match(prepared, { occurrenceLimit: 0 });
        expect(none).toEqual({ matches: [], truncated: true, occurrences: 0 });
    });
});
