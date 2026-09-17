import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import ChatLog, { isSelectable } from '../../src/ui/ChatLog';
import { ZONE_NAMES, inTimeZone } from '../helpers/time-zones';

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

/** A timestamp as a Qlik timestamp gives it: a wall-clock time, read as UTC. */
const at = (y, m, d, h = 12, min = 0) => Date.UTC(y, m - 1, d, h, min);

const message = (over = {}) => ({
    id: 'm1',
    elem: 1,
    body: 'hello',
    bodyFormat: 'text',
    authorKey: 'Ada',
    author: { key: 'Ada', elem: 10, label: 'Ada', color: '#4477aa', side: 'left' },
    ts: null,
    tsText: null,
    threadId: null,
    kind: null,
    media: [],
    accent: null,
    badge: null,
    kpis: [],
    state: 'O',
    rowIdx: 0,
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

describe('ChatLog date separators', () => {
    const twoDays = [
        message({ id: '1', body: 'first', ts: at(2026, 9, 8, 9) }),
        message({ id: '2', body: 'second', ts: at(2026, 9, 9, 9) }),
    ];

    it('renders a heading per day', () => {
        renderList(<ChatLog conversation={conversation(twoDays)} settings={{}} />);
        expect(screen.getByText('first')).toBeInTheDocument();
        expect(screen.getByText('second')).toBeInTheDocument();
        // Two distinct days means two headings.
        expect(screen.getAllByText(/\d|Today|Yesterday/).length).toBeGreaterThanOrEqual(2);
    });

    it('renders no headings when the setting is off', () => {
        const { container } = renderList(
            <ChatLog conversation={conversation(twoDays)} settings={{ dateSeparators: false }} />
        );
        expect(container.innerHTML).not.toMatch(/separator/);
    });

    it('renders no headings when nothing can be dated', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation([message({ id: '1' }), message({ id: '2' })])}
                settings={{}}
            />
        );
        expect(container.innerHTML).not.toMatch(/separator/);
    });

    it.each(ZONE_NAMES)('shows each message under the day the data holds in %s', (zone) => {
        // Regression (GOTCHAS 32): read by the reader's clock, the message at 23:30 went under the next
        // day east of UTC, and the one at 00:30 under the day before west of it.
        const day = (y, m, d) =>
            new Intl.DateTimeFormat(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
            }).format(Date.UTC(y, m - 1, d));
        const messages = [
            message({ id: '1', body: 'late', ts: at(2020, 2, 28, 23, 30) }),
            message({ id: '2', body: 'early', ts: at(2020, 2, 29, 0, 30) }),
        ];
        inTimeZone(zone, () => {
            const { container } = renderList(
                <ChatLog conversation={conversation(messages)} settings={{ virtualize: false }} />
            );
            // Separators and messages in the order they are drawn: each day, then its message.
            const drawn = [...container.querySelectorAll('[class*="separator"], [data-row]')].map(
                (node) =>
                    node.hasAttribute('data-row')
                        ? messages[node.dataset.row].body
                        : node.textContent
            );
            expect(drawn).toEqual([day(2020, 2, 28), 'late', day(2020, 2, 29), 'early']);
        });
    });

    it('shows every message even when grouped', () => {
        // A groupCounts array that does not sum to the message count silently
        // drops messages off the end of the list.
        const many = [
            message({ id: '1', body: 'a', ts: at(2026, 9, 8) }),
            message({ id: '2', body: 'b', ts: at(2026, 9, 8) }),
            message({ id: '3', body: 'c', ts: at(2026, 9, 9) }),
        ];
        renderList(<ChatLog conversation={conversation(many)} settings={{}} />);
        for (const body of ['a', 'b', 'c']) {
            expect(screen.getByText(body)).toBeInTheDocument();
        }
    });
});

describe('ChatLog density', () => {
    it('tags the root with the resolved density', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation([message()])}
                settings={{}}
                rect={{ width: 900, height: 600 }}
            />
        );
        expect(container.querySelector('[data-density="comfortable"]')).toBeTruthy();
    });

    it('tightens for a narrow object', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation([message()])}
                settings={{}}
                rect={{ width: 300, height: 600 }}
            />
        );
        expect(container.querySelector('[data-density="ultra"]')).toBeTruthy();
    });

    it('honours an explicit density over the measured size', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation([message()])}
                settings={{ density: 'comfortable' }}
                rect={{ width: 200, height: 200 }}
            />
        );
        expect(container.querySelector('[data-density="comfortable"]')).toBeTruthy();
    });
});

