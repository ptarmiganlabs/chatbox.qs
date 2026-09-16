import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BubbleBody from '../../src/ui/BubbleBody';
import { categoryStyles } from '../../src/highlight/category-styles';
import { createConversationHighlighter } from '../../src/highlight/conversation-highlights';
import { createDescriber } from '../../src/highlight/marks';

const OPTIONS = { caseSensitive: false, wholeValues: true, flexibleWhitespace: true };

/** Highlight one markdown body the way the conversation highlighter does. */
function highlightsOf(body, rows) {
    const result = createConversationHighlighter().highlight({
        messages: [{ id: '1', key: '1', body, bodyFormat: 'markdown' }],
        rows,
        options: OPTIONS,
    });
    return result.byMessage[0];
}

/** Render a markdown body with its highlights. */
function renderBody(body, rows, extra = {}) {
    const highlights = highlightsOf(body, rows);
    return render(
        <BubbleBody
            body={body}
            format="markdown"
            highlights={highlights}
            drawn={highlights.spans.length}
            {...extra}
        />
    );
}

describe('BubbleBody markdown with highlights', () => {
    it('marks a value across bold as one highlight in two pieces, labelled once', () => {
        const styles = categoryStyles({
            categories: { problem: null, list: [{ name: 'city', elemNumber: 0, color: null }] },
            palette: ['#4477aa', '#ee6677', '#228833', '#ccbb44'],
        });
        const { container } = renderBody(
            'We flew to **New** York',
            [{ value: 'New York', category: 'city' }],
            {
                describe: createDescriber({ styles }),
            }
        );
        const marks = [...container.querySelectorAll('mark')];
        expect(marks.map((m) => m.textContent)).toEqual(['New', ' York']);
        expect(marks.map((m) => m.getAttribute('data-h'))).toEqual(['0', '0']);
        expect(marks[0].hasAttribute('data-cut-end')).toBe(true);
        expect(marks[1].hasAttribute('data-cut-start')).toBe(true);
        expect(marks.map((m) => m.getAttribute('data-label'))).toEqual([null, 'city']);
        // The formatting stays: the first piece is still bold.
        expect(container.querySelector('strong mark')).toBe(marks[0]);
    });

    it('never marks a value across two paragraphs or list items', () => {
        const { container } = renderBody('- New\n- York', [{ value: 'New York', category: null }]);
        expect(container.querySelector('mark')).toBeNull();
    });

    it('marks values in links, code and tables, and flags the ones inside a link', () => {
        const body = 'Mail [reload](https://x.se) or run `reload`\n\n| a |\n|---|\n| reload |';
        const { container } = renderBody(body, [{ value: 'reload', category: null }]);
        const marks = [...container.querySelectorAll('mark')];
        expect(marks).toHaveLength(3);
        expect(marks[0].closest('a')).not.toBeNull();
        expect(marks[0].hasAttribute('data-link')).toBe(true);
        expect(marks[1].closest('code')).not.toBeNull();
        expect(marks[1].hasAttribute('data-link')).toBe(false);
        expect(marks[2].closest('td')).not.toBeNull();
    });

    it('keeps raw HTML text, marks and all, never markup', () => {
        const { container } = renderBody('a <b>reload</b> <img src=x onerror=alert(1)>', [
            { value: 'reload', category: null },
        ]);
        expect(container.querySelector('b')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('mark').textContent).toBe('reload');
        expect(container.textContent).toBe('a <b>reload</b> <img src=x onerror=alert(1)>');
    });

    it('renders the same DOM as before when there is nothing to mark', () => {
        const body = 'Some **bold** text and a [link](https://x.se)';
        const { container: before } = render(<BubbleBody body={body} format="markdown" />);
        const { container: none } = renderBody(body, [{ value: 'absent', category: null }]);
        expect(none.innerHTML).toBe(before.innerHTML);
    });

    it('draws nothing when the text it would mark is not the text the marks were found in', () => {
        const highlights = highlightsOf('reload now', [{ value: 'reload', category: null }]);
        const { container } = render(
            <BubbleBody
                body="something else entirely"
                format="markdown"
                highlights={highlights}
                drawn={highlights.spans.length}
            />
        );
        expect(container.querySelector('mark')).toBeNull();
    });

    it.each([
        ['plain words about a reload task', 2],
        ['**reload** the _task_, then `reload`', 3],
        ['- reload\n- task\n\n> reload', 3],
        ['| reload | task |\n|---|---|\n| task | reload |', 4],
        ['Note[^1] about reload\n\n[^1]: The task.', 2],
        ['![reload](https://i.png) task <b>reload</b>', 2],
    ])('draws exactly the highlights it counted in %j', (body, count) => {
        const rows = [
            { value: 'reload', category: null },
            { value: 'task', category: null },
        ];
        const highlights = highlightsOf(body, rows);
        expect(highlights.spans).toHaveLength(count);
        const { container } = renderBody(body, rows);
        const ordinals = new Set(
            [...container.querySelectorAll('mark')].map((m) => m.getAttribute('data-h'))
        );
        expect(ordinals.size).toBe(count);
    });
});
