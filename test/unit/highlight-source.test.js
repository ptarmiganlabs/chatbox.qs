// Ported from textview.qs test/unit/qix/highlight-source.test.js at df84a5e, paging through chatbox's
// fetchAllRows; a test at the end pins that a keyword which really is "-" survives.
import { describe, it, expect, vi } from 'vitest';
import {
    HIGHLIGHT_KINDS,
    MAX_CATEGORY_ROWS,
    categoryProblem,
    createHighlightSource,
    describeHighlights,
    groupValueRows,
} from '../../src/qix/highlight-source';

/** A companion layout with highlight counts and a cube of `total` values, `initial` of them delivered. */
function companionLayout({
    selected,
    selectedAll = selected,
    total = selected,
    initial = total,
    error,
} = {}) {
    const layout = {
        textKey: 'key-1',
        highlightSelected: selected,
        highlightSelectedAll: selectedAll,
        qHyperCube: {
            qSize: { qcx: 1, qcy: total },
            qDataPages: [
                {
                    qArea: { qTop: 0, qLeft: 0, qWidth: 1, qHeight: initial },
                    qMatrix: Array.from({ length: initial }, (_, i) => [
                        { qText: `value ${i}`, qElemNumber: i },
                    ]),
                },
            ],
        },
    };
    if (error) layout.qHyperCube.qError = error;
    return layout;
}

/** A companion whose session answers with the layout, and whose model pages the remaining values. */
function fakeCompanion(layout) {
    const model = {
        getHyperCubeData: vi.fn(async (_path, [page]) => [
            {
                qArea: page,
                qMatrix: Array.from({ length: page.qHeight }, (_, i) => [
                    { qText: `value ${page.qTop + i}`, qElemNumber: page.qTop + i },
                ]),
            },
        ]),
    };
    return { model, session: vi.fn(async () => (layout === null ? null : { model, layout })) };
}

describe('describeHighlights', () => {
    it('is off without a highlight field', () => {
        expect(
            describeHighlights({ field: '', companionLayout: companionLayout({ selected: 3 }) })
        ).toEqual({
            kind: HIGHLIGHT_KINDS.OFF,
        });
    });

    it('cannot read highlights without a companion, and says so', () => {
        expect(describeHighlights({ field: 'match', companionLayout: null })).toEqual({
            kind: HIGHLIGHT_KINDS.ERROR,
            field: 'match',
            error: null,
        });
    });

    it('recognises a field that is not in the data model', () => {
        const layout = companionLayout({ selected: -1 });
        expect(describeHighlights({ field: 'mtach', companionLayout: layout })).toEqual({
            kind: HIGHLIGHT_KINDS.FIELD_MISSING,
            field: 'mtach',
        });
    });

    it('treats counts that are not numbers as an error, never as zero', () => {
        const layout = companionLayout({ selected: 'NaN', selectedAll: 'NaN' });
        expect(describeHighlights({ field: 'match', companionLayout: layout }).kind).toBe(
            HIGHLIGHT_KINDS.ERROR
        );
    });

    it('tells nothing selected apart from a selection excluded by other selections', () => {
        const nothing = companionLayout({
            selected: 0,
            selectedAll: 0,
            error: { qErrorCode: 7005 },
        });
        // With possible values switched off, the calculation condition answers 7005 until something
        // is selected.
        expect(
            describeHighlights({
                field: 'match',
                companionLayout: nothing,
                possibleWhenNoneSelected: false,
            }).kind
        ).toBe(HIGHLIGHT_KINDS.NO_SELECTION);

        const excluded = companionLayout({
            selected: 0,
            selectedAll: 4,
            error: { qErrorCode: 7005 },
        });
        expect(describeHighlights({ field: 'match', companionLayout: excluded })).toEqual({
            kind: HIGHLIGHT_KINDS.EXCLUDED,
            field: 'match',
            excluded: 4,
        });
    });

    it('reports an engine error on the highlight cube while values are selected', () => {
        const layout = companionLayout({ selected: 2, error: { qErrorCode: 7009 } });
        expect(describeHighlights({ field: 'match', companionLayout: layout })).toMatchObject({
            kind: HIGHLIGHT_KINDS.ERROR,
            error: { qErrorCode: 7009 },
        });

        const onDimension = companionLayout({ selected: 2 });
        onDimension.qHyperCube.qDimensionInfo = [{ qError: { qErrorCode: 7004 } }];
        expect(describeHighlights({ field: 'match', companionLayout: onDimension })).toMatchObject({
            kind: HIGHLIGHT_KINDS.ERROR,
            error: { qErrorCode: 7004 },
        });
    });

    it('counts the selected values that are still possible', () => {
        const layout = companionLayout({ selected: 3, selectedAll: 5, total: 3 });
        expect(describeHighlights({ field: 'match', companionLayout: layout })).toEqual({
            kind: HIGHLIGHT_KINDS.VALUES,
            field: 'match',
            source: 'selected',
            total: 3,
        });
    });

    it('uses the possible values when nothing is selected in the field', () => {
        const layout = companionLayout({ selected: 0, selectedAll: 0, total: 2 });
        expect(describeHighlights({ field: 'match', companionLayout: layout })).toEqual({
            kind: HIGHLIGHT_KINDS.VALUES,
            field: 'match',
            source: 'possible',
            total: 2,
        });
    });

    it('says when nothing is selected and no value of the field is possible', () => {
        const layout = companionLayout({ selected: 0, selectedAll: 0, total: 0 });
        expect(describeHighlights({ field: 'match', companionLayout: layout })).toEqual({
            kind: HIGHLIGHT_KINDS.NONE_POSSIBLE,
            field: 'match',
        });
    });

    it('reports an excluded selection rather than falling back to possible values', () => {
        const layout = companionLayout({ selected: 0, selectedAll: 2, total: 5 });
        expect(describeHighlights({ field: 'match', companionLayout: layout }).kind).toBe(
            HIGHLIGHT_KINDS.EXCLUDED
        );
    });
});

