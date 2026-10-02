import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createWidened,
    ensureState,
    forgetStates,
    gateDimension,
    gateIndexOf,
    releaseWidened,
    repairStoredGate,
    stateAlreadyExists,
    stateNameFor,
    widenedDefinition,
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
    beforeEach(() => {
        forgetStates();
    });

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

describe('widenedDefinition', () => {
    const cube = () => ({
        qStateName: '',
        qDimensions: [{ qDef: { cId: 'd_msgid' } }, { qDef: { cId: 'd_author' } }],
        qMeasures: [{ qDef: { cId: 'm_text' } }],
        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 10, qHeight: 100 }],
    });

    it('copies the cube into the state and appends the gate, leaving the object alone', () => {
        // The object's own cube is never touched: it stays in the default state, so a click still
        // selects through the object's selection mode and the selection reaches the app.
        const def = widenedDefinition({ cube: cube(), stateName: 'cqs_xy', gate: gateOf() });
        expect(def.qHyperCubeDef.qStateName).toBe('cqs_xy');
        expect(def.qHyperCubeDef.qDimensions.map((d) => d.qDef.cId)).toEqual([
            'd_msgid',
            'd_author',
            CONTEXT_GATE_CID,
        ]);
        // Everything else the object was reading with comes along.
        expect(def.qHyperCubeDef.qMeasures).toHaveLength(1);
        expect(def.qHyperCubeDef.qInitialDataFetch).toHaveLength(1);
    });

    it('drops a gate an earlier build left in the object, rather than gating twice', () => {
        const stale = cube();
        stale.qDimensions.push({ qDef: { cId: CONTEXT_GATE_CID, qFieldDefs: ['=Aggr(old)'] } });
        const def = widenedDefinition({ cube: stale, stateName: 'cqs_xy', gate: gateOf() });
        const gates = def.qHyperCubeDef.qDimensions.filter((d) => d.qDef.cId === CONTEXT_GATE_CID);
        expect(gates).toHaveLength(1);
        expect(gates[0].qDef.qFieldDefs[0]).not.toBe('=Aggr(old)');
    });

    it('leaves an object that already reads in an alternate state alone', () => {
        // Freeing a field is relative to the default state; widening relative to another one would
        // answer a question nobody asked.
        const own = { ...cube(), qStateName: 'Comparison' };
        expect(widenedDefinition({ cube: own, stateName: 'cqs_xy', gate: gateOf() })).toBeNull();
    });

    it('builds nothing without a state, a cube or a gate', () => {
        expect(widenedDefinition({ cube: cube(), stateName: null, gate: gateOf() })).toBeNull();
        expect(widenedDefinition({ cube: null, stateName: 'cqs_xy', gate: gateOf() })).toBeNull();
        expect(
            widenedDefinition({ cube: cube(), stateName: 'cqs_xy', gate: buildContextGate({}) })
        ).toBeNull();
    });
});

