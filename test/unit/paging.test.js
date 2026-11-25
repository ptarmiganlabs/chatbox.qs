import { describe, it, expect, vi } from 'vitest';
import {
    FIRST_SCAN_ROWS,
    MAX_CALLS_IN_FLIGHT,
    MAX_CELLS,
    StaleError,
    countTrailingRows,
    fetchAllRows,
    rowsPerPage,
} from '../../src/qix/paging';
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

    it('asks for the pages in order and never for more than 10 000 cells in one call', async () => {
        const seen = [];
        const model = mkModel(5000, 5, (p) => seen.push(p));
        const layout = mkLayout({ qcy: 5000 });
        const { rows } = await fetchAllRows({ model, layout, maxRows: 5000 });

        expect(rows).toHaveLength(5000);
        for (const p of seen) expect(p.qWidth * p.qHeight).toBeLessThanOrEqual(MAX_CELLS);
        // Each page starts where the previous one ends.
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
        // All three pages are asked for at once; the one past the short page brings nothing and is dropped.
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

describe('fetchAllRows — several pages in flight', () => {
    /** The cube row a fake row was made for, from its first cell. */
    const rowOf = (row) => Number(row[0].qText.split(':')[0]);

    /**
     * A model whose calls are answered only when the test says so, recording every page asked for.
     *
     * @param {number} totalRows - The rows the engine really has.
     * @param {number} [qcx] - The cube's width.
     * @returns {object} The model, with `asked` (pages in the order asked for), `open` (calls not yet
     *   answered) and `answer(index)`, `fail(index, error)` for a call by the order it was asked in.
     */
    function heldModel(totalRows, qcx = 5) {
        const asked = [];
        const pending = [];
        const model = {
            asked,
            open: () => pending.filter((call) => !call.settled).length,
            getHyperCubeData: vi.fn((path, pages) => {
                const page = pages[0];
                asked.push(page);
                return new Promise((resolve, reject) => {
                    pending.push({ page, resolve, reject, settled: false });
                });
            }),
            answer(index) {
                const call = pending[index];
                call.settled = true;
                const { qTop, qHeight } = call.page;
                const available = Math.max(0, Math.min(qHeight, totalRows - qTop));
                call.resolve([
                    {
                        qArea: { qTop, qLeft: 0, qWidth: qcx, qHeight: available },
                        qMatrix: Array.from({ length: available }, (_, i) => mkRow(qTop + i, qcx)),
                    },
                ]);
            },
            fail(index, error) {
                pending[index].settled = true;
                pending[index].reject(error);
            },
        };
        return model;
    }

    /** Let the calls answered so far be taken in, and the next ones be asked for. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it(`keeps at most ${MAX_CALLS_IN_FLIGHT} calls in flight, and asks for the next as one returns`, async () => {
        // 1 column: 10 000 rows a page, so 60 000 rows are six pages.
        const model = heldModel(60000, 1);
        const done = fetchAllRows({
            model,
            layout: mkLayout({ qcy: 60000, qcx: 1 }),
            maxRows: 60000,
        });
        await settle();
        expect(model.asked).toHaveLength(MAX_CALLS_IN_FLIGHT);
        expect(model.open()).toBe(MAX_CALLS_IN_FLIGHT);

        model.answer(0);
        await settle();
        expect(model.asked).toHaveLength(MAX_CALLS_IN_FLIGHT + 1);
        expect(model.open()).toBe(MAX_CALLS_IN_FLIGHT);

        for (let index = 1; index < 6; index++) {
            model.answer(index);
            await settle();
        }
        const { rows, truncated } = await done;
        expect(rows).toHaveLength(60000);
        expect(truncated).toBe(false);
        expect(model.asked.map((page) => page.qTop)).toEqual(
            [0, 1, 2, 3, 4, 5].map((n) => n * 10000)
        );
    });

    it('keeps cube order and row numbers when the engine answers out of order', async () => {
        const model = heldModel(9000);
        const done = fetchAllRows({
            model,
            layout: mkLayout({ qcy: 9000 }),
            maxRows: 5000,
            fromEnd: true,
        });
        await settle();
        // Rows 4000 to 8999 in three pages, answered last first.
        for (const index of [2, 1, 0]) {
            model.answer(index);
            await settle();
        }
        const { rows, area } = await done;
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 5000 }, (_, i) => 4000 + i));
        expect(area).toEqual({ qTop: 4000, qLeft: 0, qWidth: 5, qHeight: 5000 });
    });

    it('asks for no page after a short one, and drops the pages past it', async () => {
        // The engine claims 60 000 rows of one column but has 15 000: the cube changed after the layout.
        const model = heldModel(15000, 1);
        const done = fetchAllRows({
            model,
            layout: mkLayout({ qcy: 60000, qcx: 1 }),
            maxRows: 60000,
        });
        await settle();
        // Answer the second page, which is short, before the first: what the first brings is kept.
        model.answer(1);
        await settle();
        expect(model.asked).toHaveLength(MAX_CALLS_IN_FLIGHT);
        for (const index of [0, 2, 3]) {
            model.answer(index);
            await settle();
        }
        const { rows, truncated } = await done;
        expect(model.asked).toHaveLength(MAX_CALLS_IN_FLIGHT);
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 15000 }, (_, i) => i));
        expect(truncated).toBe(true);
    });

    it('fails with the engine’s error and asks for nothing more', async () => {
        const model = heldModel(60000, 1);
        const done = fetchAllRows({
            model,
            layout: mkLayout({ qcy: 60000, qcx: 1 }),
            maxRows: 60000,
        });
        await settle();
        const error = new Error('engine said no');
        model.fail(0, error);
        await expect(done).rejects.toBe(error);
        for (let index = 1; index < MAX_CALLS_IN_FLIGHT; index++) model.answer(index);
        await settle();
        expect(model.asked).toHaveLength(MAX_CALLS_IN_FLIGHT);
    });

    it('keeps nothing a call brings back once the run is superseded', async () => {
        const model = heldModel(60000, 1);
        let stale = false;
        const done = fetchAllRows({
            model,
            layout: mkLayout({ qcy: 60000, qcx: 1 }),
            maxRows: 60000,
            isStale: () => stale,
        });
        await settle();
        stale = true;
        model.answer(2);
        await expect(done).rejects.toThrow(StaleError);
        for (const index of [0, 1, 3]) model.answer(index);
        await settle();
        expect(model.asked).toHaveLength(MAX_CALLS_IN_FLIGHT);
    });

    it('asks one page at a time while the caller says when the rows are enough', async () => {
        // The highlight values: whether a call is needed depends on what the calls before it brought.
        const model = heldModel(60000, 1);
        const done = fetchAllRows({
            model,
            layout: mkLayout({ qcy: 60000, qcx: 1 }),
            maxRows: 60000,
            isEnough: (rows) => rows.length >= 20000,
        });
        await settle();
        expect(model.open()).toBe(1);
        model.answer(0);
        await settle();
        expect(model.open()).toBe(1);
        model.answer(1);
        const { rows } = await done;
        expect(rows).toHaveLength(20000);
        expect(model.asked).toHaveLength(2);
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

describe('countTrailingRows', () => {
    // A 5-column chat cube: message id, author, thread, text, probe. A phantom row has a null id, no
    // text and a probe of 0; its cells are the ones the engine returns for a linked value with no message.
    const message = (n) => [
        { qText: String(n), qElemNumber: n },
        { qText: 'Ada', qElemNumber: 0 },
        { qText: 'T1', qElemNumber: 0 },
        { qText: `message ${n}`, qNum: 'NaN' },
        { qText: '1', qNum: 1 },
    ];
    const phantom = () => [
        { qText: '-', qElemNumber: -2 },
        { qText: 'Dora', qElemNumber: 3 },
        { qText: '-', qElemNumber: -2 },
        { qText: '-', qNum: 'NaN' },
        { qText: '0', qNum: 0 },
    ];
    const isPhantom = ([id, text, probe]) =>
        id.qElemNumber < 0 && text.qText === '-' && Number(probe.qNum) === 0;
    const COLUMNS = [0, 3, 4];

    /** A model serving any rectangles of a cube held as whole rows, recording each call's pages. */
    function cubeModel(rows) {
        const calls = [];
        return {
            calls,
            getHyperCubeData: vi.fn(async (path, pages) => {
                calls.push(pages);
                return pages.map(({ qTop, qLeft, qWidth, qHeight }) => ({
                    qArea: { qTop, qLeft, qWidth, qHeight },
                    qMatrix: rows
                        .slice(qTop, qTop + qHeight)
                        .map((row) => row.slice(qLeft, qLeft + qWidth)),
                }));
            }),
        };
    }

    const cube = (rows, pages = []) => ({
        qHyperCube: { qSize: { qcx: 5, qcy: rows.length }, qDataPages: pages },
    });
    const messages = (count) => Array.from({ length: count }, (_, i) => message(i + 1));
    const phantoms = (count) => Array.from({ length: count }, phantom);
    const cells = (pages) => pages.reduce((sum, p) => sum + p.qWidth * p.qHeight, 0);

    it('costs one small call when the last row does not match', async () => {
        const rows = messages(9000);
        const model = cubeModel(rows);
        const count = await countTrailingRows({
            model,
            layout: cube(rows),
            columns: COLUMNS,
            matches: isPhantom,
        });
        expect(count).toBe(0);
        expect(model.calls).toEqual([
            COLUMNS.map((column) => ({
                qTop: 9000 - FIRST_SCAN_ROWS,
                qLeft: column,
                qWidth: 1,
                qHeight: FIRST_SCAN_ROWS,
            })),
        ]);
    });

    it('counts a long run back from the end, reading twice as many rows each call, within the budget', async () => {
        const rows = [...messages(9000), ...phantoms(7000)];
        const model = cubeModel(rows);
        const count = await countTrailingRows({
            model,
            layout: cube(rows),
            columns: COLUMNS,
            matches: isPhantom,
        });
        expect(count).toBe(7000);
        expect(model.calls.map((pages) => pages[0].qHeight)).toEqual([
            100, 200, 400, 800, 1600, 3200, 3333,
        ]);
        for (const pages of model.calls) expect(cells(pages)).toBeLessThanOrEqual(MAX_CELLS);
        // Each call reads the rows just before the ones already tested.
        expect(model.calls.map((pages) => pages[0].qTop)).toEqual([
            15900, 15700, 15300, 14500, 12900, 9700, 6367,
        ]);
    });

    it('stops at the first row that does not match, whatever comes before it', async () => {
        const rows = [...phantoms(3), message(1), ...phantoms(2)];
        const count = await countTrailingRows({
            model: cubeModel(rows),
            layout: cube(rows),
            columns: COLUMNS,
            matches: isPhantom,
        });
        expect(count).toBe(2);
    });

    it('counts every row when every row matches', async () => {
        const rows = phantoms(250);
        const count = await countTrailingRows({
            model: cubeModel(rows),
            layout: cube(rows),
            columns: COLUMNS,
            matches: isPhantom,
        });
        expect(count).toBe(250);
    });

    it('tests the rows that came with the layout without a call', async () => {
        const rows = [...messages(15), ...phantoms(2)];
        const model = cubeModel(rows);
        const page = { qArea: { qTop: 0, qLeft: 0, qWidth: 5, qHeight: 17 }, qMatrix: rows };
        const count = await countTrailingRows({
            model,
            layout: cube(rows, [page]),
            columns: COLUMNS,
            matches: isPhantom,
        });
        expect(count).toBe(2);
        expect(model.getHyperCubeData).not.toHaveBeenCalled();
    });

    it('calls the engine when the layout’s rows lack a column it needs', async () => {
        const rows = [...messages(15), ...phantoms(2)];
        const model = cubeModel(rows);
        const narrow = rows.map((row) => row.slice(0, 3));
        const page = { qArea: { qTop: 0, qLeft: 0, qWidth: 3, qHeight: 17 }, qMatrix: narrow };
        const count = await countTrailingRows({
            model,
            layout: cube(rows, [page]),
            columns: COLUMNS,
            matches: isPhantom,
        });
        expect(count).toBe(2);
        expect(model.getHyperCubeData).toHaveBeenCalledTimes(1);
    });

    it('ends the count at a page shorter than asked for: the cube changed after the layout', async () => {
        // The layout says 16,000 rows; the engine now has 15,950.
        const rows = [...messages(9000), ...phantoms(6950)];
        const layout = cube([...rows, ...phantoms(50)]);
        const count = await countTrailingRows({
            model: cubeModel(rows),
            layout,
            columns: COLUMNS,
            matches: isPhantom,
        });
        expect(count).toBe(0);
    });

    it('counts nothing without a cube or columns', async () => {
        const model = cubeModel([]);
        expect(
            await countTrailingRows({ model, layout: {}, columns: COLUMNS, matches: isPhantom })
        ).toBe(0);
        expect(
            await countTrailingRows({
                model,
                layout: cube(phantoms(3)),
                columns: [],
                matches: isPhantom,
            })
        ).toBe(0);
        expect(model.getHyperCubeData).not.toHaveBeenCalled();
    });

    describe('cancellation', () => {
        it('aborts before its first call when already stale', async () => {
            const rows = [...messages(9000), ...phantoms(7000)];
            const model = cubeModel(rows);
            await expect(
                countTrailingRows({
                    model,
                    layout: cube(rows),
                    columns: COLUMNS,
                    matches: isPhantom,
                    isStale: () => true,
                })
            ).rejects.toThrow(StaleError);
            expect(model.getHyperCubeData).not.toHaveBeenCalled();
        });

        it('aborts AFTER an in-flight call rather than counting what it brought back', async () => {
            const rows = [...messages(9000), ...phantoms(7000)];
            const model = cubeModel(rows);
            await expect(
                countTrailingRows({
                    model,
                    layout: cube(rows),
                    columns: COLUMNS,
                    matches: isPhantom,
                    isStale: () => model.calls.length >= 2,
                })
            ).rejects.toThrow(StaleError);
            expect(model.calls).toHaveLength(2);
        });
    });
});

describe('fetchAllRows — leaving out the last rows', () => {
    const rowOf = (row) => Number(row[0].qText.split(':')[0]);

    it('ends the last rows read just before the rows to skip', async () => {
        const seen = [];
        const model = mkModel(16000, 5, (p) => seen.push(p));
        const { rows, area, truncated } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 16000 }),
            maxRows: 5000,
            fromEnd: true,
            skipLast: 7000,
        });
        expect(seen.map((p) => p.qTop)).toEqual([4000, 6000, 8000]);
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 5000 }, (_, i) => 4000 + i));
        expect(area.qTop).toBe(4000);
        expect(truncated).toBe(true);
    });

    it('reads every row before the skipped ones from row 0 when they fit the cap', async () => {
        const model = mkModel(5100);
        const { rows, area } = await fetchAllRows({
            model,
            layout: mkLayout({ qcy: 5100, prefetched: 1000 }),
            maxRows: 5000,
            fromEnd: true,
            skipLast: 200,
        });
        expect(rows.map(rowOf)).toEqual(Array.from({ length: 4900 }, (_, i) => i));
        expect(area.qTop).toBe(0);
        expect(model.getHyperCubeData.mock.calls[0][1][0].qTop).toBe(1000);
    });

    it('never reads the skipped rows when reading from the start either', async () => {
        const { rows } = await fetchAllRows({
            model: mkModel(1000),
            layout: mkLayout({ qcy: 1000, prefetched: 1000 }),
            maxRows: 5000,
            skipLast: 30,
        });
        expect(rows).toHaveLength(970);
    });

    it('skips nothing for a count that is not a number of rows', async () => {
        for (const skipLast of [undefined, -5, Number.NaN]) {
            const { rows } = await fetchAllRows({
                model: mkModel(10),
                layout: mkLayout({ qcy: 10, prefetched: 10 }),
                fromEnd: true,
                skipLast,
            });
            expect(rows).toHaveLength(10);
        }
    });
});