describe('createHighlightSource', () => {
    const highlight = { field: 'match', limit: 1000 };

    it('answers off without reading the companion when no field is set', async () => {
        const companion = fakeCompanion(companionLayout({ selected: 1 }));
        const source = createHighlightSource({ companion });
        await expect(
            source.load({ app: {}, definition: {}, highlight: { field: '', limit: 10 } })
        ).resolves.toEqual({
            kind: HIGHLIGHT_KINDS.OFF,
        });
        expect(companion.session).not.toHaveBeenCalled();
    });

    it('reads the companion with the definition it is given', async () => {
        const companion = fakeCompanion(companionLayout({ selected: 1 }));
        const app = { id: 'app' };
        const definition = { qInfo: { qType: 'chatbox-companion' } };
        await createHighlightSource({ companion }).load({ app, definition, highlight });
        expect(companion.session).toHaveBeenCalledWith(app, definition);
    });

    it('answers the selected values that arrived with the layout', async () => {
        const layout = companionLayout({ selected: 3 });
        layout.qHyperCube.qDataPages[0].qMatrix[1] = [{ qText: '-', qElemNumber: -2 }];
        const companion = fakeCompanion(layout);

        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight,
        });
        expect(result).toEqual({
            kind: HIGHLIGHT_KINDS.VALUES,
            field: 'match',
            source: 'selected',
            total: 3,
            values: ['value 0', 'value 2'],
            valueElements: new Map([
                ['value 0', 0],
                ['value 2', 2],
            ]),
            rows: [
                { value: 'value 0', category: null },
                { value: 'value 2', category: null },
            ],
            truncated: false,
            limit: 1000,
            rowsFull: false,
            locked: { highlight: false, category: false },
            categories: null,
        });
        expect(companion.model.getHyperCubeData).not.toHaveBeenCalled();
    });

    it('pages past the rows in the layout, up to the limit, and says what was left out', async () => {
        const companion = fakeCompanion(
            companionLayout({ selected: 12000, total: 12000, initial: 5000 })
        );
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight: { field: 'match', limit: 10000 },
        });

        expect(result.values).toHaveLength(10000);
        expect(result.values[9999]).toBe('value 9999');
        expect(result).toMatchObject({ truncated: true, total: 12000, limit: 10000 });
        expect(companion.model.getHyperCubeData).toHaveBeenCalledTimes(1);
    });

    it('answers a description without fetching when there is nothing to fetch', async () => {
        const companion = fakeCompanion(companionLayout({ selected: 0, selectedAll: 0 }));
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight,
        });
        expect(result.kind).toBe(HIGHLIGHT_KINDS.NONE_POSSIBLE);
        expect(companion.model.getHyperCubeData).not.toHaveBeenCalled();
    });

    it('answers the possible values when nothing is selected in the field', async () => {
        const companion = fakeCompanion(companionLayout({ selected: 0, selectedAll: 0, total: 2 }));
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight,
        });
        expect(result).toMatchObject({ source: 'possible', values: ['value 0', 'value 1'] });
    });

    it('asks for a selection instead when possible values are switched off', async () => {
        const companion = fakeCompanion(companionLayout({ selected: 0, selectedAll: 0, total: 2 }));
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight: { ...highlight, possibleWhenNoneSelected: false },
        });
        expect(result).toEqual({ kind: HIGHLIGHT_KINDS.NO_SELECTION, field: 'match' });
        expect(companion.model.getHyperCubeData).not.toHaveBeenCalled();
    });

    it('answers an error, and logs it, when paging fails', async () => {
        const logger = { warn: vi.fn() };
        const failure = Object.assign(new Error('Too many cells'), { code: 7009 });
        const companion = fakeCompanion(
            companionLayout({ selected: 6000, total: 6000, initial: 5000 })
        );
        companion.model.getHyperCubeData.mockRejectedValueOnce(failure);

        const result = await createHighlightSource({ companion, logger }).load({
            app: {},
            definition: {},
            highlight: { field: 'match', limit: 10000 },
        });
        expect(result).toEqual({ kind: HIGHLIGHT_KINDS.ERROR, field: 'match', error: failure });
        expect(logger.warn).toHaveBeenCalledWith(expect.any(String), failure);
    });

    it('answers null when a newer request starts while the companion is read', async () => {
        const companion = fakeCompanion(companionLayout({ selected: 1 }));
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight,
            isStale: () => true,
        });
        expect(result).toBeNull();
    });

    it('answers null when a newer request starts while values are paged', async () => {
        const companion = fakeCompanion(
            companionLayout({ selected: 6000, total: 6000, initial: 5000 })
        );
        let stale = false;
        companion.model.getHyperCubeData.mockImplementationOnce(async () => {
            stale = true;
            return [{ qMatrix: [] }];
        });
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight: { field: 'match', limit: 10000 },
            isStale: () => stale,
        });
        expect(result).toBeNull();
    });
});

