import { describe, it, expect, vi } from 'vitest';
import { MAX_CELLS, StaleError, fetchAllRows, rowsPerPage } from '../../src/qix/paging';
import { absoluteRow } from '../../src/qix/read-cell';

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

describe('fetchAllRows — stopping when the caller has enough', () => {
    it('asks before every call, and stops asking the engine once the rows are enough', async () => {
        // 1 column, so a page is 10 000 rows; 25 000 rows would take three calls.
        const model = mkModel(25000, 1);
        const isEnough = vi.fn((rows) => rows.length >= 10000);
        const result = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 25000, qcx: 1 }),
            maxRows: 25000,
            isEnough,
        });
        expect(model.getHyperCubeData).toHaveBeenCalledTimes(1);
        expect(result.rows).toHaveLength(10000);
        expect(result.truncated).toBe(true);
        expect(isEnough).toHaveBeenCalledTimes(2);
    });

    it('needs no call at all when the rows delivered with the layout are enough', async () => {
        const model = mkModel(3000, 2);
        const result = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 3000, qcx: 2, prefetched: 1000 }),
            maxRows: 3000,
            isEnough: (rows) => rows.length >= 1000,
        });
        expect(model.getHyperCubeData).not.toHaveBeenCalled();
        expect(result.rows).toHaveLength(1000);
    });

    it('pages as before when nobody says the rows are enough', async () => {
        const model = mkModel(25000, 1);
        const result = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 25000, qcx: 1 }),
            maxRows: 25000,
        });
        expect(model.getHyperCubeData).toHaveBeenCalledTimes(3);
        expect(result.rows).toHaveLength(25000);
    });
});

