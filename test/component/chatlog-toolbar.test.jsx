import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { VirtuosoMockContext } from 'react-virtuoso';
import ChatLog from '../../src/ui/ChatLog';
import { AUTO_FONT_SIZE } from '../../src/highlight/settings';
import { createConversationFinder } from '../../src/highlight/conversation-finder';

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

const MESSAGES = [message('1', 'the reload failed'), message('2', 'reload again')];
const conversation = { messages: MESSAGES, participants: new Map(), meta: {}, diagnostics: [] };
const keyboard = { enabled: true, active: true, blur: vi.fn() };

/** The search prop, as src/index.js builds it while the search box is switched on. */
const searchProp = () => ({
    finder: createConversationFinder(),
    initialQuery: '',
    onQueryChange: vi.fn(),
});

/** Render the conversation with the bar. */
function renderLog(settings = {}, props = {}) {
    const utils = render(
        <ChatLog
            conversation={conversation}
            settings={{ dateSeparators: false, ...settings }}
            rect={{ width: 900, height: 600 }}
            keyboard={keyboard}
            {...props}
        />,
        { wrapper: Viewport }
    );
    return { ...utils, root: utils.container.firstChild };
}

describe('ChatLog text size', () => {
    it('follows density until a size is set, and then draws the conversation at it', () => {
        const { root, rerender, container } = renderLog();
        // Nothing is written on the root while the size follows density: the density class owns it.
        expect(root.style.getPropertyValue('--cqs-read-size')).toBe('');
        expect(screen.getByRole('combobox', { name: 'Text size' })).toHaveValue(
            String(AUTO_FONT_SIZE)
        );

        rerender(
            <Viewport>
                <ChatLog
                    conversation={conversation}
                    settings={{ dateSeparators: false, fontSize: 18 }}
                    rect={{ width: 900, height: 600 }}
                    keyboard={keyboard}
                />
            </Viewport>
        );
        expect(container.firstChild.style.getPropertyValue('--cqs-read-size')).toBe('18px');
    });

    it("takes the reader's pick, and gives it up when the setting itself changes", () => {
        const { root, rerender, container } = renderLog({ fontSize: 12 });
        fireEvent.change(screen.getByRole('combobox', { name: 'Text size' }), {
            target: { value: '24' },
        });
        expect(root.style.getPropertyValue('--cqs-read-size')).toBe('24px');

        // A developer who changes the setting means it: the reader's older pick does not outlive it.
        rerender(
            <Viewport>
                <ChatLog
                    conversation={conversation}
                    settings={{ dateSeparators: false, fontSize: 14 }}
                    rect={{ width: 900, height: 600 }}
                    keyboard={keyboard}
                />
            </Viewport>
        );
        expect(container.firstChild.style.getPropertyValue('--cqs-read-size')).toBe('14px');
    });

    it('leaves the control out when it is switched off, and out of a snapshot', () => {
        renderLog({ showTextSize: false });
        expect(screen.queryByRole('combobox', { name: 'Text size' })).toBeNull();

        const snapshot = render(
            <ChatLog
                conversation={conversation}
                settings={{ dateSeparators: false }}
                layout={{ snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } }}
            />
        );
        expect(
            within(snapshot.container).queryByRole('combobox', { name: 'Text size' })
        ).toBeNull();
    });
});

describe('ChatLog toolbar groups', () => {
    it('keeps the find box and the keywords in groups of their own', () => {
        // A reader who mistakes one group for the other has been failed by the toolbar: the find box
        // steps with ▲▼ and the keywords with ◂▸, and each counts in its own pill.
        renderLog({}, { search: searchProp() });
        const search = screen.getByRole('search');
        expect(within(search).getByRole('searchbox', { name: 'Search messages' })).toBeTruthy();
        expect(within(search).getByRole('button', { name: 'Next match' })).toHaveTextContent('▼');
        expect(screen.queryByRole('group', { name: 'Keywords' })).toBeNull();
    });

    it('leaves the find box out when the search box is switched off', () => {
        // The object withholds the search prop when the setting is off; the bar draws what it is given.
        renderLog({ showSearch: false });
        expect(screen.queryByRole('search')).toBeNull();
        // The bar is still there for the text size, and takes no more room than that.
        expect(screen.getByRole('combobox', { name: 'Text size' })).toBeTruthy();
    });
});

describe('ChatLog copy button on a message', () => {
    it('hands a message to the copy handler, and leaves the button out when switched off', () => {
        const onCopyMessage = vi.fn();
        const { unmount } = renderLog({}, { onCopyMessage });
        fireEvent.click(screen.getAllByRole('button', { name: 'Copy this message' })[0]);
        expect(onCopyMessage).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
        unmount();

        renderLog({ showMessageCopy: false }, { onCopyMessage });
        expect(screen.queryByRole('button', { name: 'Copy this message' })).toBeNull();
    });

    it('leaves it out of a snapshot, which has no clipboard to copy to', () => {
        render(
            <ChatLog
                conversation={conversation}
                settings={{ dateSeparators: false }}
                onCopyMessage={vi.fn()}
                layout={{ snapshotData: { chatbox: { firstVisibleIndex: 0, openId: null } } }}
            />
        );
        expect(screen.queryByRole('button', { name: 'Copy this message' })).toBeNull();
    });
});
