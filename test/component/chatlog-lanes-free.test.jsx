import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

// Virtuoso cannot scroll in jsdom. Each lane's instance is told apart by the context the lane gives it:
// its range callback is kept for the test to call, and its scrolls are recorded with the lane.
const virtuoso = vi.hoisted(() => ({ lanes: new Map(), calls: [] }));

vi.mock('react-virtuoso', async (importOriginal) => {
    const actual = await importOriginal();
    const React = await import('react');
    const wrap = (Component) =>
        React.forwardRef(function Spied(props, ref) {
            const lane = props.context?.lane ?? 'single';
            virtuoso.lanes.set(lane, props.rangeChanged);
            React.useImperativeHandle(ref, () => ({
                scrollToIndex: (location) =>
                    virtuoso.calls.push({ lane, method: 'scrollToIndex', location }),
                scrollIntoView: (location) => {
                    virtuoso.calls.push({ lane, method: 'scrollIntoView', location });
                    location?.done?.();
                },
            }));
            return React.createElement(Component, { ...props, rangeChanged: undefined });
        });
    return {
        ...actual,
        Virtuoso: wrap(actual.Virtuoso),
        GroupedVirtuoso: wrap(actual.GroupedVirtuoso),
    };
});

const { VirtuosoMockContext } = await import('react-virtuoso');
const { default: ChatLog } = await import('../../src/ui/ChatLog');
const { buildBoard } = await import('../../src/chat/lanes');
const { laneCaption } = await import('../../src/ui/LaneBoard');

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

/** A message in a thread, at a cube row. */
const message = (id, thread, body, author = 'Ada') => ({
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
    ts: null,
    tsText: null,
    kpis: [],
    state: 'O',
    merged: false,
    rowCount: 1,
    side: 'left',
});

// By latest activity: T3 (row 9), T2 (row 8), T1 (row 5).
const MESSAGES = [
    message('1', 'T1', 'hello one'),
    message('2', 'T2', 'reload two'),
    message('3', 'T1', 'still one', 'Bob'),
    message('4', 'T3', 'three starts'),
    message('5', 'T1', 'reload one'),
    message('6', 'T3', 'three again', 'Bob'),
    message('7', 'T2', 'two more', 'Bob'),
    message('8', 'T2', 'two last'),
    message('9', 'T3', 'reload three'),
];

/** The conversation prop for a board. */
const conversationOf = (board, meta = {}) => ({
    messages: board.messages,
    participants: new Map(),
    meta: { total: board.messages.length, truncated: false, ...meta },
    diagnostics: [],
});

const settings = { dateSeparators: false, onBubbleClick: 'none' };
const active = { enabled: true, active: true, blur: () => {} };

/** Render lanes for the messages. */
function renderLanes({ messages = MESSAGES, max = 3, ...props } = {}) {
    const board = buildBoard(messages, { max, scroll: 'free' });
    const utils = render(
        <ChatLog
            conversation={conversationOf(board)}
            board={board}
            settings={settings}
            rect={{ width: 900, height: 600 }}
            keyboard={active}
            {...props}
        />,
        { wrapper: Viewport }
    );
    return { ...utils, board };
}

/** The list of a lane, by its accessible name. */
const laneList = (name) => screen.getByRole('list', { name: new RegExp(`^${name},`) });

beforeEach(() => {
    virtuoso.lanes.clear();
    virtuoso.calls.length = 0;
});

