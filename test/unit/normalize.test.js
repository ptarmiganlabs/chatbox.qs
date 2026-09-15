import { describe, it, expect } from 'vitest';
import { normalize } from '../../src/chat/normalize';
import { ATTR_IDS } from '../../src/qix/attr-map';

/** Build a layout with the standard 3-dim / 2-measure chat cube. */
function makeLayout({ qcy = 0, attrIds = [] } = {}) {
    return {
        qHyperCube: {
            qSize: { qcx: 5, qcy },
            qDimensionInfo: [
                { cId: 'd_msgid', qAttrExprInfo: attrIds.map((id) => ({ id })) },
                { cId: 'd_author' },
                { cId: 'd_thread' },
            ],
            qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
        },
    };
}

/** Build one qMatrix row. */
function row({ id, elemId = 1, author, authorElem = 10, thread = '-', text, dup = 1, attrs = [] }) {
    return [
        { qText: id, qElemNumber: elemId, qAttrExps: { qValues: attrs } },
        { qText: author, qElemNumber: authorElem, qState: 'O' },
        { qText: thread, qElemNumber: 0 },
        { qText: text, qNum: 'NaN' },
        { qText: String(dup), qNum: dup },
    ];
}

describe('normalize', () => {
    it('produces one message per row with the author resolved', () => {
        const layout = makeLayout({ qcy: 2 });
        const rows = [
            row({ id: '1', author: 'Ada', text: 'hello' }),
            row({ id: '2', author: 'Bob', authorElem: 11, text: 'hi' }),
        ];
        const c = normalize({ layout, rows });

        expect(c.messages).toHaveLength(2);
        expect(c.messages[0].body).toBe('hello');
        expect(c.messages[0].author.label).toBe('Ada');
        expect(c.participants.size).toBe(2);
        expect(c.meta.loaded).toBe(2);
    });

    it('returns the not-configured state when required roles are missing', () => {
        const layout = {
            qHyperCube: {
                qSize: { qcx: 1, qcy: 5 },
                qDimensionInfo: [{ cId: 'd_msgid' }],
                qMeasureInfo: [],
            },
        };
        const c = normalize({ layout, rows: [] });
        expect(c.messages).toEqual([]);
        expect(c.diagnostics.some((d) => d.code === 'missing-roles')).toBe(true);
    });

    it('never throws on a missing hypercube', () => {
        expect(() => normalize({ layout: undefined, rows: [] })).not.toThrow();
        expect(normalize({ layout: {}, rows: [] }).messages).toEqual([]);
    });

    describe('the merged-bubble integrity probe', () => {
        it('flags rows where the message id is not unique', () => {
            const layout = makeLayout({ qcy: 2 });
            const rows = [
                row({ id: '1', author: 'Ada', text: 'ok', dup: 3 }),
                row({ id: '2', author: 'Bob', text: 'fine', dup: 1 }),
            ];
            const c = normalize({ layout, rows });

            expect(c.messages[0].merged).toBe(true);
            expect(c.messages[1].merged).toBe(false);
            expect(c.meta.mergedCount).toBe(1);
            const warn = c.diagnostics.find((d) => d.code === 'merged-bubbles');
            expect(warn).toBeTruthy();
            // It must warn, not blank the chart.
            expect(c.messages).toHaveLength(2);
        });

        it('stays quiet when every id is unique', () => {
            const c = normalize({
                layout: makeLayout({ qcy: 1 }),
                rows: [row({ id: '1', author: 'Ada', text: 'ok', dup: 1 })],
            });
            expect(c.diagnostics.find((d) => d.code === 'merged-bubbles')).toBeUndefined();
        });
    });

    describe('attribute expressions', () => {
        const attrIds = [
            ATTR_IDS.TS,
            ATTR_IDS.AVATAR,
            ATTR_IDS.ACCENT,
            ATTR_IDS.MEDIA,
            ATTR_IDS.SIDE,
        ];

        it('reads metadata by id, not by hardcoded index', () => {
            const layout = makeLayout({ qcy: 1, attrIds });
            const rows = [
                row({
                    id: '1',
                    author: 'Ada',
                    text: 'hi',
                    attrs: [
                        { qNum: 1757000000000 },
                        { qText: '/content/Default/ada.png' },
                        { qText: '#ff0000' },
                        { qText: 'image:/content/Default/pic.png' },
                        { qNum: 1 },
                    ],
                }),
            ];
            const m = normalize({ layout, rows }).messages[0];

            expect(m.ts).toBe(1757000000000);
            expect(m.accent).toBe('#ff0000');
            expect(m.author.avatarUrl).toBe('/content/Default/ada.png');
            expect(m.media[0]).toMatchObject({ kind: 'image', ref: '/content/Default/pic.png' });
        });

        it('rejects a dangerous avatar URL rather than passing it through', () => {
            const layout = makeLayout({ qcy: 1, attrIds: [ATTR_IDS.AVATAR] });
            const rows = [
                row({
                    id: '1',
                    author: 'Ada',
                    text: 'hi',
                    attrs: [{ qText: 'javascript:alert(1)' }],
                }),
            ];
            expect(normalize({ layout, rows }).messages[0].author.avatarUrl).toBeNull();
        });

        it('tolerates a cube with no attribute expressions at all', () => {
            const c = normalize({
                layout: makeLayout({ qcy: 1 }),
                rows: [row({ id: '1', author: 'Ada', text: 'hi' })],
            });
            expect(c.messages[0].ts).toBeNull();
            expect(c.messages[0].media).toEqual([]);
        });
    });

    describe('side resolution', () => {
        const twoParty = () => [
            row({ id: '1', author: 'Ada', authorElem: 10, text: 'a' }),
            row({ id: '2', author: 'Bob', authorElem: 11, text: 'b' }),
        ];

        it('puts the author of the LAST message on the right, in SIDED mode with two participants', () => {
            const c = normalize({
                layout: makeLayout({ qcy: 2 }),
                rows: twoParty(),
                props: { layoutMode: 'sided' },
            });
            expect(c.participants.get('Bob').side).toBe('right');
            expect(c.participants.get('Ada').side).toBe('left');
        });

        it('keeps everything left in RAIL mode even with exactly two participants', () => {
            // Two-sided alignment is opt-in. Rail is the default because it is
            // the only layout that works at any participant count.
            const c = normalize({
                layout: makeLayout({ qcy: 2 }),
                rows: twoParty(),
                props: { layoutMode: 'rail' },
            });
            expect([...c.participants.values()].every((p) => p.side === 'left')).toBe(true);
        });

        it('ignores a SYNTHETIC author when counting participants for sided mode', () => {
            // A Null/Others row is not a person. Counting it turned a genuine
            // two-party chat into a three-party one and disabled sided layout.
            const rows = [
                row({ id: '1', author: 'Ada', authorElem: 10, text: 'a' }),
                row({ id: '2', author: 'Bob', authorElem: 11, text: 'b' }),
                row({ id: '3', author: '', authorElem: -2, text: 'null row' }),
            ];
            const c = normalize({
                layout: makeLayout({ qcy: 3 }),
                rows,
                props: { layoutMode: 'sided' },
            });
            expect(c.participants.get('Bob').side).toBe('right');
        });

        it('honours ownParticipant over the automatic rule', () => {
            const c = normalize({
                layout: makeLayout({ qcy: 2 }),
                rows: twoParty(),
                props: { layoutMode: 'sided', ownParticipant: 'ada' }, // case-insensitive
            });
            expect(c.participants.get('Ada').side).toBe('right');
            expect(c.participants.get('Bob').side).toBe('left');
        });

        it('lets a per-message side attribute outrank the participant default', () => {
            const layout = makeLayout({ qcy: 1, attrIds: [ATTR_IDS.SIDE] });
            const rows = [row({ id: '1', author: 'Ada', text: 'a', attrs: [{ qNum: 1 }] })];
            expect(normalize({ layout, rows }).messages[0].side).toBe('right');
        });

        it('keeps everything left with three or more participants', () => {
            const rows = [
                row({ id: '1', author: 'Ada', authorElem: 10, text: 'a' }),
                row({ id: '2', author: 'Bob', authorElem: 11, text: 'b' }),
                row({ id: '3', author: 'Cy', authorElem: 12, text: 'c' }),
            ];
            const c = normalize({ layout: makeLayout({ qcy: 3 }), rows });
            expect([...c.participants.values()].every((p) => p.side === 'left')).toBe(true);
        });
    });

    describe('participant colour', () => {
        it('is stable per element number, not per order of appearance', () => {
            const layout = makeLayout({ qcy: 2 });
            const forward = normalize({
                layout,
                rows: [
                    row({ id: '1', author: 'Ada', authorElem: 10, text: 'a' }),
                    row({ id: '2', author: 'Bob', authorElem: 11, text: 'b' }),
                ],
            });
            // Same people, opposite arrival order — colours must not swap.
            const reverse = normalize({
                layout,
                rows: [
                    row({ id: '2', author: 'Bob', authorElem: 11, text: 'b' }),
                    row({ id: '1', author: 'Ada', authorElem: 10, text: 'a' }),
                ],
            });
            expect(forward.participants.get('Ada').color).toBe(
                reverse.participants.get('Ada').color
            );
            expect(forward.participants.get('Bob').color).toBe(
                reverse.participants.get('Bob').color
            );
        });

        it('greys synthetic participants instead of giving them a palette colour', () => {
            const c = normalize({
                layout: makeLayout({ qcy: 1 }),
                rows: [row({ id: '1', author: '', authorElem: -2, text: 'x' })],
            });
            const p = [...c.participants.values()][0];
            expect(p.unknown).toBe(true);
            expect(p.color).toBe('#9e9e9e');
        });
    });

    describe('truncation and ordering', () => {
        it('warns when fewer rows are loaded than the cube holds', () => {
            const c = normalize({
                layout: makeLayout({ qcy: 5000 }),
                rows: [row({ id: '1', author: 'Ada', text: 'a' })],
            });
            expect(c.meta.truncated).toBe(true);
            expect(c.diagnostics.find((d) => d.code === 'truncated').message).toContain('5000');
        });

        it('reverses for newest-first without losing any message', () => {
            const rows = [
                row({ id: '1', author: 'Ada', text: 'first' }),
                row({ id: '2', author: 'Bob', text: 'second' }),
            ];
            const c = normalize({
                layout: makeLayout({ qcy: 2 }),
                rows,
                props: { order: 'newest' },
            });
            expect(c.messages.map((m) => m.body)).toEqual(['second', 'first']);
        });
    });

    it('records absolute row indices honouring the page area offset', () => {
        const c = normalize({
            layout: makeLayout({ qcy: 3000 }),
            rows: [row({ id: 'x', author: 'Ada', text: 'a' })],
            area: { qTop: 2000, qLeft: 0 },
        });
        expect(c.messages[0].rowIdx).toBe(2000);
    });

    it('keeps a message whose body is empty rather than dropping it', () => {
        const c = normalize({
            layout: makeLayout({ qcy: 1 }),
            rows: [row({ id: '1', author: 'Ada', text: '' })],
        });
        expect(c.messages).toHaveLength(1);
        expect(c.messages[0].body).toBe('');
    });

    it('does not interpret HTML in a message body — it is carried as plain text', () => {
        const evil = '<img src=x onerror=alert(1)>';
        const c = normalize({
            layout: makeLayout({ qcy: 1 }),
            rows: [row({ id: '1', author: '<script>', text: evil })],
        });
        expect(c.messages[0].body).toBe(evil);
        expect(c.messages[0].author.label).toBe('<script>');
    });
});

