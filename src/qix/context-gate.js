/**
 * The calculated dimension that widens a selection to the conversations it touches.
 *
 * Selecting a participant narrows a conversation to the lines that participant wrote, which is what
 * Qlik was asked for and almost never what the reader meant: they asked which chats someone is in and
 * got which lines they wrote. Widening it means evaluating the object's cube under a different
 * selection — one with the people fields freed — and that cannot be done by rewriting expressions,
 * because the message body is the user's own measure and no set can be injected into an arbitrary
 * expression without parsing it. An alternate state re-evaluates every expression at once; the gate
 * dimension is what then says which rows still belong.
 *
 * It is read from inside that state, where `$` means the default state — the real selection, the one
 * the rest of the sheet is showing — and it counts each message twice: once under the selection with
 * the freed fields set aside, which drops a message that fails a selection that should still narrow
 * (a date, a kind), and once under the selection as it stands, which tells a message that matches
 * from one that is only there as context. {@link buildContextGate} decides which fields are freed;
 * {@link gateDimensionExpression} writes the dimension, and is the only thing that does.
 *
 * Freeing a field needs its name, so a dimension that is an expression cannot take part: there is no
 * field to free and nothing to put in the set. Saying so is the point — a gate that quietly left such
 * a dimension narrowing would widen some conversations and not others, with nothing to see.
 */
import { CONTEXT_GATE_CID, ROLES, fieldOfColumn } from './column-map';
import { fieldRef } from './field-ref';
import { roleLabel } from './role-labels';

export { CONTEXT_GATE_CID };

/** Why a conversation cannot be widened. */
export const GATE_PROBLEMS = Object.freeze({
    NO_MESSAGE_ID: 'no-message-id',
    EXPRESSION_DIMENSION: 'expression-dimension',
});

/** The roles whose selections stop narrowing: who spoke, and who they spoke to. */
const PEOPLE_ROLES = Object.freeze([ROLES.AUTHOR, ROLES.RECIPIENT]);

/**
 * Write a set expression that frees some fields from the default state's selection.
 *
 * @param {string[]} fields - The field names to free.
 * @returns {string} For example `{$<[Author]=,[To]=>}`, or `{$}` with nothing to free.
 */
export function freedSet(fields) {
    if (fields.length === 0) return '{$}';
    return `{$<${fields.map((field) => `${fieldRef(field)}=`).join(',')}>}`;
}

/**
 * Build the gate expressions for a cube's resolved roles.
 *
 * The keyword fields are taken as field **names**, the way `readTextToolSettings` hands them over and
 * `fieldOfColumn` reads the roles: already out of their brackets. They are not normalised again here.
 * Doing it twice is not harmless — a field literally named `[weird]` is typed `[[weird]]`, comes out
 * of the first pass as `[weird]`, and a second pass strips it to a field that does not exist.
 *
 * @param {object} byRole - The resolved columns by role, from `resolveRoles`.
 * @param {object} [keywords] - The highlight settings' field names, as `readTextToolSettings` returns
 *     them.
 * @param {string} [keywords.highlightField] - The field whose values are highlighted.
 * @param {string} [keywords.categoryField] - The field that groups those values.
 * @returns {{freed: string[], messageIdField: string, threadField: string,
 *     problem: ?{kind: string, roles: string[]}}} The fields freed, the fields the gate counts and
 *     scopes by, and what stands in the way; `problem` is null when nothing does.
 */
export function buildContextGate(byRole, { highlightField = '', categoryField = '' } = {}) {
    const messageIdField = fieldOfColumn(byRole?.[ROLES.MESSAGE_ID]);
    const empty = {
        freed: [],
        messageIdField,
        threadField: fieldOfColumn(byRole?.[ROLES.THREAD]),
    };
    if (!messageIdField) {
        return { ...empty, problem: { kind: GATE_PROBLEMS.NO_MESSAGE_ID, roles: [] } };
    }

    // A people dimension that is not a field cannot be freed, and a gate that left it narrowing
    // would widen some conversations and not others.
    const unusable = PEOPLE_ROLES.filter((role) => byRole?.[role] && !fieldOfColumn(byRole[role]));
    if (unusable.length > 0) {
        return { ...empty, problem: { kind: GATE_PROBLEMS.EXPRESSION_DIMENSION, roles: unusable } };
    }

    // Who wrote, who they wrote to, and what the messages are highlighted by. A keyword or a
    // category picks out which conversations are worth reading, not which lines of them: selecting
    // the category "ops" means show me the chats where ops came up, not the four lines that said so.
    const freed = [
        ...new Set(
            [
                ...PEOPLE_ROLES.map((role) => fieldOfColumn(byRole?.[role])),
                highlightField,
                categoryField,
            ].filter((name) => typeof name === 'string' && name !== '')
        ),
    ];
    return {
        freed,
        messageIdField,
        threadField: empty.threadField,
        problem: null,
    };
}

/**
 * Write the dimension that bounds a widened cube to the rows that still belong.
 *
 * The engine drops the rest, so nothing out of scope is ever paged. Two conditions, and a message
 * must meet both: it passes every selection but the people one, and its conversation is one the real
 * selection leaves possible. A message with no conversation at all meets the second by default —
 * there is no conversation of its own to be in scope — so it is governed by the first alone.
 *
 * It answers three things at once, so no second column is needed: null for a row that does not
 * belong, which the engine then drops; 0 for a message that belongs only because the people fields
 * were freed, which is context; and 1 for one that matches the selection as it stands.
 *
 * It is **appended** to the cube rather than put in place of the message id. A calculated dimension's
 * element numbers are the `Aggr`'s own, not the field's, and every selection by element number — a
 * click on a message, on a lane header, on a highlight — would then be wrong.
 *
 * Nothing is selected in the alternate state to do this job, deliberately: a selection there pushes an
 * undo step, and Sense's back button would undo the object's own bookkeeping (GOTCHAS 42).
 *
 * @param {object} gate - From {@link buildContextGate}, with no problem.
 * @returns {string} The calculated dimension, or '' when the gate has a problem.
 */
export function gateDimensionExpression(gate) {
    if (!gate || gate.problem) return '';
    const id = fieldRef(gate.messageIdField);
    const passes = `Count(${freedSet(gate.freed)} ${id}) > 0`;
    const mark = `If(Count({$} ${id}) > 0, 1, 0)`;
    if (!gate.threadField) return `=Aggr(If(${passes}, ${mark}), ${id})`;
    const thread = fieldRef(gate.threadField);
    const inScope = `IsNull(Only(${thread})) or Count({1<${thread} = P({$} ${thread})>} ${id}) > 0`;
    return `=Aggr(If(${passes} and (${inScope}), ${mark}), ${id})`;
}

/**
 * Say why a conversation cannot be widened, in words a reader can act on.
 *
 * @param {?{kind: string, roles: string[]}} problem - From {@link buildContextGate}.
 * @param {string} [model] - The conversation model, for naming the roles the way the panel does.
 * @returns {string} The reason, or '' when there is none.
 */
export function gateProblemText(problem, model) {
    if (!problem) return '';
    if (problem.kind === GATE_PROBLEMS.NO_MESSAGE_ID) {
        return 'Whole conversations need a Message ID dimension on a field.';
    }
    const names = problem.roles.map((role) => roleLabel(role, model));
    return `Whole conversations need ${names.join(' and ')} on a field, not an expression.`;
}

export default buildContextGate;
