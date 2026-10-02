import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import ChatLog from '../../src/ui/ChatLog';
import { buildBoard } from '../../src/chat/lanes';

/** Wrap in the mock viewport Virtuoso needs to render rows in jsdom. */
function Viewport({ children }) {
    return (
        <VirtuosoMockContext.Provider value={{ viewportHeight: 800, itemHeight: 60 }}>
            {children}
        </VirtuosoMockContext.Provider>
    );
}

const ada = { key: 'Ada', elem: 10, label: 'Ada', color: '#4477aa', side: 'left' };

/** A message in a thread, at a cube row. The thread's element number is its last character's code. */
const message = (id, thread) => ({
    id,
    key: `k${id}`,
    elem: Number(id),
    body: `message ${id}`,
    bodyFormat: 'text',
    authorKey: 'Ada',
    author: ada,
    threadId: thread,
    threadElem: thread === '' ? -1 : thread.charCodeAt(thread.length - 1),
    rowIdx: Number(id),
    ts: null,
    tsText: null,
    kpis: [],
    state: 'O',
    merged: false,
    rowCount: 1,
    side: 'left',
});

// Ranked by latest activity, latest first: T4, T3, T2, T1, then the messages in no conversation,
// whose own message came first of all. The engine writes that lane's element number as -2.
const MESSAGES = [
    { ...message('1', ''), threadId: null, threadElem: -2 },
    message('2', 'T1'),
    message('3', 'T2'),
    message('4', 'T3'),
    message('5', 'T4'),
];

const settings = { dateSeparators: false, onBubbleClick: 'none' };
const keyboard = { enabled: true, active: true, blur: vi.fn() };

/** Render lanes, with the picking and stepping the object would hand down. */
function renderLanes({ max = 2, offset = 0, ...props } = {}) {
    const board = buildBoard(MESSAGES, { max, scroll: 'free', offset });
    const utils = render(
        <ChatLog
            conversation={{
                messages: board.messages,
                participants: new Map(),
                meta: { total: board.messages.length, truncated: false },
                diagnostics: [],
            }}
            board={board}
            settings={settings}
            rect={{ width: 900, height: 600 }}
            keyboard={keyboard}
            {...props}
        />,
        { wrapper: Viewport }
    );
    return { ...utils, board };
}

describe('lane headers that select their conversation', () => {
    const picking = (over = {}) => ({
        locked: false,
        hint: 'Selects this conversation. Pick several, then confirm.',
        onPick: vi.fn(),
        ...over,
    });

    it('stays plain text while headers do not select', () => {
        renderLanes();
        expect(screen.queryByRole('button', { name: /T4/ })).toBeNull();
        expect(screen.getByText('T4')).toBeInTheDocument();
    });

    it('hands each header clicked to the picker, so several can be confirmed together', () => {
        const pick = picking();
        renderLanes({ lanePicking: pick });
        const header = screen.getByRole('button', { name: /T4/ });
        expect(header).toHaveAttribute('title', expect.stringContaining('confirm'));

        fireEvent.click(header);
        expect(pick.onPick).toHaveBeenLastCalledWith(
            expect.objectContaining({ label: 'T4' }),
            false
        );
        fireEvent.click(screen.getByRole('button', { name: /T3/ }));
        expect(pick.onPick).toHaveBeenLastCalledWith(
            expect.objectContaining({ label: 'T3' }),
            false
        );
        expect(pick.onPick).toHaveBeenCalledTimes(2);
    });

    it('leaves the lane for messages without a conversation unclickable', () => {
        // There is no value behind it to select, so a click could only ever do nothing.
        renderLanes({ max: 10, lanePicking: picking() });
        const none = screen.getByText('(no conversation)');
        expect(none.closest('button')).toBeNull();
    });

    it('takes no tab stop before Sense hands focus over, and none in a snapshot', () => {
        const { unmount } = renderLanes({
            lanePicking: picking(),
            keyboard: { enabled: true, active: false },
        });
        expect(screen.getByRole('button', { name: /T4/ })).toHaveAttribute('tabindex', '-1');
        unmount();

        renderLanes({
            lanePicking: picking(),
            layout: { snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } },
        });
        expect(screen.queryByRole('button', { name: /T4/ })).toBeNull();
    });
});

describe('stepping the window of conversations', () => {
    const steps = (board, onStep) => ({
        first: board.first,
        shown: board.lanes.length,
        total: board.total,
        onStep,
    });

    it('says where the window is and walks it a page at a time', () => {
        const onStep = vi.fn();
        const { board } = renderLanes({ max: 2 });
        const { unmount } = renderLanes({ max: 2, laneSteps: steps(board, onStep) });
        const group = screen.getByRole('group', { name: 'Conversations shown' });
        expect(within(group).getByText('1–2 of 5')).toBeInTheDocument();
        // At the start of the ranking there is nothing earlier to step to.
        expect(within(group).getByRole('button', { name: 'Earlier conversations' })).toBeDisabled();

        fireEvent.click(within(group).getByRole('button', { name: 'Later conversations' }));
        expect(onStep).toHaveBeenCalledWith(1);
        unmount();

        const moved = renderLanes({ max: 2, offset: 2 });
        renderLanes({ max: 2, offset: 2, laneSteps: steps(moved.board, onStep) });
        expect(screen.getByText('3–4 of 5')).toBeInTheDocument();
    });

    it('clamps the window to what there is, rather than running off the end', () => {
        const { board } = renderLanes({ max: 2, offset: 99 });
        expect(board.first).toBe(3);
        expect(board.lanes.map((lane) => lane.label)).toEqual(['T1', '(no conversation)']);
    });

    it('leaves the group out when every conversation is already shown', () => {
        renderLanes({ max: 10 });
        expect(screen.queryByRole('group', { name: 'Conversations shown' })).toBeNull();
    });
});
