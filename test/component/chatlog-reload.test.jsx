import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Virtuoso cannot scroll in jsdom, so its handle is spied on, and the range callback it would call
// while scrolling is captured for the test to call.
const virtuoso = vi.hoisted(() => ({
    scrollToIndex: vi.fn(),
    rangeChanged: null,
    props: null,
    component: null,
}));

vi.mock('react-virtuoso', async (importOriginal) => {
    const actual = await importOriginal();
    const React = await import('react');
    const wrap = (Component, name) =>
        React.forwardRef(function Spied(props, ref) {
            virtuoso.rangeChanged = props.rangeChanged;
            virtuoso.props = props;
            virtuoso.component = name;
            React.useImperativeHandle(ref, () => ({
                scrollToIndex: virtuoso.scrollToIndex,
                scrollIntoView: vi.fn(),
            }));
            // The real virtualizer reports ranges from a mock viewport that never scrolls; only the
            // test says where the reader is.
            return React.createElement(Component, { ...props, rangeChanged: undefined });
        });
    return {
        ...actual,
        Virtuoso: wrap(actual.Virtuoso, 'Virtuoso'),
        GroupedVirtuoso: wrap(actual.GroupedVirtuoso, 'GroupedVirtuoso'),
    };
});

const { VirtuosoMockContext } = await import('react-virtuoso');
const { default: ChatLog, messageAtTop, returnIndex } = await import('../../src/ui/ChatLog');

const message = (id, over = {}) => ({
    id,
    key: `k${id}`,
    elem: Number(id),
    body: `message ${id}`,
    bodyFormat: 'text',
    authorKey: 'Ada',
    author: { key: 'Ada', elem: 10, label: 'Ada', color: '#4477aa', side: 'left' },
    ts: null,
    tsText: null,
    kpis: [],
    state: 'O',
    merged: false,
    rowCount: 1,
    side: 'left',
    ...over,
});

const conversation = (ids) => ({
    messages: ids.map((id) => message(id)),
    participants: new Map(),
    meta: { total: ids.length, loaded: ids.length, truncated: false, mergedCount: 0 },
    diagnostics: [],
});

/** Wrap in the mock viewport Virtuoso needs to render rows in jsdom. */
function Viewport({ children }) {
    return (
        <VirtuosoMockContext.Provider value={{ viewportHeight: 800, itemHeight: 60 }}>
            {children}
        </VirtuosoMockContext.Provider>
    );
}

beforeEach(() => {
    virtuoso.scrollToIndex.mockClear();
});