describe('fetchAllRows — reading the last rows', () => {
    /** The cube row a fake row was made for, from its first cell. */
    const rowOf = (row) => Number(row[0].qText.split(':')[0]);

    it('reads the last rows in cube order, starting where they start', async () => {
        const seen = [];
        const model = mkModel(9000, 5, (p) => seen.push(p));
        const result = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 9000 }),
            maxRows: 5000,
            fromEnd: true,
        });

        expect(seen.map((p) => [p.qTop, p.qHeight])).toEqual([
            [4000, 2000],
            [6000, 2000],
            [8000, 1000],
        ]);
        for (const p of seen) expect(p.qWidth * p.qHeight).toBeLessThanOrEqual(MAX_CELLS);
        expect(result.rows).toHaveLength(5000);
        expect(rowOf(result.rows[0])).toBe(4000);
        expect(rowOf(result.rows.at(-1))).toBe(8999);
        expect(result.total).toBe(9000);
        expect(result.truncated).toBe(true);
    });

    it('keeps row numbers absolute, so a message knows its cube row', async () => {
        const { rows, area } = await fetchAllRows({
            model: mkModel(9000),
            layout: mkLayout({ qcy: 9000, prefetched: 1000 }),
            maxRows: 5000,
            fromEnd: true,
        });
        expect(area.qTop).toBe(4000);
        for (const index of [0, 1, 2499, 4999]) {
            expect(absoluteRow(area, index)).toBe(rowOf(rows[index]));
        }
    });

    it('reads every row from row 0 when the cube fits the cap, reusing the layout’s rows', async () => {
        const seen = [];
        const model = mkModel(2500, 5, (p) => seen.push(p));
        const { rows, area, truncated } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 2500, prefetched: 1000 }),
            maxRows: 5000,
            fromEnd: true,
        });
        expect(seen.map((p) => p.qTop)).toEqual([1000]);
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
        expect(area.qTop).toBe(0);
        expect(truncated).toBe(false);
    });

    it('uses only the part of the layout’s rows that reaches into the last rows', async () => {
        // 5,500 rows, 5,000 wanted: rows 500 to 999 came with the layout, rows 0 to 499 are not wanted.
        const seen = [];
        const model = mkModel(5500, 5, (p) => seen.push(p));
        const { rows, area } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 5500, prefetched: 1000 }),
            maxRows: 5000,
            fromEnd: true,
        });
        expect(seen.map((p) => [p.qTop, p.qHeight])).toEqual([
            [1000, 2000],
            [3000, 2000],
            [5000, 500],
        ]);
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 5000 }, (_, i) => 500 + i));
        expect(area.qTop).toBe(500);
    });

    it('fetches every row wanted when the layout’s rows end before them', async () => {
        const seen = [];
        const model = mkModel(12000, 5, (p) => seen.push(p));
        const { rows } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 12000, prefetched: 1000 }),
            maxRows: 5000,
            fromEnd: true,
        });
        expect(seen.map((p) => p.qTop)).toEqual([7000, 9000, 11000]);
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 5000 }, (_, i) => 7000 + i));
    });

    it('makes no call when the layout’s rows reach the last row', async () => {
        const model = mkModel(800);
        const { rows, area, truncated } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 800, prefetched: 800 }),
            maxRows: 500,
            fromEnd: true,
        });
        expect(model.getHyperCubeData).not.toHaveBeenCalled();
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 500 }, (_, i) => 300 + i));
        expect(area.qTop).toBe(300);
        expect(truncated).toBe(true);
    });

    it('discards narrow layout rows here too, and fetches the last rows full width', async () => {
        const qcx = 8;
        const model = mkModel(3000, qcx);
        const layout = mkLayout({ qcy: 3000, qcx, prefetched: 1000 });
        layout.qHyperCube.qDataPages[0].qArea.qWidth = 5;
        layout.qHyperCube.qDataPages[0].qMatrix = Array.from({ length: 1000 }, (_, i) =>
            mkRow(i, 5)
        );
        const { rows } = await fetchAllRows({ model, layout, maxRows: 2500, fromEnd: true });
        expect(model.getHyperCubeData.mock.calls[0][1][0].qTop).toBe(500);
        expect(rows).toHaveLength(2500);
        expect(rows.every((row) => row.length === qcx)).toBe(true);
    });

    it('stops at a short page and says the rows were cut short', async () => {
        // The engine claims 9,000 rows but has 7,000: the cube changed after the layout.
        const model = mkModel(7000);
        const { rows, area, truncated } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 9000 }),
            maxRows: 5000,
            fromEnd: true,
        });
        expect(model.getHyperCubeData).toHaveBeenCalledTimes(2);
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 3000 }, (_, i) => 4000 + i));
        expect(area.qTop).toBe(4000);
        expect(truncated).toBe(true);
    });

    it('reports progress towards the rows wanted', async () => {
        const progress = [];
        await fetchAllRows({
            model: mkModel(9000),
            layout: mkLayout({ qcy: 9000 }),
            maxRows: 5000,
            fromEnd: true,
            onProgress: (loaded, total) => progress.push([loaded, total]),
        });
        expect(progress).toEqual([
            [2000, 5000],
            [4000, 5000],
            [5000, 5000],
        ]);
    });

    it('asks the engine for whole rows when the limit is not a whole number', async () => {
        const seen = [];
        const model = mkModel(9000, 5, (p) => seen.push(p));
        const { rows } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 9000 }),
            maxRows: 2500.5,
            fromEnd: true,
        });
        expect(seen.map((p) => [p.qTop, p.qHeight])).toEqual([
            [6500, 2000],
            [8500, 500],
        ]);
        expect(rows).toHaveLength(2500);
    });

    describe('cancellation', () => {
        it('aborts before its first request when already stale', async () => {
            const model = mkModel(9000);
            await expect(
                fetchAllRows({
                    model,
                    layout: mkLayout({ qcy: 9000 }),
                    maxRows: 5000,
                    fromEnd: true,
                    isStale: () => true,
                })
            ).rejects.toThrow(StaleError);
            expect(model.getHyperCubeData).not.toHaveBeenCalled();
        });

        it('aborts AFTER an in-flight request rather than keeping stale rows', async () => {
            let calls = 0;
            const model = mkModel(9000, 5, () => {
                calls += 1;
            });
            await expect(
                fetchAllRows({
                    model,
                    layout: mkLayout({ qcy: 9000 }),
                    maxRows: 5000,
                    fromEnd: true,
                    isStale: () => calls >= 2,
                })
            ).rejects.toThrow(StaleError);
            expect(calls).toBe(2);
        });
    });
});

describe('fetchAllRows — rows that came with the layout', () => {
    it('ignores layout rows that do not start at the first row wanted', async () => {
        // Rows after a gap would sit at the wrong row numbers.
        const model = mkModel(50);
        const layout = mkLayout({ qcy: 50 });
        layout.qHyperCube.qDataPages = [
            {
                qArea: { qTop: 5, qLeft: 0, qWidth: 5, qHeight: 10 },
                qMatrix: Array.from({ length: 10 }, (_, i) => mkRow(5 + i)),
            },
        ];
        const { rows, area } = await fetchAllRows({ model, layout, maxRows: 50 });
        expect(model.getHyperCubeData.mock.calls[0][1][0].qTop).toBe(0);
        expect(rows.map((row) => row[0].qText)).toEqual(
            Array.from({ length: 50 }, (_, i) => `${i}:0`)
        );
        expect(area.qTop).toBe(0);
    });

    it('describes the rows read in one area, from the first read', async () => {
        const { area } = await fetchAllRows({
            model: mkModel(2500),
            layout: mkLayout({ qcy: 2500, prefetched: 1000 }),
        });
        expect(area).toEqual({ qTop: 0, qLeft: 0, qWidth: 5, qHeight: 2500 });
    });
});
