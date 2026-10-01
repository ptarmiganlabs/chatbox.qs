/**
 * The set expressions that widen a selection to the conversations it touches.
 *
 * Selecting a participant narrows a conversation to the lines that participant wrote, which is what
 * Qlik was asked for and almost never what the reader meant: they asked which chats someone is in and
 * got which lines they wrote. Widening it means evaluating the object's cube under a different
 * selection — one with the people fields freed — and that cannot be done by rewriting expressions,
 * because the message body is the user's own measure and no set can be injected into an arbitrary
 * expression without parsing it. An alternate state re-evaluates every expression at once; these are
 * the expressions that then say which rows still belong.
 *
 * Both are written to be read from inside that state, where `$` means the default state — the real
 * selection, the one the rest of the sheet is showing.
 *
 * - `passes` is 0 for a message that fails a selection which should still narrow — a date, a kind —
 *   and the row is dropped.
 * - `inSelection` is 0 for a message that survives those but not the people selection: it is context,
 *   and is drawn as context rather than as an answer.
 *
 * Freeing a field needs its name, so a dimension that is an expression cannot take part: there is no
 * field to free and nothing to put in the set. Saying so is the point — a gate that quietly left such
 * a dimension narrowing would widen some conversations and not others, with nothing to see.
 */
import { ROLES, fieldOfColumn } from './column-map';
import { fieldRef } from './field-ref';

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
 * @param {object} byRole - The resolved columns by role, from `resolveRoles`.
 * @returns {{passes: string, inSelection: string, freed: string[], messageIdField: string,
 *     threadField: string, problem: ?{kind: string, roles: string[]}}} The expressions, the fields
 *     freed, and what stands in the way; `problem` is null when nothing does.
 */
export function buildContextGate(byRole) {
    const messageIdField = fieldOfColumn(byRole?.[ROLES.MESSAGE_ID]);
    const empty = {
        passes: '',
        inSelection: '',
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

    const freed = [
        ...new Set(
            PEOPLE_ROLES.map((role) => fieldOfColumn(byRole?.[role])).filter((name) => name !== '')
        ),
    ];
    const id = fieldRef(messageIdField);
    return {
        passes: `Count(${freedSet(freed)} ${id})`,
        inSelection: `Count({$} ${id})`,
        freed,
        messageIdField,
        threadField: empty.threadField,
        problem: null,
    };
}

export default buildContextGate;
