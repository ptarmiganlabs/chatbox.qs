/**
 * Hypercube paging.
 *
 * stardust exports no paging helper — there is no useHyperCubePages, no
 * usePagination, and getHyperCubeData does not appear in the bundle at all — so
 * this module and its cancellation are ours to own, with no vendor reference
 * implementation to copy.
 *
 * Two engine facts shape it:
 *
 *  - GetHyperCubeData caps at 10 000 cells *per call*, counted across every
 *    page in that call (engine error 7009). So pages are fetched sequentially;
 *    a Promise.all of several pages breaches the cap rather than parallelising
 *    within it.
 *  - Attribute expressions do not count toward that cap, which is why all the
 *    per-message metadata rides on them instead of on extra columns.
 */

/** The engine's per-call cell budget, inclusive. */
export const MAX_CELLS = 10000;

/**
 * Compute how many rows fit in one request for a given column count.
 *
 * @param {number} colCount - Number of columns in the hypercube.
 * @returns {number} Rows per page, at least 1.
 */
export function rowsPerPage(colCount) {
    const cols = Number.isFinite(colCount) && colCount > 0 ? colCount : 1;
    return Math.max(1, Math.floor(MAX_CELLS / cols));
}

/**
 * Error thrown when a fetch is abandoned because its layout went stale.
 *
 * Named AbortError so callers can distinguish "we cancelled this" from a real
 * engine failure and stay silent about it.
 */
export class StaleError extends Error {
    /**
     * Construct a stale-fetch error.
     *
     * @param {string} [message] - Optional message.
     */
    constructor(message = 'Fetch superseded by a newer layout') {
        super(message);
        this.name = 'AbortError';
    }
}

/**
 * Fetch every row of the hypercube, up to a cap.
 *
 * Rows already delivered with the layout are reused first: `qInitialDataFetch`
 * results arrive inside `getLayout`, and the engine re-evaluates them on every
 * layout change, so they are always fresh. For most conversations that means
 * zero extra round trips.
 *
 * @param {object} options - Inputs.
 * @param {object} options.model - The enigma GenericObject model.
 * @param {object} options.layout - The layout to page against (use useStaleLayout).
 * @param {Function} [options.isStale] - Returns true when this run is superseded.
 * @param {Function} [options.onProgress] - Called with (loaded, total) per page.
 * @param {number} [options.maxRows] - Hard cap on rows fetched.
 * @returns {Promise<object>} { rows, area, total, truncated }.
 */
export async function fetchAllRows({
    model,
    layout,
    isStale = () => false,
    onProgress,
    maxRows = 5000,
}) {
    const hc = layout?.qHyperCube;
    if (!hc) return { rows: [], area: null, total: 0, truncated: false };

    const colCount = hc.qSize?.qcx || 1;
    const engineRows = hc.qSize?.qcy || 0;
    const total = engineRows;
    const wanted = Math.min(engineRows, maxRows);

    // 1. Reuse the pages that came with the layout — free, already evaluated.
    //
    // Only if they are FULL WIDTH. qInitialDataFetch declares a fixed qWidth, so
    // a cube with more columns than that (the user added KPI measures) delivers
    // short rows: the extra columns are simply absent. Mixing those with
    // correctly-sized rows fetched later gives undefined cells for exactly the
    // first page of messages — wrong output, no error.
    const rows = [];
    let area = null;
    for (const page of hc.qDataPages || []) {
        const pageWidth = page.qArea?.qWidth ?? 0;
        if (pageWidth < colCount) {
            rows.length = 0;
            area = null;
            break;
        }
        if (!area) area = page.qArea ?? null;
        for (const matrixRow of page.qMatrix || []) rows.push(matrixRow);
    }

    if (rows.length >= wanted) {
        const trimmed = rows.slice(0, wanted);
        return { rows: trimmed, area, total, truncated: total > trimmed.length };
    }

    // 2. Page the remainder sequentially, resuming rather than refetching.
    const perPage = rowsPerPage(colCount);
    let top = rows.length;

    while (top < wanted) {
        if (isStale()) throw new StaleError();

        const qHeight = Math.min(wanted - top, perPage);
        const pages = await model.getHyperCubeData('/qHyperCubeDef', [
            { qTop: top, qLeft: 0, qWidth: colCount, qHeight },
        ]);

        // Check again after the await: the layout may have changed while the
        // request was in flight, and appending stale rows to fresh ones is how
        // a conversation silently duplicates itself.
        if (isStale()) throw new StaleError();

        const page = pages?.[0];
        const matrix = page?.qMatrix ?? [];
        if (!area) area = page?.qArea ?? null;
        if (matrix.length === 0) break;

        for (const matrixRow of matrix) rows.push(matrixRow);
        onProgress?.(rows.length, wanted);

        // A short page means the engine has no more rows for us.
        if (matrix.length < qHeight) break;
        top += qHeight;
    }

    return { rows, area, total, truncated: total > rows.length };
}

export default fetchAllRows;
