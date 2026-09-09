import { describe, it, expect, vi } from 'vitest';
import {
    buildAttributeExpressions,
    isInSync,
    syncAttributeExpressions,
} from '../../src/qix/sync-attrs';
import { ATTR_ORDER } from '../../src/ext/metadata-section';

const layout = (attrs, dims = [{ cId: 'd_msgid' }, { cId: 'd_author' }]) => ({
    qHyperCube: { qDimensionInfo: dims, qMeasureInfo: [{ cId: 'm_text' }] },
    chatbox: { attrs },
});

describe('buildAttributeExpressions', () => {
    it('emits every slot in canonical order, even when unset', () => {
        const out = buildAttributeExpressions({});
        expect(out.map((e) => e.id)).toEqual(ATTR_ORDER);
        expect(out.every((e) => e.qExpression === '' && e.qAttribute === true)).toBe(true);
    });

    it('carries configured expressions through', () => {
        const out = buildAttributeExpressions({ ts: 'Num(Min(SentAt))', accent: 'Only(Color)' });
        expect(out.find((e) => e.id === 'ts').qExpression).toBe('Num(Min(SentAt))');
        expect(out.find((e) => e.id === 'accent').qExpression).toBe('Only(Color)');
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

describe('syncAttributeExpressions', () => {
    const mkModel = (dims) => ({
        getProperties: vi.fn(async () => ({ qHyperCubeDef: { qDimensions: dims } })),
        setProperties: vi.fn(async () => {}),
    });

    it('writes the expressions onto the message-id dimension', async () => {
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }, { qDef: { cId: 'd_author' } }]);
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout({ ts: 'Num(Min(SentAt))' }),
            canEdit: true,
        });
        expect(wrote).toBe(true);
        const written = model.setProperties.mock.calls[0][0].qHyperCubeDef.qDimensions[0];
        expect(written.qAttributeExpressions.find((e) => e.id === 'ts').qExpression).toBe(
            'Num(Min(SentAt))'
        );
        // and NOT onto the author dimension
        const author = model.setProperties.mock.calls[0][0].qHyperCubeDef.qDimensions[1];
        expect(author.qAttributeExpressions).toBeUndefined();
    });

    it('does NOT write when already in sync — it must not loop', async () => {
        const dims = [
            {
                qDef: { cId: 'd_msgid' },
                qAttributeExpressions: buildAttributeExpressions({ ts: 'A' }),
            },
        ];
        const model = mkModel(dims);
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout({ ts: 'A' }, [{ cId: 'd_msgid' }]),
            canEdit: true,
        });
        expect(wrote).toBe(false);
        expect(model.setProperties).not.toHaveBeenCalled();
    });

    it('never writes outside edit mode', async () => {
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }]);
        expect(
            await syncAttributeExpressions({ model, layout: layout({ ts: 'A' }), canEdit: false })
        ).toBe(false);
        expect(model.getProperties).not.toHaveBeenCalled();
    });

    it('swallows a write failure rather than blanking the chart', async () => {
        const model = {
            getProperties: vi.fn(async () => ({
                qHyperCubeDef: { qDimensions: [{ qDef: { cId: 'd_msgid' } }] },
            })),
            setProperties: vi.fn(async () => {
                throw new Error('Access denied');
            }),
        };
        await expect(
            syncAttributeExpressions({ model, layout: layout({ ts: 'A' }), canEdit: true })
        ).resolves.toBe(false);
    });

    it('does nothing when there is no message-id dimension yet', async () => {
        const model = mkModel([]);
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
    it('NEVER wipes working expressions when the panel bag is empty', async () => {
        // Regression: an object configured outside the panel (seeded by added(),
        // set via the API, or imported) must not be blanked just because
        // chatbox.attrs has never been filled in.
        const live = [
            { id: 'ts', qExpression: 'Num(Min(SentAt))', qAttribute: true },
            { id: 'accent', qExpression: 'Only(SpeakerColor)', qAttribute: true },
        ];
        const model = {
            getProperties: vi.fn(async () => ({
                qHyperCubeDef: {
                    qDimensions: [{ qDef: { cId: 'd_msgid' }, qAttributeExpressions: live }],
                },
            })),
            setProperties: vi.fn(async () => {}),
        };
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout({}, [{ cId: 'd_msgid' }]),
            canEdit: true,
        });
        expect(wrote).toBe(false);
        expect(model.setProperties).not.toHaveBeenCalled();
    });

    it('still writes when the panel bag has content', async () => {
        const model = {
            getProperties: vi.fn(async () => ({
                qHyperCubeDef: {
                    qDimensions: [
                        {
                            qDef: { cId: 'd_msgid' },
                            qAttributeExpressions: [{ id: 'ts', qExpression: 'OLD' }],
                        },
                    ],
                },
            })),
            setProperties: vi.fn(async () => {}),
        };
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout({ ts: 'NEW' }, [{ cId: 'd_msgid' }]),
            canEdit: true,
        });
        expect(wrote).toBe(true);
    });
});
