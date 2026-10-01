import { describe, it, expect, vi } from 'vitest';
import {
    WIDEN_OUTCOMES,
    ensureState,
    gateDimension,
    gateIndexOf,
    narrow,
    stateNameFor,
    widen,
} from '../../src/qix/whole-conversations';
import { buildContextGate } from '../../src/qix/context-gate';
import { CONTEXT_GATE_CID, ROLES } from '../../src/qix/column-map';

const onField = (name, col) => ({
    col,
    kind: 'dim',
    cId: `d_${name}`,
    label: name,
    info: { qGroupFieldDefs: [name] },
});
const gateOf = () =>
    buildContextGate({
        [ROLES.MESSAGE_ID]: onField('MsgId', 0),
        [ROLES.AUTHOR]: onField('Author', 1),
        [ROLES.THREAD]: onField('ThreadId', 2),
    });

describe('stateNameFor', () => {
    it('names one state per object, so two chatboxes never bound each other', () => {
        expect(stateNameFor('AbCdEf')).toBe('cqs_AbCdEf');
        expect(stateNameFor('a-b-c')).toBe('cqs_abc');
        expect(stateNameFor('')).toBe('cqs_object');
    });
});

describe('gateDimension', () => {
    it('suppresses its nulls, which is what drops the rows that do not belong', () => {
        const dimension = gateDimension(gateOf());
        expect(dimension.qNullSuppression).toBe(true);
        expect(dimension.qDef.cId).toBe(CONTEXT_GATE_CID);
        expect(dimension.qDef.qFieldDefs[0]).toMatch(/^=Aggr\(/);
    });

    it('builds nothing for a gate that cannot be built', () => {
        expect(gateDimension(buildContextGate({}))).toBeNull();
    });
});

describe('ensureState', () => {
    it('creates the session state and answers its name', async () => {
        const app = { addSessionAlternateState: vi.fn().mockResolvedValue({}) };
        expect(await ensureState({ app, objectId: 'xy' })).toBe('cqs_xy');
        expect(app.addSessionAlternateState).toHaveBeenCalledWith('cqs_xy');
    });

    it('takes a state that is already there as success: it outlives one render', async () => {
        const app = {
            addSessionAlternateState: vi.fn().mockRejectedValue(new Error('already exists')),
        };
        expect(await ensureState({ app, objectId: 'xy' })).toBe('cqs_xy');
    });

    it('answers null when the engine refuses, and says so once', async () => {
        const warn = vi.fn();
        const app = {
            addSessionAlternateState: vi
                .fn()
                .mockRejectedValue(Object.assign(new Error('nope'), { code: 1 })),
        };
        expect(await ensureState({ app, objectId: 'xy', logger: { warn } })).toBeNull();
        expect(warn).toHaveBeenCalled();
    });
});

describe('widen and narrow', () => {
    it('patches the cube into the state and appends the gate, as a soft patch', async () => {
        const model = { applyPatches: vi.fn().mockResolvedValue(undefined) };
        const outcome = await widen({
            model,
            stateName: 'cqs_xy',
            gate: gateOf(),
            dimensionCount: 3,
        });
        expect(outcome).toBe(WIDEN_OUTCOMES.WIDENED);
        const [patches, soft] = model.applyPatches.mock.calls[0];
        // Soft, or it would be saved with the object and widen it for everyone, for ever.
        expect(soft).toBe(true);
        expect(patches[0]).toMatchObject({
            qOp: 'replace',
            qPath: '/qHyperCubeDef/qStateName',
            qValue: '"cqs_xy"',
        });
        // Appended after the dimensions the object stores, never in place of one.
        expect(patches[1]).toMatchObject({ qOp: 'add', qPath: '/qHyperCubeDef/qDimensions/3' });
    });

    it('refuses rather than patching half of it', async () => {
        const model = { applyPatches: vi.fn() };
        expect(await widen({ model, stateName: null, gate: gateOf(), dimensionCount: 3 })).toBe(
            WIDEN_OUTCOMES.REFUSED
        );
        expect(
            await widen({
                model,
                stateName: 'cqs_xy',
                gate: buildContextGate({}),
                dimensionCount: 3,
            })
        ).toBe(WIDEN_OUTCOMES.REFUSED);
        expect(model.applyPatches).not.toHaveBeenCalled();
    });

    it('says when the engine refused the patch, rather than looking widened', async () => {
        const warn = vi.fn();
        const model = { applyPatches: vi.fn().mockRejectedValue(new Error('no')) };
        expect(
            await widen({
                model,
                stateName: 'cqs_xy',
                gate: gateOf(),
                dimensionCount: 3,
                logger: { warn },
            })
        ).toBe(WIDEN_OUTCOMES.REFUSED);
        expect(warn).toHaveBeenCalled();
    });

    it('puts the cube back, state and gate together', async () => {
        const model = { applyPatches: vi.fn().mockResolvedValue(undefined) };
        await narrow({ model, gateIndex: 3 });
        const [patches] = model.applyPatches.mock.calls[0];
        expect(patches[0]).toMatchObject({ qPath: '/qHyperCubeDef/qStateName', qValue: '""' });
        expect(patches[1]).toMatchObject({ qOp: 'remove', qPath: '/qHyperCubeDef/qDimensions/3' });
    });

    it('leaves the dimensions alone when there is no gate to remove', async () => {
        const model = { applyPatches: vi.fn().mockResolvedValue(undefined) };
        await narrow({ model, gateIndex: -1 });
        expect(model.applyPatches.mock.calls[0][0]).toHaveLength(1);
    });
});

describe('gateIndexOf', () => {
    it('finds the gate by its cId, never by position', () => {
        const layout = {
            qHyperCube: {
                qDimensionInfo: [
                    { cId: 'd_msgid' },
                    { cId: 'd_author' },
                    { cId: CONTEXT_GATE_CID },
                ],
            },
        };
        expect(gateIndexOf(layout)).toBe(2);
        expect(gateIndexOf({ qHyperCube: { qDimensionInfo: [{ cId: 'd_msgid' }] } })).toBe(-1);
        expect(gateIndexOf(null)).toBe(-1);
    });
});
