import { describe, it, expect, vi } from 'vitest';
import {
    buildAttributeExpressions,
    formulaOf,
    isBagUnset,
    isInSync,
    syncAttributeExpressions,
} from '../../src/qix/sync-attrs';
import { ATTR_ORDER } from '../../src/ext/metadata-section';
import { timeSortCriteria } from '../../src/qix/time-order';

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
    applyPatches: vi.fn(async () => {}),
    // Never used: the sync patches the paths it owns. One test pins that.
    setProperties: vi.fn(async () => {}),
});

/** The value the first write put at a property path, or undefined when it left that path alone. */
const patched = (model, qPath) => {
    const patch = model.applyPatches.mock.calls[0][0].find((p) => p.qPath === qPath);
    return patch && JSON.parse(patch.qValue);
};

/** The attribute expressions the first write put on the message-id dimension. */
const written = (model) => patched(model, '/qHyperCubeDef/qDimensions/0/qAttributeExpressions');

/** One slot's expression. */
const expressionOf = (expressions, id) => expressions.find((e) => e.id === id).qExpression;

/**
 * An attribute-expression array shaped the way GetProperties returns one: a slot left empty in the
 * panel has no `qExpression` key at all, because the engine leaves out a default-valued q-property.
 * Checked on the lab server, object AaesP of the Claude scratch app.
 */
