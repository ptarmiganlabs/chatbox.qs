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
 * Fetch the rows of the hypercube, up to a cap.
 *
 * The rows read are one unbroken run: the first `maxRows` rows, or with
 * `fromEnd` the last. A cube sorted oldest first keeps its newest rows that way
 * when the cap cuts it short.
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
 * @param {boolean} [options.fromEnd] - Read the last rows rather than the first.
 * @param {number} [options.skipLast] - Rows at the end of the cube never to read,
 *   such as the phantom rows found by {@link countTrailingRows}; with `fromEnd`
 *   the rows read end just before them.
 * @param {Function} [options.isEnough] - Given the rows so far, returns true when
 *   no more are needed; asked before every call to the engine. The highlight
 *   values stop at a whole value past their limit this way, rather than at a row
 *   count that could cut a value off from some of its categories. The rows so far
 *   start at the first row read, so with `fromEnd` stopping early leaves out the
 *   last rows.
 * @returns {Promise<object>} { rows, area, total, truncated }. `area` covers the
 *   rows read, so `absoluteRow(area, index)` is the cube row of `rows[index]`.
 */
export async function fetchAllRows({
    model,
    layout,
    isStale = () => false,
    onProgress,
    maxRows = 5000,
    fromEnd = false,
    skipLast = 0,
    isEnough = () => false,
}) {
    const hc = layout?.qHyperCube;
    if (!hc) return { rows: [], area: null, total: 0, truncated: false };

    const colCount = hc.qSize?.qcx || 1;
    const total = hc.qSize?.qcy || 0;
    // The rows that may be read: all but the ones to skip at the end.
    const readable = Math.max(0, total - Math.max(0, Math.floor(skipLast) || 0));
    // A whole number of rows: a limit such as 2500.5 would otherwise ask the
    // engine for a fractional row.
    const wanted = Math.max(0, Math.min(readable, Math.floor(maxRows)));
    // The cube row the rows read start at.
    const first = fromEnd ? readable - wanted : 0;

    // 1. Reuse the pages that came with the layout — free, already evaluated —
    // for the rows wanted they hold, from the first row wanted on. The initial
    // fetch starts at row 0, so reading the end of a cube longer than the cap
    // uses only the part of it that reaches into the last rows, or none of it.
    //
    // Only if they are FULL WIDTH. qInitialDataFetch declares a fixed qWidth, so
    // a cube with more columns than that (the user added KPI measures) delivers
    // short rows: the extra columns are simply absent. Mixing those with
    // correctly-sized rows fetched later gives undefined cells for exactly the
    // first page of messages — wrong output, no error.
    const rows = [];
    for (const page of hc.qDataPages || []) {
        const pageWidth = page.qArea?.qWidth ?? 0;
        if (pageWidth < colCount) {
            rows.length = 0;
            break;
        }
        const matrix = page.qMatrix || [];
        // Where the next row wanted is in this page. A page that starts past it
        // leaves a gap, and rows after a gap would sit at the wrong row numbers.
        const from = first + rows.length - (page.qArea?.qTop ?? 0);
        if (from < 0) break;
        for (let i = from; i < matrix.length && rows.length < wanted; i++) rows.push(matrix[i]);
    }

    // 2. Page the remainder sequentially, resuming rather than refetching.
    const perPage = rowsPerPage(colCount);

    while (rows.length < wanted && !isEnough(rows)) {
        if (isStale()) throw new StaleError();

        const qHeight = Math.min(wanted - rows.length, perPage);
        const pages = await model.getHyperCubeData('/qHyperCubeDef', [
            { qTop: first + rows.length, qLeft: 0, qWidth: colCount, qHeight },
        ]);

        // Check again after the await: the layout may have changed while the
        // request was in flight, and appending stale rows to fresh ones is how
        // a conversation silently duplicates itself.
        if (isStale()) throw new StaleError();

        const matrix = pages?.[0]?.qMatrix ?? [];
        if (matrix.length === 0) break;

        for (const matrixRow of matrix) rows.push(matrixRow);
        onProgress?.(rows.length, wanted);

        // A short page means the engine has no more rows for us.
        if (matrix.length < qHeight) break;
    }

    return {
        rows,
        // One area for the whole run, since a run can start part-way into a
        // page that came with the layout.
        area: { qTop: first, qLeft: 0, qWidth: colCount, qHeight: rows.length },
        total,
        truncated: total > rows.length,
    };
}

