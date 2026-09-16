import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';

// Virtuoso cannot scroll in jsdom, so its handle is spied on, and the range callback it would call while
// scrolling is captured for the test to call.
const virtuoso = vi.hoisted(() => ({
    scrollToIndex: vi.fn(),
    scrollIntoView: vi.fn(),
    rangeChanged: null,
}));

vi.mock('react-virtuoso', async (importOriginal) => {
    const actual = await importOriginal();
    const React = await import('react');
    const wrap = (Component) =>
        React.forwardRef(function Spied(props, ref) {
            virtuoso.rangeChanged = props.rangeChanged;
            React.useImperativeHandle(ref, () => ({
                scrollToIndex: virtuoso.scrollToIndex,
                scrollIntoView: virtuoso.scrollIntoView,
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
const { default: ConversationList } = await import('../../src/ui/ConversationList');

/** Wrap in the mock viewport Virtuoso needs to render rows in jsdom. */
function Viewport({ children }) {
    return (
        <VirtuosoMockContext.Provider value={{ viewportHeight: 800, itemHeight: 60 }}>
            {children}
        </VirtuosoMockContext.Provider>
    );
}

const message = (id) => ({ id, key: `k${id}`, body: `message ${id}` });
const messages = (ids) => ids.map(message);

/** Render a row the way the conversation view does, tagged with its conversation index. */
const renderItem = (list, offset) => (index) => (
    <div data-message-index={index} data-row={index}>
        {list[index - offset].body}
    </div>
);

/** Render a list at an offset, returning its handle. */
function renderList({ list, offset = 0, ...props }) {
    const ref = createRef();
    const utils = render(
        <ConversationList
            ref={ref}
            messages={list}
            offset={offset}
            renderItem={renderItem(list, offset)}
            label="Lane"
            {...props}
        />,
        { wrapper: Viewport }
    );
    /** Render again with other props. */
    const again = ({ list: next = list, offset: at = offset, ...more }) =>
        utils.rerender(
            <ConversationList
                ref={ref}
                messages={next}
                offset={at}
                renderItem={renderItem(next, at)}
                label="Lane"
                {...props}
                {...more}
            />
        );
    return { ...utils, ref, again };
}

beforeEach(() => {
    virtuoso.scrollToIndex.mockClear();
    virtuoso.scrollIntoView.mockClear();
});

describe('ConversationList', () => {
    it('renders each message by its index in the whole conversation', () => {
        const { container } = renderList({ list: messages(['a', 'b']), offset: 5 });
        const rows = [...container.querySelectorAll('[data-message-index]')];
        expect(rows.map((row) => row.getAttribute('data-message-index'))).toEqual(['5', '6']);
        expect(screen.getByRole('list', { name: 'Lane' })).toBeInTheDocument();
    });

    it('scrolls the virtualizer to the index within the list', () => {
        const { ref } = renderList({ list: messages(['a', 'b', 'c']), offset: 10 });
        ref.current.jumpTo(12);
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({
            index: 2,
            align: 'start',
            behavior: 'auto',
        });
        const done = vi.fn();
        ref.current.reveal(11, { behavior: 'auto', done });
        expect(virtuoso.scrollIntoView).toHaveBeenCalledWith({ index: 1, behavior: 'auto', done });
    });

    it('reports where the reader is in conversation indices', () => {
        const onRange = vi.fn();
        const { ref } = renderList({ list: messages(['a', 'b', 'c']), offset: 10, onRange });
        virtuoso.rangeChanged({ startIndex: 2, endIndex: 2 });
        expect(onRange).toHaveBeenLastCalledWith(12);
        expect(ref.current.firstVisibleIndex()).toBe(12);
        // Nothing is laid out in jsdom, so the reading place falls back to the range.
        expect(ref.current.readingIndex()).toBe(12);
    });

    it('returns the reader to their message by its place within the list', () => {
        const { again } = renderList({ list: messages(['a', 'b', 'c', 'd']), offset: 3 });
        virtuoso.rangeChanged({ startIndex: 2, endIndex: 3 });
        // A selection removed "a", and an earlier list grew by two, so the offset moved too.
        again({ list: messages(['b', 'c', 'd']), offset: 5 });
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({ index: 1, align: 'start' });
    });

    it('does not scroll when only the offset changes', () => {
        const list = messages(['a', 'b', 'c']);
        const { again } = renderList({ list, offset: 0 });
        virtuoso.rangeChanged({ startIndex: 1, endIndex: 2 });
        again({ list, offset: 4 });
        again({ list: messages(['a', 'b', 'c']), offset: 4 });
        expect(virtuoso.scrollToIndex).not.toHaveBeenCalled();
    });

    it('with every message rendered, reveals at once and puts each day before its first message', () => {
        const ref = createRef();
        const list = messages(['a', 'b', 'c']);
        render(
            <ConversationList
                ref={ref}
                messages={list}
                offset={0}
                renderItem={renderItem(list, 0)}
                renderAll
                dayGroups={{ groupCounts: [2, 1], labels: ['Mon', 'Tue'] }}
                label="Lane"
            />
        );
        const done = vi.fn();
        ref.current.reveal(1, { done });
        expect(done).toHaveBeenCalledTimes(1);
        expect(virtuoso.scrollIntoView).not.toHaveBeenCalled();
        const text = screen.getByRole('list').textContent;
        expect(text).toBe('Monmessage amessage bTuemessage c');
        expect(ref.current.container(0).scroller).toBe(screen.getByRole('list'));
    });
});
