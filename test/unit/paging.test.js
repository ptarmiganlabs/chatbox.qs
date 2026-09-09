import { describe, it, expect, vi } from 'vitest';
import { MAX_CELLS, StaleError, fetchAllRows, rowsPerPage } from '../../src/qix/paging';

/** Build a fake row of n cells. */
const mkRow = (id, n = 5) => Array.from({ length: n }, (_, i) => ({ qText: `${id}:${i}` }));

/** Build a layout with an optional pre-delivered first page. */
function mkLayout({ qcy, qcx = 5, prefetched = 0 }) {
    return {
        qHyperCube: {
            qSize: { qcx, qcy },
            qDataPages: prefetched
                ? [
                      {
                          qArea: { qTop: 0, qLeft: 0, qWidth: qcx, qHeight: prefetched },
                          qMatrix: Array.from({ length: prefetched }, (_, i) => mkRow(i, qcx)),
                      },
                  ]
                : [],
        },
    };
}

/** A model whose getHyperCubeData serves rows from a synthetic table. */
function mkModel(totalRows, qcx = 5, onCall) {
    return {
        getHyperCubeData: vi.fn(async (path, pages) => {
            const { qTop, qHeight } = pages[0];
            onCall?.(pages[0]);
            const available = Math.max(0, Math.min(qHeight, totalRows - qTop));
            return [
                {
                    qArea: { qTop, qLeft: 0, qWidth: qcx, qHeight: available },
                    qMatrix: Array.from({ length: available }, (_, i) => mkRow(qTop + i, qcx)),
                },
            ];
        }),
    };
}

describe('rowsPerPage', () => {
    it('never exceeds the 10 000-cell budget', () => {
        for (const cols of [1, 3, 5, 17, 97]) {
            expect(rowsPerPage(cols) * cols).toBeLessThanOrEqual(MAX_CELLS);
        }
    });

    it('gives 2000 rows for the standard 5-column chat cube', () => {
        expect(rowsPerPage(5)).toBe(2000);
    });

    it('returns at least one row for absurd inputs', () => {
        expect(rowsPerPage(0)).toBe(MAX_CELLS);
        expect(rowsPerPage(999999)).toBe(1);
        expect(rowsPerPage(undefined)).toBe(MAX_CELLS);
    });
});

