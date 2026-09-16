/**
 * Appearance settings.
 */
import { TEXT_TOOL_DEFAULTS } from '../highlight/settings';
import { ON_OFF, switchItem } from './items';

/**
 * Build the Appearance accordion section.
 *
 * @returns {object} The section definition.
 */
export function appearanceSection() {
    return {
        type: 'items',
        label: 'Appearance',
        items: {
            layoutMode: {
                ref: 'chatbox.layoutMode',
                type: 'string',
                component: 'dropdown',
                label: 'Layout',
                defaultValue: 'rail',
                options: [
                    { value: 'rail', label: 'Rail (any number of participants)' },
                    { value: 'sided', label: 'Two-sided (per conversation)' },
                ],
            },
            ownParticipant: {
                ref: 'chatbox.ownParticipant',
                type: 'string',
                label: 'Own participant',
                description:
                    'Shown on the right in every conversation they are part of, however many ' +
                    'people are in it. Accepts a literal name or an expression such as =OSUser(). ' +
                    'Left blank, the person in the most conversations goes right; in a single ' +
                    'two-person chat, whoever wrote last.',
                expression: 'optional',
                defaultValue: '',
                /**
                 * Only meaningful when the two-sided layout is active.
                 *
                 * @param {object} data - The object properties.
                 * @returns {boolean} True when the item should be shown.
                 */
                show: (data) => data?.chatbox?.layoutMode === 'sided',
            },
            density: {
                ref: 'chatbox.density',
                type: 'string',
                component: 'dropdown',
                label: 'Density',
                description:
                    'Automatic tightens spacing as the object gets smaller. A Sense object is ' +
                    'often a small dashboard tile and occasionally full screen, so one fixed ' +
                    'spacing is wrong at one end.',
                defaultValue: 'auto',
                options: [
                    { value: 'auto', label: 'Automatic (recommended)' },
                    { value: 'comfortable', label: 'Comfortable' },
                    { value: 'compact', label: 'Compact' },
                    { value: 'ultra', label: 'Ultra compact' },
                ],
            },
            showAvatars: {
                ref: 'chatbox.showAvatars',
                type: 'boolean',
                component: 'switch',
                label: 'Show avatars',
                defaultValue: true,
                options: ON_OFF,
            },
            dateSeparators: {
                ref: 'chatbox.dateSeparators',
                type: 'boolean',
                component: 'switch',
                label: 'Date separators',
                defaultValue: true,
                options: ON_OFF,
            },
            groupGapSec: {
                ref: 'chatbox.groupGapSec',
                type: 'number',
                component: 'slider',
                label: 'Group messages within (seconds)',
                min: 0,
                max: 600,
                step: 30,
                defaultValue: 120,
            },
            // Beside the conversation, with a tick where highlights or search matches are. It shows
            // only while there are some, so it costs nothing without a highlight field or a search.
            showRuler: switchItem({
                ref: 'chatbox.showRuler',
                label: 'Show overview ruler',
                defaultValue: TEXT_TOOL_DEFAULTS.showRuler,
            }),
        },
    };
}

export default appearanceSection;
