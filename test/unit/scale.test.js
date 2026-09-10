import { describe, it, expect, vi } from 'vitest';
import { normalize } from '../../src/chat/normalize';
import { buildDayGroups } from '../../src/chat/grouping';
import { fetchAllRows, rowsPerPage } from '../../src/qix/paging';

/**
 * Matches the ChatBig fixture on the PTLAB server: 12,000 generated messages
 * across three participants, one every five minutes from 2026-01-01.
 */
const COUNT = 12_000;
const COLS = 5;
const START = new Date(2026, 0, 1).getTime();

/** Qlik day serial for an epoch ms value — what the engine actually returns. */
const toSerial = (ms) => ms / 86400000 + 25569;

function bigRows(n = COUNT) {
    const authors = ['Ada', 'Göran', 'Priya'];
    return Array.from({ length: n }, (_, i) => [
        {
            qText: String(i + 1),
            qElemNumber: i,
            qAttrExps: { qValues: [{ qNum: toSerial(START + i * 300_000) }] },
        },
        { qText: authors[i % 3], qElemNumber: i % 3, qState: 'O' },
        { qText: `Thread ${Math.ceil((i + 1) / 500)}`, qElemNumber: 0 },
        { qText: `Generated message ${i + 1}`, qNum: 'NaN', qIsNull: true },
        { qText: '1', qNum: 1 },
    ]);
}

const bigLayout = (qcy = COUNT) => ({
    qHyperCube: {
        qSize: { qcx: COLS, qcy },
        qDimensionInfo: [
            { cId: 'd_msgid', qAttrExprInfo: [{ id: 'ts' }] },
            { cId: 'd_author' },
            { cId: 'd_thread' },
        ],
        qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
    },
});

describe('scale: 12,000 messages', () => {
    it('normalizes every message without dropping any', () => {
        const c = normalize({ layout: bigLayout(), rows: bigRows() });
        expect(c.messages).toHaveLength(COUNT);
        expect(c.meta.loaded).toBe(COUNT);
        expect(c.meta.truncated).toBe(false);
        expect(c.participants.size).toBe(3);
    });

    it('normalizes in a time a resize can afford', () => {
        // Normalization runs on every layout change, including each step of a
        // drag-resize. A budget this generous still catches an accidental
        // quadratic — the failure mode that only shows up at scale.
        const rows = bigRows();
        const layout = bigLayout();
        const started = performance.now();
        normalize({ layout, rows });
        const elapsed = performance.now() - started;
        expect(elapsed).toBeLessThan(2000);
    });

    it('does not degrade super-linearly from 3,000 to 12,000', () => {
        const time = (n) => {
            const rows = bigRows(n);
            const layout = bigLayout(n);
            const t = performance.now();
            normalize({ layout, rows });
            return performance.now() - t;
        };
        time(500); // warm up, so the first run's JIT cost is not attributed
        const small = Math.max(time(3000), 1);
        const large = time(12000);
        // 4x the rows should cost well under 16x the time.
        expect(large / small).toBeLessThan(12);
    });

    it('groups a year of messages into days without losing any', () => {
        const c = normalize({ layout: bigLayout(), rows: bigRows() });
        const groups = buildDayGroups(c.messages, START);
        expect(groups.groupCounts.reduce((a, b) => a + b, 0)).toBe(COUNT);
        // One message every 5 minutes = 288/day, so ~42 days.
        expect(groups.groupCounts.length).toBeGreaterThan(30);
    });

    it('converts the engine day serial back to a real timestamp', () => {
        const c = normalize({ layout: bigLayout(), rows: bigRows(3) });
        expect(new Date(c.messages[0].ts).getFullYear()).toBe(2026);
        expect(c.messages[1].ts - c.messages[0].ts).toBeCloseTo(300_000, -2);
    });
});

describe('scale: paging 12,000 rows', () => {
    it('fetches every row in the fewest calls the cell budget allows', async () => {
        const perPage = rowsPerPage(COLS); // 2000
        const seen = [];
        const model = {
            getHyperCubeData: vi.fn(async (path, pages) => {
                const { qTop, qHeight } = pages[0];
                seen.push(pages[0]);
                const available = Math.max(0, Math.min(qHeight, COUNT - qTop));
                return [
                    {
                        qArea: { qTop, qLeft: 0, qWidth: COLS, qHeight: available },
                        qMatrix: bigRows(available),
                    },
                ];
            }),
        };
        const { rows, total, truncated } = await fetchAllRows({
            model,
            layout: bigLayout(),
            maxRows: COUNT,
        });

        expect(rows).toHaveLength(COUNT);
        expect(total).toBe(COUNT);
        expect(truncated).toBe(false);
        expect(seen).toHaveLength(Math.ceil(COUNT / perPage)); // 6
        for (const p of seen) expect(p.qWidth * p.qHeight).toBeLessThanOrEqual(10_000);
    });

    it('stops at the configured cap and says so', async () => {
        const model = {
            getHyperCubeData: vi.fn(async (path, pages) => {
                const { qTop, qHeight } = pages[0];
                return [
                    {
                        qArea: { qTop, qLeft: 0, qWidth: COLS, qHeight },
                        qMatrix: bigRows(qHeight),
                    },
                ];
            }),
        };
        const { rows, truncated } = await fetchAllRows({
            model,
            layout: bigLayout(),
            maxRows: 5000,
        });
        expect(rows).toHaveLength(5000);
        expect(truncated).toBe(true);
    });

    it('reports truncation to the user rather than silently dropping messages', () => {
        const c = normalize({ layout: bigLayout(COUNT), rows: bigRows(5000) });
        expect(c.meta.truncated).toBe(true);
        const warning = c.diagnostics.find((d) => d.code === 'truncated');
        expect(warning.message).toContain('12000');
    });
});
