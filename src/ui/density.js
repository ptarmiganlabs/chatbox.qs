/**
 * Display density.
 *
 * A Qlik object is often a small tile on a dashboard and occasionally a
 * full-screen view, so a single spacing scale is wrong at one end. Density is
 * resolved from the measured rect and applied as a class carrying CSS custom
 * properties, which keeps the spacing decisions in the stylesheet rather than
 * scattered through components.
 */

/** Widths at or below which the next density down is used. */
const ULTRA_MAX_WIDTH = 320;
const COMPACT_MAX_WIDTH = 520;

/** Below this height even a medium-width object needs tighter rows. */
const COMPACT_MAX_HEIGHT = 260;

/** The densities, loosest first. */
export const DENSITIES = ['comfortable', 'compact', 'ultra'];

/**
 * Choose a density for the space available.
 *
 * @param {object} [rect] - The object's rect from useRect().
 * @param {string} [configured] - The density property: auto|comfortable|compact|ultra.
 * @returns {string} One of 'comfortable', 'compact', 'ultra'.
 */
export function resolveDensity(rect, configured) {
    if (configured && configured !== 'auto') {
        return DENSITIES.includes(configured) ? configured : 'comfortable';
    }

    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;

    // Before the first measurement useRect reports zeros. Treat that as the
    // smallest case: a too-tight first paint corrects itself on measure,
    // where a too-loose one would visibly reflow.
    if (width === 0) return 'ultra';

    if (width <= ULTRA_MAX_WIDTH) return 'ultra';
    if (width <= COMPACT_MAX_WIDTH || height <= COMPACT_MAX_HEIGHT) return 'compact';
    return 'comfortable';
}

export default resolveDensity;
