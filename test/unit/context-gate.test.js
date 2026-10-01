import { describe, it, expect } from 'vitest';
import { GATE_PROBLEMS, buildContextGate, freedSet } from '../../src/qix/context-gate';
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
