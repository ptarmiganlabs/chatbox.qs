import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BubbleBody from '../../src/ui/BubbleBody';

describe('BubbleBody plain text', () => {
    it('renders text as text', () => {
        render(<BubbleBody body="Morning — did the reload finish?" format="text" />);
        expect(screen.getByText('Morning — did the reload finish?')).toBeInTheDocument();
    });

    it('does NOT interpret markdown when the format is text', () => {
        // Qlik field values routinely contain * and _ as ordinary characters —
        // shell commands, file paths, snake_case identifiers.
        const raw = 'run *_test_* and check file_name_here';
        const { container } = render(<BubbleBody body={raw} format="text" />);
        expect(screen.getByText(raw)).toBeInTheDocument();
        expect(container.querySelector('em')).toBeNull();
        expect(container.querySelector('strong')).toBeNull();
    });

    it('does not interpret HTML either', () => {
        const evil = '<img src=x onerror="alert(1)">';
        const { container } = render(<BubbleBody body={evil} format="text" />);
        expect(screen.getByText(evil)).toBeInTheDocument();
        expect(container.querySelector('img')).toBeNull();
    });
});

describe('BubbleBody markdown', () => {
    it('renders emphasis, lists and code', () => {
        const { container } = render(
            <BubbleBody body={'**bold** and `code`\n\n- one\n- two'} format="markdown" />
        );
        expect(container.querySelector('strong')).toBeTruthy();
        expect(container.querySelector('code')).toBeTruthy();
        expect(container.querySelectorAll('li')).toHaveLength(2);
    });

    it('renders GFM tables and strikethrough', () => {
        const { container } = render(
            <BubbleBody body={'| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~'} format="markdown" />
        );
        expect(container.querySelector('table')).toBeTruthy();
        expect(container.querySelector('del')).toBeTruthy();
    });

    describe('raw HTML is never parsed', () => {
        it('renders an HTML tag in markdown as literal text', () => {
            // No rehype-raw, so there is no HTML path at all — which is what
            // makes markdown safe here without shipping a sanitizer.
            const { container } = render(
                <BubbleBody body={'<img src=x onerror="alert(1)">'} format="markdown" />
            );
            expect(container.querySelector('img')).toBeNull();
            expect(container.textContent).toContain('<img');
        });

        it('does not execute a script tag', () => {
            const { container } = render(
                <BubbleBody body={'<script>alert(1)</script>'} format="markdown" />
            );
            expect(container.querySelector('script')).toBeNull();
        });
    });

    describe('links', () => {
        it('opens http(s) links safely in a new tab', () => {
            const { container } = render(
                <BubbleBody body="[docs](https://example.com/x)" format="markdown" />
            );
            const a = container.querySelector('a');
            expect(a).toHaveAttribute('href', 'https://example.com/x');
            expect(a).toHaveAttribute('rel', expect.stringContaining('noopener'));
            expect(a).toHaveAttribute('target', '_blank');
        });

        it('STRIPS a javascript: link target', () => {
            // An extension runs on the hub's own origin inside the user's
            // authenticated session, so a navigable javascript: URL in message
            // data is a genuine session-stealing vector.
            const { container } = render(
                <BubbleBody body="[click](javascript:alert(1))" format="markdown" />
            );
            const a = container.querySelector('a');
            expect(a).toBeTruthy();
            expect(a.getAttribute('href')).toBeNull();
            expect(container.textContent).toContain('click');
        });

        it('strips other non-http schemes', () => {
            for (const url of ['vbscript:msgbox(1)', 'data:text/html,<script>1</script>']) {
                const { container } = render(<BubbleBody body={`[x](${url})`} format="markdown" />);
                expect(container.querySelector('a').getAttribute('href')).toBeNull();
            }
        });
    });
});
