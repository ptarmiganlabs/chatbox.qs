/**
 * Snapshot and export support.
 *
 * Sense does not photograph the live DOM. It captures the object's *layout*,
 * then re-renders from that layout in a backend browser and photographs the
 * result. Scroll offset, the virtualization window, and every piece of component
 * state are gone by then — so anything that must survive has to be written into
 * the layout while the snapshot is being taken, and read back on the far side.
 *
 * Pure functions, so the round trip is testable without a Sense client.
 */

/** Where our state lives inside the layout copy. */
const KEY = 'snapshotData';

/**
 * Report whether this layout is a snapshot being re-rendered.
 *
 * @param {object} [layout] - The object layout.
 * @returns {boolean} True when rendering from captured snapshot state.
 */
export function isSnapshot(layout) {
    return Boolean(layout?.[KEY]?.chatbox);
}

/**
 * Write the view state into a layout copy, for a snapshot.
 *
 * @param {object} layout - The layout copy handed to onTakeSnapshot.
 * @param {object} [state] - { firstVisibleIndex, openId }.
 * @returns {object} The same layout, mutated.
 */
export function writeSnapshot(layout, state = {}) {
    if (!layout || typeof layout !== 'object') return layout;
    const existing = layout[KEY] && typeof layout[KEY] === 'object' ? layout[KEY] : {};
    layout[KEY] = {
        ...existing,
        chatbox: {
            firstVisibleIndex:
                Number.isInteger(state.firstVisibleIndex) && state.firstVisibleIndex >= 0
                    ? state.firstVisibleIndex
                    : 0,
            openId: typeof state.openId === 'string' ? state.openId : null,
        },
    };
    return layout;
}

/**
 * Read back the view state a snapshot captured.
 *
 * @param {object} [layout] - The object layout.
 * @returns {?object} { firstVisibleIndex, openId }, or null when not a snapshot.
 */
export function readSnapshot(layout) {
    const state = layout?.[KEY]?.chatbox;
    if (!state) return null;
    return {
        firstVisibleIndex: Number.isInteger(state.firstVisibleIndex) ? state.firstVisibleIndex : 0,
        openId: typeof state.openId === 'string' ? state.openId : null,
    };
}

/**
 * Report whether virtualization should be turned off for this render.
 *
 * A virtualized list renders only what fits the viewport. The export browser
 * photographs whatever it is given, so a virtualized render captures one screen
 * of a conversation and silently drops the rest. Snapshot and export renders
 * therefore render every message.
 *
 * @param {object} [layout] - The object layout.
 * @param {object} [settings] - The `chatbox` property bag.
 * @returns {boolean} True when the list should render every message.
 */
export function shouldRenderAll(layout, settings) {
    if (isSnapshot(layout)) return true;
    return settings?.virtualize === false;
}
