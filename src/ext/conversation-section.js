/**
 * The conversation model.
 *
 * Binds to the extension's own property bag, like every other panel item —
 * never to a hypercube path (see GOTCHAS 5). The model is read by the data
 * target's added() and description() callbacks, which is why it must be chosen
 * before dimensions are added: switching later never rewrites the role a column
 * already has.
 */
import { CONVERSATION_MODELS } from '../qix/column-map';

/**
 * Build the Conversation accordion section.
 *
 * @returns {object} The section definition.
 */
export function conversationSection() {
    return {
        type: 'items',
        label: 'Conversation',
        items: {
            conversationModel: {
                ref: 'chatbox.conversationModel',
                type: 'string',
                component: 'dropdown',
                label: 'Conversation model',
                description:
                    'Choose before adding dimensions. Participants: Message ID, Participant, then ' +
                    'an optional thread. From → To: Message ID, From, To, then an optional thread ' +
                    '— a message sent to several people collapses into one bubble.',
                defaultValue: CONVERSATION_MODELS.PARTICIPANT,
                options: [
                    {
                        value: CONVERSATION_MODELS.PARTICIPANT,
                        label: 'Participants (one speaker dimension)',
                    },
                    {
                        value: CONVERSATION_MODELS.FROM_TO,
                        label: 'From → To (sender and recipient dimensions)',
                    },
                ],
            },
        },
    };
}

export default conversationSection;
