import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { buildBoard } from '../../src/chat/lanes';
import { buildExportModel } from '../../src/export/export-model';
import ExportDocument, { footerText, sheetWidth } from '../../src/export/ExportDocument';
import { LANE_WIDTH, SINGLE_WIDTH } from '../../src/export/export-styles';

const people = {
    Ada: {
        key: 'Ada',
        label: 'Ada Lovelace',
        color: '#4477aa',
        avatarUrl: 'https://pics.example/ada.png',
    },
    Bob: { key: 'Bob', label: 'Bob', color: '#ee6677' },
};

const message = (id, thread, body, { author = 'Ada', minutes = 0, ...rest } = {}) => ({
    id,
    key: `k${id}`,
    body,
    bodyFormat: 'text',
    authorKey: author,
    author: people[author],
    recipients: null,
    threadId: thread,
    threadElem: 1,
    ts: Date.UTC(2026, 8, 8, 9, 0) + minutes * 60000,
    tsText: `09:${String(minutes).padStart(2, '0')}`,
    side: author === 'Bob' ? 'right' : 'left',
    ...rest,
});

const MESSAGES = [
    message('1', 'T1', 'Where is my order?', { recipients: [people.Bob] }),
    message('2', 'T1', 'On its way **today**', {
        author: 'Bob',
        minutes: 1,
        bodyFormat: 'markdown',
    }),
    message('3', 'T1', 'Thanks', { minutes: 2, context: true, badge: 'resolved' }),
];

const THEME = { '--cqs-bg': '#101010', '--cqs-text': '#f0f0f0' };

/** A view of the messages, without lanes. */
const view = (messages = MESSAGES, extra = {}) => ({
    conversation: { messages, meta: { truncated: false }, diagnostics: [] },
    board: null,
    settings: {},
    layout: { title: 'Support chats' },
    ...extra,
});

/** Draw the export of a view. */
function draw(model, props = {}) {
    return render(<ExportDocument model={model} format="html" theme={THEME} {...props} />);
}

describe('ExportDocument', () => {
    it('opens with the title block: the conversation, who, when and how many', () => {
        const model = buildExportModel(view());
        const { container } = draw(model);
        const title = container.querySelector('.cx-title');
        expect(within(title).getByRole('heading', { level: 1 })).toHaveTextContent('T1');
        expect(title).toHaveTextContent('Ada Lovelace and Bob');
        expect(title).toHaveTextContent('3 messages');
        expect(title).toHaveTextContent('Faded messages are context');
    });

    it('leaves the title block out when asked, and says briefly what was left out', () => {
        const truncated = view();
        truncated.conversation.meta = {
            truncated: true,
            rowsLoaded: 3,
            total: 10,
            truncatedTo: 'newest',
        };
        const model = buildExportModel(truncated);
        const { container } = draw(model, { title: false });
        expect(container.querySelector('.cx-title')).toBeNull();
        expect(container.querySelector('.cx-footer')).toHaveTextContent(
            /Exported .* · Not every message is included/
        );
    });

    it('draws every message, its sender once per cluster, and the time it was sent', () => {
        const { container } = draw(buildExportModel(view()));
        const messages = container.querySelectorAll('.cx-msg');
        expect(messages).toHaveLength(3);
        expect(messages[0].querySelector('.cx-author')).toHaveTextContent('Ada Lovelace → Bob');
        expect(messages[0]).toHaveTextContent('09:00');
        expect(messages[1].getAttribute('data-own')).toBe('true');
        expect(messages[2].getAttribute('data-context')).toBe('true');
        expect(messages[2].querySelector('.cx-badge')).toHaveTextContent('resolved');
    });

    it('draws markdown as the object does, and text as text', () => {
        const { container } = draw(buildExportModel(view()));
        const bodies = container.querySelectorAll('.cx-body');
        expect(bodies[1].getAttribute('data-format')).toBe('markdown');
        expect(bodies[1].querySelector('strong')).toHaveTextContent('today');
        const hostile = buildExportModel(
            view([message('9', 'T1', '<img src=x onerror=alert(1)>')])
        );
        const drawn = draw(hostile).container;
        expect(drawn.querySelector('.cx-body img')).toBeNull();
        expect(drawn.querySelector('.cx-body')).toHaveTextContent('<img src=x onerror=alert(1)>');
    });

    it('shows a picture where it can be drawn, and initials where it cannot', () => {
        const model = buildExportModel(view());
        const pictured = draw(model, {
            avatars: new Map([['https://pics.example/ada.png', 'data:image/png;base64,AAAA']]),
        }).container;
        expect(pictured.querySelector('img.cx-avatar').getAttribute('src')).toBe(
            'data:image/png;base64,AAAA'
        );
        const refused = draw(model, {
            avatars: new Map([['https://pics.example/ada.png', null]]),
        }).container;
        expect(refused.querySelector('img.cx-avatar')).toBeNull();
        expect(refused.querySelector('.cx-initials')).toHaveTextContent('AL');
    });

    it('says whether the page has avatars, which the gutter of a right-hand message clears', () => {
        const withFaces = draw(buildExportModel(view())).container.querySelector('.cx-page');
        expect(withFaces.getAttribute('data-avatars')).toBe('true');
        const without = buildExportModel(view(MESSAGES, { settings: { showAvatars: false } }));
        const page = draw(without).container.querySelector('.cx-page');
        expect(page.hasAttribute('data-avatars')).toBe(false);
        expect(page.querySelector('.cx-avatar, .cx-avatar-space')).toBeNull();
    });

    it('carries the theme on the page', () => {
        const { container } = draw(buildExportModel(view()));
        const page = container.querySelector('.cx-page');
        expect(page.style.getPropertyValue('--cqs-bg')).toBe('#101010');
        expect(page.getAttribute('data-format')).toBe('html');
    });

    it('heads each conversation side by side, and draws a part with its number', () => {
        const messages = [
            message('1', 'T1', 'one', { minutes: 0 }),
            message('2', 'T2', 'two', { minutes: 1, threadElem: 2 }),
        ];
        const board = buildBoard(messages, { max: 4, scroll: 'linked' });
        const model = buildExportModel(view(board.messages, { board }));
        const { container } = draw(model, {
            format: 'png',
            shape: 'slides',
            part: { index: 1, count: 3 },
            size: { width: 960, height: 540 },
        });
        const heads = container.querySelectorAll('.cx-heads th');
        expect([...heads].map((head) => head.querySelector('.cx-head-name').textContent)).toEqual(
            board.lanes.map((lane) => lane.label)
        );
        // Only the first image has the title block.
        expect(container.querySelector('.cx-title')).toBeNull();
        expect(container.querySelector('.cx-footer')).toHaveTextContent('2 of 3');
        expect(container.querySelector('.cx-page').style.height).toBe('540px');
    });

    it('is a column to read for one conversation, and a lane each side by side', () => {
        expect(sheetWidth({ columns: [{}] })).toBe(SINGLE_WIDTH);
        expect(sheetWidth({ columns: [{}, {}, {}] })).toBe(3 * LANE_WIDTH - 24);
    });

    it('numbers the footer only when there are several images', () => {
        const model = { footer: 'Exported today', notes: [] };
        expect(footerText(model, null, true)).toEqual({ left: 'Exported today', right: null });
        expect(footerText(model, { index: 0, count: 1 }, true).right).toBeNull();
        expect(footerText(model, { index: 2, count: 4 }, false).right).toBe('3 of 4');
    });
});