describe('createWidened and releaseWidened', () => {
    it('reads the effective cube, so the session sort order comes along', async () => {
        // The time order is a soft patch in an app nobody can edit; a copy of the stored cube would
        // show the messages in the message id's order instead.
        const model = {
            getEffectiveProperties: vi.fn().mockResolvedValue({
                qHyperCubeDef: { qDimensions: [{ qDef: { cId: 'd_msgid' } }], qMeasures: [] },
            }),
        };
        const app = { createSessionObject: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const object = await createWidened({ app, model, stateName: 'cqs_xy', gate: gateOf() });
        expect(object).toEqual({ id: 'w1' });
        expect(model.getEffectiveProperties).toHaveBeenCalled();
    });

    it('answers null when the engine refuses, and says so', async () => {
        const warn = vi.fn();
        const model = { getEffectiveProperties: vi.fn().mockRejectedValue(new Error('no')) };
        const app = { createSessionObject: vi.fn() };
        expect(
            await createWidened({
                app,
                model,
                stateName: 'cqs_xy',
                gate: gateOf(),
                logger: { warn },
            })
        ).toBeNull();
        expect(warn).toHaveBeenCalled();
    });

    it('destroys the cube it made, and shrugs off one that was never made', async () => {
        const app = { destroySessionObject: vi.fn().mockResolvedValue(true) };
        await releaseWidened({ app, object: { id: 'w1' } });
        expect(app.destroySessionObject).toHaveBeenCalledWith('w1');
        await releaseWidened({ app, object: null });
        expect(app.destroySessionObject).toHaveBeenCalledTimes(1);
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

describe('repairStoredGate', () => {
    it('takes a gate 0.6.0 saved with the object back out, and the state with it', async () => {
        const props = {
            qHyperCubeDef: {
                qStateName: 'cqs_pPPN',
                qDimensions: [
                    { qDef: { cId: 'd_msgid' } },
                    { qDef: { cId: 'd_author' } },
                    { qDef: { cId: CONTEXT_GATE_CID } },
                ],
            },
        };
        const model = {
            getProperties: vi.fn().mockResolvedValue(props),
            setProperties: vi.fn().mockResolvedValue(undefined),
        };
        expect(await repairStoredGate({ model })).toBe(true);
        const written = model.setProperties.mock.calls[0][0];
        expect(written.qHyperCubeDef.qDimensions.map((d) => d.qDef.cId)).toEqual([
            'd_msgid',
            'd_author',
        ]);
        expect(written.qHyperCubeDef.qStateName).toBe('');
    });

    it('writes nothing to an object that was never damaged', async () => {
        const model = {
            getProperties: vi.fn().mockResolvedValue({
                qHyperCubeDef: { qStateName: '', qDimensions: [{ qDef: { cId: 'd_msgid' } }] },
            }),
            setProperties: vi.fn(),
        };
        expect(await repairStoredGate({ model })).toBe(false);
        expect(model.setProperties).not.toHaveBeenCalled();
    });

    it('says when the engine refused, rather than throwing into the render', async () => {
        const warn = vi.fn();
        const model = { getProperties: vi.fn().mockRejectedValue(new Error('no')) };
        expect(await repairStoredGate({ model, logger: { warn } })).toBe(false);
        expect(warn).toHaveBeenCalled();
    });
});

describe('asking for the session state', () => {
    beforeEach(() => {
        forgetStates();
    });

    it('asks once per browsing context, however often a component remounts', async () => {
        // The state belongs to the engine session, which outlives the component: nebula remounts a
        // supernova for reasons of its own, and asking again is refused.
        const app = { addSessionAlternateState: vi.fn().mockResolvedValue({}) };
        expect(await ensureState({ app, objectId: 'xy' })).toBe('cqs_xy');
        expect(await ensureState({ app, objectId: 'xy' })).toBe('cqs_xy');
        expect(app.addSessionAlternateState).toHaveBeenCalledTimes(1);
    });

    it('reads the engine’s "name is taken" for what it is', async () => {
        // Measured on Qlik Sense May 2026: no dedicated code, the generic message "Invalid
        // parameters", and only the parameter says what was wrong.
        const taken = Object.assign(new Error('Invalid parameters'), {
            code: 8,
            parameter: 'Used state name',
        });
        const app = { addSessionAlternateState: vi.fn().mockRejectedValue(taken) };
        expect(await ensureState({ app, objectId: 'xy' })).toBe('cqs_xy');
        // And it is remembered, so the refusal is not provoked a second time.
        expect(await ensureState({ app, objectId: 'xy' })).toBe('cqs_xy');
        expect(app.addSessionAlternateState).toHaveBeenCalledTimes(1);
    });

    it('still gives up on a refusal that is not about the name', async () => {
        const warn = vi.fn();
        const app = {
            addSessionAlternateState: vi
                .fn()
                .mockRejectedValue(Object.assign(new Error('Access denied'), { code: 3 })),
        };
        expect(await ensureState({ app, objectId: 'xy', logger: { warn } })).toBeNull();
        expect(warn).toHaveBeenCalled();
    });
});

describe('stateAlreadyExists', () => {
    it('recognises the taken name in either phrasing', () => {
        expect(stateAlreadyExists({ code: 8, parameter: 'Used state name' })).toBe(true);
        expect(stateAlreadyExists({ message: 'State already exists' })).toBe(true);
    });

    it('does not mistake another refusal for it', () => {
        expect(stateAlreadyExists({ code: 3, message: 'Access denied' })).toBe(false);
        expect(stateAlreadyExists({ code: 8, parameter: 'Invalid handle' })).toBe(false);
        expect(stateAlreadyExists(null)).toBe(false);
    });
});