describe('ChatLog keyboard navigation', () => {
    const five = Array.from({ length: 5 }, (_, i) =>
        message({ id: String(i + 1), body: `msg ${i + 1}` })
    );

    /** Sense manages keyboard handling and has handed focus to this object. */
    const active = { enabled: true, active: true, blur: () => {} };
    /** Sense manages keyboard handling and has NOT handed focus over. */
    const inactive = { enabled: true, active: false, blur: () => {} };

    it('exposes exactly ONE tab stop for the whole conversation', () => {
        // The point of roving tabindex. One stop, not one per message.
        const { container } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={active} />
        );
        const stops = container.querySelectorAll('[tabindex="0"]');
        expect(stops).toHaveLength(1);
    });

    it("makes the virtualizer's own scroller non-tabbable", () => {
        // react-virtuoso sets tabIndex=0 on its scroller by default. Left alone
        // that is a second tab stop for the list, present even when Sense has
        // not handed focus over — so the roving tabindex would not be the only
        // one. Pinned here because a virtuoso upgrade could reintroduce it.
        const { container } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={active} />
        );
        const zeros = [...container.querySelectorAll('[tabindex="0"]')];
        expect(zeros).toHaveLength(1);
        expect(zeros[0].getAttribute('data-message-index')).not.toBeNull();
    });

    it('exposes NO tab stop when Sense has not handed focus over', () => {
        const { container } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={inactive} />
        );
        expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
    });

    it('moves focus with arrow keys', () => {
        const { container } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={active} />
        );
        const list = container.querySelector('[role="list"]');

        fireEvent.keyDown(list, { key: 'ArrowDown' });
        expect(container.querySelector('[data-message-index="0"][tabindex="0"]')).toBeTruthy();

        fireEvent.keyDown(list, { key: 'ArrowDown' });
        expect(container.querySelector('[data-message-index="1"][tabindex="0"]')).toBeTruthy();

        fireEvent.keyDown(list, { key: 'ArrowUp' });
        expect(container.querySelector('[data-message-index="0"][tabindex="0"]')).toBeTruthy();
    });

    it('jumps to either end with Home and End', () => {
        const { container } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={active} />
        );
        const list = container.querySelector('[role="list"]');
        fireEvent.keyDown(list, { key: 'End' });
        expect(container.querySelector('[data-message-index="4"][tabindex="0"]')).toBeTruthy();
        fireEvent.keyDown(list, { key: 'Home' });
        expect(container.querySelector('[data-message-index="0"][tabindex="0"]')).toBeTruthy();
    });

    it('opens and closes the detail with Enter and Escape', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation(five)}
                settings={{}}
                rect={{ width: 900, height: 600 }}
                keyboard={active}
            />
        );
        const list = container.querySelector('[role="list"]');
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'Enter' });
        expect(screen.getByLabelText('Message details')).toBeInTheDocument();

        fireEvent.keyDown(list, { key: 'Escape' });
        expect(screen.queryByLabelText('Message details')).not.toBeInTheDocument();
    });

    it('hands focus back to Sense on Escape when no detail is open', () => {
        // Otherwise the reader is trapped in the conversation and cannot tab on
        // to the rest of the sheet.
        let blurred = null;
        const keyboard = {
            enabled: true,
            active: true,
            blur: (v) => {
                blurred = v;
            },
        };
        const { container } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={keyboard} />
        );
        const list = container.querySelector('[role="list"]');
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'Escape' });
        expect(blurred).toBe(true);
    });

    it('ignores keys entirely when it may not hold focus', () => {
        const { container } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={inactive} />
        );
        const list = container.querySelector('[role="list"]');
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(0);
    });

    it('keeps focus on the same message when a selection moves it to another index', () => {
        const { container, rerender } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={active} />
        );
        const list = container.querySelector('[role="list"]');
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        // A selection removes the first message: "msg 3" is now at index 1.
        rerender(
            <ChatLog conversation={conversation(five.slice(1))} settings={{}} keyboard={active} />
        );
        const stops = container.querySelectorAll('[data-message-index][tabindex="0"]');
        expect(stops).toHaveLength(1);
        expect(stops[0].getAttribute('data-message-index')).toBe('1');
        expect(stops[0].textContent).toContain('msg 3');
    });

    it('gives the tab stop back to the first message when the focused one is gone', () => {
        const { container, rerender } = renderList(
            <ChatLog conversation={conversation(five)} settings={{}} keyboard={active} />
        );
        const list = container.querySelector('[role="list"]');
        fireEvent.keyDown(list, { key: 'End' });
        rerender(
            <ChatLog
                conversation={conversation(five.slice(0, 3))}
                settings={{}}
                keyboard={active}
            />
        );
        const stops = container.querySelectorAll('[data-message-index][tabindex="0"]');
        expect(stops).toHaveLength(1);
        expect(stops[0].getAttribute('data-message-index')).toBe('0');
    });

    it('announces how many messages the list holds', () => {
        renderList(<ChatLog conversation={conversation(five)} settings={{}} keyboard={active} />);
        expect(screen.getByLabelText('Conversation, 5 messages')).toBeInTheDocument();
    });
});

