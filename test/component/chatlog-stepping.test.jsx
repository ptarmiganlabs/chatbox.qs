import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

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

const message = (id, body) => ({
    id,
    key: `k${id}`,
    elem: Number(id),
    body,
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
});

const MESSAGES = [
    message('1', 'reload the task'),
    message('2', 'nothing'),
    message('3', 'another reload'),
];
const conversation = { messages: MESSAGES, participants: new Map(), meta: {}, diagnostics: [] };

const answer = {
    kind: HIGHLIGHT_KINDS.VALUES,
    field: 'match',
    source: 'selected',
    total: 2,
    values: ['reload', 'task'],
    rows: [
        { value: 'reload', category: null },
        { value: 'task', category: null },
    ],
    truncated: false,
    categories: null,
};

/** The highlights prop, as src/index.js builds it. */
function highlights({ canSelect = true, chatbox = {} } = {}) {
    const layout = { qHyperCube: {}, chatbox: { highlight: { field: 'match' }, ...chatbox } };
    const view = createHighlightView().build({
        tagged: { answer, derivedFrom: layout, version: 0 },
        layout,
        version: 0,
        messages: MESSAGES,
        canSelect,
    });
    return { ...view, onSelectValues: vi.fn(), onSelectCategory: vi.fn() };
}

const active = { enabled: true, active: true, blur: vi.fn() };
const settings = { dateSeparators: false };

/** Render the conversation and return its list and root. */
function renderLog(props = {}) {
    const utils = render(
        <ChatLog
            conversation={conversation}
            settings={settings}
            rect={{ width: 900, height: 600 }}
            keyboard={active}
            highlights={highlights()}
            {...props}
        />,
        { wrapper: Viewport }
    );
    const list = utils.container.querySelector('[role="list"]');
    return { ...utils, list };
}

/** The text of the marks drawn as current. */
const currentMarks = (container) =>
    [...container.querySelectorAll('mark')]
        .filter((m) => /markCurrent/.test(m.className))
        .map((m) => m.textContent);

beforeEach(() => {
    virtuoso.scrollIntoView.mockClear();
    virtuoso.scrollToIndex.mockClear();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
        callback();
        return 0;
    });
});

