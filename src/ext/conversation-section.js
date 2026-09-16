/**
 * The conversation model.
 *
 * Binds to the extension's own property bag, like every other panel item —
 * never to a hypercube path (see GOTCHAS 5). The model is read by the data
 * target's added() and description() callbacks, which is why it must be chosen
 * before dimensions are added: switching later never rewrites the role a column
 * already has.
 */
import { LANE_DEFAULTS, LANE_MAX } from '../chat/lanes';
import { CONVERSATION_MODELS } from '../qix/column-map';
import { switchItem } from './items';

/**
 * Show an item only while conversations show side by side.
 *
 * @param {object} data - The object properties.
 * @returns {boolean} True when lanes are switched on.
 */
export function lanesShown(data) {
    return data?.chatbox?.lanes?.show === true;
}

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
            // Several conversations side by side, a lane per Conversation / thread value. Shown whether or
            // not a thread dimension is found: one bound by position carries no cId to find it by.
            lanesShow: switchItem({
                ref: 'chatbox.lanes.show',
                label: 'Show conversations side by side',
                defaultValue: LANE_DEFAULTS.show,
            }),
            lanesHelp: {
                component: 'text',
                label:
                    'A lane per value of the Conversation / thread dimension, the most recently active ' +
                    'on the left. Needs that dimension. A narrow object fits fewer lanes.',
                show: lanesShown,
            },
            lanesMax: {
                ref: 'chatbox.lanes.max',
                type: 'number',
                component: 'slider',
                label: 'Most conversations side by side',
                min: 1,
                max: LANE_MAX,
                step: 1,
                defaultValue: LANE_DEFAULTS.max,
                show: lanesShown,
            },
            lanesScroll: {
                ref: 'chatbox.lanes.scroll',
                type: 'string',
                component: 'dropdown',
                label: 'Scrolling',
                description:
                    'Linked lines the lanes up in time, with one scrollbar for all of them. Free lets ' +
                    'each lane scroll on its own.',
                defaultValue: LANE_DEFAULTS.scroll,
                options: [
                    { value: 'linked', label: 'Linked — rows line up in time' },
                    { value: 'free', label: 'Free — each conversation scrolls on its own' },
                ],
                show: lanesShown,
            },
        },
    };
}

export default conversationSection;
