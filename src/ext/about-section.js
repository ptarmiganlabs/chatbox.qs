/**
 * Version and support links.
 */
import { BUILD_DATE, PACKAGE_VERSION } from '../util/logger';

/**
 * Build the About accordion section.
 *
 * @returns {object} The section definition.
 */
export function aboutSection() {
    return {
        type: 'items',
        label: 'About',
        items: {
            version: {
                component: 'text',
                label: `Chatbox.qs v${PACKAGE_VERSION}`,
            },
            built: {
                component: 'text',
                label: `Built ${BUILD_DATE}`,
            },
            docs: {
                component: 'link',
                label: 'Documentation',
                url: 'https://github.com/ptarmiganlabs/chatbox.qs',
            },
            issues: {
                component: 'link',
                label: 'Report an issue',
                url: 'https://github.com/ptarmiganlabs/chatbox.qs/issues',
            },
        },
    };
}

export default aboutSection;