describe('participant colours — regression', () => {
    it('ignores a single-colour theme palette rather than colouring everyone alike', () => {
        // Regression: getDataColorPalettes() returns a MIXED list, and [0] is not
        // reliably categorical. A one-colour palette made every participant the
        // same colour, because the modulo always landed on index 0.
        const singleColourTheme = {
            getDataColorPalettes: () => [
                { name: 'Single', colors: ['#008397'] },
                { name: '12 colors', colors: ['#a1c'] },
            ],
        };
        const rows = [
            row({ id: '1', author: 'Ada', authorElem: 10, text: 'a' }),
            row({ id: '2', author: 'Bob', authorElem: 11, text: 'b' }),
        ];
        const c = normalize({ layout: makeLayout({ qcy: 2 }), rows, theme: singleColourTheme });
        expect(c.participants.get('Ada').color).not.toBe(c.participants.get('Bob').color);
    });

    it('uses the richest categorical palette the theme offers', () => {
        const theme = {
            getDataColorPalettes: () => [
                { name: 'Single', colors: ['#008397'] },
                { name: '6 colors', colors: ['#111', '#222', '#333', '#444', '#555', '#666'] },
            ],
        };
        const c = normalize({
            layout: makeLayout({ qcy: 1 }),
            rows: [row({ id: '1', author: 'Ada', authorElem: 2, text: 'a' })],
            theme,
        });
        expect(c.participants.get('Ada').color).toBe('#333');
    });

    it('survives a theme whose palette accessor throws', () => {
        const theme = {
            getDataColorPalettes: () => {
                throw new Error('no theme');
            },
        };
        expect(() =>
            normalize({
                layout: makeLayout({ qcy: 1 }),
                rows: [row({ id: '1', author: 'Ada', text: 'a' })],
                theme,
            })
        ).not.toThrow();
    });
});

