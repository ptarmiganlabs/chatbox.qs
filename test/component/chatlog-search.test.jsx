import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

// Virtuoso cannot scroll in jsdom: its handle is spied on, and a scroll reports itself done at once.
const virtuoso = vi.hoisted(() => ({ scrollIntoView: vi.fn(), scrollToIndex: vi.fn() }));
vi.mock('react-virtuoso', async (importOriginal) => {
    const actual = await importOriginal();
    const React = await import('react');
    const wrap = (Component) =>
        React.forwardRef(function Spied(props, ref) {
            React.useImperativeHandle(ref, () => ({
                scrollToIndex: virtuoso.scrollToIndex,
                scrollIntoView: (location) => {
                    virtuoso.scrollIntoView(location);
                    location?.done?.();
                },
            }));
            return React.createElement(Component, props);
        });
    return {
        ...actual,
        Virtuoso: wrap(actual.Virtuoso),
        GroupedVirtuoso: wrap(actual.GroupedVirtuoso),
    };
});

const { VirtuosoMockContext } = await import('react-virtuoso');
const { default: ChatLog } = await import('../../src/ui/ChatLog');
const { createConversationFinder } = await import('../../src/highlight/conversation-finder');
const { HIGHLIGHT_KINDS } = await import('../../src/qix/highlight-source');
const { createHighlightView } = await import('../../src/highlight/highlight-view');

/** Wrap in the mock viewport Virtuoso needs to render rows in jsdom. */
function Viewport({ children }) {
    return (
        <VirtuosoMockContext.Provider value={{ viewportHeight: 800, itemHeight: 60 }}>
            {children}
        </VirtuosoMockContext.Provider>
    );
}

const person = (label) => ({ key: label, label, color: '#4477aa', side: 'left' });
const message = (id, body, author = 'Ada') => ({
    id,
    key: `k${id}`,
    elem: Number(id),
    body,
    bodyFormat: 'text',
    authorKey: author,
    author: person(author),
    ts: null,
    tsText: null,
    kpis: [],
    state: 'O',
    merged: false,
    rowCount: 1,
    side: 'left',
});

const MESSAGES = [
    message('1', 'the reload failed', 'Ada'),
    message('2', 'reload again', 'Bob'),
    message('3', 'Ada, it worked', 'Bob'),
];
const conversation = { messages: MESSAGES, participants: new Map(), meta: {}, diagnostics: [] };
const settings = { dateSeparators: false };
const keyboard = { enabled: true, active: true, blur: vi.fn() };

/** The search prop, as src/index.js builds it. */
const searchProp = (over = {}) => ({
    finder: createConversationFinder(),
    initialQuery: '',
    onQueryChange: vi.fn(),
    ...over,
});

/** Render the conversation with a search box. */
function renderLog(props = {}) {
    const utils = render(
        <ChatLog
            conversation={conversation}
            settings={settings}
            rect={{ width: 900, height: 600 }}
            keyboard={keyboard}
            search={searchProp()}
            {...props}
        />,
        { wrapper: Viewport }
    );
    const input = screen.queryByRole('searchbox', { name: 'Search messages' });
    const list = utils.container.querySelector('[role="list"]');
    return { ...utils, input, list };
}

/** Type a query and let the pause pass. */
function type(input, value) {
    fireEvent.change(input, { target: { value } });
    act(() => {
        vi.advanceTimersByTime(150);
    });
}

/** The text of the search marks drawn, and of the current one. */
const findMarks = (container) =>
    [...container.querySelectorAll('mark')].filter((m) => /find/.test(m.className));
const currentText = (container) =>
    findMarks(container)
        .filter((m) => m.hasAttribute('data-current'))
        .map((m) => m.textContent);