describe('ChatLog stepping through highlights', () => {
    it('steps with F3, outlining the current highlight and counting where it is', () => {
        const { container, list } = renderLog();
        fireEvent.keyDown(list, { key: 'F3' });
        expect(currentMarks(container)).toEqual(['reload']);
        expect(screen.getByText('1 of 3')).toBeInTheDocument();
        expect(virtuoso.scrollIntoView).toHaveBeenLastCalledWith(
            expect.objectContaining({ index: 0 })
        );

        fireEvent.keyDown(list, { key: 'F3' });
        expect(currentMarks(container)).toEqual(['task']);
        fireEvent.keyDown(list, { key: 'F3' });
        expect(currentMarks(container)).toEqual(['reload']);
        expect(screen.getByText('3 of 3')).toBeInTheDocument();
        expect(virtuoso.scrollIntoView).toHaveBeenLastCalledWith(
            expect.objectContaining({ index: 2 })
        );
    });

    it('steps back with Shift+F3, wrapping to the last, and with Ctrl+G and Cmd+Shift+G', () => {
        const { container, list } = renderLog();
        fireEvent.keyDown(list, { key: 'F3', shiftKey: true });
        expect(screen.getByText('3 of 3')).toBeInTheDocument();
        fireEvent.keyDown(list, { key: 'g', ctrlKey: true });
        expect(screen.getByText('1 of 3')).toBeInTheDocument();
        fireEvent.keyDown(list, { key: 'G', metaKey: true, shiftKey: true });
        expect(currentMarks(container)).toEqual(['reload']);
        expect(screen.getByText('3 of 3')).toBeInTheDocument();
    });

    it('steps with the buttons, from the bar', () => {
        const { container } = renderLog();
        fireEvent.click(screen.getByRole('button', { name: 'Next highlight' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next highlight' }));
        expect(currentMarks(container)).toEqual(['task']);
        fireEvent.click(screen.getByRole('button', { name: 'Previous highlight' }));
        expect(currentMarks(container)).toEqual(['reload']);
    });

    it('selects the value of the highlight stepped to with Enter, and opens details with Space', () => {
        const props = highlights();
        const { list } = renderLog({ highlights: props });
        fireEvent.keyDown(list, { key: 'F3' });
        fireEvent.keyDown(list, { key: 'Enter' });
        expect(props.onSelectValues).toHaveBeenCalledWith(['reload'], false);
        expect(screen.queryByLabelText('Message details')).not.toBeInTheDocument();

        fireEvent.keyDown(list, { key: ' ' });
        expect(screen.getByLabelText('Message details')).toBeInTheDocument();
    });

    it('opens details with Enter while clicking a highlight does not select', () => {
        const props = highlights({ canSelect: false });
        const { list } = renderLog({ highlights: props });
        fireEvent.keyDown(list, { key: 'F3' });
        fireEvent.keyDown(list, { key: 'Enter' });
        expect(props.onSelectValues).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Message details')).toBeInTheDocument();
    });

    it('lets go of the highlight on moving on, and on Escape before leaving the object', () => {
        const { container, list } = renderLog();
        fireEvent.keyDown(list, { key: 'F3' });
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        expect(currentMarks(container)).toEqual([]);

        fireEvent.keyDown(list, { key: 'F3' });
        expect(currentMarks(container)).toHaveLength(1);
        fireEvent.keyDown(list, { key: 'Escape' });
        expect(currentMarks(container)).toEqual([]);
        expect(active.blur).not.toHaveBeenCalled();
        fireEvent.keyDown(list, { key: 'Escape' });
        expect(active.blur).toHaveBeenCalledWith(true);
    });

    it('keeps F3 for the browser when there is nothing to step to', () => {
        const none = createHighlightView().build({
            tagged: {
                answer: { ...answer, rows: [{ value: 'absent', category: null }] },
                derivedFrom: null,
                version: 0,
            },
            layout: { chatbox: { highlight: { field: 'match' } } },
            version: 0,
            messages: MESSAGES,
        });
        const { list } = renderLog({ highlights: none });
        const event = new KeyboardEvent('keydown', { key: 'F3', bubbles: true, cancelable: true });
        list.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(screen.getByRole('button', { name: 'Next highlight' })).toBeDisabled();
    });

    it('shows an overview ruler that goes to a message when clicked', () => {
        const { container } = renderLog();
        const ruler = container.querySelector('[data-kind="highlight"]');
        expect(ruler).not.toBeNull();
        const ticks = ruler.children;
        expect(ticks).toHaveLength(2);
        expect(ticks[1].getAttribute('title')).toBe('1 highlight in 1 message');
        ruler.getBoundingClientRect = () => ({
            top: 0,
            height: 300,
            bottom: 300,
            left: 0,
            right: 10,
            width: 10,
        });
        // Message 3 of 3 sits at 5/6 of the height.
        fireEvent.click(ruler, { clientY: 250 });
        expect(virtuoso.scrollToIndex).toHaveBeenCalledWith({
            index: 2,
            align: 'start',
            behavior: 'auto',
        });
    });

    it('leaves the ruler out when switched off, and the step buttons out of a snapshot', () => {
        const { container } = renderLog({ settings: { ...settings, showRuler: false } });
        expect(container.querySelector('[data-kind="highlight"]')).toBeNull();

        const snapshot = render(
            <ChatLog
                conversation={conversation}
                settings={settings}
                highlights={highlights()}
                layout={{ snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } }}
            />
        );
        expect(
            within(snapshot.container).queryByRole('button', { name: 'Next highlight' })
        ).toBeNull();
        expect(snapshot.container.querySelector('mark')).not.toBeNull();
    });

    it('lets the list scroll itself when every row is rendered in a live object', () => {
        const { list } = renderLog({ settings: { ...settings, virtualize: false } });
        expect(list.className).toMatch(/listScroll/);
    });
});
