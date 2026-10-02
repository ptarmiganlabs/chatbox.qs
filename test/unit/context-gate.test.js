import { describe, it, expect } from 'vitest';
import {
    GATE_PROBLEMS,
    buildContextGate,
    freedSet,
    gateDimensionExpression,
} from '../../src/qix/context-gate';
import { ROLES } from '../../src/qix/column-map';
import { readTextToolSettings } from '../../src/highlight/settings';

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

    it('names the fields it frees, and the ones it counts and scopes by — and nothing else', () => {
        // The whole shape, so that nothing comes back into it unread: the gate once also returned
        // two expression strings nobody used, and the tests that pinned them were all that kept
        // them alive. gateDimensionExpression writes the conditions; this only decides the fields.
        expect(buildContextGate(roles)).toEqual({
            freed: ['Author'],
            messageIdField: 'MsgId',
            threadField: 'ThreadId',
            problem: null,
        });
    });

    it('frees the sender and the recipient together in a From → To model', () => {
        const gate = buildContextGate({ ...roles, [ROLES.RECIPIENT]: onField('To', 3) });
        expect(gate.freed).toEqual(['Author', 'To']);
        expect(gateDimensionExpression(gate)).toContain('Count({$<[Author]=,[To]=>} [MsgId]) > 0');
    });

    it('never frees one field twice, however the roles resolved', () => {
        const same = { ...roles, [ROLES.RECIPIENT]: onField('Author', 3) };
        expect(buildContextGate(same).freed).toEqual(['Author']);
    });

    it('refuses a people dimension that is an expression, and says which', () => {
        // There is no field to free, and a gate that left it narrowing would widen some
        // conversations and not others, with nothing on screen to say so.
        const gate = buildContextGate({ ...roles, [ROLES.AUTHOR]: onExpression(1) });
        expect(gate.problem).toEqual({
            kind: GATE_PROBLEMS.EXPRESSION_DIMENSION,
            roles: [ROLES.AUTHOR],
        });
        expect(gate.freed).toEqual([]);
        expect(gateDimensionExpression(gate)).toBe('');
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

describe('freeing the keyword and its category', () => {
    const roles = {
        [ROLES.MESSAGE_ID]: onField('MsgId', 0),
        [ROLES.AUTHOR]: onField('Author', 1),
        [ROLES.THREAD]: onField('ThreadId', 2),
    };

    it('frees the highlight field and the category field beside the people', () => {
        // A keyword or a category picks out which conversations are worth reading, not which lines
        // of them: selecting "ops" means show me the chats where ops came up.
        const gate = buildContextGate(roles, {
            highlightField: 'HlKeyword',
            categoryField: 'HlKeywordCategory',
        });
        expect(gate.freed).toEqual(['Author', 'HlKeyword', 'HlKeywordCategory']);
        expect(gateDimensionExpression(gate)).toContain(
            'Count({$<[Author]=,[HlKeyword]=,[HlKeywordCategory]=>} [MsgId]) > 0'
        );
    });

    /**
     * Build the gate from what an author typed, through the settings reader, as the object does.
     *
     * @param {string} typed - The highlight field as typed in the panel.
     * @returns {object} The gate.
     */
    const gateFromTyped = (typed) =>
        buildContextGate(roles, {
            highlightField: readTextToolSettings({ highlight: { field: typed } }).highlight.field,
        });

    it('frees a field typed in brackets, once the settings reader has taken them off', () => {
        // What the panel stores is what the author typed; the settings reader takes the brackets
        // off, and the gate takes the name it is handed.
        const gate = gateFromTyped('[odd]]name]');
        expect(gate.freed).toEqual(['Author', 'odd]name']);
        expect(gateDimensionExpression(gate)).toContain('[odd]]name]=');
    });

    it('frees a field whose own name is in brackets, rather than unwrapping it a second time', () => {
        // A field literally named "[weird]" is typed "[[weird]]". Unwrapped once it is the field;
        // unwrapped twice it was "weird" — a field that does not exist, freed in place of the real
        // one, which went on narrowing.
        const gate = gateFromTyped('[[weird]]');
        expect(gate.freed).toEqual(['Author', '[weird]']);
        expect(gateDimensionExpression(gate)).toContain('[[weird]]]=');
    });

    it('frees nothing extra while no highlight field is set', () => {
        expect(buildContextGate(roles, {}).freed).toEqual(['Author']);
        expect(buildContextGate(roles).freed).toEqual(['Author']);
    });

    it('never frees one field twice, whatever it is used for', () => {
        const gate = buildContextGate(roles, { highlightField: 'Author' });
        expect(gate.freed).toEqual(['Author']);
    });
});