describe('message body — regression', () => {
    it('renders a string measure body that the engine flagged as null', () => {
        const layout = makeLayout({ qcy: 1 });
        const r = row({ id: '1', author: 'Ada', text: 'hello there' });
        r[3] = { qText: 'hello there', qNum: 'NaN', qIsNull: true }; // as the engine really sends it
        expect(normalize({ layout, rows: [r] }).messages[0].body).toBe('hello there');
    });
});

describe('merged bubbles — body regression', () => {
    it("does not surface the engine's '-' as the message body", () => {
        // Only() returns NULL when the value is not unique within the group,
        // which is exactly what a merged bubble produces. The engine renders
        // that as '-', and a bare dash was reaching the bubble as if it were
        // the message text.
        const layout = makeLayout({ qcy: 1 });
        const r = row({ id: '900', author: 'Ada', text: '-', dup: 2 });
        r[3] = { qText: '-', qNum: 'NaN', qIsNull: true };
        const m = normalize({ layout, rows: [r] }).messages[0];

        expect(m.body).toBe('');
        expect(m.merged).toBe(true);
        expect(m.rowCount).toBe(2);
    });

    it('reports how many messages a bubble combines', () => {
        const layout = makeLayout({ qcy: 1 });
        const m = normalize({
            layout,
            rows: [row({ id: '900', author: 'Ada', text: 'x', dup: 5 })],
        }).messages[0];
        expect(m.rowCount).toBe(5);
    });

    it('leaves an ordinary message at rowCount 1 and keeps its text', () => {
        const m = normalize({
            layout: makeLayout({ qcy: 1 }),
            rows: [row({ id: '1', author: 'Ada', text: 'hello', dup: 1 })],
        }).messages[0];
        expect(m.rowCount).toBe(1);
        expect(m.merged).toBe(false);
        expect(m.body).toBe('hello');
    });

    it('keeps a message whose text legitimately contains a dash', () => {
        const m = normalize({
            layout: makeLayout({ qcy: 1 }),
            rows: [row({ id: '1', author: 'Ada', text: 'well - maybe', dup: 1 })],
        }).messages[0];
        expect(m.body).toBe('well - maybe');
    });
});