/** A value cell, a category cell with an optional colour attribute, as the engine sends them. */
function pair(value, valueElem, category, categoryElem, color) {
    const categoryCell =
        category === null
            ? { qText: '-', qElemNumber: -2, qIsNull: true }
            : { qText: category, qElemNumber: categoryElem };
    if (color !== undefined) categoryCell.qAttrExps = { qValues: [color] };
    return [{ qText: value, qElemNumber: valueElem }, categoryCell];
}

describe('categoryProblem', () => {
    it('recognises a category field that is not in the data model', () => {
        // Captured from the engine: the column is dropped (qcx 1) and its info carries error 7000.
        const layout = {
            categorySelectedAll: -1,
            qHyperCube: {
                qSize: { qcx: 1, qcy: 20017 },
                qDimensionInfo: [{}, { qError: { qErrorCode: 7000, qContext: 'no_such_field' } }],
            },
        };
        expect(categoryProblem(layout)).toEqual({ kind: 'field-missing' });
    });

    it('reports an engine error on the category column, or a check that gave no number', () => {
        const broken = {
            categorySelectedAll: 0,
            qHyperCube: { qDimensionInfo: [{}, { qError: { qErrorCode: 7004 } }] },
        };
        expect(categoryProblem(broken)).toEqual({ kind: 'error', error: { qErrorCode: 7004 } });
        expect(categoryProblem({ categorySelectedAll: 'NaN' })).toEqual({
            kind: 'error',
            error: null,
        });
    });

    it('has nothing to say about a sound category column', () => {
        expect(categoryProblem({ categorySelectedAll: 2, qHyperCube: {} })).toBeNull();
    });
});

