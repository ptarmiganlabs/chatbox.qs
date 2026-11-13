import '@testing-library/jest-dom/vitest';

// jsdom lacks these; react-virtuoso and the density switcher both need them.
if (!global.ResizeObserver) {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// A test file that runs in Node (`// @vitest-environment node`) has no window to add it to.
if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    });
}
