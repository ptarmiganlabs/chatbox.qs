import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

// Virtuoso cannot scroll in jsdom: its handle is spied on, its props and range callback are kept for the
// test, and a scroll into view reports itself done at once.
const virtuoso = vi.hoisted(() => ({ props: null, component: null, calls: [] }));

vi.mock('react-virtuoso', async (importOriginal) => {
    const actual = await importOriginal();
    const React = await import('react');
    const wrap = (Component, name) =>
        React.forwardRef(function Spied(props, ref) {
            virtuoso.props = props;
            virtuoso.component = name;
            React.useImperativeHandle(ref, () => ({
                scrollToIndex: (location) => virtuoso.calls.push(['scrollToIndex', location]),
                scrollIntoView: (location) => {
                    virtuoso.calls.push(['scrollIntoView', location]);
                    location?.done?.();
                },
            }));
            return React.createElement(Component, { ...props, rangeChanged: undefined });
        });
    return {
        ...actual,
        Virtuoso: wrap(actual.Virtuoso, 'Virtuoso'),
        GroupedVirtuoso: wrap(actual.GroupedVirtuoso, 'GroupedVirtuoso'),
    };
});

const { VirtuosoMockContext } = await import('react-virtuoso');
const { default: ChatLog } = await import('../../src/ui/ChatLog');
const { buildBoard } = await import('../../src/chat/lanes');

/** Wrap in the mock viewport Virtuoso needs to render rows in jsdom. */
function Viewport({ children }) {
    return (
        <VirtuosoMockContext.Provider value={{ viewportHeight: 800, itemHeight: 60 }}>
            {children}
        </VirtuosoMockContext.Provider>
    );
}

const people = {
    Ada: { key: 'Ada', elem: 10, label: 'Ada', color: '#4477aa', side: 'left' },
    Bob: { key: 'Bob', elem: 11, label: 'Bob', color: '#ee6677', side: 'left' },
};

/** A message in a thread, at a cube row, optionally dated. */
const message = (id, thread, body, { author = 'Ada', ts = null } = {}) => ({
    id,
    key: `k${id}`,
    elem: Number(id),
    body,
    bodyFormat: 'text',
    authorKey: author,
    author: people[author],
    threadId: thread,
    threadElem: thread.charCodeAt(thread.length - 1),
    rowIdx: Number(id),
    ts,
    tsText: null,
    kpis: [],
    state: 'O',
    merged: false,
    rowCount: 1,
    side: 'left',
});

// Lanes by latest activity: T2 (row 6), T1 (row 5).
const MESSAGES = [
    message('1', 'T1', 'one opens'),
    message('2', 'T2', 'two opens', { author: 'Bob' }),
    message('3', 'T2', 'reload two', { author: 'Bob' }),
    message('4', 'T1', 'one again'),
    message('5', 'T1', 'reload one'),
    message('6', 'T2', 'two closes', { author: 'Bob' }),
];
// Board order is display order. Rows: [1 2] [3 4] [5 6].

/** The conversation prop for a board. */
const conversationOf = (board) => ({
    messages: board.messages,
    participants: new Map(),
    meta: { total: board.messages.length, truncated: false },
    diagnostics: [],
});

const settings = { dateSeparators: false, onBubbleClick: 'none' };
const active = { enabled: true, active: true, blur: () => {} };

/** Render linked lanes. */
function renderLanes({ messages = MESSAGES, settings: chatbox = settings, ...props } = {}) {
    const board = buildBoard(messages, { max: 4, scroll: 'linked' });
    const utils = render(
        <ChatLog
            conversation={conversationOf(board)}
            board={board}
            settings={chatbox}
            rect={{ width: 900, height: 600 }}
            keyboard={active}
            {...props}
        />,
        { wrapper: Viewport }
    );
    return { ...utils, board };
}

/** The bodies in each lane column of each rendered row. */
function cells(container) {
    return [...container.querySelectorAll('[data-lane-row]')].map((row) =>
        [...row.children].map(
            (cell) => cell.querySelector('[data-message-index] [class*="body"]')?.textContent ?? ''
        )
    );
}

beforeEach(() => {
    virtuoso.calls.length = 0;
    virtuoso.props = null;
});