beforeEach(() => {
    vi.useFakeTimers();
    virtuoso.scrollIntoView.mockClear();
    keyboard.blur.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
        callback();
        return 0;
    });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ChatLog search', () => {
    it('marks what was typed once typing pauses, in bodies and in names, and makes the first current', () => {
        const { container, input } = renderLog();
        fireEvent.change(input, { target: { value: 'ada' } });
        expect(findMarks(container)).toHaveLength(0);
        act(() => {
            vi.advanceTimersByTime(150);
        });
        // "Ada" in message 1's header, "Bob" has none, "Ada," in message 3's body.
        expect(findMarks(container).map((m) => m.textContent)).toEqual(['Ada', 'Ada']);
        expect(currentText(container)).toEqual(['Ada']);
        expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });

    it('steps with Enter and Shift+Enter in the box, wrapping, and with the buttons', () => {
        const { container, input } = renderLog();
        type(input, 'reload');
        expect(screen.getByText('1 of 2')).toBeInTheDocument();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('2 of 2')).toBeInTheDocument();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('1 of 2')).toBeInTheDocument();
        fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
        expect(screen.getByText('2 of 2')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
        expect(currentText(container)).toEqual(['reload']);
        expect(screen.getByText('1 of 2')).toBeInTheDocument();
    });

    it('searches what is typed at once on Enter, without waiting for the pause', () => {
        const { input } = renderLog();
        fireEvent.change(input, { target: { value: 'worked' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByText('1 of 1')).toBeInTheDocument();
    });

    it('says when nothing matches', () => {
        const { input } = renderLog();
        type(input, 'zebra');
        expect(screen.getByText('No matches')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled();
    });

    it('clears the query with Escape, and hands focus back to Sense with a second', () => {
        const { container, input } = renderLog();
        type(input, 'reload');
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(input).toHaveValue('');
        expect(findMarks(container)).toHaveLength(0);
        expect(keyboard.blur).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(keyboard.blur).toHaveBeenCalledWith(true);
    });

    it('goes to the search box with Ctrl+F or Cmd+F from inside the object', () => {
        const { input, list } = renderLog();
        const event = new KeyboardEvent('keydown', {
            key: 'f',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        list.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(input);
    });

    it('steps through the matches with F3 while a query is typed, and the highlights after', () => {
        const layout = { qHyperCube: {}, chatbox: { highlight: { field: 'match' } } };
        const highlights = createHighlightView().build({
            tagged: {
                answer: {
                    kind: HIGHLIGHT_KINDS.VALUES,
                    field: 'match',
                    source: 'selected',
                    total: 1,
                    values: ['worked'],
                    rows: [{ value: 'worked', category: null }],
                    truncated: false,
                    categories: null,
                },
                derivedFrom: layout,
                version: 0,
            },
            layout,
            version: 0,
            messages: MESSAGES,
        });
        const { container, input, list } = renderLog({ highlights });
        type(input, 'reload');
        fireEvent.keyDown(list, { key: 'F3' });
        expect(screen.getByText('2 of 2')).toBeInTheDocument();
        expect(container.querySelector('[data-kind="find"]')).not.toBeNull();

        fireEvent.keyDown(input, { key: 'Escape' });
        fireEvent.keyDown(list, { key: 'F3' });
        expect(screen.getByText('1 of 1')).toBeInTheDocument();
        expect(container.querySelector('[data-kind="highlight"]')).not.toBeNull();
    });

    it('keeps the query across a remount, and reports it as it settles', () => {
        const search = searchProp();
        const { input, unmount } = renderLog({ search });
        type(input, 'reload');
        expect(search.onQueryChange).toHaveBeenLastCalledWith('reload');
        unmount();

        renderLog({ search: searchProp({ initialQuery: 'reload' }) });
        expect(screen.getByRole('searchbox', { name: 'Search messages' })).toHaveValue('reload');
        expect(screen.getByText('2 matches')).toBeInTheDocument();
    });

    it('leaves the search box out where it is switched off or cannot be used', () => {
        const { input } = renderLog({ search: null });
        expect(input).toBeNull();
        const snapshot = render(
            <ChatLog
                conversation={conversation}
                settings={settings}
                search={searchProp()}
                layout={{ snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } }}
            />
        );
        expect(snapshot.container.querySelector('input')).toBeNull();
    });
});
