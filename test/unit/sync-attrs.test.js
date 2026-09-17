import { describe, it, expect, vi } from 'vitest';
import {
    buildAttributeExpressions,
    formulaOf,
    isBagUnset,
    isInSync,
    syncAttributeExpressions,
} from '../../src/qix/sync-attrs';
import { ATTR_ORDER } from '../../src/ext/metadata-section';

/** A layout, which the roles are resolved from. */
const layout = (dims = [{ cId: 'd_msgid' }, { cId: 'd_author' }], chatbox = {}) => ({
    qHyperCube: { qDimensionInfo: dims, qMeasureInfo: [{ cId: 'm_text' }] },
    chatbox,
});

/**
 * A model whose properties hold the dimensions and, when given, the panel's bag. The bag is read
 * from the properties, so it goes here rather than on the layout.
 *
 * @param {object[]} dims - The qDimensions.
 * @param {object} [attrs] - The `chatbox.attrs` bag; left out, the object has none.
 * @returns {object} The model.
 */
const mkModel = (dims, attrs) => ({
    getProperties: vi.fn(async () => ({
        qHyperCubeDef: { qDimensions: dims },
        chatbox: attrs === undefined ? {} : { attrs },
    })),
    setProperties: vi.fn(async () => {}),
});

/** The attribute expressions the first write put on the message-id dimension. */
const written = (model) =>
    model.setProperties.mock.calls[0][0].qHyperCubeDef.qDimensions[0].qAttributeExpressions;

/** One slot's expression. */
const expressionOf = (expressions, id) => expressions.find((e) => e.id === id).qExpression;

describe('formulaOf', () => {
    it('reads a plain value as it was typed', () => {
        expect(formulaOf('Only(ThreadId)')).toBe('Only(ThreadId)');
        expect(formulaOf('')).toBe('');
    });

    it('reads the formula of a value typed with =, not its result', () => {
        // How Qlik Sense May 2026 stored `=Only(ThreadId)` typed into Badge text.
        expect(formulaOf({ qStringExpression: { qExpr: 'Only(ThreadId)' } })).toBe(
            'Only(ThreadId)'
        );
        // The short form the engine also takes.
        expect(formulaOf({ qStringExpression: '=Only(ThreadId)' })).toBe('=Only(ThreadId)');
    });

    it('is empty for anything else', () => {
        for (const value of [undefined, null, 42, {}, { qStringExpression: {} }]) {
            expect(formulaOf(value)).toBe('');
        }
    });
});

describe('buildAttributeExpressions', () => {
    it('emits every slot in canonical order, even when unset', () => {
        const out = buildAttributeExpressions({});
        expect(out.map((e) => e.id)).toEqual(ATTR_ORDER);
        expect(out.every((e) => e.qExpression === '' && e.qAttribute === true)).toBe(true);
    });

    it('carries configured expressions through', () => {
        const out = buildAttributeExpressions({
            ts: 'Num(Min(SentAt))',
            accent: { qStringExpression: { qExpr: 'Only(Color)' } },
        });
        expect(expressionOf(out, 'ts')).toBe('Num(Min(SentAt))');
        expect(expressionOf(out, 'accent')).toBe('Only(Color)');
    });
});

describe('isInSync', () => {
    it('detects a match and any drift', () => {
        const desired = buildAttributeExpressions({ ts: 'A' });
        expect(isInSync(desired, desired)).toBe(true);
        expect(isInSync([], desired)).toBe(false);
        expect(isInSync(undefined, desired)).toBe(false);
        const reordered = [...desired].reverse();
        expect(isInSync(reordered, desired)).toBe(false);
    });
});

describe('isBagUnset', () => {
    it('is unset when no field has held a value', () => {
        for (const attrs of [undefined, null, {}]) {
            expect(isBagUnset(attrs)).toBe(true);
        }
    });

    it('is set once a field has held a value, even after it was cleared', () => {
        // Clearing a field on Qlik Sense May 2026 left its key behind as ''.
        expect(isBagUnset({ badge: '' })).toBe(false);
        expect(isBagUnset({ badge: 'Only(ThreadId)' })).toBe(false);
        expect(isBagUnset({ badge: { qStringExpression: { qExpr: 'Only(ThreadId)' } } })).toBe(
            false
        );
    });
});

