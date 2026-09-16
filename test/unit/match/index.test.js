// Ported from textview.qs test/unit/match/index.test.js at df84a5e.
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_MATCH_OPTIONS,
    findText,
    matchValues,
    prepareText,
    resolveMatchOptions,
} from '../../../src/match/index';

// Texts from the test app's load script (docs/test-app/load-script.qvs), so the rules checked here
// are the ones checked live.
const TEXT_1004 =
    'Called back on +46 70\n123 45 67 about the invoice.\nISBN 978-91-0096-205-7 was quoted in the order.';
const TEXT_1005 = 'İSTANBUL office moved to ΟΔΟΣ 12.\nThe istanbul team confirmed the new address.';
const TEXT_1009 =
    'The plate ABC 123 was seen next to order ABC 1234.\n' +
    'Alias user_anna.svensson@example.se is a different mailbox than anna.svensson@example.se.';
const TEXT_1010 = 'Åsa bor på Östra gatan 5 i Växjö.\nÅsaka är en annan ort än Åsa.';

/**
 * Match values and return what each match covers in the original text.
 *
 * @param {string} text - The text.
 * @param {Array<{value: *, category?: *}>} rows - Selected values.
 * @param {object} [options] - Matching options.
 * @returns {string[]} The matched slices of the original text.
 */
function matchedSlices(text, rows, options) {
    const prepared = prepareText(text, options);
    return matchValues(prepared, rows).matches.map((match) => text.slice(match.start, match.end));
}

describe('resolveMatchOptions', () => {
    it('fills in the defaults: case-insensitive, whole values, flexible whitespace', () => {
        expect(resolveMatchOptions()).toEqual(DEFAULT_MATCH_OPTIONS);
        expect(DEFAULT_MATCH_OPTIONS).toEqual({
            caseSensitive: false,
            wholeValues: true,
            flexibleWhitespace: true,
        });
    });

    it('keeps the options that were given', () => {
        expect(resolveMatchOptions({ caseSensitive: true })).toEqual({
            ...DEFAULT_MATCH_OPTIONS,
            caseSensitive: true,
        });
    });
});

describe('prepareText', () => {
    it('prepares a missing text as an empty one', () => {
        expect(prepareText(null).original).toBe('');
        expect(prepareText(undefined).searchable).toBe('');
    });

    it('turns a number into text', () => {
        expect(prepareText(701234567).original).toBe('701234567');
    });
});

