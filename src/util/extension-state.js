/**
 * Module-scoped handles to the current object's enigma model and app.
 *
 * Property-panel callbacks (`action`, `options`, `change`) run outside the
 * supernova's hook scope and cannot call `useModel()` / `useApp()`, so
 * `component()` stashes them here for those callbacks to reach.
 */
export const extensionState = {
    /** @type {object|null} The enigma GenericObject model for this instance. */
    model: null,
    /** @type {object|null} The enigma Doc (app) model. */
    app: null,
};

export default extensionState;
