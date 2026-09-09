/**
 * Interaction and data-volume settings.
 */

/** Standard on/off options for a switch component. */
const ON_OFF = [
    { value: true, label: 'On' },
    { value: false, label: 'Off' },
];

/**
 * Build the Behaviour accordion section.
 *
 * @returns {object} The section definition.
 */
export function behaviourSection() {
    return {
        type: 'items',
        label: 'Behaviour',
        items: {
            order: {
                ref: 'chatbox.order',
                type: 'string',
                component: 'dropdown',
                label: 'Message order',
                description:
                    'Chronological order drives grouping and date separators, so it is set here ' +
                    'rather than through the generic sorting panel.',
                defaultValue: 'oldest',
                options: [
                    { value: 'oldest', label: 'Oldest first' },
                    { value: 'newest', label: 'Newest first' },
                ],
            },
            onBubbleClick: {
                ref: 'chatbox.onBubbleClick',
                type: 'string',
                component: 'dropdown',
                label: 'Clicking a message',
                defaultValue: 'selectAuthor',
                options: [
                    { value: 'selectAuthor', label: 'Selects the participant' },
                    { value: 'selectMessage', label: 'Selects the message' },
                    { value: 'none', label: 'Does nothing' },
                ],
            },
            bodyFormat: {
                ref: 'chatbox.bodyFormat',
                type: 'string',
                component: 'dropdown',
                label: 'Message body',
                description:
                    'Plain text is the safe default. Markdown renders without raw HTML, but ' +
                    'field values often contain *, _ and # that markdown would reformat.',
                defaultValue: 'text',
                options: [
                    { value: 'text', label: 'Plain text' },
                    { value: 'markdown', label: 'Markdown' },
                ],
            },
            maxMessages: {
                ref: 'chatbox.maxMessages',
                type: 'number',
                label: 'Maximum messages',
                description:
                    'Messages beyond this are not fetched; a banner reports the shortfall. ' +
                    'Large conversations are better filtered than rendered.',
                defaultValue: 5000,
                min: 1,
                max: 50000,
            },
            virtualize: {
                ref: 'chatbox.virtualize',
                type: 'boolean',
                component: 'switch',
                label: 'Virtualize long conversations',
                description: 'Turn off when exporting or printing, so every message is rendered.',
                defaultValue: true,
                options: ON_OFF,
            },
        },
    };
}

export default behaviourSection;