describe('describeHighlights with categories', () => {
    it('counts values with the engine, since rows pair values with categories', () => {
        const layout = companionLayout({ selected: 0, selectedAll: 0, total: 20018 });
        layout.qHyperCube.qSize.qcx = 2;
        layout.highlightPossible = 20017;
        expect(describeHighlights({ field: 'match', companionLayout: layout })).toMatchObject({
            kind: HIGHLIGHT_KINDS.VALUES,
            total: 20017,
        });
    });

    it('falls back to the row count without a possible count, and without a category column', () => {
        const layout = companionLayout({ selected: 2, total: 3 });
        layout.qHyperCube.qSize.qcx = 2;
        expect(describeHighlights({ field: 'match', companionLayout: layout }).total).toBe(3);

        const dropped = companionLayout({ selected: 2, total: 3 });
        dropped.highlightPossible = 99;
        expect(describeHighlights({ field: 'match', companionLayout: dropped }).total).toBe(3);
    });

    it('keeps the values when only the category column has an error', () => {
        const layout = companionLayout({ selected: 2 });
        layout.qHyperCube.qDimensionInfo = [{}, { qError: { qErrorCode: 7000 } }];
        expect(describeHighlights({ field: 'match', companionLayout: layout }).kind).toBe(
            HIGHLIGHT_KINDS.VALUES
        );
    });
});

