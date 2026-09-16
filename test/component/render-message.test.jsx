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

describe('MessageRow — merged and excluded regressions', () => {
    it('explains a merged bubble instead of rendering a bare dash', () => {
        render(
            <MessageRow
                message={message({ body: '', merged: true, rowCount: 2 })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        expect(screen.getByText(/2 messages share this Message ID/)).toBeInTheDocument();
        expect(screen.getByText('Concat()')).toBeInTheDocument();
    });

    it('dims ALTERNATIVE state, not only excluded', () => {
        // Native Sense charts grey both 'X' (excluded) and 'A' (alternative).
        const { container: excluded } = render(
            <MessageRow
                message={message({ state: 'X' })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        const { container: alternative } = render(
            <MessageRow
                message={message({ state: 'A' })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        const dimClass = [...excluded.querySelectorAll('[class]')]
            .map((el) => el.className)
            .find((c) => c.includes('dimmed'));
        expect(dimClass).toBeTruthy();
        expect(
            [...alternative.querySelectorAll('[class]')].some((el) =>
                el.className.includes('dimmed')
            )
        ).toBe(true);
    });

    it('does not dim an ordinary optional value', () => {
        const { container } = render(
            <MessageRow
                message={message({ state: 'O' })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        expect(
            [...container.querySelectorAll('[class]')].some((el) => el.className.includes('dimmed'))
        ).toBe(false);
    });
});

describe('MessageRow — shared message ids', () => {
    it('flags a bubble whose id belongs to a different message too', () => {
        render(
            <MessageRow
                message={message({ idConflict: true })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        const badge = screen.getByText('shared id');
        expect(badge).toHaveAttribute('title', 'A different message has the same Message ID');
    });

    it('shows no such badge on an ordinary bubble', () => {
        render(<MessageRow message={message()} showAuthor showAvatar selectable={false} />);
        expect(screen.queryByText('shared id')).not.toBeInTheDocument();
    });
});

describe('MessageRow — recipients', () => {
    const to = (...names) => names.map((name) => ({ key: name, label: name, unknown: false }));

    it('names the recipients after the author, with the arrow hidden from screen readers', () => {
        const { container } = render(
            <MessageRow
                message={message({ recipients: to('Bob', 'Cy') })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        // The author still matches on its own.
        expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
        expect(screen.getByText('Bob, Cy')).toBeInTheDocument();
        expect(screen.getByText('→').getAttribute('aria-hidden')).toBe('true');
        expect(container.textContent).toContain('to');
    });

    it('counts the recipients of a group message', () => {
        render(
            <MessageRow
                message={message({ recipients: to('Bob', 'Cy', 'Dan', 'Eve') })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        expect(screen.getByText('4 recipients')).toBeInTheDocument();
        expect(screen.getByText('Bob, Cy, Dan and 1 more')).toBeInTheDocument();
    });

    it('shows no count for a one-to-one message', () => {
        render(
            <MessageRow
                message={message({ recipients: to('Bob') })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        expect(screen.queryByText(/recipients/)).not.toBeInTheDocument();
    });

    it('renders a recipient name that looks like markup as text', () => {
        const evil = '<img src=x onerror="alert(1)">';
        const { container } = render(
            <MessageRow
                message={message({ recipients: to(evil) })}
                showAuthor
                showAvatar
                selectable={false}
            />
        );
        expect(screen.getByText(evil)).toBeInTheDocument();
        expect(container.querySelector('img[src="x"]')).toBeNull();
    });

    it('shows no arrow in the participant model', () => {
        render(<MessageRow message={message()} showAuthor showAvatar selectable={false} />);
        expect(screen.queryByText('→')).not.toBeInTheDocument();
    });
});

describe('MessageRow — selectable text', () => {
    it('does not act on the message when a click ends a text selection in it', () => {
        const onSelect = vi.fn();
        render(
            <MessageRow message={message()} showAuthor showAvatar selectable onSelect={onSelect} />
        );
        const body = screen.getByText('hello');
        const range = document.createRange();
        range.setStart(body.firstChild, 0);
        range.setEnd(body.firstChild, 4);
        document.getSelection().removeAllRanges();
        document.getSelection().addRange(range);

        fireEvent.click(body);
        expect(onSelect).not.toHaveBeenCalled();

        document.getSelection().removeAllRanges();
        fireEvent.click(body);
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('lets a link in a markdown body open without also acting on the message', () => {
        const onSelect = vi.fn();
        render(
            <MessageRow
                message={message({
                    body: 'See [the order](https://x.se/1)',
                    bodyFormat: 'markdown',
                })}
                showAuthor
                showAvatar
                selectable
                onSelect={onSelect}
            />
        );
        fireEvent.click(screen.getByRole('link', { name: 'the order' }));
        expect(onSelect).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText(/See/));
        expect(onSelect).toHaveBeenCalledTimes(1);
    });
});
