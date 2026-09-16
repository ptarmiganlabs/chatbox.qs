import { describe, it, expect, vi } from 'vitest';
import { normalize } from '../../src/chat/normalize';
import { buildDayGroups } from '../../src/chat/grouping';
import { fetchAllRows, rowsPerPage } from '../../src/qix/paging';
import { assignBubbleKeys, collapseRecords } from '../../src/chat/collapse';
import { buildBoard } from '../../src/chat/lanes';
import { readsFromEnd } from '../../src/chat/message-limit';
import { laneCaption } from '../../src/ui/LaneBoard';
import { fastestTime } from '../helpers/timing';

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
        const input = (n) => ({ layout: bigLayout(n), rows: bigRows(n) });
        const small = input(3000);
        const large = input(12000);
        // The fastest of several runs, each after a warm-up: a single run picked up the load of
        // the other test files running beside this one, and failed at 12.6 on an idle change.
        const smallTime = Math.max(
            fastestTime(() => normalize(small)),
            1
        );
        const largeTime = fastestTime(() => normalize(large));
        // 4x the rows should cost well under 16x the time.
        expect(largeTime / smallTime).toBeLessThan(12);
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

describe('scale: 12,000 messages over a limit of 5,000', () => {
    /** A model serving the generated rows, each page from the row it starts at. */
    const cubeModel = () => ({
        getHyperCubeData: vi.fn(async (path, pages) => {
            const { qTop, qHeight } = pages[0];
            const available = Math.max(0, Math.min(qHeight, COUNT - qTop));
            return [
                {
                    qArea: { qTop, qLeft: 0, qWidth: COLS, qHeight: available },
                    qMatrix: bigRows(qTop + available).slice(qTop),
                },
            ];
        }),
    });

    /** Read the rows as the object does for these settings, and normalize them. */
    async function conversationFor(settings) {
        const { rows, area } = await fetchAllRows({
            model: cubeModel(),
            layout: bigLayout(),
            maxRows: 5000,
            fromEnd: readsFromEnd(settings),
        });
        return normalize({ layout: bigLayout(), rows, area, props: settings });
    }

    const truncation = (c) => c.diagnostics.find((d) => d.code === 'truncated').message;

    it('shows the newest 5,000 newest first, not the oldest 5,000 — regression', async () => {
        const c = await conversationFor({ order: 'newest' });
        expect(c.messages).toHaveLength(5000);
        expect(c.messages[0].body).toBe('Generated message 12000');
        expect(c.messages[0].rowIdx).toBe(11999);
        expect(c.messages.at(-1).body).toBe('Generated message 7001');
        expect(c.messages.at(-1).rowIdx).toBe(7000);
        expect(truncation(c)).toBe(
            'Showing the newest 5000 of 12000 messages. Filter to see the rest.'
        );
    });

    it('still shows the oldest 5,000 oldest first', async () => {
        const c = await conversationFor({ order: 'oldest' });
        expect(c.messages[0].body).toBe('Generated message 1');
        expect(c.messages.at(-1).body).toBe('Generated message 5000');
        expect(truncation(c)).toBe(
            'Showing the oldest 5000 of 12000 messages. Filter to see the rest.'
        );
    });

    it('gives the conversations with the latest activity lanes, and says which rows they come from', async () => {
        // A thread every 500 messages: the newest 5,000 rows hold threads 15 to 24.
        const settings = { order: 'oldest', lanes: { show: true } };
        const c = await conversationFor(settings);
        const board = buildBoard(c.messages, { max: 4, scroll: 'linked' });
        expect(board.lanes.map((lane) => lane.label)).toEqual([
            'Thread 24',
            'Thread 23',
            'Thread 22',
            'Thread 21',
        ]);
        expect(laneCaption(board, c.meta)).toBe(
            '4 of 10 conversations among the newest 5,000 of 12,000 rows'
        );
    });
});