describe('groupValueRows', () => {
    // Captured shape: 978-91-0096-205-7 is both a credit-card and an isbn value in the test app.
    const matrix = [
        pair('070-123 45 67', 3, 'se-phone', 1),
        pair('978-91-0096-205-7', 9, 'credit-card', 5),
        pair('978-91-0096-205-7', 9, 'isbn', 4),
        pair('a@x.se', 5, 'email', 0),
        pair('no category', 7, null),
    ];

    it('keeps every category of a value, and each category once', () => {
        const group = groupValueRows(matrix, { limit: 10, complete: true });
        expect(group.values).toEqual([
            '070-123 45 67',
            '978-91-0096-205-7',
            'a@x.se',
            'no category',
        ]);
        expect(group.rows).toEqual([
            { value: '070-123 45 67', category: 'se-phone' },
            { value: '978-91-0096-205-7', category: 'credit-card' },
            { value: '978-91-0096-205-7', category: 'isbn' },
            { value: 'a@x.se', category: 'email' },
            { value: 'no category', category: null },
        ]);
        expect(group.categories).toEqual([
            { name: 'se-phone', elemNumber: 1, color: null, selected: false },
            { name: 'credit-card', elemNumber: 5, color: null, selected: false },
            { name: 'isbn', elemNumber: 4, color: null, selected: false },
            { name: 'email', elemNumber: 0, color: null, selected: false },
        ]);
        expect(group.valueElements).toEqual(
            new Map([
                ['070-123 45 67', 3],
                ['978-91-0096-205-7', 9],
                ['a@x.se', 5],
                ['no category', 7],
            ])
        );
        expect(group.truncated).toBe(false);
    });

    it('says which categories are selected, locked selections included', () => {
        // Captured on the test server: a selected category's cells read S, and L once locked.
        const cell = (name, elem, state) => [
            { qText: `v${elem}`, qElemNumber: elem },
            { qText: name, qElemNumber: elem, qState: state },
        ];
        const group = groupValueRows(
            [cell('email', 0, 'S'), cell('isbn', 4, 'L'), cell('se-phone', 1, 'O')],
            { limit: 10, complete: true }
        );
        expect(group.categories.map((category) => [category.name, category.selected])).toEqual([
            ['email', true],
            ['isbn', true],
            ['se-phone', false],
        ]);
    });

    it('counts the limit in values, never cutting a value off from some of its categories', () => {
        const group = groupValueRows(matrix, { limit: 2, complete: true });
        expect(group.values).toEqual(['070-123 45 67', '978-91-0096-205-7']);
        expect(group.rows).toHaveLength(3);
        expect(group).toMatchObject({ truncated: true, limited: true });

        const exact = groupValueRows(matrix.slice(0, 3), { limit: 2, complete: true });
        expect(exact.truncated).toBe(false);
    });

    it('leaves out the last value when rows were left unread, since its categories may go on', () => {
        const group = groupValueRows(matrix.slice(0, 2), { limit: 10, complete: false });
        expect(group.values).toEqual(['070-123 45 67']);
        expect(group.rows).toEqual([{ value: '070-123 45 67', category: 'se-phone' }]);
        expect(group.categories.map((category) => category.name)).toEqual(['se-phone']);
        expect(group).toMatchObject({ truncated: true, limited: false });
    });

    it('reads what the colour expression returned, telling nothing apart from a colour', () => {
        // Captured from the engine: RGB() answers a number and its text, a text colour answers
        // "NaN" as its number, and no colour answers only "NaN".
        const colored = [
            pair('a', 1, 'isbn', 4, { qText: 'RGB(255,0,0)', qNum: 4294901760 }),
            pair('b', 2, 'credit-card', 5, { qText: '#00ff00', qNum: 'NaN' }),
            pair('c', 3, 'se-phone', 1, { qNum: 'NaN' }),
        ];
        const group = groupValueRows(colored, { limit: 10, complete: true, colorIndex: 0 });
        expect(group.categories.map((category) => category.color)).toEqual([
            { text: 'RGB(255,0,0)', number: 4294901760 },
            { text: '#00ff00', number: null },
            null,
        ]);
        expect(
            groupValueRows(colored, { limit: 10, complete: true, colorIndex: -1 }).categories[0]
                .color
        ).toBeNull();
    });

    it('treats a row without a category column as a value without a category', () => {
        const group = groupValueRows([[{ qText: 'x', qElemNumber: 0 }]], {
            limit: 10,
            complete: true,
        });
        expect(group.rows).toEqual([{ value: 'x', category: null }]);
        expect(group.categories).toEqual([]);
    });

    it('skips null value rows, and keys values by text when there is no element number', () => {
        const group = groupValueRows(
            [
                [
                    { qText: '-', qElemNumber: -2 },
                    { qText: 'email', qElemNumber: 0 },
                ],
                [{ qText: 'x' }, { qText: 'email', qElemNumber: 0 }],
                [{ qText: 'x' }, { qText: 'phone', qElemNumber: 1 }],
            ],
            { limit: 10, complete: true }
        );
        expect(group.values).toEqual(['x']);
        expect(group.rows).toHaveLength(2);
    });
});

