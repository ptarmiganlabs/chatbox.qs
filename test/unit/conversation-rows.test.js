import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_MAX_MESSAGES, readConversationRows } from '../../src/qix/conversation-rows';
import { StaleError } from '../../src/qix/paging';

// A participant cube: message id, author, thread, text, probe. A phantom row is a linked value with no
// message: a null id, no text and a probe of 0. Null ids sort last, so the phantoms are the last rows.
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

/** Messages 1 to `messages`, then `phantoms` phantom rows. */
const cubeRows = (messages, phantoms = 0) => [
    ...Array.from({ length: messages }, (_, i) => message(i + 1)),
    ...Array.from({ length: phantoms }, phantom),
];

/** The layout of a cube, with the first 1,000 rows delivered as its initial fetch does. */
const layoutOf = (rows) => ({
    qHyperCube: {
        qSize: { qcx: 5, qcy: rows.length },
        qDimensionInfo: [{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_thread' }],
        qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
        qDataPages: [
            {
                qArea: { qTop: 0, qLeft: 0, qWidth: 5, qHeight: Math.min(1000, rows.length) },
                qMatrix: rows.slice(0, 1000),
            },
        ],
    },
});

/** A model serving any rectangles of the cube, recording each call's pages. */
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
                    .map((r) => r.slice(qLeft, qLeft + qWidth)),
            }));
        }),
    };
}

/** The message number of each row read; null for a phantom row. */
const numbers = (rows) => rows.map((r) => (r[0].qElemNumber < 0 ? null : r[0].qElemNumber));
/** The calls that scanned single columns rather than reading whole rows. */
const scans = (model) => model.calls.filter((pages) => pages.every((p) => p.qWidth === 1));

describe('readConversationRows', () => {
    it('reads past the phantom rows at the end with Newest first', async () => {
        const rows = cubeRows(9000, 7000);
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 5000 },
        });
        expect(result.phantomTail).toBe(7000);
        expect(numbers(result.rows)).toEqual(Array.from({ length: 5000 }, (_, i) => 4001 + i));
        expect(result.area.qTop).toBe(4000);
        expect(scans(model).length).toBeGreaterThan(0);
    });

    it('reads past them with lanes in either order', async () => {
        const rows = cubeRows(30, 20);
        const result = await readConversationRows({
            model: cubeModel(rows),
            layout: layoutOf(rows),
            settings: { order: 'oldest', maxMessages: 10, lanes: { show: true } },
        });
        expect(result.phantomTail).toBe(20);
        expect(numbers(result.rows)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    });

    it('shows messages where every row the limit allowed was a phantom — the lab fixture', async () => {
        // 15 message rows and 2 phantom rows, at Maximum messages 2.
        const rows = cubeRows(15, 2);
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 2 },
        });
        expect(numbers(result.rows)).toEqual([14, 15]);
        expect(result.phantomTail).toBe(2);
        // Every row came with the layout: no call at all.
        expect(model.getHyperCubeData).not.toHaveBeenCalled();
    });

    it('costs one small scan when the cube does not end in phantom rows', async () => {
        const rows = cubeRows(12000);
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 5000 },
        });
        expect(result.phantomTail).toBe(0);
        expect(numbers(result.rows)[0]).toBe(7001);
        expect(scans(model)).toHaveLength(1);
        expect(scans(model)[0][0].qHeight).toBe(100);
    });

    it('does not scan a cube within the limit, whose phantom rows take no message’s place', async () => {
        const rows = cubeRows(4000, 500);
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 5000 },
        });
        expect(result.phantomTail).toBe(0);
        expect(result.rows).toHaveLength(4500);
        expect(scans(model)).toHaveLength(0);
    });

    it('does not scan for Oldest first without lanes, which reads from row 0', async () => {
        const rows = cubeRows(9000, 7000);
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout: layoutOf(rows),
            settings: { order: 'oldest', maxMessages: 5000 },
        });
        expect(result.phantomTail).toBe(0);
        expect(numbers(result.rows).slice(0, 2)).toEqual([1, 2]);
        expect(scans(model)).toHaveLength(0);
    });

    it('reads the last rows without a scan while the roles are not set up', async () => {
        const rows = cubeRows(30, 20);
        const layout = layoutOf(rows);
        layout.qHyperCube.qMeasureInfo = [];
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout,
            settings: { order: 'newest', maxMessages: 10 },
        });
        expect(result.phantomTail).toBe(0);
        expect(result.area.qTop).toBe(40);
        expect(scans(model)).toHaveLength(0);
    });

    it('uses the default limit when the setting holds no number', async () => {
        const rows = cubeRows(DEFAULT_MAX_MESSAGES + 50);
        const result = await readConversationRows({
            model: cubeModel(rows),
            layout: layoutOf(rows),
            settings: { order: 'oldest', maxMessages: 'lots' },
        });
        expect(result.rows).toHaveLength(DEFAULT_MAX_MESSAGES);
    });

    it('reports reading progress, and aborts a superseded run during the scan', async () => {
        const rows = cubeRows(9000, 7000);
        const progress = [];
        await readConversationRows({
            model: cubeModel(rows),
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 5000 },
            onProgress: (loaded, total) => progress.push([loaded, total]),
        });
        expect(progress.at(-1)).toEqual([5000, 5000]);

        const model = cubeModel(rows);
        await expect(
            readConversationRows({
                model,
                layout: layoutOf(rows),
                settings: { order: 'newest', maxMessages: 5000 },
                isStale: () => model.calls.length >= 1,
            })
        ).rejects.toThrow(StaleError);
        expect(model.calls).toHaveLength(1);
        expect(scans(model)).toHaveLength(1);
    });
});
