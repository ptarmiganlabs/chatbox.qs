/**
 * How per-message detail is revealed.
 */

/**
 * Build the Details accordion section.
 *
 * @returns {object} The section definition.
 */
export function detailSection() {
    return {
        type: 'items',
        label: 'Details',
        items: {
            revealMode: {
                ref: 'chatbox.revealMode',
                type: 'string',
                component: 'dropdown',
                label: 'Show details as',
                description:
                    'Automatic picks a presentation from the object size: a side pane when wide, ' +
                    'an overlay when medium, and an inline expansion when small. A Sense object ' +
                    'spans roughly 300 to 4000 px, so a fixed choice is wrong at one end.',
                defaultValue: 'auto',
                options: [
                    { value: 'auto', label: 'Automatic (recommended)' },
                    { value: 'pane', label: 'Side pane' },
                    { value: 'overlay', label: 'Overlay' },
                    { value: 'inline', label: 'Inline expansion' },
                ],
            },
        },
    };
}

export default detailSection;
