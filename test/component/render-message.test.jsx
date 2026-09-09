import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MessageRow from '../../src/ui/render-message';

const participant = (over = {}) => ({
    key: 'Ada',
    elem: 10,
    label: 'Ada Lovelace',
    color: '#4477aa',
    avatarUrl: null,
    side: 'left',
    unknown: false,
    ...over,
});

const message = (over = {}) => ({
    id: 'm1',
    elem: 1,
    body: 'hello',
    bodyFormat: 'text',
    author: participant(),
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
    side: 'left',
    ...over,
});

describe('MessageRow', () => {
    it('renders the body and author', () => {
        render(<MessageRow message={message()} showAuthor showAvatar selectable={false} />);
        expect(screen.getByText('hello')).toBeInTheDocument();
        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    });

    describe('untrusted data never reaches the DOM as markup', () => {
        it('renders an HTML message body as literal text, not elements', () => {
            const evil = '<img src=x onerror="alert(1)">';
            const { container } = render(
                <MessageRow
                    message={message({ body: evil })}
                    showAuthor
                    showAvatar
                    selectable={false}
                />
            );
            // The text is visible verbatim...
            expect(screen.getByText(evil)).toBeInTheDocument();
            // ...and no element was actually created from it.
            expect(container.querySelector('img[src="x"]')).toBeNull();
        });

        it('renders a script-shaped author name as text', () => {
            const evil = '<script>alert(1)</script>';
            const { container } = render(
                <MessageRow
                    message={message({ author: participant({ label: evil }) })}
                    showAuthor
                    showAvatar
                    selectable={false}
                />
            );
            expect(container.querySelector('script')).toBeNull();
            expect(screen.getByText(evil)).toBeInTheDocument();
        });
    });

    describe('avatars', () => {
        it('falls back to initials when there is no avatar URL', () => {
            render(<MessageRow message={message()} showAuthor showAvatar selectable={false} />);
            expect(screen.getByText('AL')).toBeInTheDocument();
        });

        it('renders an img when a validated URL is present', () => {
            const { container } = render(
                <MessageRow
                    message={message({
                        author: participant({ avatarUrl: '/content/Default/a.png' }),
                    })}
                    showAuthor
                    showAvatar
                    selectable={false}
                />
            );
            const img = container.querySelector('img');
            expect(img).toHaveAttribute('src', '/content/Default/a.png');
            expect(img).toHaveAttribute('loading', 'lazy');
            expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
        });

        it('reserves the avatar column for grouped messages so bubbles stay aligned', () => {
            const { container } = render(
                <MessageRow message={message()} showAuthor={false} showAvatar selectable={false} />
            );
            expect(container.querySelector('img')).toBeNull();
            expect(screen.queryByText('AL')).not.toBeInTheDocument();
        });
    });

    describe('selection', () => {
        it('fires on click and on keyboard activation when selectable', () => {
            const onSelect = vi.fn();
            render(
                <MessageRow
                    message={message()}
                    showAuthor
                    showAvatar
                    selectable
                    onSelect={onSelect}
                />
            );
            const bubble = screen.getByRole('button');

            fireEvent.click(bubble);
            fireEvent.keyDown(bubble, { key: 'Enter' });
            fireEvent.keyDown(bubble, { key: ' ' });
            expect(onSelect).toHaveBeenCalledTimes(3);
        });

        it('exposes no button role and ignores clicks when not selectable', () => {
            const onSelect = vi.fn();
            render(
                <MessageRow
                    message={message()}
                    showAuthor
                    showAvatar
                    selectable={false}
                    onSelect={onSelect}
                />
            );
            expect(screen.queryByRole('button')).toBeNull();
            fireEvent.click(screen.getByText('hello'));
            expect(onSelect).not.toHaveBeenCalled();
        });
    });

    it('marks a merged bubble so the data problem is visible, not silent', () => {
        render(
            <MessageRow
                message={message({ merged: true })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        expect(screen.getByText('merged')).toBeInTheDocument();
    });

    it('shows the timestamp and badge when present', () => {
        render(
            <MessageRow
                message={message({ tsText: '09:41', badge: 'urgent' })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        expect(screen.getByText('09:41')).toBeInTheDocument();
        expect(screen.getByText('urgent')).toBeInTheDocument();
    });
});
