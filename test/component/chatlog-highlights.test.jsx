import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import ChatLog from '../../src/ui/ChatLog';
import { HIGHLIGHT_KINDS } from '../../src/qix/highlight-source';
import { createHighlightView } from '../../src/highlight/highlight-view';

/** Virtuoso measures with the real DOM; jsdom has no layout, so mock the viewport. */
function renderList(ui) {
    return render(ui, {
        wrapper: ({ children }) => (
            <VirtuosoMockContext.Provider value={{ viewportHeight: 800, itemHeight: 60 }}>
                {children}
            </VirtuosoMockContext.Provider>
        ),
    });
}

const message = (id, body, over = {}) => ({
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
    ...over,
});

const conversation = (messages) => ({
    messages,
    participants: new Map(),
    meta: { total: messages.length, loaded: messages.length, truncated: false, mergedCount: 0 },
    diagnostics: [],
});

const MESSAGES = [
    message('1', 'The reload failed; the task will retry'),
    message('2', 'Another task'),
    message('3', 'Nothing here'),
];

const categories = {
    field: 'pattern',
    problem: null,
    expression: null,
    list: [
        { name: 'ops', elemNumber: 0, color: null, selected: false },
        { name: 'script', elemNumber: 1, color: null, selected: false },
        { name: 'unused', elemNumber: 2, color: null, selected: false },
    ],
};

const values = {
    kind: HIGHLIGHT_KINDS.VALUES,
    field: 'match',
    source: 'possible',
    total: 2,
    values: ['reload', 'task'],
    rows: [
        { value: 'reload', category: 'ops' },
        { value: 'task', category: 'ops' },
        { value: 'task', category: 'script' },
    ],
    truncated: false,
    categories,
};

/** Build the highlights prop the way src/index.js does. */
function highlightsFor(answer, chatbox = {}, messages = MESSAGES, { canSelect = false } = {}) {
    const layout = {
        qHyperCube: {},
        chatbox: { highlight: { field: 'match' }, category: { field: 'pattern' }, ...chatbox },
    };
    const view = createHighlightView().build({
        tagged: { answer, derivedFrom: layout, version: 0 },
        layout,
        version: 0,
        messages,
        canSelect,
    });
    return view && { ...view, onSelectValues: vi.fn(), onSelectCategory: vi.fn() };
}

const settings = { dateSeparators: false };

describe('ChatLog with highlights', () => {
    it('marks the values in the messages', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlightsFor(values)}
            />
        );
        const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent);
        expect(marks).toEqual(['reload', 'task', 'task']);
        expect(container.querySelector('mark').getAttribute('title')).toBe('reload · ops');
    });

    it('sums the highlights up in the bar, with a legend of categories and their counts', () => {
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlightsFor(values)}
            />
        );
        expect(
            screen.getByText('2 possible values · 3 highlights in 2 messages')
        ).toBeInTheDocument();
        const legend = screen.getByRole('list', { name: 'Categories' });
        const chips = within(legend).getAllByRole('listitem');
        expect(chips.map((chip) => chip.textContent)).toEqual(['ops3', 'script2', 'unused0']);
        expect(chips[0]).toHaveAttribute('title', 'ops: 3 highlights in 2 messages');
        expect(chips[2]).toHaveAttribute('data-empty', 'true');
    });

    it('counts the highlights beside an empty summary when the summary is switched off', () => {
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlightsFor(values, {
                    highlight: { field: 'match', showSummary: false },
                    category: { field: 'pattern', showLegend: false },
                })}
            />
        );
        expect(screen.queryByText(/possible values/)).not.toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Categories' })).not.toBeInTheDocument();
        expect(screen.getByText('3 highlights')).toBeInTheDocument();
    });

    it('keeps a problem in sight as a banner, even with the summary switched off', () => {
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlightsFor(
                    { kind: HIGHLIGHT_KINDS.FIELD_MISSING, field: 'mtach' },
                    { highlight: { field: 'mtach', showSummary: false } }
                )}
            />
        );
        const banner = screen.getByText('The highlight field mtach is not in the data model');
        expect(banner).toHaveAttribute('data-level', 'error');
        expect(document.querySelector('mark')).toBeNull();
    });

    it('turns category labels on for the stylesheet only when categories are in use', () => {
        const { container, rerender } = renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlightsFor(values, {
                    category: { field: 'pattern', showLabels: true },
                })}
            />
        );
        expect(container.querySelector('[data-labels="true"]')).toBeTruthy();
        expect(
            [...container.querySelectorAll('mark[data-label]')].map((m) =>
                m.getAttribute('data-label')
            )
        ).toEqual(['ops', 'ops, script', 'ops, script']);

        rerender(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlightsFor(
                    { ...values, categories: null },
                    { category: { showLabels: true } }
                )}
            />
        );
        expect(container.querySelector('[data-labels="true"]')).toBeNull();
    });

    it('marks the values in the detail quote too', () => {
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={{ ...settings, onBubbleClick: 'showDetails' }}
                rect={{ width: 900, height: 600 }}
                highlights={highlightsFor(values)}
            />
        );
        fireEvent.click(screen.getByText('Another'));
        const details = screen.getByLabelText('Message details');
        expect([...details.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['task']);
    });

    it('matches a markdown message’s source for its detail quote', () => {
        const markdown = [message('1', 'Run **the task** now', { bodyFormat: 'markdown' })];
        renderList(
            <ChatLog
                conversation={conversation(markdown)}
                settings={{ ...settings, onBubbleClick: 'showDetails' }}
                rect={{ width: 900, height: 600 }}
                highlights={highlightsFor(values, {}, markdown)}
            />
        );
        fireEvent.click(screen.getByText('now', { exact: false }));
        const details = screen.getByLabelText('Message details');
        expect([...details.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['task']);
    });

    it('shows no bar without highlights', () => {
        const { container } = renderList(
            <ChatLog conversation={conversation(MESSAGES)} settings={settings} highlights={null} />
        );
        expect(container.querySelector('mark')).toBeNull();
        expect(screen.queryByText(/highlight/)).not.toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Categories' })).not.toBeInTheDocument();
    });
});