/** How many rows the first call of a backwards scan reads; each later call reads twice as many. */
export const FIRST_SCAN_ROWS = 100;

/**
 * Count the rows at the end of the hypercube that match, reading backwards.
 *
 * Reads only the columns asked for, one single-column page each in the same
 * call, so a call holds as many rows as the cell budget allows for those
 * columns. The first call reads the last {@link FIRST_SCAN_ROWS} rows, and each
 * later call twice as many, up to the budget: a cube whose last row does not
 * match costs one small call, and a long run of matching rows few calls. Rows
 * that came with the layout are tested without a call.
 *
 * @param {object} options - Inputs.
 * @param {object} options.model - The enigma GenericObject model.
 * @param {object} options.layout - The layout to scan against (use useStaleLayout).
 * @param {number[]} options.columns - The columns a row is tested on.
 * @param {function(object[]): boolean} options.matches - Given a row's cells in the
 *   order of `columns`, returns true when the row counts.
 * @param {Function} [options.isStale] - Returns true when this run is superseded.
 * @returns {Promise<number>} How many rows, from the last one back, match, up to
 *   the first that does not. A page shorter than asked for, which means the cube
 *   changed after the layout, ends the count there.
 */
export async function countTrailingRows({
    model,
    layout,
    columns,
    matches,
    isStale = () => false,
}) {
    const hc = layout?.qHyperCube;
    const total = hc?.qSize?.qcy || 0;
    if (!total || !columns?.length) return 0;

    const lowest = Math.min(...columns);
    const highest = Math.max(...columns);
    // The layout's pages that hold every column asked for.
    const held = (hc.qDataPages || []).filter((page) => {
        const left = page.qArea?.qLeft ?? 0;
        return left <= lowest && left + (page.qArea?.qWidth ?? 0) > highest;
    });

    const perCall = Math.max(1, Math.floor(MAX_CELLS / columns.length));
    let height = FIRST_SCAN_ROWS;
    let count = 0;
    // The row tested next.
    let next = total - 1;

    while (next >= 0) {
        const page = held.find((candidate) => {
            const top = candidate.qArea?.qTop ?? 0;
            return next >= top && next < top + (candidate.qMatrix?.length ?? 0);
        });
        if (page) {
            const top = page.qArea?.qTop ?? 0;
            const left = page.qArea?.qLeft ?? 0;
            for (; next >= top; next--) {
                const row = page.qMatrix[next - top];
                if (!matches(columns.map((column) => row?.[column - left]))) return count;
                count += 1;
            }
            continue;
        }

        if (isStale()) throw new StaleError();
        const qHeight = Math.min(height, perCall, next + 1);
        const qTop = next + 1 - qHeight;
        const pages = await model.getHyperCubeData(
            '/qHyperCubeDef',
            columns.map((column) => ({ qTop, qLeft: column, qWidth: 1, qHeight }))
        );
        // As in fetchAllRows: a run superseded while the call was out must not
        // count what it brought back.
        if (isStale()) throw new StaleError();

        const matrices = columns.map((_, k) => pages?.[k]?.qMatrix ?? []);
        if (matrices.some((matrix) => matrix.length < qHeight)) return count;
        for (let i = qHeight - 1; i >= 0; i--) {
            if (!matches(matrices.map((matrix) => matrix[i]?.[0]))) return count;
            count += 1;
            next -= 1;
        }
        height *= 2;
    }
    return count;
}

export default fetchAllRows;
