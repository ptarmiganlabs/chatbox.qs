/**
 * Owns the React root.
 *
 * The root is keyed on the DOM element and nothing else. Qlik's own chart-dev
 * guidance shows `createRoot` keyed on the layout, which tears the whole tree
 * down and rebuilds it on every property edit and every selection; keying on
 * the element mounts once and re-renders in place.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import logger from '../util/logger';

/** Roots by element, so a re-render never creates a second root. */
const roots = new WeakMap();

/**
 * Mount or update the React tree inside the Qlik-provided element.
 *
 * @param {HTMLElement} element - The element nebula gave us.
 * @param {Function} Component - The root component to render.
 * @param {object} props - Props for the root component.
 * @returns {void}
 */
export function render(element, Component, props) {
    if (!element) return;
    let root = roots.get(element);
    if (!root) {
        root = createRoot(element);
        roots.set(element, root);
        logger.debug('mounted React root');
    }
    root.render(createElement(Component, props));
}

/**
 * Unmount and forget the root for an element.
 *
 * @param {HTMLElement} element - The element to tear down.
 * @returns {void}
 */
export function destroy(element) {
    const root = roots.get(element);
    if (!root) return;
    roots.delete(element);
    // React warns if a root is unmounted during its own render pass.
    queueMicrotask(() => {
        try {
            root.unmount();
        } catch (err) {
            logger.warn('root unmount failed:', err);
        }
    });
}