const asEngineReturns = (attrs) =>
    ATTR_ORDER.map((id) =>
        attrs[id] ? { qExpression: attrs[id], qAttribute: true, id } : { qAttribute: true, id }
    );

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

    it('takes a slot with no qExpression for the empty slot it is', () => {
        // Regression: GetProperties leaves out a q-property whose value is the default, so the slots
        // left empty in the panel come back as `{ id, qAttribute: true }` while the build emits
        // `qExpression: ''`. Compared raw, `undefined === ''` failed for every one of them, so the
        // guard never held for a real object and every layout change in edit mode wrote again.
        const attrs = { ts: 'Num(Min(FtSentAt))', tsText: "Only(Time(FtSentAt, 'hh:mm'))" };
        expect(isInSync(asEngineReturns(attrs), buildAttributeExpressions(attrs))).toBe(true);
    });

    it('still sees drift in a slot the engine left out', () => {
        expect(
            isInSync(
                asEngineReturns({ ts: 'A' }),
                buildAttributeExpressions({ ts: 'A', badge: 'B' })
            )
        ).toBe(false);
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
        expect(written(model)).toHaveLength(ATTR_ORDER.length);
        // and nothing at all on the recipient dimension
        expect(
            patched(model, '/qHyperCubeDef/qDimensions/2/qAttributeExpressions')
        ).toBeUndefined();
    });

    it('writes the expressions onto the message-id dimension', async () => {
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }, { qDef: { cId: 'd_author' } }], {
            ts: 'Num(Min(SentAt))',
        });
        const wrote = await syncAttributeExpressions({ model, layout: layout(), canEdit: true });
        expect(wrote).toBe(true);
        expect(expressionOf(written(model), 'ts')).toBe('Num(Min(SentAt))');
        // and NOT onto the author dimension
        expect(
            patched(model, '/qHyperCubeDef/qDimensions/1/qAttributeExpressions')
        ).toBeUndefined();
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
                qDef: { cId: 'd_msgid', qSortCriterias: timeSortCriteria('A') },
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
        expect(model.applyPatches).not.toHaveBeenCalled();
    });

    it('does NOT write for the shape the engine returns — this is what looped', async () => {
        // Regression: on a real object the empty slots come back without a qExpression, the guard
        // never held, and the effect wrote on every layout change in edit mode. The engine answers a
        // write with a change notification, so that write brought the next layout, which brought the
        // next write — an endless loop, re-fetching the data each time round.
        const attrs = { ts: 'A' };
        const model = mkModel(
            [
                {
                    qDef: { cId: 'd_msgid', qSortCriterias: timeSortCriteria('A') },
                    qAttributeExpressions: asEngineReturns(attrs),
                },
            ],
            attrs
        );
        const wrote = await syncAttributeExpressions({
            model,
            layout: layout([{ cId: 'd_msgid' }]),
            canEdit: true,
        });
        expect(wrote).toBe(false);
        expect(model.applyPatches).not.toHaveBeenCalled();
    });

    it('patches only the paths it owns, never the whole properties object', async () => {
        // The sync reads the properties, then writes. Sending that whole read back makes every render
        // in edit mode an authority on every property, and undoes a panel edit made in between.
        const model = mkModel([{ qDef: { cId: 'd_msgid' } }, { qDef: { cId: 'd_author' } }], {
            ts: 'Num(Min(SentAt))',
        });
        await syncAttributeExpressions({ model, layout: layout(), canEdit: true });
        expect(model.setProperties).not.toHaveBeenCalled();
        const [patches, softPatch] = model.applyPatches.mock.calls[0];
        // Saved with the object, like any other panel edit — not for this session only.
        expect(softPatch).toBe(false);
        expect(patches.map((p) => p.qPath)).toEqual([
            '/qHyperCubeDef/qDimensions/0/qAttributeExpressions',
            '/qHyperCubeDef/qDimensions/0/qDef/qSortCriterias',
        ]);
        expect(patches.every((p) => p.qOp === 'replace')).toBe(true);
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
        model.applyPatches = vi.fn(async () => {
            throw new Error('Access denied');
        });
        await expect(
            syncAttributeExpressions({ model, layout: layout(), canEdit: true })
        ).resolves.toBe(false);
        expect(model.applyPatches).toHaveBeenCalled();
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

describe('syncAttributeExpressions — time order', () => {
    /** The sort the first write saved on the message-id dimension. */
    const savedSort = (model) => patched(model, '/qHyperCubeDef/qDimensions/0/qDef/qSortCriterias');

    it('saves the sort by the timestamp with the expressions', async () => {
        // Regression: the message id only ever sorted numerically, so ids that do not rise with time
        // showed days out of order — Feb 3, Feb 5, Feb 3 — seen on a 0.4.0 server.
        const model = mkModel(
            [{ qDef: { cId: 'd_msgid', qSortCriterias: [{ qSortByNumeric: 1 }] } }],
            {
                ts: 'Num(Min(SentAt))',
            }
        );
        expect(await syncAttributeExpressions({ model, layout: layout(), canEdit: true })).toBe(
            true
        );
        expect(savedSort(model)).toEqual(timeSortCriteria('Num(Min(SentAt))'));
    });

    it('saves the sort when the expressions are already in sync', async () => {
        const model = mkModel(
            [
                {
                    qDef: { cId: 'd_msgid', qSortCriterias: [{ qSortByNumeric: 1 }] },
                    qAttributeExpressions: buildAttributeExpressions({ ts: 'A' }),
                },
            ],
            { ts: 'A' }
        );
        expect(
            await syncAttributeExpressions({
                model,
                layout: layout([{ cId: 'd_msgid' }]),
                canEdit: true,
            })
        ).toBe(true);
        expect(savedSort(model)).toEqual(timeSortCriteria('A'));
    });

    it('sorts by a timestamp set outside the panel, leaving its expressions as they are', async () => {
        const live = [
            { id: 'ts', qExpression: 'Num(Min(SentAt))', qAttribute: true },
            { id: 'badge', qExpression: 'Only(ThreadId)', qAttribute: true },
        ];
        const model = mkModel([{ qDef: { cId: 'd_msgid' }, qAttributeExpressions: live }]);
        expect(
            await syncAttributeExpressions({
                model,
                layout: layout([{ cId: 'd_msgid' }]),
                canEdit: true,
            })
        ).toBe(true);
        // Left alone means no patch for that path at all, so nothing can reach it.
        expect(written(model)).toBeUndefined();
        expect(savedSort(model)).toEqual(timeSortCriteria('Num(Min(SentAt))'));
    });

    it('leaves the sort as it is without a timestamp', async () => {
        const model = mkModel(
            [{ qDef: { cId: 'd_msgid', qSortCriterias: [{ qSortByNumeric: 1 }] } }],
            {
                badge: 'Only(ThreadId)',
            }
        );
        expect(await syncAttributeExpressions({ model, layout: layout(), canEdit: true })).toBe(
            true
        );
        // Left alone means no patch for that path at all: the numeric sort stands untouched.
        expect(savedSort(model)).toBeUndefined();
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
                [
                    {
                        qDef: {
                            cId: 'd_msgid',
                            qSortCriterias: timeSortCriteria('Num(Min(SentAt))'),
                        },
                        qAttributeExpressions: live(),
                    },
                ],
                attrs
            );
            const wrote = await syncAttributeExpressions({
                model,
                layout: layout([{ cId: 'd_msgid' }]),
                canEdit: true,
            });
            expect(wrote).toBe(false);
            expect(model.applyPatches).not.toHaveBeenCalled();
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