describe('ChatLog snapshot rendering', () => {
    const ten = Array.from({ length: 10 }, (_, i) => message({ id: String(i), body: `msg ${i}` }));

    /** A layout as it arrives when Sense re-renders a snapshot. */
    const snapLayout = (state) => ({
        snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null, ...state } },
    });

    it('renders EVERY message for a snapshot, ignoring the virtualize setting', () => {
        // The export browser photographs whatever it is given. A virtualized
        // render captures one screen and drops the rest, which reads as data
        // loss rather than a rendering choice.
        renderList(
            <ChatLog
                conversation={conversation(ten)}
                settings={{ virtualize: true }}
                layout={snapLayout()}
            />
        );
        for (let i = 0; i < 10; i += 1) {
            expect(screen.getByText(`msg ${i}`)).toBeInTheDocument();
        }
    });

    it('restores the detail that was open when the snapshot was taken', () => {
        renderList(
            <ChatLog
                conversation={conversation(ten)}
                settings={{}}
                rect={{ width: 900, height: 600 }}
                layout={snapLayout({ openId: '3' })}
            />
        );
        expect(screen.getByLabelText('Message details')).toBeInTheDocument();
    });

    it('opens nothing on an ordinary render', () => {
        renderList(
            <ChatLog
                conversation={conversation(ten)}
                settings={{}}
                rect={{ width: 900, height: 600 }}
                layout={{}}
            />
        );
        expect(screen.queryByLabelText('Message details')).not.toBeInTheDocument();
    });
});

describe('ChatLog bubbles that share a message id', () => {
    // Ids repeat legitimately (two authors sharing one) or through a data error.
    // normalize() gives each bubble a unique key; the view must key on it.
    const shared = [
        message({ id: '7', key: '7', body: 'first' }),
        message({ id: '7', key: '7#2', body: 'second' }),
    ];
    const active = { enabled: true, active: true, blur: () => {} };

    it('opens only the bubble that was activated', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation(shared)}
                settings={{}}
                // Narrow enough for inline details, which render per row.
                rect={{ width: 300, height: 600 }}
                keyboard={active}
            />
        );
        const list = container.querySelector('[role="list"]');
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'ArrowDown' });
        fireEvent.keyDown(list, { key: 'Enter' });

        expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    });

    it('renders both in the export path without duplicate React keys', () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        renderList(
            <ChatLog
                conversation={conversation(shared)}
                settings={{}}
                layout={{ snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } }}
            />
        );
        expect(screen.getByText('first')).toBeInTheDocument();
        expect(screen.getByText('second')).toBeInTheDocument();
        const keyWarnings = errors.mock.calls.filter((args) =>
            String(args[0]).includes('same key')
        );
        errors.mockRestore();
        expect(keyWarnings).toEqual([]);
    });
});

describe('ChatLog click gating', () => {
    const two = [message({ id: '1', body: 'one' }), message({ id: '2', body: 'two' })];

    it('offers a click only where the selection builder says it selects something', () => {
        const { container } = renderList(
            <ChatLog
                conversation={conversation(two)}
                settings={{ onBubbleClick: 'selectConversation' }}
                canSelect
                onSelect={() => {}}
                isMessageSelectable={(m) => m.id === '1'}
            />
        );
        expect(container.querySelector('[data-message-index="0"]').getAttribute('role')).toBe(
            'button'
        );
        expect(container.querySelector('[data-message-index="1"]').getAttribute('role')).toBeNull();
    });
});

describe('isSelectable', () => {
    it('keeps the author and message gates it always had', () => {
        const m = message();
        expect(isSelectable(m, 'selectAuthor')).toBe(true);
        expect(isSelectable(m, undefined)).toBe(true);
        expect(isSelectable({ ...m, elem: -2 }, 'selectMessage')).toBe(false);
    });

    it('refuses an action it cannot evaluate rather than guessing author', () => {
        expect(isSelectable(message(), 'selectConversation')).toBe(false);
        expect(isSelectable(message(), 'none')).toBe(false);
    });
});
