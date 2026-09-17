import { describe, it, expect, vi } from 'vitest';
import {
    createTimeOrder,
    isSortedBy,
    messageIdColumnOf,
    timeSortCriteria,
    timestampExpressionOf,
} from '../../src/qix/time-order';

const TS = 'Num(Min([SentAt]))';

/** A layout, which the message id column is resolved from. */
const layout = (dims = [{ cId: 'd_msgid' }, { cId: 'd_author' }], id = 'obj-1') => ({
    qInfo: { qId: id },
    qHyperCube: { qDimensionInfo: dims, qMeasureInfo: [{ cId: 'm_text' }] },
    chatbox: {},
});

/** A message id dimension as the properties hold it. */
const messageId = ({ ts = TS, sort = [{ qSortByNumeric: 1 }] } = {}) => ({
    qDef: { cId: 'd_msgid', qSortCriterias: sort },
    qAttributeExpressions: [
        { id: 'tsText', qExpression: 'Only(Time([SentAt]))' },
        { id: 'ts', qExpression: ts },
    ],
});

/** A model whose effective properties hold the given dimensions. */
const mkModel = (dims) => ({
    getEffectiveProperties: vi.fn(async () => ({ qHyperCubeDef: { qDimensions: dims } })),
    getProperties: vi.fn(async () => ({ qHyperCubeDef: { qDimensions: dims } })),
    applyPatches: vi.fn(async () => {}),
});

describe('timestampExpressionOf', () => {
    it('reads the timestamp attribute expression, as a sort can use it', () => {
        expect(timestampExpressionOf(messageId())).toBe(TS);
        expect(timestampExpressionOf(messageId({ ts: `  =${TS} ` }))).toBe(TS);
    });

    it('is empty without one', () => {
        expect(timestampExpressionOf(messageId({ ts: '' }))).toBe('');
        expect(
            timestampExpressionOf({ qAttributeExpressions: [{ id: 'badge', qExpression: 'X' }] })
        ).toBe('');
        expect(timestampExpressionOf(undefined)).toBe('');
    });
});

describe('timeSortCriteria', () => {
    it('sorts by the timestamp, with the id for ties', () => {
        expect(timeSortCriteria(TS)).toEqual([
            { qSortByExpression: 1, qExpression: { qv: TS }, qSortByNumeric: 1 },
        ]);
    });
});

describe('isSortedBy', () => {
    it('reads saved and patched criteria alike', () => {
        // How Qlik Sense May 2026 returned them: saved properties give every field, a soft patch only the
        // ones it set.
        const saved = {
            qSortByState: 0,
            qSortByFrequency: 0,
            qSortByNumeric: 1,
            qSortByAscii: 0,
            qSortByLoadOrder: 0,
            qSortByExpression: 1,
            qExpression: { qv: TS },
            qSortByGreyness: 0,
        };
        expect(isSortedBy(messageId({ sort: [saved] }), TS)).toBe(true);
        expect(isSortedBy(messageId({ sort: timeSortCriteria(TS) }), TS)).toBe(true);
    });

    it('is false for any other sort', () => {
        expect(isSortedBy(messageId(), TS)).toBe(false);
        expect(
            isSortedBy(
                messageId({ sort: [{ qSortByExpression: -1, qExpression: { qv: TS } }] }),
                TS
            )
        ).toBe(false);
        expect(isSortedBy(messageId({ sort: timeSortCriteria('Min([Other])') }), TS)).toBe(false);
        expect(isSortedBy(messageId({ sort: timeSortCriteria('') }), '')).toBe(false);
    });
});

describe('messageIdColumnOf', () => {
    it('finds the message id by its role, wherever it is', () => {
        expect(messageIdColumnOf(layout([{ cId: 'd_author' }, { cId: 'd_msgid' }])).col).toBe(1);
        expect(messageIdColumnOf(layout([]))).toBeNull();
    });
});

describe('createTimeOrder', () => {
    it('sorts the messages by their timestamp for this session', async () => {
        // Regression: the message id only ever sorted numerically, so ids that do not rise with time
        // showed days out of order — Feb 3, Feb 5, Feb 3 — seen on a 0.4.0 server.
        const model = mkModel([messageId(), { qDef: { cId: 'd_author' } }]);
        await expect(createTimeOrder().ensure({ model, layout: layout() })).resolves.toBe(true);
        expect(model.applyPatches).toHaveBeenCalledTimes(1);
        const [patches, soft] = model.applyPatches.mock.calls[0];
        expect(soft).toBe(true);
        expect(patches).toHaveLength(1);
        expect(patches[0].qOp).toBe('replace');
        expect(patches[0].qPath).toBe('/qHyperCubeDef/qDimensions/0/qDef/qSortCriterias');
        expect(JSON.parse(patches[0].qValue)).toEqual(timeSortCriteria(TS));
    });

    it('patches the message id column, not the first dimension', async () => {
        const model = mkModel([{ qDef: { cId: 'd_author' } }, messageId()]);
        await createTimeOrder().ensure({
            model,
            layout: layout([{ cId: 'd_author' }, { cId: 'd_msgid' }]),
        });
        expect(model.applyPatches.mock.calls[0][0][0].qPath).toBe(
            '/qHyperCubeDef/qDimensions/1/qDef/qSortCriterias'
        );
    });

    it('leaves messages already in time order, and those without a timestamp, alone', async () => {
        for (const dimension of [
            messageId({ sort: timeSortCriteria(TS) }),
            messageId({ ts: '' }),
        ]) {
            const model = mkModel([dimension]);
            await expect(
                createTimeOrder().ensure({ model, layout: layout([{ cId: 'd_msgid' }]) })
            ).resolves.toBe(false);
            expect(model.applyPatches).not.toHaveBeenCalled();
        }
    });

    it('never patches in edit mode, where the sort is saved, or in a snapshot', async () => {
        const model = mkModel([messageId()]);
        const order = createTimeOrder();
        await expect(order.ensure({ model, layout: layout(), edit: true })).resolves.toBe(false);
        await expect(order.ensure({ model, layout: layout(), snapshot: true })).resolves.toBe(
            false
        );
        expect(model.getEffectiveProperties).not.toHaveBeenCalled();
        expect(model.applyPatches).not.toHaveBeenCalled();
    });

    it('tries once for each object and message id column, so the render a patch brings reads rows', async () => {
        const model = mkModel([messageId()]);
        const order = createTimeOrder();
        await expect(order.ensure({ model, layout: layout() })).resolves.toBe(true);
        await expect(order.ensure({ model, layout: layout() })).resolves.toBe(false);
        expect(model.getEffectiveProperties).toHaveBeenCalledTimes(1);
        // Another object is its own question.
        await expect(order.ensure({ model, layout: layout(undefined, 'obj-2') })).resolves.toBe(
            true
        );
    });

    it('reads the rows as they are when the engine refuses the patch', async () => {
        const model = mkModel([messageId()]);
        model.applyPatches = vi.fn(async () => {
            throw new Error('Access denied');
        });
        const order = createTimeOrder();
        await expect(order.ensure({ model, layout: layout() })).resolves.toBe(false);
        await expect(order.ensure({ model, layout: layout() })).resolves.toBe(false);
        expect(model.applyPatches).toHaveBeenCalledTimes(1);
    });

    it('reads the saved properties when effective ones are not on offer', async () => {
        const model = mkModel([messageId()]);
        delete model.getEffectiveProperties;
        await expect(createTimeOrder().ensure({ model, layout: layout() })).resolves.toBe(true);
        expect(model.getProperties).toHaveBeenCalledTimes(1);
    });
});
