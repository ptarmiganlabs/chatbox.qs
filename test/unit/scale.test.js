import { describe, it, expect, vi } from 'vitest';
import { normalize } from '../../src/chat/normalize';
import { buildDayGroups } from '../../src/chat/grouping';
import { fetchAllRows, rowsPerPage } from '../../src/qix/paging';
import { assignBubbleKeys, collapseRecords } from '../../src/chat/collapse';

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

describe('scale: 12,000 messages spread over 36,000 rows', () => {
    // A group message arrives as one row per recipient. Collapsing must stay
    // linear, or a large cube with recipients becomes a resize-time stall.
    const WIDE = 6;
    const recipients = ['Bob', 'Cy', 'Dan'];

    function wideRows(messages) {
        return bigRows(messages).flatMap((r) =>
            recipients.map((name, k) => [
                r[0],
                r[1],
                r[2],
                { qText: name, qElemNumber: k },
                r[3],
                r[4],
            ])
        );
    }

    const wideLayout = (qcy) => ({
        qHyperCube: {
            qSize: { qcx: WIDE, qcy },
            qDimensionInfo: [
                { cId: 'd_msgid', qAttrExprInfo: [{ id: 'ts' }] },
                { cId: 'd_author' },
                { cId: 'd_thread' },
                { cId: 'uidRecipient', qFallbackTitle: 'Recipient' },
            ],
            qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
        },
    });

    it('collapses back to 12,000 bubbles without reporting truncation', () => {
        const rows = wideRows(COUNT);
        const c = normalize({ layout: wideLayout(rows.length), rows });
        expect(c.messages).toHaveLength(COUNT);
        expect(c.meta.rowsLoaded).toBe(COUNT * 3);
        expect(c.meta.truncated).toBe(false);
    });

    it('collapses in a time a resize can afford', () => {
        const rows = wideRows(COUNT);
        const layout = wideLayout(rows.length);
        const started = performance.now();
        normalize({ layout, rows });
        expect(performance.now() - started).toBeLessThan(2000);
    });
});

describe('scale: a Message ID shared by 20,000 different messages', () => {
    // A misconfigured id — a campaign or conversation id — shared by many different
    // messages from one sender. Splitting them and keying the bubbles was
    // quadratic: 12 seconds at this size, on every layout change.
    it('splits and keys them in linear time — regression', () => {
        const n = 20_000;
        const records = Array.from({ length: n }, (_, i) => ({
            id: 'campaign-7',
            elem: 1,
            authorKey: 'Ada',
            threadId: null,
            body: `Message ${i}`,
            ts: i,
            rowCount: 1,
            merged: false,
            sideHint: null,
            kpis: [],
            recipients: null,
        }));
        const started = performance.now();
        const { messages, conflictCount } = collapseRecords(records);
        assignBubbleKeys(messages);
        const elapsed = performance.now() - started;

        expect(messages).toHaveLength(n);
        expect(conflictCount).toBe(n - 1);
        expect(messages.every((m) => m.idConflict)).toBe(true);
        expect(new Set(messages.map((m) => m.key)).size).toBe(n);
        expect(elapsed).toBeLessThan(2000);
    });
});

describe('scale: sided From → To with many pairs', () => {
    // 12,000 messages between three people and 200 contacts, every tenth one a
    // group message to three contacts: ~14,400 rows and 600 pairs.
    function pairRows(messages) {
        const authors = ['Ada', 'Göran', 'Priya'];
        const rows = [];
        for (let i = 0; i < messages; i += 1) {
            const recipients = i % 10 === 0 ? [i % 200, (i + 1) % 200, (i + 2) % 200] : [i % 200];
            for (const r of recipients) {
                rows.push([
                    { qText: String(i + 1), qElemNumber: i, qAttrExps: { qValues: [] } },
                    { qText: authors[i % 3], qElemNumber: i % 3, qState: 'O' },
                    { qText: `Contact ${r}`, qElemNumber: r },
                    { qText: `Generated message ${i + 1}`, qNum: 'NaN', qIsNull: true },
                    { qText: '1', qNum: 1 },
                ]);
            }
        }
        return rows;
    }

    const pairLayout = (qcy) => ({
        qHyperCube: {
            qSize: { qcx: 5, qcy },
            qDimensionInfo: [{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_recipient' }],
            qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
        },
    });

    it('resolves sides for every message in a time a resize can afford', () => {
        const rows = pairRows(COUNT);
        const layout = pairLayout(rows.length);
        const props = { conversationModel: 'fromTo', layoutMode: 'sided' };
        const started = performance.now();
        const c = normalize({ layout, rows, props });
        expect(performance.now() - started).toBeLessThan(2000);
        expect(c.messages).toHaveLength(COUNT);
        expect(c.messages.every((m) => m.side === 'left' || m.side === 'right')).toBe(true);
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
