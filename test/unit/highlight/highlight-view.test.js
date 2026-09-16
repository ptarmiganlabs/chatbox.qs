import { describe, it, expect } from 'vitest';
import { HIGHLIGHT_KINDS } from '../../../src/qix/highlight-source';
import { createHighlightView } from '../../../src/highlight/highlight-view';

const layout = {
    qHyperCube: {},
    chatbox: { highlight: { field: 'match' }, category: { field: 'pattern', showLabels: true } },
};

const answer = {
    kind: HIGHLIGHT_KINDS.VALUES,
    field: 'match',
    source: 'selected',
    total: 2,
    values: ['reload', 'task'],
    rows: [
        { value: 'reload', category: 'ops' },
        { value: 'task', category: 'script' },
    ],
    truncated: false,
    categories: {
        field: 'pattern',
        problem: null,
        expression: null,
        list: [
            { name: 'ops', elemNumber: 0, color: null, selected: false },
            { name: 'script', elemNumber: 1, color: null, selected: false },
        ],
    },
};

const messages = [
    { id: '1', key: 'k1', body: 'reload the task', bodyFormat: 'text' },
    { id: '2', key: 'k2', body: 'nothing', bodyFormat: 'text' },
];

const tagged = (a = answer, version = 0) => ({ answer: a, derivedFrom: layout, version });

describe('createHighlightView', () => {
    it('answers null while highlighting is off or nothing is loaded yet', () => {
        const view = createHighlightView();
        expect(view.build({ tagged: null, layout, version: 0, messages })).toBeNull();
        expect(
            view.build({
                tagged: tagged({ kind: HIGHLIGHT_KINDS.OFF }),
                layout,
                version: 0,
                messages,
            })
        ).toBeNull();
    });

    it('works out the result, the styles, the summary and where the summary goes', () => {
        const built = createHighlightView().build({
            tagged: tagged(),
            layout,
            version: 0,
            messages,
        });
        expect(built.result.total).toBe(2);
        expect(built.styles.enabled).toBe(true);
        expect(built.settings.category.showLabels).toBe(true);
        expect(built.summary).toEqual({
            level: 'info',
            text: '2 selected values · 2 highlights in 1 message',
        });
        expect(built.placement.bar).toBe(built.summary);
        expect(built.pending).toBe(false);
        expect(built.matchPlain('task').length).toBe(1);
    });

    it('keeps the same result, styles and describer while nothing they depend on changed', () => {
        const view = createHighlightView();
        const first = view.build({ tagged: tagged(), layout, version: 0, messages });
        const second = view.build({
            tagged: tagged(),
            layout,
            version: 0,
            messages: messages.map((m) => ({ ...m })),
        });
        expect(second.result).toBe(first.result);
        expect(second.styles).toBe(first.styles);
        expect(second.describe).toBe(first.describe);
    });

    // Found reviewing the change: clearing a colour expression that answered something other than a
    // colour left the categories in the same palette colours, the kept styles still carried the old
    // answer, and the warning stayed.
    it('drops the colour expression warning once the expression no longer answers a non-colour', () => {
        const view = createHighlightView();
        const withColors = (color) => ({
            ...answer,
            categories: {
                ...answer.categories,
                list: answer.categories.list.map((category) => ({ ...category, color })),
            },
        });
        const broken = view.build({
            tagged: tagged(withColors({ text: 'banana', number: null })),
            layout,
            version: 0,
            messages,
        });
        expect(broken.placement.banner?.text).toMatch(/returned "banana", which is not a colour/);

        const cleared = view.build({
            tagged: tagged(withColors(null)),
            layout,
            version: 0,
            messages,
        });
        expect(cleared.styles.invalidColor).toBeNull();
        expect(cleared.placement.banner).toBeNull();
        expect(cleared.summary.level).toBe('info');
    });

    it('says an answer for an older layout or companion version is still being replaced', () => {
        const view = createHighlightView();
        expect(
            view.build({ tagged: tagged(answer, 1), layout, version: 2, messages }).pending
        ).toBe(true);
    });

    it('still reports an answer without values, such as a missing field, with no highlights', () => {
        const built = createHighlightView().build({
            tagged: tagged({ kind: HIGHLIGHT_KINDS.FIELD_MISSING, field: 'mtach' }),
            layout,
            version: 0,
            messages,
        });
        expect(built.result.total).toBe(0);
        expect(built.placement.banner).toEqual({
            level: 'error',
            text: 'The highlight field mtach is not in the data model',
        });
    });
});

describe('createHighlightView selecting by clicking', () => {
    it('says what a click does in the tooltip only while clicking selects', () => {
        const view = createHighlightView();
        const quiet = view.build({ tagged: tagged(), layout, version: 0, messages });
        const span = quiet.result.byMessage[0].spans[0];
        expect(quiet.clickMode).toBeNull();
        expect(quiet.describe(span).title).toBe('reload · ops');

        const clicking = view.build({
            tagged: tagged(),
            layout,
            version: 0,
            messages,
            canSelect: true,
        });
        expect(clicking.clickMode).toBe('select');
        expect(clicking.describe(span).title).toMatch(/\nClick to select this value/);
        // The styles are kept; only the describer changed with the hint.
        expect(clicking.styles).toBe(quiet.styles);
        expect(clicking.describe).not.toBe(quiet.describe);
    });

    it('marks clicks on a locked highlight field as locked', () => {
        const locked = { ...answer, locked: { highlight: true, category: false } };
        const built = createHighlightView().build({
            tagged: tagged(locked),
            layout,
            version: 0,
            messages,
            canSelect: true,
        });
        expect(built.clickMode).toBe('locked');
    });
});