describe('ChatLog with conversations side by side, scrolling freely', () => {
    it('says Today and Yesterday in each lane by the clock a snapshot recorded', () => {
        const day = (d, h) => Date.UTC(2026, 8, d, h);
        const dated = [
            { ...message('1', 'T1', 'one opens'), ts: day(7, 9) },
            { ...message('2', 'T2', 'two opens'), ts: day(7, 10) },
            { ...message('3', 'T1', 'one again'), ts: day(8, 9) },
        ];
        // Taken at 10:00 on 8 September on the reader's clock, and drawn again long after.
        const chatbox = { firstVisibleIndex: 0, openId: null, today: day(8, 10) };
        renderLanes({
            messages: dated,
            settings: { ...settings, dateSeparators: true },
            layout: { snapshotData: { chatbox } },
        });
        const headers = (name) =>
            [...laneList(name).querySelectorAll('[class*="separator"]')].map(
                (node) => node.textContent
            );
        expect(headers('T1')).toEqual(['Yesterday', 'Today']);
        expect(headers('T2')).toEqual(['Yesterday']);
    });

    it('shows a lane per conversation, the latest activity first, each with its name and count', () => {
        const { container } = renderLanes();
        const headers = [...container.querySelectorAll('section')].map((section) =>
            section.getAttribute('aria-label')
        );
        expect(headers).toEqual(['T3', 'T2', 'T1']);
        expect(within(laneList('T3')).getByText('reload three')).toBeInTheDocument();
        expect(laneList('T1')).toHaveAttribute('aria-label', 'T1, 3 messages');
        expect(screen.queryByText(/of 3 conversations/)).not.toBeInTheDocument();
    });

    it('says how many conversations are shown when some are not', () => {
        renderLanes({ max: 2 });
        expect(screen.getByText('2 of 3 conversations')).toBeInTheDocument();
        expect(screen.queryByText('hello one')).not.toBeInTheDocument();
    });

    it('says the lanes come from the newest rows, when the message limit cut them short', () => {
        // Every conversation read has a lane, but older ones may not have been read.
        const board = buildBoard(MESSAGES, { max: 3, scroll: 'free' });
        render(
            <ChatLog
                conversation={conversationOf(board, {
                    truncated: true,
                    truncatedTo: 'newest',
                    rowsLoaded: 9,
                    total: 900,
                })}
                board={board}
                settings={settings}
                rect={{ width: 900, height: 600 }}
                keyboard={active}
            />,
            { wrapper: Viewport }
        );
        expect(
            screen.getByText('3 conversations among the newest 9 of 900 rows')
        ).toBeInTheDocument();
    });

    it('keeps exactly one tab stop for all the lanes, and none before Sense hands over focus', () => {
        const { container, unmount } = renderLanes();
        expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
        unmount();
        const inactive = renderLanes({ keyboard: { enabled: true, active: false } });
        expect(inactive.container.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
    });

    it('moves focus up and down within a lane, and across to where the reader is in the next', () => {
        const { container, board } = renderLanes();
        const focused = () =>
            Number(
                container.querySelector('[data-message-index][tabindex="0"]').dataset.messageIndex
            );
        const lane = (index) => board.lanes[board.laneOf[index]].label;

        fireEvent.keyDown(laneList('T3'), { key: 'ArrowDown' });
        expect([lane(focused()), board.messages[focused()].body]).toEqual(['T3', 'three starts']);
        fireEvent.keyDown(laneList('T3'), { key: 'End' });
        fireEvent.keyDown(laneList('T3'), { key: 'ArrowDown' });
        // Clamped at the end of the lane, never running into the next one.
        expect(board.messages[focused()].body).toBe('reload three');

        // The reader has scrolled lane T2 to its second message.
        virtuoso.lanes.get('v:T2')({ startIndex: 1, endIndex: 2 });
        fireEvent.keyDown(laneList('T3'), { key: 'ArrowRight' });
        expect([lane(focused()), board.messages[focused()].body]).toEqual(['T2', 'two more']);
    });

    it('steps through search matches lane by lane, scrolling the lane each is in', () => {
        const { container } = renderLanes({ search: { initialQuery: 'reload' } });
        const root = container.firstChild;
        fireEvent.keyDown(root, { key: 'F3' });
        fireEvent.keyDown(root, { key: 'F3' });
        const reveals = virtuoso.calls.filter((call) => call.method === 'scrollIntoView');
        // Lane T3 holds "reload three" at its third place, lane T2 "reload two" at its first.
        expect(reveals.map((call) => [call.lane, call.location.index])).toEqual([
            ['v:T3', 2],
            ['v:T2', 0],
        ]);
    });

    it('gives each lane a ruler of its own, which scrolls that lane', () => {
        const { container } = renderLanes({ search: { initialQuery: 'reload' } });
        const rulers = container.querySelectorAll('[data-kind="find"]');
        expect(rulers).toHaveLength(3);
        const ruler = within(container.querySelectorAll('section')[2]).getByTitle(
            /Where the search matches are/
        );
        ruler.getBoundingClientRect = () => ({
            top: 0,
            height: 300,
            bottom: 300,
            left: 0,
            right: 10,
            width: 10,
        });
        // Lane T1's match, "reload one", is its third message: at 5/6 of the ruler.
        fireEvent.click(ruler, { clientY: 250 });
        expect(virtuoso.calls.at(-1)).toEqual({
            lane: 'v:T1',
            method: 'scrollToIndex',
            location: { index: 2, align: 'start', behavior: 'auto' },
        });
    });

    it('keeps each lane where it was when a selection changes another lane', () => {
        const { board, rerender } = renderLanes();
        virtuoso.lanes.get('v:T2')({ startIndex: 2, endIndex: 2 });
        virtuoso.lanes.get('v:T1')({ startIndex: 2, endIndex: 2 });
        // A selection removes "three starts" from lane T3, and "hello one" from lane T1. Lane T2 is the
        // same, one place earlier on the board.
        const next = buildBoard(
            MESSAGES.filter((m) => m.id !== '4' && m.id !== '1'),
            { max: 3, scroll: 'free' }
        );
        expect(next.lanes[1].start).toBe(board.lanes[1].start - 1);
        rerender(
            <ChatLog
                conversation={conversationOf(next)}
                board={next}
                settings={settings}
                rect={{ width: 900, height: 600 }}
                keyboard={active}
            />
        );
        const returns = virtuoso.calls.filter((call) => call.method === 'scrollToIndex');
        // Lane T1's reader was at "reload one", now its second message; lane T2 does not move.
        expect(returns.map((call) => [call.lane, call.location])).toEqual([
            ['v:T1', { index: 1, align: 'start' }],
        ]);
    });

    it('scrolls a lane that went and came back, through its new list', () => {
        const search = { initialQuery: 'reload one' };
        const { container, rerender } = renderLanes({ search });
        const view = (max) => {
            const board = buildBoard(MESSAGES, { max, scroll: 'free' });
            rerender(
                <ChatLog
                    conversation={conversationOf(board)}
                    board={board}
                    settings={settings}
                    rect={{ width: 900, height: 600 }}
                    keyboard={active}
                    search={search}
                />
            );
        };
        // T1, the least recent, goes with fewer lanes and comes back with more.
        view(2);
        expect(screen.queryByRole('list', { name: /^T1,/ })).not.toBeInTheDocument();
        view(3);
        virtuoso.calls.length = 0;
        fireEvent.keyDown(container.firstChild, { key: 'F3' });
        expect(virtuoso.calls.filter((call) => call.method === 'scrollIntoView')).toEqual([
            expect.objectContaining({
                lane: 'v:T1',
                location: expect.objectContaining({ index: 2 }),
            }),
        ]);
    });

    it('heads each lane’s first message with its author, whoever wrote the lane before', () => {
        // T2's last message and T1's first are both Ada's, side by side on the board.
        renderLanes();
        const firstOfT1 = within(laneList('T1'))
            .getByText('hello one')
            .closest('[role="listitem"]');
        expect(within(firstOfT1).getByText('Ada')).toBeInTheDocument();
    });

    it('renders every message of every lane for a snapshot', () => {
        renderLanes({
            layout: { snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } },
        });
        for (const m of MESSAGES) expect(screen.getByText(m.body)).toBeInTheDocument();
    });

    it('overlays the details rather than squeezing every lane beside a pane', () => {
        renderLanes({ settings: { ...settings, onBubbleClick: 'showDetails' } });
        fireEvent.click(screen.getByText('two last'));
        const details = screen.getByLabelText('Message details');
        expect(details.className).toMatch(/detailOverlay/);
    });
});