describe('createHighlightSource with categories', () => {
    const highlight = { field: 'match', limit: 1000 };
    const category = { field: 'pattern', colorExpression: '' };

    /** A companion layout for a value and category cube. */
    function categoryLayout({ matrix, total = matrix.length, possible, attributes } = {}) {
        return {
            highlightSelected: 0,
            highlightSelectedAll: 0,
            highlightPossible: possible,
            categorySelectedAll: 0,
            qHyperCube: {
                qSize: { qcx: 2, qcy: total },
                qDimensionInfo: [{}, { qAttrExprInfo: attributes }],
                qDataPages: [
                    {
                        qArea: { qTop: 0, qLeft: 0, qWidth: 2, qHeight: matrix.length },
                        qMatrix: matrix,
                    },
                ],
            },
        };
    }

    /** A model that answers pages of generated values, each value in `perValue` categories. */
    function pagingModel(perValue) {
        return {
            getHyperCubeData: vi.fn(async (_path, [page]) => [
                {
                    qArea: page,
                    qMatrix: Array.from({ length: page.qHeight }, (_, i) => {
                        const row = page.qTop + i;
                        const value = Math.floor(row / perValue);
                        return pair(`v${value}`, value, `c${row % perValue}`, row % perValue);
                    }),
                },
            ]),
        };
    }

    it('answers each value with its categories and the categories seen', async () => {
        const layout = categoryLayout({
            matrix: [pair('a@x.se', 5, 'email', 0), pair('b@x.se', 6, 'email', 0)],
            possible: 2,
        });
        const companion = fakeCompanion(layout);
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight,
            category,
        });
        expect(result).toMatchObject({
            kind: HIGHLIGHT_KINDS.VALUES,
            source: 'possible',
            total: 2,
            values: ['a@x.se', 'b@x.se'],
            rows: [
                { value: 'a@x.se', category: 'email' },
                { value: 'b@x.se', category: 'email' },
            ],
            truncated: false,
            categories: {
                field: 'pattern',
                problem: null,
                expression: null,
                list: [{ name: 'email', elemNumber: 0, color: null }],
            },
        });
    });

    it('says when the highlight or the category field is locked', async () => {
        const layout = categoryLayout({ matrix: [pair('a@x.se', 5, 'email', 0)] });
        // Captured on the test server: qLocked appears on a locked field's dimension info.
        layout.qHyperCube.qDimensionInfo = [{}, { qLocked: true }];
        const result = await createHighlightSource({ companion: fakeCompanion(layout) }).load({
            app: {},
            definition: {},
            highlight,
            category,
        });
        expect(result.locked).toEqual({ highlight: false, category: true });
    });

    it('reads colours from the attribute with the colour id, wherever it sits', async () => {
        const layout = categoryLayout({
            matrix: [
                [
                    { qText: 'a', qElemNumber: 0 },
                    {
                        qText: 'isbn',
                        qElemNumber: 4,
                        qAttrExps: { qValues: [{ qNum: 1 }, { qText: '#ff0000', qNum: 'NaN' }] },
                    },
                ],
            ],
            attributes: [{ id: 'other' }, { id: 'color' }],
        });
        const result = await createHighlightSource({ companion: fakeCompanion(layout) }).load({
            app: {},
            definition: {},
            highlight,
            category: { field: 'pattern', colorExpression: "'#ff0000'" },
        });
        expect(result.categories.list[0].color).toEqual({ text: '#ff0000', number: null });
    });

    /** A companion answering the layout, with a model that pages generated rows. */
    function pagingCompanion(layout, perValue) {
        const model = pagingModel(perValue);
        return { model, session: vi.fn(async () => ({ model, layout })) };
    }

    it('pages on until it has seen one value past the limit, and keeps whole values', async () => {
        // 3 categories per value: the first 1,000 values take 3,000 rows.
        const companion = pagingCompanion(
            categoryLayout({ matrix: [], total: 9000, possible: 3000 }),
            3
        );
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight,
            category,
        });
        expect(result.values).toHaveLength(1000);
        expect(result.rows).toHaveLength(3000);
        expect(result).toMatchObject({ truncated: true, total: 3000, rowsFull: false });
        expect(companion.model.getHyperCubeData).toHaveBeenCalledTimes(1);
    });

    it(`reads at most ${MAX_CATEGORY_ROWS} rows when categories multiply the rows`, async () => {
        // A data island: every value paired with each of 25 categories.
        const companion = pagingCompanion(
            categoryLayout({ matrix: [], total: 250_000, possible: 10_000 }),
            25
        );
        const result = await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight: { field: 'match', limit: 10_000 },
            category,
        });
        // The 800th value's rows end exactly at the cap, but nothing says it has no more categories.
        expect(result.values).toHaveLength(MAX_CATEGORY_ROWS / 25 - 1);
        expect(result.rows).toHaveLength(MAX_CATEGORY_ROWS - 25);
        expect(result).toMatchObject({ truncated: true, total: 10_000, rowsFull: true });
        expect(companion.model.getHyperCubeData).toHaveBeenCalledTimes(4);
    });

    it('keeps highlighting, and says why, when the category field is not in the data model', async () => {
        const layout = companionLayout({ selected: 2, total: 2 });
        layout.categorySelectedAll = -1;
        layout.qHyperCube.qDimensionInfo = [{}, { qError: { qErrorCode: 7000 } }];
        const app = { checkExpression: vi.fn(async () => ({ qErrorMsg: 'broken' })) };
        const result = await createHighlightSource({ companion: fakeCompanion(layout) }).load({
            app,
            definition: {},
            highlight,
            category: { field: 'pattren', colorExpression: 'broken(' },
        });
        expect(result).toMatchObject({
            kind: HIGHLIGHT_KINDS.VALUES,
            values: ['value 0', 'value 1'],
            rows: [
                { value: 'value 0', category: null },
                { value: 'value 1', category: null },
            ],
            categories: {
                field: 'pattren',
                problem: { kind: 'field-missing' },
                expression: null,
                list: [],
            },
        });
    });

    it('never presents a missing category column as values without categories', async () => {
        // A layout that says the field exists, yet has no category column.
        const layout = companionLayout({ selected: 1, total: 1 });
        layout.categorySelectedAll = 0;
        const result = await createHighlightSource({ companion: fakeCompanion(layout) }).load({
            app: {},
            definition: {},
            highlight,
            category,
        });
        expect(result.categories.problem).toEqual({ kind: 'error', error: null });
    });

    it('checks the colour expression beside the companion read, and reports its problem', async () => {
        const layout = categoryLayout({ matrix: [pair('a', 0, 'isbn', 4, { qNum: 'NaN' })] });
        const app = {
            checkExpression: vi.fn(async () => ({
                qErrorMsg: "Error in expression:\n')' expected",
                qBadFieldNames: [],
            })),
        };
        const result = await createHighlightSource({ companion: fakeCompanion(layout) }).load({
            app,
            definition: {},
            highlight,
            category: { field: 'pattern', colorExpression: 'If(pattern = , RGB(1,2,3)' },
        });
        expect(app.checkExpression).toHaveBeenCalledWith('If(pattern = , RGB(1,2,3)', []);
        expect(result.categories.expression).toEqual({ kind: 'syntax', message: "')' expected" });
    });

    it('does not check a colour expression without a category field', async () => {
        const app = { checkExpression: vi.fn() };
        const companion = fakeCompanion(companionLayout({ selected: 1 }));
        const result = await createHighlightSource({ companion }).load({
            app,
            definition: {},
            highlight,
            category: { field: '', colorExpression: 'Red()' },
        });
        expect(app.checkExpression).not.toHaveBeenCalled();
        expect(result.categories).toBeNull();
    });
});

describe('createHighlightSource in chatbox', () => {
    it('keeps a keyword that really is "-", which the engine also shows for null', async () => {
        const layout = companionLayout({ selected: 2, total: 2 });
        layout.qHyperCube.qDataPages[0].qMatrix = [
            [{ qText: '-', qElemNumber: 4 }],
            [{ qText: '-', qElemNumber: -2, qIsNull: true }],
        ];
        const result = await createHighlightSource({ companion: fakeCompanion(layout) }).load({
            app: {},
            definition: {},
            highlight: { field: 'match', limit: 1000 },
        });
        expect(result.values).toEqual(['-']);
        expect(result.valueElements).toEqual(new Map([['-', 4]]));
    });

    it('reads the companion cube at its own path, a page at a time within the cell budget', async () => {
        const companion = fakeCompanion(
            companionLayout({ selected: 12000, total: 12000, initial: 5000 })
        );
        await createHighlightSource({ companion }).load({
            app: {},
            definition: {},
            highlight: { field: 'match', limit: 10000 },
        });
        expect(companion.model.getHyperCubeData).toHaveBeenCalledWith('/qHyperCubeDef', [
            { qTop: 5000, qLeft: 0, qWidth: 1, qHeight: 5000 },
        ]);
    });
});
