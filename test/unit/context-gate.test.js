import { describe, it, expect } from 'vitest';
import {
    GATE_PROBLEMS,
    buildContextGate,
    freedSet,
    gateDimensionExpression,
} from '../../src/qix/context-gate';
import { ROLES } from '../../src/qix/column-map';

/** A dimension column on a field, as resolveRoles hands it over. */
const onField = (name, col = 0) => ({
    col,
    kind: 'dim',
    cId: `d_${name}`,
    label: name,
    info: { qGroupFieldDefs: [name] },
});

/** A dimension column that is an expression, which names no field. */
const onExpression = (col = 0) => ({
    col,
    kind: 'dim',
    cId: 'd_x',
    label: 'calc',
    info: { qGroupFieldDefs: ['=Only(Author)'] },
});

describe('freedSet', () => {
    it('frees the fields it is given from the default state', () => {
        expect(freedSet(['Author'])).toBe('{$<[Author]=>}');
        expect(freedSet(['From', 'To'])).toBe('{$<[From]=,[To]=>}');
    });

    it('is the default state itself when there is nothing to free', () => {
        expect(freedSet([])).toBe('{$}');
    });

    it('writes a field name whose own brackets would otherwise end the reference', () => {
        expect(freedSet(['odd]name'])).toBe('{$<[odd]]name]=>}');
    });
});

describe('buildContextGate', () => {
    const roles = {
        [ROLES.MESSAGE_ID]: onField('MsgId', 0),
        [ROLES.AUTHOR]: onField('Author', 1),
        [ROLES.THREAD]: onField('ThreadId', 2),
    };

    it('counts a message under the selection with the people fields freed, and under all of it', () => {
        const gate = buildContextGate(roles);
        expect(gate.problem).toBeNull();
        expect(gate.passes).toBe('Count({$<[Author]=>} [MsgId])');
        expect(gate.inSelection).toBe('Count({$} [MsgId])');
        expect(gate.freed).toEqual(['Author']);
        expect(gate.threadField).toBe('ThreadId');
    });

    it('frees the sender and the recipient together in a From → To model', () => {
        const gate = buildContextGate({ ...roles, [ROLES.RECIPIENT]: onField('To', 3) });
        expect(gate.passes).toBe('Count({$<[Author]=,[To]=>} [MsgId])');
        expect(gate.freed).toEqual(['Author', 'To']);
    });

    it('never frees one field twice, however the roles resolved', () => {
        const same = { ...roles, [ROLES.RECIPIENT]: onField('Author', 3) };
        expect(buildContextGate(same).passes).toBe('Count({$<[Author]=>} [MsgId])');
    });

    it('refuses a people dimension that is an expression, and says which', () => {
        // There is no field to free, and a gate that left it narrowing would widen some
        // conversations and not others, with nothing on screen to say so.
        const gate = buildContextGate({ ...roles, [ROLES.AUTHOR]: onExpression(1) });
        expect(gate.problem).toEqual({
            kind: GATE_PROBLEMS.EXPRESSION_DIMENSION,
            roles: [ROLES.AUTHOR],
        });
        expect(gate.passes).toBe('');
    });

    it('refuses a message id that is an expression, which nothing can be counted by', () => {
        const gate = buildContextGate({ ...roles, [ROLES.MESSAGE_ID]: onExpression(0) });
        expect(gate.problem).toEqual({ kind: GATE_PROBLEMS.NO_MESSAGE_ID, roles: [] });
    });

    it('answers for no roles at all without throwing', () => {
        expect(buildContextGate({}).problem.kind).toBe(GATE_PROBLEMS.NO_MESSAGE_ID);
        expect(buildContextGate(undefined).problem.kind).toBe(GATE_PROBLEMS.NO_MESSAGE_ID);
    });
});

describe('gateDimensionExpression', () => {
    const roles = {
        [ROLES.MESSAGE_ID]: onField('MsgId', 0),
        [ROLES.AUTHOR]: onField('Author', 1),
        [ROLES.THREAD]: onField('ThreadId', 2),
    };

    it('answers null to drop a row, 0 for context and 1 for a message that matches', () => {
        // Verified against Qlik Sense May 2026: with Author = Priya, who writes only in T2, this
        // answers the whole of T2 and nothing else (GOTCHAS 42).
        expect(gateDimensionExpression(buildContextGate(roles))).toBe(
            '=Aggr(If(Count({$<[Author]=>} [MsgId]) > 0 and ' +
                '(IsNull(Only([ThreadId])) or ' +
                'Count({1<[ThreadId] = P({$} [ThreadId])>} [MsgId]) > 0), ' +
                'If(Count({$} [MsgId]) > 0, 1, 0)), [MsgId])'
        );
    });

    it('drops the conversation clause when there is no conversation dimension', () => {
        // Without one the whole cube is a single conversation, and freeing the people fields is all
        // there is to do.
        const { [ROLES.THREAD]: _thread, ...noThread } = roles;
        expect(gateDimensionExpression(buildContextGate(noThread))).toBe(
            '=Aggr(If(Count({$<[Author]=>} [MsgId]) > 0, ' +
                'If(Count({$} [MsgId]) > 0, 1, 0)), [MsgId])'
        );
    });

    it('writes nothing for a gate that cannot be built', () => {
        expect(gateDimensionExpression(buildContextGate({}))).toBe('');
        expect(gateDimensionExpression(null)).toBe('');
    });
});