describe('ChatLog with conversations side by side, scrolling linked', () => {
    it('lines the lanes up in rows, a column per lane, with blank cells where a lane is quiet', () => {
        const { container, board } = renderLanes();
        expect(board.lanes.map((lane) => lane.label)).toEqual(['T2', 'T1']);
        const headers = [...container.querySelectorAll('section')].map((s) =>
            s.getAttribute('aria-label')
        );
        expect(headers).toEqual(['T2', 'T1']);
        expect(cells(container)).toEqual([
            ['two opens', 'one opens'],
            ['reload two', 'one again'],
            ['two closes', 'reload one'],
        ]);
        expect(
            screen.getByRole('list', { name: 'Conversations side by side, 6 messages' })
        ).toBeInTheDocument();
        expect(virtuoso.props.totalCount).toBe(3);
    });

    it('leaves a cell blank where its lane has no message in the row', () => {
        const { container } = renderLanes({
            messages: [message('1', 'T1', 'a'), message('2', 'T1', 'b'), message('3', 'T2', 'c')],
        });
        // T1's second message starts a row of its own, beside nothing.
        expect(cells(container)).toEqual([
            ['', 'a'],
            ['c', 'b'],
        ]);
    });

    it('groups the rows by day, the counts adding up to the rows', () => {
        const day = (d, h) => new Date(2026, 8, d, h).getTime();
        const dated = [
            message('1', 'T1', 'a', { ts: day(7, 9) }),
            message('2', 'T2', 'b', { ts: day(7, 10) }),
            message('3', 'T1', 'c', { ts: day(8, 9) }),
        ];
        renderLanes({ messages: dated, settings: { ...settings, dateSeparators: true } });
        expect(virtuoso.component).toBe('GroupedVirtuoso');
        expect(virtuoso.props.groupCounts).toEqual([1, 1]);
    });

    it('puts every day heading before its first row when every message is rendered', () => {
        const day = (d, h) => new Date(2026, 8, d, h).getTime();
        const dated = [
            message('1', 'T1', 'a', { ts: day(7, 9) }),
            message('2', 'T2', 'b', { ts: day(7, 10) }),
            message('3', 'T1', 'c', { ts: day(8, 9) }),
        ];
        const { container } = renderLanes({
            messages: dated,
            settings: { ...settings, dateSeparators: true },
            layout: { snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } },
        });
        const list = container.querySelector('[role="list"]');
        const order = [...list.querySelectorAll('[class*="separator"], [data-lane-row]')].map(
            (node) => (node.hasAttribute('data-lane-row') ? `row ${node.dataset.laneRow}` : 'day')
        );
        expect(order).toEqual(['day', 'row 0', 'day', 'row 1']);
    });

    it('returns the reader to the row of the message they were at, again after the commit', async () => {
        const { rerender } = renderLanes();
        virtuoso.props.rangeChanged({ startIndex: 2, endIndex: 2 });
        // A selection removes the first row's messages: "reload one" is now in the second row.
        const next = buildBoard(
            MESSAGES.filter((m) => m.id !== '1' && m.id !== '2'),
            { max: 4, scroll: 'linked' }
        );
        rerender(
            <ChatLog
                conversation={conversationOf(next)}
                board={next}
                settings={settings}
                rect={{ width: 900, height: 600 }}
                keyboard={active}
            />
        );
        expect(virtuoso.calls).toEqual([['scrollToIndex', { index: 1, align: 'start' }]]);
        await Promise.resolve();
        expect(virtuoso.calls).toHaveLength(2);
    });

    it('moves focus across to the same row, else the nearest', () => {
        const { container, board } = renderLanes();
        const list = container.querySelector('[role="list"]');
        const focused = () =>
            board.messages[
                Number(
                    container.querySelector('[data-message-index][tabindex="0"]').dataset
                        .messageIndex
                )
            ].body;
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        expect(focused()).toBe('two opens');
        fireEvent.keyDown(list, { key: 'ArrowRight' });
        expect(focused()).toBe('one opens');
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'ArrowLeft' });
        expect(focused()).toBe('two closes');
    });

    it('steps through matches in time order, bringing each one’s row into view', () => {
        const { container } = renderLanes({ search: { initialQuery: 'reload' } });
        const root = container.firstChild;
        fireEvent.keyDown(root, { key: 'F3' });
        fireEvent.keyDown(root, { key: 'F3' });
        const reveals = virtuoso.calls.filter(([method]) => method === 'scrollIntoView');
        // "reload two" is in row 1, "reload one" in row 2.
        expect(reveals.map(([, location]) => location.index)).toEqual([1, 2]);
    });

    it('places ruler ticks by row, and a click goes to the row', () => {
        const { container } = renderLanes({ search: { initialQuery: 'reload' } });
        const ruler = container.querySelector('[data-kind="find"]');
        const positions = [...ruler.children].map((tick) =>
            tick.style.getPropertyValue('--cqs-tick-pos')
        );
        expect(positions).toEqual([String(1.5 / 3), String(2.5 / 3)]);
        ruler.getBoundingClientRect = () => ({
            top: 0,
            height: 300,
            bottom: 300,
            left: 0,
            right: 10,
            width: 10,
        });
        // Away from both ticks, in the first third: the first row.
        fireEvent.click(ruler, { clientY: 20 });
        expect(virtuoso.calls.at(-1)).toEqual([
            'scrollToIndex',
            { index: 0, align: 'start', behavior: 'auto' },
        ]);
        // The headers leave room for the ruler, so their columns stay over the rows.
        expect(container.querySelector('[data-ruler="true"]')).not.toBeNull();
    });

    it('heads a message with its author by the previous message in its own lane', () => {
        const { container } = renderLanes();
        const row = (index) => container.querySelector(`[data-lane-row="${index}"]`);
        // "one again" follows Ada's own "one opens" in lane T1, with Bob's messages between on the board.
        const oneAgain = within(row(1)).getByText('one again').closest('[role="listitem"]');
        expect(within(oneAgain).queryByText('Ada')).toBeNull();
        const twoOpens = within(row(0)).getByText('two opens').closest('[role="listitem"]');
        expect(within(twoOpens).getByText('Bob')).toBeInTheDocument();
    });
});
