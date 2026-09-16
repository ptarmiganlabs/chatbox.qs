import { vi } from 'vitest';

// Stand-ins for the enigma objects the extension talks to. They record calls and model only the
// behaviour the extension relies on; a test adds anything else with vi mocks on these objects.
// Adapted from textview.qs test/fakes/engine.js at df84a5e, without its text key.

/**
 * An enigma Doc that creates companion session objects. Their layouts come from `app.layoutFor`,
 * which by default answers with `app.layout`; their data pages from `app.pagesFor`.
 */
export function fakeApp({ layout = { highlightSelected: 1 } } = {}) {
    const app = {
        layout,
        created: [],
        layoutFor: () => app.layout,
        pagesFor: () => [],
        createSessionObject: vi.fn(async (definition) => {
            const listeners = new Map();
            const model = {
                id: `companion-${app.created.length + 1}`,
                definition,
                getLayout: vi.fn(async () => app.layoutFor(definition)),
                getHyperCubeData: vi.fn(async (path, pages) => app.pagesFor(definition, pages)),
                on: vi.fn((event, handler) => listeners.set(event, handler)),
                removeListener: vi.fn((event, handler) => {
                    if (listeners.get(event) === handler) listeners.delete(event);
                }),
                emit: (event) => listeners.get(event)?.(),
                listens: (event) => listeners.has(event),
            };
            app.created.push(model);
            return model;
        }),
        destroySessionObject: vi.fn(async () => true),
    };
    return app;
}

/** A promise with its resolve and reject exposed. */
export function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

/** Let pending promise callbacks run. Not a time budget: nothing here waits for the clock. */
export function flushPromises() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}
