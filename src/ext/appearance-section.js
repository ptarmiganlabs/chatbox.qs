/**
 * Appearance settings.
 */

/** Standard on/off options for a switch component. */
const ON_OFF = [
    { value: true, label: 'On' },
    { value: false, label: 'Off' },
];

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
                    { value: 'sided', label: 'Two-sided (2 participants only)' },
                ],
            },
            ownParticipant: {
                ref: 'chatbox.ownParticipant',
                type: 'string',
                label: 'Own participant',
                description:
                    'Which participant is shown on the right. Accepts a literal name or an ' +
                    'expression such as =OSUser(). Leave blank to decide automatically.',
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
        },
    };
}

export default appearanceSection;