describe('matchValues', () => {
    it('matches a phone number that a line break splits in the text', () => {
        expect(matchedSlices(TEXT_1004, [{ value: '+46 70 123 45 67' }])).toEqual([
            '+46 70\n123 45 67',
        ]);
    });

    it('does not match across a line break when whitespace must match exactly', () => {
        expect(
            matchedSlices(TEXT_1004, [{ value: '+46 70 123 45 67' }], { flexibleWhitespace: false })
        ).toEqual([]);
    });

    it('reports every category of a value that belongs to several', () => {
        const prepared = prepareText(TEXT_1004);
        const { matches } = matchValues(prepared, [
            { value: '978-91-0096-205-7', category: 'isbn' },
            { value: '978-91-0096-205-7', category: 'credit-card' },
        ]);
        expect(matches).toHaveLength(1);
        expect(matches[0].categories).toEqual(['isbn', 'credit-card']);
        expect(matches[0].values).toEqual(['978-91-0096-205-7']);
    });

    it('ignores case outside ASCII, reporting the original characters', () => {
        expect(matchedSlices(TEXT_1005, [{ value: 'istanbul' }, { value: 'οδος 12' }])).toEqual([
            'İSTANBUL',
            'ΟΔΟΣ 12',
            'istanbul',
        ]);
    });

    it('matches case exactly when asked', () => {
        expect(
            matchedSlices(TEXT_1005, [{ value: 'istanbul' }, { value: 'οδος 12' }], {
                caseSensitive: true,
            })
        ).toEqual(['istanbul']);
    });

    it('does not match a value inside a longer word', () => {
        expect(
            matchedSlices(TEXT_1009, [{ value: 'ABC 123' }, { value: 'anna.svensson@example.se' }])
        ).toEqual(['ABC 123', 'anna.svensson@example.se']);
        const prepared = prepareText(TEXT_1009);
        const { matches } = matchValues(prepared, [{ value: 'anna.svensson@example.se' }]);
        expect(matches[0].start).toBe(TEXT_1009.lastIndexOf('anna.svensson@example.se'));
    });

    it('matches inside longer words when whole values are off', () => {
        expect(
            matchedSlices(
                TEXT_1009,
                [{ value: 'ABC 123' }, { value: 'anna.svensson@example.se' }],
                {
                    wholeValues: false,
                }
            )
        ).toEqual(['ABC 123', 'ABC 123', 'anna.svensson@example.se', 'anna.svensson@example.se']);
    });

    it('treats å, ä and ö as letters when checking whole values', () => {
        expect(matchedSlices(TEXT_1010, [{ value: 'åsa' }])).toEqual(['Åsa', 'Åsa']);
    });

    it('prefers the value that starts first, then the longer one', () => {
        expect(
            matchedSlices('New York City', [{ value: 'York City' }, { value: 'New York' }])
        ).toEqual(['New York']);
        expect(
            matchedSlices('order ABC 1234', [{ value: 'ABC 123' }, { value: 'ABC 1234' }], {
                wholeValues: false,
            })
        ).toEqual(['ABC 1234']);
    });

    it('maps offsets correctly after collapsed Windows line endings', () => {
        const text = 'x\r\n\r\n  anna@example.se\r\nend';
        expect(matchedSlices(text, [{ value: 'anna@example.se' }])).toEqual(['anna@example.se']);
    });

    it('returns no matches and no terms for no values', () => {
        expect(matchValues(prepareText('text'), [])).toEqual({
            matches: [],
            termCount: 0,
            truncated: false,
        });
    });

    it('says so when it stops at the occurrence limit', () => {
        const prepared = prepareText('a a a a a');
        const result = matchValues(prepared, [{ value: 'a' }], { occurrenceLimit: 2 });
        expect(result.truncated).toBe(true);
        expect(result.matches).toHaveLength(2);
    });

    it('does not report truncation when the limit is exactly reached', () => {
        const prepared = prepareText('a a');
        const result = matchValues(prepared, [{ value: 'a' }], { occurrenceLimit: 2 });
        expect(result.truncated).toBe(false);
        expect(result.matches).toHaveLength(2);
    });

    it('counts the distinct terms it searched for', () => {
        const prepared = prepareText(TEXT_1005);
        expect(
            matchValues(prepared, [{ value: 'istanbul' }, { value: 'İSTANBUL' }]).termCount
        ).toBe(1);
    });
});

describe('findText', () => {
    it('finds a substring, ignoring case, without whole-value rules', () => {
        const prepared = prepareText(TEXT_1009);
        const { matches } = findText(prepared, 'SVENSSON');
        expect(matches.map((match) => TEXT_1009.slice(match.start, match.end))).toEqual([
            'svensson',
            'svensson',
        ]);
    });

    it('finds text across a line break with flexible whitespace', () => {
        const prepared = prepareText(TEXT_1004);
        const [match] = findText(prepared, '70 123').matches;
        expect(TEXT_1004.slice(match.start, match.end)).toBe('70\n123');
    });

    it('finds nothing for an empty or blank query', () => {
        const prepared = prepareText(TEXT_1004);
        expect(findText(prepared, '').matches).toEqual([]);
        expect(findText(prepared, '   ').matches).toEqual([]);
        expect(findText(prepared, null).matches).toEqual([]);
    });

    it('does not report overlapping occurrences', () => {
        const { matches } = findText(prepareText('aaaa'), 'aa');
        expect(matches).toEqual([
            { start: 0, end: 2 },
            { start: 2, end: 4 },
        ]);
    });

    it('treats every character literally', () => {
        expect(findText(prepareText('a.c abc'), 'a.c').matches).toEqual([{ start: 0, end: 3 }]);
    });

    it('says so when it stops at the occurrence limit', () => {
        const result = findText(prepareText('aaaa'), 'a', { occurrenceLimit: 2 });
        expect(result.truncated).toBe(true);
        expect(result.matches).toHaveLength(2);
    });
});