describe('fetchAllRows', () => {
    it('makes ZERO engine calls when the layout already carries every row', async () => {
        const model = mkModel(10);
        const layout = mkLayout({ qcy: 10, prefetched: 10 });
        const { rows } = await fetchAllRows({ model, layout });

        expect(rows).toHaveLength(10);
        expect(model.getHyperCubeData).not.toHaveBeenCalled();
    });

    it('resumes from the prefetched rows instead of refetching them', async () => {
        const seen = [];
        const model = mkModel(2500, 5, (p) => seen.push(p));
        const layout = mkLayout({ qcy: 2500, prefetched: 2000 });
        const { rows } = await fetchAllRows({ model, layout });

        expect(seen[0].qTop).toBe(2000);
        expect(rows).toHaveLength(2500);
    });

    it('pages sequentially and never asks for more than 10 000 cells in one call', async () => {
        const seen = [];
        const model = mkModel(5000, 5, (p) => seen.push(p));
        const layout = mkLayout({ qcy: 5000 });
        const { rows } = await fetchAllRows({ model, layout, maxRows: 5000 });

        expect(rows).toHaveLength(5000);
        for (const p of seen) expect(p.qWidth * p.qHeight).toBeLessThanOrEqual(MAX_CELLS);
        // Sequential: each page starts where the previous ended.
        expect(seen.map((p) => p.qTop)).toEqual([0, 2000, 4000]);
    });

    it('honours the row cap and reports truncation', async () => {
        const model = mkModel(50000);
        const layout = mkLayout({ qcy: 50000 });
        const { rows, total, truncated } = await fetchAllRows({ model, layout, maxRows: 100 });

        expect(rows).toHaveLength(100);
        expect(total).toBe(50000);
        expect(truncated).toBe(true);
    });

    it('stops early when the engine returns a short page', async () => {
        // Engine claims 5000 rows but only has 1200.
        const model = mkModel(1200);
        const layout = mkLayout({ qcy: 5000 });
        const { rows, truncated } = await fetchAllRows({ model, layout, maxRows: 5000 });

        expect(rows).toHaveLength(1200);
        expect(truncated).toBe(true);
    });

    describe('cancellation', () => {
        it('aborts before issuing a request when already stale', async () => {
            const model = mkModel(5000);
            const layout = mkLayout({ qcy: 5000 });
            await expect(fetchAllRows({ model, layout, isStale: () => true })).rejects.toThrow(
                StaleError
            );
            expect(model.getHyperCubeData).not.toHaveBeenCalled();
        });

        it('aborts AFTER an in-flight request rather than appending stale rows', async () => {
            // This is the duplicated-conversation bug: the layout changes while
            // a page is in flight, and its rows get appended to a fresh run.
            let calls = 0;
            const model = mkModel(6000, 5, () => {
                calls += 1;
            });
            const layout = mkLayout({ qcy: 6000 });

            await expect(
                fetchAllRows({
                    model,
                    layout,
                    maxRows: 6000,
                    // Fresh for the first request, stale once it has returned.
                    isStale: () => calls >= 1,
                })
            ).rejects.toThrow(StaleError);

            expect(calls).toBe(1);
        });

        it('reports the abort as AbortError so callers can stay silent', async () => {
            const model = mkModel(10);
            const layout = mkLayout({ qcy: 10 });
            await fetchAllRows({ model, layout, isStale: () => true }).catch((e) => {
                expect(e.name).toBe('AbortError');
            });
        });
    });

    it('reports progress as pages arrive', async () => {
        const progress = [];
        const model = mkModel(4000);
        const layout = mkLayout({ qcy: 4000 });
        await fetchAllRows({
            model,
            layout,
            maxRows: 4000,
            onProgress: (loaded, total) => progress.push([loaded, total]),
        });
        expect(progress).toEqual([
            [2000, 4000],
            [4000, 4000],
        ]);
    });

    it('returns an empty result for a layout with no hypercube', async () => {
        const out = await fetchAllRows({ model: mkModel(0), layout: {} });
        expect(out).toEqual({ rows: [], area: null, total: 0, truncated: false });
    });

    it('carries the page area through so absolute row indices stay correct', async () => {
        const model = mkModel(100);
        const layout = mkLayout({ qcy: 100 });
        const { area } = await fetchAllRows({ model, layout });
        expect(area).toMatchObject({ qTop: 0, qLeft: 0 });
    });
});

describe('fetchAllRows — prefetched page width regression', () => {
    it('DISCARDS prefetched pages that are narrower than the cube', async () => {
        // Regression: qInitialDataFetch declares a fixed qWidth. A cube with more
        // columns than that (the user added KPI measures) delivers SHORT rows in
        // the layout. Mixing those with correctly-sized rows fetched later gives
        // undefined cells for exactly the first page of messages — and no error.
        const qcx = 8;
        const model = mkModel(50, qcx);
        const layout = {
            qHyperCube: {
                qSize: { qcx, qcy: 50 },
                qDataPages: [
                    {
                        qArea: { qTop: 0, qLeft: 0, qWidth: 5, qHeight: 10 }, // narrower than qcx
                        qMatrix: Array.from({ length: 10 }, (_, i) => mkRow(i, 5)),
                    },
                ],
            },
        };
        const { rows } = await fetchAllRows({ model, layout, maxRows: 50 });

        expect(rows).toHaveLength(50);
        // Every row must have the full column count, including the first.
        expect(rows.every((r) => r.length === qcx)).toBe(true);
        // And it must have refetched from row 0, not resumed from 10.
        expect(model.getHyperCubeData.mock.calls[0][1][0].qTop).toBe(0);
    });

    it('still reuses prefetched pages that are full width', async () => {
        const model = mkModel(10, 5);
        const layout = mkLayout({ qcy: 10, qcx: 5, prefetched: 10 });
        const { rows } = await fetchAllRows({ model, layout });
        expect(rows).toHaveLength(10);
        expect(model.getHyperCubeData).not.toHaveBeenCalled();
    });
});
