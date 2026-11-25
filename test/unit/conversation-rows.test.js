import { describe, it, expect, vi } from 'vitest';
import {
    DEFAULT_MAX_MESSAGES,
    readConversationRows,
    readSnapshotRows,
} from '../../src/qix/conversation-rows';
import { writeRowSnapshot, writeSnapshot } from '../../src/ui/snapshot';
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

    it('costs no call of its own when the cube does not end in phantom rows', async () => {
        // The scan before reading used to be a round trip of its own, which on a sheet of several
        // objects queued behind their pages for ~140 ms (GOTCHAS 61).
        const rows = cubeRows(12000);
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 5000 },
        });
        expect(result.phantomTail).toBe(0);
        expect(numbers(result.rows)).toEqual(Array.from({ length: 5000 }, (_, i) => 7001 + i));
        expect(scans(model)).toHaveLength(0);
        expect(model.calls.map((pages) => pages[0].qTop)).toEqual([7000, 9000, 11000]);
    });

    it('counts a few phantom rows among the rows read, and reads the ones they displaced in one call', async () => {
        const rows = cubeRows(12000, 300);
        const model = cubeModel(rows);
        const result = await readConversationRows({
            model,
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 5000 },
        });
        expect(result.phantomTail).toBe(300);
        expect(numbers(result.rows)).toEqual(Array.from({ length: 5000 }, (_, i) => 7001 + i));
        expect(result.area).toEqual({ qTop: 7000, qLeft: 0, qWidth: 5, qHeight: 5000 });
        expect(result.truncated).toBe(true);
        expect(scans(model)).toHaveLength(0);
        // The last 5,000 rows, then the 300 before them.
        expect(model.calls.at(-1)[0]).toMatchObject({ qTop: 7000, qHeight: 300 });
    });

    it('keeps every message when the phantom rows push the rows wanted back to row 0', async () => {
        // 4,900 messages and 300 phantom rows: 5,200 rows, over the limit of 5,000 only by phantoms.
        const rows = cubeRows(4900, 300);
        const result = await readConversationRows({
            model: cubeModel(rows),
            layout: layoutOf(rows),
            settings: { order: 'newest', maxMessages: 5000 },
        });
        expect(result.phantomTail).toBe(300);
        expect(numbers(result.rows)).toEqual(Array.from({ length: 4900 }, (_, i) => i + 1));
        expect(result.area.qTop).toBe(0);
        expect(result.truncated).toBe(true);
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

    it('reports reading progress, and aborts a superseded run', async () => {
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
    });
});

/**
 * The model an image or PDF export renders with: nebula's snapshot renderer gives the object a model
 * that answers getLayout and nothing else (GOTCHAS 29).
 */
const exportModel = (layout) => ({
    getLayout: async () => layout,
    on() {},
    once() {},
});

/** The layout copy Sense hands onTakeSnapshot, with the view state and the rows shown written in. */
function snapshotOf(layout, read) {
    const copy = JSON.parse(JSON.stringify(layout));
    writeSnapshot(copy, { firstVisibleIndex: 0, openId: null });
    return writeRowSnapshot(copy, { ...read, hyperCube: layout.qHyperCube });
}

describe('rows in an image or PDF export', () => {
    it('cannot be paged from the export model — the error an export showed', async () => {
        const rows = cubeRows(9000, 7000);
        const snapshot = JSON.parse(JSON.stringify(layoutOf(rows)));
        await expect(
            readConversationRows({
                model: exportModel(snapshot),
                layout: snapshot,
                settings: { order: 'newest', maxMessages: 5000 },
            })
        ).rejects.toThrow(/getHyperCubeData is not a function/);
    });

    it.each([
        [
            'Newest first past phantom rows',
            cubeRows(9000, 7000),
            { order: 'newest', maxMessages: 5000 },
        ],
        ['lanes', cubeRows(30, 20), { order: 'oldest', maxMessages: 10, lanes: { show: true } }],
        [
            'Oldest first past the initial fetch',
            cubeRows(3000),
            { order: 'oldest', maxMessages: 2500 },
        ],
    ])('shows the rows the reader saw, with %s', async (_, rows, settings) => {
        const layout = layoutOf(rows);
        const live = await readConversationRows({ model: cubeModel(rows), layout, settings });
        const snapshot = snapshotOf(layout, live);
        // What the export reads it with is serialized and sent away first.
        const exported = JSON.parse(JSON.stringify(snapshot));
        expect(readSnapshotRows({ layout: exported, settings })).toEqual(live);
    });

    it('carries the widened cube the rows were read from, not the object’s own', () => {
        const own = layoutOf(cubeRows(5));
        const widened = layoutOf(cubeRows(8));
        widened.qHyperCube.qSize.qcx = 6;
        widened.qHyperCube.qDimensionInfo.push({ cId: 'chatbox-context-gate' });
        const wideRows = widened.qHyperCube.qDataPages[0].qMatrix.map((r) => [...r, { qNum: 1 }]);
        const copy = writeSnapshot(JSON.parse(JSON.stringify(own)), {});
        writeRowSnapshot(copy, {
            rows: wideRows,
            area: { qTop: 0, qLeft: 0, qWidth: 6, qHeight: 8 },
            phantomTail: 0,
            hyperCube: widened.qHyperCube,
        });
        expect(copy.qHyperCube.qSize).toEqual({ qcx: 6, qcy: 8 });
        expect(copy.qHyperCube.qDimensionInfo.at(-1).cId).toBe('chatbox-context-gate');
        expect(copy.qHyperCube.qDataPages).toEqual([
            { qArea: { qTop: 0, qLeft: 0, qWidth: 6, qHeight: 8 }, qMatrix: wideRows },
        ]);
        // A copy: the live session's cube is left as it was.
        expect(copy.qHyperCube.qDataPages[0].qMatrix).not.toBe(wideRows);
        expect(widened.qHyperCube.qDataPages[0].qMatrix[0]).toHaveLength(5);
    });

    it('shows the rows the layout holds for a snapshot taken without them, and asks no engine', () => {
        // A story snapshot saved by an earlier build: the view state, and only the initial fetch.
        const rows = cubeRows(3000);
        const snapshot = writeSnapshot(JSON.parse(JSON.stringify(layoutOf(rows))), {});
        const result = readSnapshotRows({ layout: snapshot, settings: { maxMessages: 400 } });
        expect(numbers(result.rows)).toEqual(Array.from({ length: 400 }, (_, i) => i + 1));
        expect(result).toMatchObject({ total: 3000, truncated: true, phantomTail: 0 });
        expect(result.area).toEqual({ qTop: 0, qLeft: 0, qWidth: 5, qHeight: 400 });
    });

    it('leaves a layout with nothing shown as it was', () => {
        const layout = writeSnapshot(layoutOf(cubeRows(3)), {});
        const pages = layout.qHyperCube.qDataPages;
        writeRowSnapshot(layout, null);
        expect(layout.qHyperCube.qDataPages).toBe(pages);
        expect(layout.snapshotData.chatboxRows).toBeUndefined();
    });
});
