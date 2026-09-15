/**
 * Human names for roles, shared by the property panel and the not-configured state.
 *
 * The author role is the same role in both conversation models, but people call
 * it something different in each — "Participant" when one dimension holds every
 * speaker, "From" when a second dimension says who the message went to.
 */
import { CONVERSATION_MODELS, ROLES, conversationModelOf } from './column-map';

/**
 * Name a role for display.
 *
 * @param {string} role - A ROLES value.
 * @param {string} [model] - A CONVERSATION_MODELS value.
 * @returns {string} The display name, or the raw role when it is unknown.
 */
export function roleLabel(role, model) {
    const fromTo =
        conversationModelOf({ conversationModel: model }) === CONVERSATION_MODELS.FROM_TO;
    switch (role) {
        case ROLES.MESSAGE_ID:
            return 'Message ID';
        case ROLES.AUTHOR:
            return fromTo ? 'From' : 'Participant';
        case ROLES.RECIPIENT:
            return 'To';
        case ROLES.THREAD:
            return 'Conversation';
        case ROLES.TEXT:
            return 'Message text';
        case ROLES.DUP_CHECK:
            return 'Integrity probe';
        default:
            return String(role);
    }
}

/**
 * Describe which column each resolved role is bound to.
 *
 * Shown in the not-configured state, so that after a model switch — which never
 * rewrites a column's role — the author can see what each dimension currently is.
 *
 * @param {object[]} columns - Column descriptors from buildColumns.
 * @param {object} byRole - Role map from resolveRoles.
 * @param {string} [model] - A CONVERSATION_MODELS value.
 * @returns {object[]} { role, label, column } for every bound role, in cube order.
 */
export function describeAssignments(columns, byRole, model) {
    return Object.entries(byRole ?? {})
        .filter(([, column]) => column)
        .sort(([, a], [, b]) => a.col - b.col)
        .map(([role, column]) => ({
            role,
            label: roleLabel(role, model),
            column: column.label || `column ${column.col + 1}`,
        }));
}