describe('laneCaption', () => {
    const board = buildBoard(MESSAGES, { max: 2, scroll: 'free' });
    const all = buildBoard(MESSAGES, { max: 3, scroll: 'free' });

    it('says nothing when every conversation is shown and every row was read', () => {
        expect(laneCaption(all, { truncated: false })).toBeNull();
        expect(laneCaption(null)).toBeNull();
    });

    it('counts the conversations shown when some are not', () => {
        expect(laneCaption(board, { truncated: false })).toBe('2 of 3 conversations');
    });

    it('says the rows were cut short, whether or not every conversation read has a lane', () => {
        const meta = { truncated: true, truncatedTo: 'newest', rowsLoaded: 5000, total: 12000 };
        expect(laneCaption(board, meta)).toBe(
            '2 of 3 conversations among the newest 5,000 of 12,000 rows'
        );
        expect(laneCaption(all, meta)).toBe(
            '3 conversations among the newest 5,000 of 12,000 rows'
        );
    });

    it('says which rows were kept as the conversation does, and none when it cannot tell', () => {
        const meta = { truncated: true, rowsLoaded: 5000, total: 12000 };
        expect(laneCaption(all, { ...meta, truncatedTo: 'oldest' })).toBe(
            '3 conversations among the oldest 5,000 of 12,000 rows'
        );
        expect(laneCaption(all, { ...meta, truncatedTo: null })).toBe(
            '3 conversations among 5,000 of 12,000 rows'
        );
    });

    it('leaves the rows out rather than print a count it does not have', () => {
        expect(laneCaption(all, { truncated: true })).toBe('3 conversations');
    });
});