describe('ChatLog while newer rows load', () => {
    const before = conversation(['1', '2', '3', '4', '5']);
    const settings = { onBubbleClick: 'showDetails', dateSeparators: false };
    const rect = { width: 900, height: 600 };

    it('shows a progress line and marks the list busy', () => {
        const { container, rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

        rerender(
            <ChatLog
                conversation={before}
                settings={settings}
                rect={rect}
                reloading={{ loaded: 2000, total: 8000 }}
            />
        );
        const line = screen.getByRole('progressbar', { name: 'Loading messages' });
        expect(line).toHaveAttribute('aria-valuenow', '2000');
        expect(line).toHaveAttribute('aria-valuemax', '8000');
        expect(container.querySelector('[role="list"]')).toHaveAttribute('aria-busy', 'true');
    });

    it('moves a sliver instead of claiming a progress it does not know', () => {
        render(
            <ChatLog
                conversation={before}
                settings={settings}
                rect={rect}
                reloading={{ loaded: null, total: null }}
            />,
            { wrapper: Viewport }
        );
        expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    });

    it('stays mounted, so what the reader opened is still open', () => {
        const { rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        fireEvent.click(screen.getByText('message 3'));
        expect(screen.getByLabelText('Message details')).toBeInTheDocument();

        rerender(
            <ChatLog
                conversation={before}
                settings={settings}
                rect={rect}
                reloading={{ loaded: null, total: null }}
            />
        );
        expect(screen.getByLabelText('Message details')).toBeInTheDocument();

        rerender(
            <ChatLog conversation={conversation(['2', '3'])} settings={settings} rect={rect} />
        );
        expect(screen.getByLabelText('Message details')).toBeInTheDocument();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('puts the reader back at the message they were reading when the rows change', () => {
        const { rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        // The reader has scrolled so that message 4 is at the top.
        virtuoso.rangeChanged({ startIndex: 3, endIndex: 4 });

        // A selection removed messages 1 and 2: message 4 is now the second one.
        rerender(
            <ChatLog conversation={conversation(['3', '4', '5'])} settings={settings} rect={rect} />
        );
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({ index: 1, align: 'start' });
    });

    // Found on the server: after a highlight click narrowed the list to one message, clearing the
    // selection threw the reader to the last message. A list short enough to fit counts as scrolled
    // to the bottom, and following the returning rows there overrode the return to the reader's
    // message. The virtualizer's scrolling cannot run in jsdom, so the option itself is checked.
    it.each([
        ['Virtuoso', { dateSeparators: false }, (id) => message(id)],
        [
            'GroupedVirtuoso',
            { dateSeparators: true },
            (id) => message(id, { ts: Date.UTC(2026, 8, 8, 8, Number(id)) }),
        ],
    ])('does not follow returning rows to the bottom (%s)', (component, over, make) => {
        const rows = (ids) => ({ ...conversation(ids), messages: ids.map(make) });
        const { rerender } = render(
            <ChatLog conversation={rows(['2'])} settings={{ ...settings, ...over }} rect={rect} />,
            { wrapper: Viewport }
        );
        virtuoso.rangeChanged({ startIndex: 0, endIndex: 0 });
        rerender(
            <ChatLog
                conversation={rows(['1', '2', '3', '4', '5'])}
                settings={{ ...settings, ...over }}
                rect={rect}
            />
        );
        expect(virtuoso.component).toBe(component);
        expect(virtuoso.props.followOutput).toBeUndefined();
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({ index: 1, align: 'start' });
    });

    // Found in Chrome: going back to a message further down than the shorter list reached stopped at
    // that list's end, because the virtualizer draws the longer list's height in an update of its own.
    it('scrolls to the message again once the virtualizer has drawn the new height', async () => {
        const { rerender } = render(
            <ChatLog conversation={conversation(['4', '5'])} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        virtuoso.rangeChanged({ startIndex: 1, endIndex: 1 });
        rerender(<ChatLog conversation={before} settings={settings} rect={rect} />);
        expect(virtuoso.scrollToIndex).toHaveBeenCalledTimes(1);
        await Promise.resolve();
        expect(virtuoso.scrollToIndex).toHaveBeenCalledTimes(2);
        expect(virtuoso.scrollToIndex).toHaveBeenLastCalledWith({ index: 4, align: 'start' });
    });

    it('goes to the next message still shown when the one the reader was at is gone', () => {
        const { rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        virtuoso.rangeChanged({ startIndex: 3, endIndex: 4 });
        // Message 4 is gone; message 5, after it, is now the second one.
        rerender(
            <ChatLog conversation={conversation(['1', '5'])} settings={settings} rect={rect} />
        );
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({ index: 1, align: 'start' });
    });

    it('goes to the last message before it when none after it is still shown', () => {
        const { rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        virtuoso.rangeChanged({ startIndex: 3, endIndex: 4 });
        rerender(
            <ChatLog conversation={conversation(['1', '2'])} settings={settings} rect={rect} />
        );
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({ index: 1, align: 'start' });
    });

    // Found in Chrome, with 12,000 messages: the virtualizer's range also counts the rows it draws above
    // the view, so the message it starts with is one the reader cannot see. When a selection removed that
    // message, nothing was returned to, and the list kept a pixel offset past the end of the shorter list.
    it('returns to the message at the top of the view, not the first row the virtualizer draws', () => {
        const { container, rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        virtuoso.rangeChanged({ startIndex: 0, endIndex: 4 });
        // Messages 1 and 2 are drawn above the view; message 3 is at its top.
        const view = container.querySelector('[data-virtuoso-scroller]');
        const box = (top, bottom) => ({
            top,
            bottom,
            left: 0,
            right: 900,
            width: 900,
            height: bottom - top,
        });
        const layout = vi
            .spyOn(Element.prototype, 'getBoundingClientRect')
            .mockImplementation(function measure() {
                if (this === view) return box(0, 600);
                const index = this.getAttribute('data-message-index');
                if (index === null) return box(0, 0);
                const top = (Number(index) - 2) * 60;
                return box(top, top + 60);
            });
        try {
            // A selection removed message 1, which the reader could not see.
            rerender(
                <ChatLog
                    conversation={conversation(['2', '3', '4', '5'])}
                    settings={settings}
                    rect={rect}
                />
            );
        } finally {
            layout.mockRestore();
        }
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({ index: 1, align: 'start' });
    });

    it('does not scroll when a render brings the same messages at the same places', () => {
        const { rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        virtuoso.rangeChanged({ startIndex: 2, endIndex: 4 });
        // A resize builds new message objects for the same conversation.
        rerender(
            <ChatLog
                conversation={conversation(['1', '2', '3', '4', '5'])}
                settings={settings}
                rect={{ width: 700, height: 600 }}
            />
        );
        expect(virtuoso.scrollToIndex).not.toHaveBeenCalled();
    });
});

describe('returnIndex', () => {
    const ids = (list) => list.map((id) => message(id));
    const shown = ids(['1', '2', '3', '4', '5']);

    it('finds the message the reader was at, at its new index', () => {
        expect(returnIndex({ messages: shown, index: 3 }, ids(['2', '4', '5']))).toBe(1);
    });

    it('keeps the index when the same messages were rebuilt', () => {
        expect(returnIndex({ messages: shown, index: 2 }, ids(['1', '2', '3', '4', '5']))).toBe(2);
    });

    it('takes the next message still shown, then the last one before, then none', () => {
        expect(returnIndex({ messages: shown, index: 1 }, ids(['1', '4']))).toBe(1);
        expect(returnIndex({ messages: shown, index: 3 }, ids(['1', '2']))).toBe(1);
        expect(returnIndex({ messages: shown, index: 3 }, ids(['9']))).toBe(-1);
    });

    it('copes with an index past the messages that were shown', () => {
        expect(returnIndex({ messages: shown, index: 40 }, ids(['2', '5']))).toBe(1);
        expect(returnIndex({ messages: [], index: 0 }, ids(['1']))).toBe(-1);
    });
});

describe('messageAtTop', () => {
    /**
     * Lay every element out at the box its `data-box` attribute gives: "top,bottom".
     *
     * @returns {object} The spy, to restore.
     */
    function layOut() {
        return vi
            .spyOn(Element.prototype, 'getBoundingClientRect')
            .mockImplementation(function measure() {
                const [top, bottom] = (this.getAttribute('data-box') ?? '0,0')
                    .split(',')
                    .map(Number);
                return { top, bottom, left: 0, right: 100, width: 100, height: bottom - top };
            });
    }

    it('answers -1 where nothing is laid out, as in jsdom', () => {
        const list = document.createElement('div');
        list.innerHTML = '<div data-message-index="0"></div><div data-message-index="1"></div>';
        expect(messageAtTop(document.createElement('div'), list)).toBe(-1);
        expect(messageAtTop(null, list)).toBe(-1);
    });

    it('skips rows above the view and a row reaching a fraction of a pixel into it', () => {
        const view = document.createElement('div');
        view.setAttribute('data-box', '100,700');
        view.innerHTML = [
            '<div data-message-index="4" data-box="20,60"></div>',
            '<div data-message-index="5" data-box="60,100.5"></div>',
            '<div data-message-index="6" data-box="100.5,160"></div>',
        ].join('');
        const layout = layOut();
        try {
            expect(messageAtTop(view, view)).toBe(6);
        } finally {
            layout.mockRestore();
        }
    });

    // Found in Chrome: in a list with day separators the virtualizer holds the day's header at the top
    // of the view, and a message scrolled to the top sits below it. The row behind the header is hidden.
    it('starts the view below the day header held at its top', () => {
        const view = document.createElement('div');
        view.setAttribute('data-box', '100,700');
        view.innerHTML = [
            '<div data-testid="virtuoso-top-item-list" data-box="100,140"></div>',
            '<div data-message-index="7" data-box="80,140"></div>',
            '<div data-message-index="8" data-box="140,210"></div>',
        ].join('');
        const layout = layOut();
        try {
            expect(messageAtTop(view, view)).toBe(8);
        } finally {
            layout.mockRestore();
        }
    });
});
