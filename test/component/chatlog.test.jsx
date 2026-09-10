import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import ChatLog from '../../src/ui/ChatLog';

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

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

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