describe('syncAttributeExpressions', () => {
    it('still writes onto the message-id dimension in the From → To model', async () => {
        const model = mkModel(
            [
                { qDef: { cId: 'd_msgid' } },
                { qDef: { cId: 'd_author' } },
                { qDef: { cId: 'd_recipient' } },
            ],
            { ts: 'Num(Min(SentAt))' }
        );
        const fromTo = layout([{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_recipient' }], {
            conversationModel: 'fromTo',
        });
        const wrote = await syncAttributeExpressions({ model, layout: fromTo, canEdit: true });
        expect(wrote).toBe(true);
        const dims = model.setProperties.mock.calls[0][0].qHyperCubeDef.qDimensions;
        expect(dims[0].qAttributeExpressions).toHaveLength(ATTR_ORDER.length);
        expect(dims[2].qAttributeExpressions).toBeUndefined();
    });

    it('writes the expressions onto the message-id dimension', async () => {
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }, { qDef: { cId: 'd_author' } }], {
            ts: 'Num(Min(SentAt))',
        });
        const wrote = await syncAttributeExpressions({ model, layout: layout(), canEdit: true });
        expect(wrote).toBe(true);
        expect(expressionOf(written(model), 'ts')).toBe('Num(Min(SentAt))');
        // and NOT onto the author dimension
        const author = model.setProperties.mock.calls[0][0].qHyperCubeDef.qDimensions[1];
        expect(author.qAttributeExpressions).toBeUndefined();
    });

    it('copies the formula of a value typed with =, not the result the layout holds', async () => {
        // Regression, seen on Qlik Sense May 2026: `=Only(ThreadId)` typed into Badge text was stored
        // as an expression, and the layout held its result for the whole object, '-'. Copied into
        // the cube, '-' gave every message nothing, so no badge showed and nothing said why.
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }, { qDef: { cId: 'd_author' } }], {
            badge: { qStringExpression: { qExpr: 'Only(ThreadId)' } },
        });
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout(undefined, { attrs: { badge: '-' } }),
            canEdit: true,
        });
        expect(wrote).toBe(true);
        expect(expressionOf(written(model), 'badge')).toBe('Only(ThreadId)');
    });

    it('does NOT write when already in sync — it must not loop', async () => {
        const dims = [
            {
                qDef: { cId: 'd_msgid' },
                qAttributeExpressions: buildAttributeExpressions({ ts: 'A' }),
            },
        ];
        const model = mkModel(dims, { ts: 'A' });
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout([{ cId: 'd_msgid' }]),
            canEdit: true,
        });
        expect(wrote).toBe(false);
        expect(model.setProperties).not.toHaveBeenCalled();
    });

    it('never writes outside edit mode', async () => {
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }], { ts: 'A' });
        expect(await syncAttributeExpressions({ model, layout: layout(), canEdit: false })).toBe(
            false
        );
        expect(model.getProperties).not.toHaveBeenCalled();
    });

    it('swallows a write failure rather than blanking the chart', async () => {
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }], { ts: 'A' });
        model.setProperties = vi.fn(async () => {
            throw new Error('Access denied');
        });
        await expect(
            syncAttributeExpressions({ model, layout: layout(), canEdit: true })
        ).resolves.toBe(false);
        expect(model.setProperties).toHaveBeenCalled();
    });

    it('does nothing when there is no message-id dimension yet', async () => {
        const model = mkModel([], { ts: 'A' });
        expect(
            await syncAttributeExpressions({
                model,
                layout: { qHyperCube: { qDimensionInfo: [], qMeasureInfo: [] } },
                canEdit: true,
            })
        ).toBe(false);
    });
});

describe('syncAttributeExpressions — clobber guard', () => {
    const live = () => [
        { id: 'ts', qExpression: 'Num(Min(SentAt))', qAttribute: true },
        { id: 'accent', qExpression: 'Only(SpeakerColor)', qAttribute: true },
    ];

    it.each([
        ['no bag', undefined],
        ['an empty bag', {}],
    ])(
        'NEVER wipes working expressions when the panel was never filled in: %s',
        async (_, attrs) => {
            // Regression: an object configured outside the panel (set via the API, or imported) must not
            // be blanked just because chatbox.attrs has never been filled in.
            const model = mkModel(
                [{ qDef: { cId: 'd_msgid' }, qAttributeExpressions: live() }],
                attrs
            );
            const wrote = await syncAttributeExpressions({
                model,
                layout: layout([{ cId: 'd_msgid' }]),
                canEdit: true,
            });
            expect(wrote).toBe(false);
            expect(model.setProperties).not.toHaveBeenCalled();
        }
    );

    it('still writes when the panel bag has content', async () => {
        const model = mkModel(
            [
                {
                    qDef: { cId: 'd_msgid' },
                    qAttributeExpressions: [{ id: 'ts', qExpression: 'OLD' }],
                },
            ],
            { ts: 'NEW' }
        );
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout([{ cId: 'd_msgid' }]),
            canEdit: true,
        });
        expect(wrote).toBe(true);
    });

    it('clears the expressions when the last field is cleared in the panel', async () => {
        // Regression, seen on Qlik Sense May 2026: clearing Badge text, the only field filled in, left
        // `badge: ''` in the bag. Taken for a panel never filled in, it kept the badge on every message.
        const cleared = Object.fromEntries(ATTR_ORDER.map((id) => [id, '']));
        const model = mkModel(
            [
                {
                    qDef: { cId: 'd_msgid' },
                    qAttributeExpressions: buildAttributeExpressions({ badge: 'Only(ThreadId)' }),
                },
            ],
            cleared
        );
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout([{ cId: 'd_msgid' }]),
            canEdit: true,
        });
        expect(wrote).toBe(true);
        expect(written(model).every((e) => e.qExpression === '')).toBe(true);
    });
});