describe('per-message KPIs', () => {
    function kpiLayout() {
        return {
            qHyperCube: {
                qSize: { qcx: 6, qcy: 1 },
                qDimensionInfo: [{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_thread' }],
                qMeasureInfo: [
                    { cId: 'm_text' },
                    { cId: 'm_dupcheck' },
                    { cId: 'm_sent', qFallbackTitle: 'Sentiment' },
                ],
            },
        };
    }

    it('exposes measures beyond the role measures as KPIs', () => {
        const r = row({ id: '1', author: 'Ada', text: 'hi' });
        r.push({ qText: '0.82', qNum: 0.82 });
        const m = normalize({ layout: kpiLayout(), rows: [r] }).messages[0];

        expect(m.kpis).toHaveLength(1);
        expect(m.kpis[0]).toMatchObject({ label: 'Sentiment', text: '0.82', num: 0.82 });
    });

    it('does NOT expose the integrity probe as a KPI', () => {
        // It is an internal correctness signal, not something to show a user.
        const r = row({ id: '1', author: 'Ada', text: 'hi' });
        r.push({ qText: '0.82', qNum: 0.82 });
        const m = normalize({ layout: kpiLayout(), rows: [r] }).messages[0];
        expect(m.kpis.map((k) => k.label)).not.toContain('_rows');
    });

    it('gives every message an empty KPI list when there are no extra measures', () => {
        const m = normalize({
            layout: makeLayout({ qcy: 1 }),
            rows: [row({ id: '1', author: 'Ada', text: 'hi' })],
        }).messages[0];
        expect(m.kpis).toEqual([]);
    });

    it('keeps a non-numeric KPI readable rather than dropping it', () => {
        const r = row({ id: '1', author: 'Ada', text: 'hi' });
        r.push({ qText: 'high', qNum: 'NaN' });
        const m = normalize({ layout: kpiLayout(), rows: [r] }).messages[0];
        expect(m.kpis[0].text).toBe('high');
        expect(m.kpis[0].num).toBeNull();
    });
});

describe('rows that belong to one message', () => {
    // A cube with a fourth dimension no role claims — the same row shape a
    // recipient dimension produces for a group message: one row per extra value.
    // It carries a role cId another column already holds, so neither the cId pass
    // nor the positional fallback can give it a role. Element numbers are
    // explicit here, because the row() helper above gives every row the same
    // message-id element.
    function wideLayout({ qcy, attrIds = [], kpiCount = 0 } = {}) {
        return {
            qHyperCube: {
                qSize: { qcx: 6 + kpiCount, qcy },
                qDimensionInfo: [
                    { cId: 'd_msgid', qAttrExprInfo: attrIds.map((id) => ({ id })) },
                    { cId: 'd_author' },
                    { cId: 'd_thread' },
                    { cId: 'd_author', qFallbackTitle: 'Channel' },
                ],
                qMeasureInfo: [
                    { cId: 'm_text' },
                    { cId: 'm_dupcheck' },
                    ...Array.from({ length: kpiCount }, (_, k) => ({
                        cId: `m_kpi${k}`,
                        qFallbackTitle: `KPI ${k}`,
                    })),
                ],
            },
        };
    }

    function wideRow({
        id,
        elemId,
        author = 'Ada',
        authorElem = 10,
        extra = 'Bob',
        text = 'hello',
        dup = 1,
        attrs = [],
        kpis = [],
    }) {
        return [
            { qText: id, qElemNumber: elemId, qAttrExps: { qValues: attrs } },
            { qText: author, qElemNumber: authorElem, qState: 'O' },
            { qText: '-', qElemNumber: -2 },
            { qText: extra, qElemNumber: 0 },
            { qText: text, qNum: 'NaN' },
            { qText: String(dup), qNum: dup },
            ...kpis,
        ];
    }

    it('collapses the rows of one message into a single bubble', () => {
        const rows = ['Bob', 'Cy', 'Dan'].map((extra) =>
            wideRow({ id: '7', elemId: 7, extra, text: 'to all of you' })
        );
        const c = normalize({ layout: wideLayout({ qcy: 3 }), rows });

        expect(c.messages).toHaveLength(1);
        expect(c.messages[0].body).toBe('to all of you');
        expect(c.messages[0].rowsCollapsed).toBe(3);
        expect(c.meta.rowsLoaded).toBe(3);
    });

    it('collapses rows that are not adjacent, keeping the first row in place', () => {
        // A dragged dimension or an expression sort can separate a message's rows.
        const rows = [
            wideRow({ id: '7', elemId: 7, extra: 'Bob', text: 'first' }),
            wideRow({ id: '8', elemId: 8, author: 'Bob', authorElem: 11, text: 'second' }),
            wideRow({ id: '7', elemId: 7, extra: 'Cy', text: 'first' }),
        ];
        const c = normalize({ layout: wideLayout({ qcy: 3 }), rows });
        expect(c.messages.map((m) => m.body)).toEqual(['first', 'second']);
    });

    it('never collapses rows whose message id is null or synthetic', () => {
        // Every null id shares element -2; grouping on it would merge strangers.
        const rows = [
            wideRow({ id: '-', elemId: -2, extra: 'Bob', text: 'same' }),
            wideRow({ id: '-', elemId: -2, extra: 'Cy', text: 'same' }),
        ];
        const c = normalize({ layout: wideLayout({ qcy: 2 }), rows });
        expect(c.messages).toHaveLength(2);
    });

    it('keeps the probe honest: merged if any row says so, with the largest count', () => {
        const rows = [
            wideRow({ id: '7', elemId: 7, extra: 'Bob', dup: 1 }),
            wideRow({ id: '7', elemId: 7, extra: 'Cy', dup: 3 }),
        ];
        const m = normalize({ layout: wideLayout({ qcy: 2 }), rows }).messages[0];
        expect(m.merged).toBe(true);
        // The largest count, never the sum: recipients are not messages.
        expect(m.rowCount).toBe(3);
    });

    it('marks a KPI that differs between the rows as varying', () => {
        const rows = [
            wideRow({
                id: '7',
                elemId: 7,
                extra: 'Bob',
                kpis: [
                    { qText: '10', qNum: 10 },
                    { qText: 'same', qNum: 'NaN' },
                ],
            }),
            wideRow({
                id: '7',
                elemId: 7,
                extra: 'Cy',
                kpis: [
                    { qText: '12', qNum: 12 },
                    { qText: 'same', qNum: 'NaN' },
                ],
            }),
        ];
        const m = normalize({ layout: wideLayout({ qcy: 2, kpiCount: 2 }), rows }).messages[0];
        expect(m.kpis[0]).toMatchObject({ varies: true, num: null, text: '' });
        expect(m.kpis[1]).toMatchObject({ text: 'same' });
        expect(m.kpis[1].varies).toBeUndefined();
    });

    it('honours the side attribute only when every row agrees on it', () => {
        const layout = wideLayout({ qcy: 2, attrIds: [ATTR_IDS.SIDE] });
        const agree = normalize({
            layout,
            rows: [
                wideRow({ id: '7', elemId: 7, extra: 'Bob', attrs: [{ qNum: 1 }] }),
                wideRow({ id: '7', elemId: 7, extra: 'Cy', attrs: [{ qNum: 1 }] }),
            ],
        });
        expect(agree.messages[0].side).toBe('right');

        const disagree = normalize({
            layout,
            rows: [
                wideRow({ id: '7', elemId: 7, extra: 'Bob', attrs: [{ qNum: 1 }] }),
                wideRow({ id: '7', elemId: 7, extra: 'Cy', attrs: [{ qNum: 0 }] }),
            ],
        });
        expect(disagree.messages[0].sideHint).toBeNull();
    });

    it('keeps different messages that share an id apart, and says so', () => {
        // Ids unique per chat but not globally: "hi" to Bob and "yo" to Cy both
        // carry id 7. Collapsing them would silently drop "yo".
        const rows = [
            wideRow({ id: '7', elemId: 7, extra: 'Bob', text: 'hi' }),
            wideRow({ id: '7', elemId: 7, extra: 'Cy', text: 'yo' }),
        ];
        const c = normalize({ layout: wideLayout({ qcy: 2 }), rows });

        expect(c.messages.map((m) => m.body)).toEqual(['hi', 'yo']);
        expect(c.messages.every((m) => m.idConflict)).toBe(true);
        expect(c.meta.conflictCount).toBe(1);
        expect(c.diagnostics.filter((d) => d.code === 'ambiguous-message-id')).toHaveLength(1);
    });

    it('warns about a dimension no role uses', () => {
        const c = normalize({
            layout: wideLayout({ qcy: 1 }),
            rows: [wideRow({ id: '7', elemId: 7 })],
        });
        const warning = c.diagnostics.find((d) => d.code === 'unassigned-dimension');
        expect(warning.message).toContain('Channel');
    });

    it('does not report truncation when every row is loaded — regression', () => {
        // 6 rows collapse to 2 bubbles. Comparing bubbles with qcy would claim
        // four messages are missing when every one of them is on screen.
        const rows = ['Bob', 'Cy', 'Dan'].flatMap((extra) => [
            wideRow({ id: '7', elemId: 7, extra, text: 'a' }),
            wideRow({ id: '8', elemId: 8, extra, text: 'b' }),
        ]);
        const c = normalize({ layout: wideLayout({ qcy: 6 }), rows });

        expect(c.messages).toHaveLength(2);
        expect(c.meta.truncated).toBe(false);
        expect(c.diagnostics.find((d) => d.code === 'truncated')).toBeUndefined();
    });

    it('reports truncation in rows when rows and bubbles differ', () => {
        const rows = ['Bob', 'Cy', 'Dan'].flatMap((extra) => [
            wideRow({ id: '7', elemId: 7, extra, text: 'a' }),
            wideRow({ id: '8', elemId: 8, extra, text: 'b' }),
        ]);
        const c = normalize({ layout: wideLayout({ qcy: 9 }), rows });

        expect(c.meta.truncated).toBe(true);
        const warning = c.diagnostics.find((d) => d.code === 'truncated');
        expect(warning.message).toContain('2 messages from 6 of 9 rows');
    });

    it('gives every bubble a unique key, and the first bubble keeps its id', () => {
        // Two authors sharing an id is the harmless case from GOTCHAS 8 — but
        // the view must still tell the bubbles apart.
        const rows = [
            row({ id: '7', elemId: 7, author: 'Ada', authorElem: 10, text: 'a' }),
            row({ id: '7', elemId: 7, author: 'Bob', authorElem: 11, text: 'b' }),
        ];
        const c = normalize({ layout: makeLayout({ qcy: 2 }), rows });
        expect(c.messages.map((m) => m.key)).toEqual(['7', '7#2']);
    });
});

describe('the From → To model', () => {
    function fromToLayout({ qcy, thread = false } = {}) {
        return {
            qHyperCube: {
                qSize: { qcx: thread ? 6 : 5, qcy },
                qDimensionInfo: [
                    { cId: 'd_msgid' },
                    { cId: 'd_author' },
                    { cId: 'd_recipient' },
                    ...(thread ? [{ cId: 'd_thread' }] : []),
                ],
                qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
            },
        };
    }

    const props = { conversationModel: 'fromTo' };

    function ftRow({ id, elemId, from, fromElem, to, toElem, text = 'hello' }) {
        return [
            { qText: id, qElemNumber: elemId, qAttrExps: { qValues: [] } },
            { qText: from, qElemNumber: fromElem, qState: 'O' },
            { qText: to, qElemNumber: toElem },
            { qText: text, qNum: 'NaN' },
            { qText: '1', qNum: 1 },
        ];
    }

    it('attaches the recipient to each message', () => {
        const c = normalize({
            layout: fromToLayout({ qcy: 1 }),
            rows: [ftRow({ id: '1', elemId: 1, from: 'Ada', fromElem: 0, to: 'Bob', toElem: 5 })],
            props,
        });
        expect(c.messages[0].recipients).toEqual([
            { key: 'Bob', label: 'Bob', elem: 5, unknown: false },
        ]);
        // A recipient role is not an unused dimension.
        expect(c.diagnostics.find((d) => d.code === 'unassigned-dimension')).toBeUndefined();
    });

    it('keeps each person’s element number per field — regression', () => {
        // Ada is element 0 in From and element 9 in To. Selecting her in To with
        // her From number would select somebody else entirely.
        const c = normalize({
            layout: fromToLayout({ qcy: 2 }),
            rows: [
                ftRow({ id: '1', elemId: 1, from: 'Ada', fromElem: 0, to: 'Bob', toElem: 5 }),
                ftRow({ id: '2', elemId: 2, from: 'Bob', fromElem: 1, to: 'Ada', toElem: 9 }),
            ],
            props,
        });
        expect(c.participants.get('Ada').elem).toBe(0);
        expect(c.recipientElems.get('Ada')).toBe(9);
        expect(c.recipientElems.get('Bob')).toBe(5);
    });

    it('gathers a group message’s recipients into one bubble', () => {
        const rows = [
            ftRow({ id: '1', elemId: 1, from: 'Ada', fromElem: 0, to: 'Bob', toElem: 5 }),
            ftRow({ id: '1', elemId: 1, from: 'Ada', fromElem: 0, to: 'Cy', toElem: 6 }),
        ];
        const c = normalize({ layout: fromToLayout({ qcy: 2 }), rows, props });
        expect(c.messages).toHaveLength(1);
        expect(c.messages[0].recipients.map((r) => r.label)).toEqual(['Bob', 'Cy']);
    });

    it('shows a null recipient as nobody, not as a person called "-"', () => {
        const c = normalize({
            layout: fromToLayout({ qcy: 1 }),
            rows: [ftRow({ id: '1', elemId: 1, from: 'Ada', fromElem: 0, to: '-', toElem: -2 })],
            props,
        });
        expect(c.messages[0].recipients).toEqual([
            { key: null, label: '(no recipient)', elem: -2, unknown: true },
        ]);
        expect(c.recipientElems.size).toBe(0);
    });

    it('keeps the text of a synthetic recipient such as Others', () => {
        const c = normalize({
            layout: fromToLayout({ qcy: 1 }),
            rows: [
                ftRow({ id: '1', elemId: 1, from: 'Ada', fromElem: 0, to: 'Others', toElem: -3 }),
            ],
            props,
        });
        expect(c.messages[0].recipients[0]).toMatchObject({ label: 'Others', unknown: true });
    });

    it('flags only the last bubble’s recipients as possibly incomplete when truncated', () => {
        const rows = [
            ftRow({ id: '1', elemId: 1, from: 'Ada', fromElem: 0, to: 'Bob', toElem: 5 }),
            ftRow({ id: '2', elemId: 2, from: 'Ada', fromElem: 0, to: 'Bob', toElem: 5 }),
            ftRow({ id: '2', elemId: 2, from: 'Ada', fromElem: 0, to: 'Cy', toElem: 6 }),
        ];
        const truncated = normalize({ layout: fromToLayout({ qcy: 10 }), rows, props });
        expect(truncated.messages.map((m) => Boolean(m.recipientsPartial))).toEqual([false, true]);

        const complete = normalize({ layout: fromToLayout({ qcy: 3 }), rows, props });
        expect(complete.messages.some((m) => m.recipientsPartial)).toBe(false);
    });

    it('is not configured without a To dimension', () => {
        const layout = {
            qHyperCube: {
                qSize: { qcx: 3, qcy: 1 },
                qDimensionInfo: [{ cId: 'd_msgid' }, { cId: 'd_author' }],
                qMeasureInfo: [{ cId: 'm_text' }],
            },
        };
        const c = normalize({ layout, rows: [], props });
        const error = c.diagnostics.find((d) => d.code === 'missing-roles');
        expect(error.message).toContain('recipient');
    });

    it('renders recipients from a fourth To dimension in the participant model', () => {
        const layout = {
            qHyperCube: {
                qSize: { qcx: 6, qcy: 1 },
                qDimensionInfo: [
                    { cId: 'd_msgid' },
                    { cId: 'd_author' },
                    { cId: 'd_thread' },
                    { cId: 'd_recipient' },
                ],
                qMeasureInfo: [{ cId: 'm_text' }, { cId: 'm_dupcheck' }],
            },
        };
        const r = [
            { qText: '1', qElemNumber: 1, qAttrExps: { qValues: [] } },
            { qText: 'Ada', qElemNumber: 0, qState: 'O' },
            { qText: 'T1', qElemNumber: 0 },
            { qText: 'Bob', qElemNumber: 4 },
            { qText: 'hi', qNum: 'NaN' },
            { qText: '1', qNum: 1 },
        ];
        const c = normalize({ layout, rows: [r] });
        expect(c.messages[0].recipients.map((x) => x.label)).toEqual(['Bob']);
        expect(c.messages[0].threadId).toBe('T1');
    });

    it('carries no recipients at all in a participant cube', () => {
        const c = normalize({
            layout: makeLayout({ qcy: 1 }),
            rows: [row({ id: '1', author: 'Ada', text: 'hi' })],
        });
        expect(c.messages[0].recipients).toBeNull();
    });
});