describe('ChatLog selecting by clicking highlights and chips', () => {
    const selectable = () => highlightsFor(values, {}, MESSAGES, { canSelect: true });

    it('selects every spelling of a highlight’s value, and says so in its tooltip', () => {
        const highlights = selectable();
        const { container } = renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlights}
            />
        );
        const mark = container.querySelector('mark');
        expect(mark.getAttribute('title')).toBe(
            'reload · ops\nClick to select this value. Ctrl+click or Cmd+click adds or removes it'
        );
        expect(container.querySelector('[data-marks="select"]')).toBeTruthy();
        fireEvent.click(mark, { metaKey: true });
        expect(highlights.onSelectValues).toHaveBeenCalledWith(['reload'], true);
    });

    it('makes each category a toggle button that selects it', () => {
        const highlights = selectable();
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlights}
            />
        );
        const group = screen.getByRole('group', { name: 'Categories' });
        const script = within(group).getByRole('button', { name: /script/ });
        expect(script).toHaveAttribute('aria-pressed', 'false');
        expect(script.getAttribute('title')).toBe(
            'script: 2 highlights in 2 messages\nClick to select only script. Ctrl+click or Cmd+click adds or removes it'
        );
        fireEvent.click(script);
        expect(highlights.onSelectCategory).toHaveBeenCalledWith('script', false);
    });

    it('disables the chips while the category field is locked', () => {
        const locked = highlightsFor(
            { ...values, locked: { highlight: false, category: true } },
            {},
            MESSAGES,
            { canSelect: true }
        );
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={locked}
            />
        );
        for (const chip of within(screen.getByRole('group', { name: 'Categories' })).getAllByRole(
            'button'
        )) {
            expect(chip).toBeDisabled();
        }
    });

    it('still routes a click on a locked highlight, so the reader is told why nothing happened', () => {
        const locked = highlightsFor(
            { ...values, locked: { highlight: true, category: false } },
            {},
            MESSAGES,
            { canSelect: true }
        );
        const { container } = renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={locked}
            />
        );
        const mark = container.querySelector('mark');
        expect(mark.getAttribute('title')).toBe('reload · ops\nmatch is locked');
        fireEvent.click(mark);
        expect(locked.onSelectValues).toHaveBeenCalledWith(['reload'], false);
    });

    it('selects a value clicked in the detail quote', () => {
        const highlights = selectable();
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={{ ...settings, onBubbleClick: 'showDetails' }}
                rect={{ width: 900, height: 600 }}
                highlights={highlights}
            />
        );
        fireEvent.click(screen.getByText('Another'));
        const quoteMark = screen.getByLabelText('Message details').querySelector('mark');
        fireEvent.click(quoteMark);
        expect(highlights.onSelectValues).toHaveBeenCalledWith(['task'], false);
    });

    it('selects nothing while the rows shown are the ones before a selection', () => {
        const highlights = selectable();
        const { container } = renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={highlights}
                reloading={{ loaded: null, total: null }}
            />
        );
        fireEvent.click(container.querySelector('mark'));
        expect(highlights.onSelectValues).not.toHaveBeenCalled();
        expect(screen.getByRole('list', { name: 'Categories' })).toBeInTheDocument();
    });

    it('shows a notice in the corner', () => {
        renderList(
            <ChatLog
                conversation={conversation(MESSAGES)}
                settings={settings}
                highlights={selectable()}
                notice={{ id: 1, level: 'warning', text: 'match is locked' }}
            />
        );
        expect(screen.getByText('match is locked')).toHaveAttribute('data-level', 'warning');
    });
});
