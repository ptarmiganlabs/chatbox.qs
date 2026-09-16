import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// Virtuoso cannot scroll in jsdom, so its handle is spied on, and the range callback it would call
// while scrolling is captured for the test to call.
const virtuoso = vi.hoisted(() => ({ scrollToIndex: vi.fn(), rangeChanged: null }));

vi.mock('react-virtuoso', async (importOriginal) => {
    const actual = await importOriginal();
    const React = await import('react');
    const wrap = (Component) =>
        React.forwardRef(function Spied(props, ref) {
            virtuoso.rangeChanged = props.rangeChanged;
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
        Virtuoso: wrap(actual.Virtuoso),
        GroupedVirtuoso: wrap(actual.GroupedVirtuoso),
    };
});

const { VirtuosoMockContext } = await import('react-virtuoso');
const { default: ChatLog } = await import('../../src/ui/ChatLog');

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

    it('leaves the list where it is when the message the reader was at is gone', () => {
        const { rerender } = render(
            <ChatLog conversation={before} settings={settings} rect={rect} />,
            { wrapper: Viewport }
        );
        virtuoso.rangeChanged({ startIndex: 3, endIndex: 4 });
        rerender(
            <ChatLog conversation={conversation(['1', '5'])} settings={settings} rect={rect} />
        );
        expect(virtuoso.scrollToIndex).not.toHaveBeenCalled();
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
