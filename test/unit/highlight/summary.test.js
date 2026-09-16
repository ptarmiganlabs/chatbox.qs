// Adapted from textview.qs test/unit/render/highlight-summary.test.js at df84a5e: counts are across the
// conversation, and name messages.
import { describe, it, expect } from 'vitest';
import { HIGHLIGHT_KINDS } from '../../../src/qix/highlight-source';
import { highlightSummary, summaryPlacement } from '../../../src/highlight/summary';

const found = (total, { messagesWith = total, searchTruncated = false } = {}) => ({
    total,
    messagesWith,
    searchTruncated,
});
const NONE = found(0);

const values = (count, extra = {}) => ({
    kind: HIGHLIGHT_KINDS.VALUES,
    field: 'match',
    values: Array.from({ length: count }, (_, i) => `v${i}`),
    total: count,
    truncated: false,
    limit: 1000,
    ...extra,
});

describe('highlightSummary', () => {
    it('says nothing while highlights are off', () => {
        expect(highlightSummary({ kind: HIGHLIGHT_KINDS.OFF }, NONE)).toBeNull();
        expect(highlightSummary(undefined, NONE)).toBeNull();
    });

    it('names a highlight field that is not in the data model, as an error', () => {
        expect(
            highlightSummary({ kind: HIGHLIGHT_KINDS.FIELD_MISSING, field: 'mtach' }, NONE)
        ).toEqual({ level: 'error', text: 'The highlight field mtach is not in the data model' });
    });

    it('names the engine error code, or says the engine could not be read', () => {
        const error = (e) =>
            highlightSummary({ kind: HIGHLIGHT_KINDS.ERROR, field: 'match', error: e }, NONE);
        expect(error({ qErrorCode: 7009 })).toEqual({
            level: 'error',
            text: 'The highlights could not be calculated: Qlik engine error 7009',
        });
        expect(error({ code: 15 }).text).toContain('error 15');
        expect(error(null)).toEqual({
            level: 'error',
            text: 'The highlights could not be read from the Qlik engine',
        });
    });

    it('counts highlights and the messages they are in', () => {
        expect(highlightSummary(values(3), found(12, { messagesWith: 5 }))).toEqual({
            level: 'info',
            text: '3 selected values · 12 highlights in 5 messages',
        });
        expect(highlightSummary(values(1), found(1)).text).toBe(
            '1 selected value · 1 highlight in 1 message'
        );
    });

    it('says the values are possible ones when nothing is selected in the field', () => {
        expect(highlightSummary(values(2, { source: 'possible' }), found(2))).toEqual({
            level: 'info',
            text: '2 possible values · 2 highlights in 2 messages',
        });
    });

    it('says when none of the values occur in these messages', () => {
        expect(highlightSummary(values(2), NONE)).toEqual({
            level: 'info',
            text: '2 selected values · none found in these messages',
        });
    });

    it('asks for a selection, or says no value is possible', () => {
        expect(
            highlightSummary({ kind: HIGHLIGHT_KINDS.NO_SELECTION, field: 'match' }, NONE)
        ).toEqual({ level: 'info', text: 'Select values in match to highlight them' });
        expect(
            highlightSummary({ kind: HIGHLIGHT_KINDS.NONE_POSSIBLE, field: 'match' }, NONE)
        ).toEqual({
            level: 'info',
            text: 'No values of match are possible with the current selections',
        });
    });

    it('warns when the selected values are excluded by other selections', () => {
        const excluded = (n) =>
            highlightSummary({ kind: HIGHLIGHT_KINDS.EXCLUDED, field: 'match', excluded: n }, NONE);
        expect(excluded(1)).toEqual({
            level: 'warning',
            text: '1 value selected in match, but excluded by other selections',
        });
        expect(excluded(1234).text).toBe(
            '1,234 values selected in match, but excluded by other selections'
        );
    });

    it('warns when the value limit, or categories filling the rows, left values out', () => {
        expect(highlightSummary(values(1000, { total: 20017, truncated: true }), found(4))).toEqual(
            {
                level: 'warning',
                text: 'The first 1,000 of 20,017 selected values · 4 highlights in 4 messages',
            }
        );
        const cut = values(2857, {
            source: 'possible',
            total: 20000,
            truncated: true,
            rowsFull: true,
            categories: { field: 'Keyword', problem: null, expression: null },
        });
        expect(highlightSummary(cut, NONE).text).toBe(
            'The first 2,857 of 20,000 possible values: their categories filled 20,000 rows · none found in these messages'
        );
    });

    it('warns when every message is drawn at once and only the first highlights are marked', () => {
        const many = found(31442, { messagesWith: 9000 });
        expect(highlightSummary(values(3), many).level).toBe('info');
        expect(highlightSummary(values(3), many, { renderAll: true })).toEqual({
            level: 'warning',
            text: '3 selected values · 31,442 highlights in 9,000 messages, the first 20,000 of them marked',
        });
    });

    it('warns when the search stopped early', () => {
        expect(highlightSummary(values(1), found(10, { searchTruncated: true }))).toEqual({
            level: 'warning',
            text: '1 selected value · 10 highlights in 10 messages · the search stopped early',
        });
    });

    it('warns first about the categories and the colour expression', () => {
        const withCategories = (categories) => values(2, { categories });
        expect(
            highlightSummary(
                withCategories({
                    field: 'pattren',
                    problem: { kind: 'field-missing' },
                    expression: null,
                }),
                found(5, { messagesWith: 3 })
            ).text
        ).toBe(
            'The category field pattren is not in the data model · 2 selected values · 5 highlights in 3 messages'
        );
        expect(
            highlightSummary(
                withCategories({
                    field: 'pattern',
                    problem: { kind: 'error', error: { qErrorCode: 7004 } },
                }),
                found(1)
            ).text
        ).toMatch(/^The categories could not be calculated: Qlik engine error 7004 · /);
        expect(
            highlightSummary(
                withCategories({
                    field: 'pattern',
                    problem: null,
                    expression: { kind: 'syntax', message: "')' expected" },
                }),
                found(1),
                { invalidColor: 'ignored while the expression itself is wrong' }
            ).text
        ).toMatch(/^The colour expression has an error: '\)' expected · /);
        expect(
            highlightSummary(
                withCategories({
                    field: 'pattern',
                    problem: null,
                    expression: { kind: 'unknown-fields', names: ['a', 'b'] },
                }),
                found(1)
            ).text
        ).toMatch(/^The colour expression names fields not in the data model: a, b · /);
        const sound = withCategories({ field: 'pattern', problem: null, expression: null });
        expect(highlightSummary(sound, found(1), { invalidColor: 'blue-ish' })).toMatchObject({
            level: 'warning',
            text: expect.stringMatching(
                /^The colour expression returned "blue-ish", which is not a colour · /
            ),
        });
        expect(highlightSummary(sound, found(1)).level).toBe('info');
    });
});

describe('summaryPlacement', () => {
    const info = { level: 'info', text: '3 selected values · 12 highlights in 5 messages' };
    const warning = { level: 'warning', text: 'The first 1,000 of 20,017 selected values · …' };
    const error = { level: 'error', text: 'The highlight field mtach is not in the data model' };

    it('puts information in the bar, while the summary is switched on', () => {
        expect(summaryPlacement(info, { showSummary: true })).toEqual({ bar: info, banner: null });
        expect(summaryPlacement(info, { showSummary: false })).toEqual({ bar: null, banner: null });
    });

    it('keeps warnings and errors in sight as banners, whatever the switch says', () => {
        for (const showSummary of [true, false]) {
            expect(summaryPlacement(warning, { showSummary })).toEqual({
                bar: null,
                banner: warning,
            });
            expect(summaryPlacement(error, { showSummary })).toEqual({ bar: null, banner: error });
        }
    });

    it('places nothing without a summary', () => {
        expect(summaryPlacement(null, { showSummary: true })).toEqual({ bar: null, banner: null });
    });
});
