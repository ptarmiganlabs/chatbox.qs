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
import { localWallClock } from '../chat/grouping';

/** Where our state lives inside the layout copy. */
const KEY = 'snapshotData';

/** Where the lanes shown live, beside the view state rather than inside it. */
const LANES_KEY = 'chatboxLanes';

/** The furthest from 1970 a Date can be, either way, in milliseconds. */
const DATE_RANGE_MS = 8.64e15;

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
 * The reader's wall clock goes with it, so the day separators say Today and
 * Yesterday as they did when the snapshot was taken: an export is drawn again on
 * the server, whose clock may be in another time zone, and a story is viewed later.
 *
 * @param {object} layout - The layout copy handed to onTakeSnapshot.
 * @param {object} [state] - { firstVisibleIndex, openId }.
 * @param {number} [now] - When the snapshot is taken, in epoch milliseconds; defaults to the current clock.
 * @returns {object} The same layout, mutated.
 */
export function writeSnapshot(layout, state = {}, now = Date.now()) {
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
            today: localWallClock(now),
        },
    };
    return layout;
}

/**
 * Read back the view state a snapshot captured.
 *
 * @param {object} [layout] - The object layout.
 * @returns {?object} { firstVisibleIndex, openId, today }, or null when not a snapshot. `today` is the
 *     reader's wall clock when the snapshot was taken; null for a snapshot taken before it was recorded.
 */
export function readSnapshot(layout) {
    const state = layout?.[KEY]?.chatbox;
    if (!state) return null;
    const today = state.today;
    return {
        firstVisibleIndex: Number.isInteger(state.firstVisibleIndex) ? state.firstVisibleIndex : 0,
        openId: typeof state.openId === 'string' ? state.openId : null,
        today: Number.isFinite(today) && Math.abs(today) <= DATE_RANGE_MS ? today : null,
    };
}

/**
 * Write the conversations shown side by side into a layout copy, for a snapshot.
 *
 * An export draws the object at the export's size, where a different number of lanes may fit: the
 * snapshot shows the lanes the reader saw instead.
 *
 * @param {object} layout - The layout copy handed to onTakeSnapshot.
 * @param {?Array<string>} keys - The lane keys shown, in order, or null without lanes.
 * @returns {object} The same layout, mutated when there are lanes.
 */
export function writeLaneSnapshot(layout, keys) {
    if (!layout || typeof layout !== 'object') return layout;
    const kept = Array.isArray(keys) ? keys.filter((key) => typeof key === 'string') : [];
    if (kept.length === 0) return layout;
    const existing = layout[KEY] && typeof layout[KEY] === 'object' ? layout[KEY] : {};
    layout[KEY] = { ...existing, [LANES_KEY]: { keys: kept } };
    return layout;
}

/**
 * Read back the conversations a snapshot showed side by side.
 *
 * @param {object} [layout] - The object layout.
 * @returns {?{keys: Array<string>}} The lane keys, or null when this is not a snapshot or had no lanes.
 */
export function readLaneSnapshot(layout) {
    if (!isSnapshot(layout)) return null;
    const keys = layout[KEY][LANES_KEY]?.keys;
    const kept = Array.isArray(keys) ? keys.filter((key) => typeof key === 'string') : [];
    return kept.length > 0 ? { keys: kept } : null;
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
