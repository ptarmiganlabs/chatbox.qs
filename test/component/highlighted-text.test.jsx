import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import HighlightedText from '../../src/ui/HighlightedText';
import BubbleBody from '../../src/ui/BubbleBody';
import { categoryStyles } from '../../src/highlight/category-styles';
import { createDescriber } from '../../src/highlight/marks';

const span = (start, end, values = ['v'], categories = []) => ({ start, end, values, categories });

describe('HighlightedText', () => {
    it('keeps a highlighted value that looks like markup as text', () => {
        const text = 'see <img src=x onerror="alert(1)"> now';
        const { container } = render(
            <div>
                <HighlightedText text={text} highlights={[span(4, 34, ['<img …>'])]} />
            </div>
        );
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('mark').textContent).toBe('<img src=x onerror="alert(1)">');
        expect(container.textContent).toBe(text);
    });

    it('keeps the text exactly, whitespace and line breaks included', () => {
        const text = 'Call 070-123\n45 67  today';
        const { container } = render(
            <div>
                <HighlightedText text={text} highlights={[span(5, 18, ['070-123 45 67'])]} />
            </div>
        );
        expect(container.textContent).toBe(text);
        expect(container.querySelector('mark').textContent).toBe('070-123\n45 67');
    });

    it('marks a search match inside a highlight, opening the highlight where it is cut', () => {
        const { container } = render(
            <div>
                <HighlightedText
                    text="New York City"
                    highlights={[span(0, 8, ['New York'])]}
                    finds={[span(4, 13)]}
                    current={{ kind: 'find', ordinal: 0 }}
                />
            </div>
        );
        const marks = [...container.querySelectorAll('mark')];
        expect(marks.map((m) => m.textContent)).toEqual(['New ', 'York', ' City']);
        expect(marks[0].hasAttribute('data-cut-end')).toBe(true);
        expect(marks[1].hasAttribute('data-cut-start')).toBe(true);
        expect(marks[1].getAttribute('data-h')).toBe('0');
        expect(marks[2].hasAttribute('data-h')).toBe(false);
        expect(marks[1].className).toMatch(/find/);
        expect(marks[1].className).toMatch(/markCurrent/);
    });

    it('titles and colours a highlight by its categories, labelling only its last piece', () => {
        const styles = categoryStyles({
            categories: { problem: null, list: [{ name: 'city', elemNumber: 0, color: null }] },
            palette: ['#4477aa', '#ee6677', '#228833', '#ccbb44'],
        });
        const { container } = render(
            <div>
                <HighlightedText
                    text="New York"
                    highlights={[span(0, 8, ['New York'], ['city'])]}
                    finds={[span(0, 3)]}
                    describe={createDescriber({ styles })}
                />
            </div>
        );
        const marks = [...container.querySelectorAll('mark')];
        expect(marks.map((m) => m.getAttribute('data-label'))).toEqual([null, 'city']);
        expect(marks[1].getAttribute('title')).toBe('New York · city');
        expect(marks[1].style.getPropertyValue('--cqs-mark-fill')).toMatch(/^rgba\(/);
    });

    it('renders plain text when there is nothing to mark', () => {
        const { container } = render(
            <div>
                <HighlightedText text="plain" />
            </div>
        );
        expect(container.innerHTML).toBe('<div>plain</div>');
    });
});

describe('BubbleBody with highlights', () => {
    it('marks a plain-text body, and renders the same DOM as before without highlights', () => {
        const { container: plain } = render(<BubbleBody body="reload now" format="text" />);
        const { container: none } = render(
            <BubbleBody body="reload now" format="text" highlights={{ spans: [] }} />
        );
        expect(none.innerHTML).toBe(plain.innerHTML);

        const { container } = render(
            <BubbleBody
                body="reload now"
                format="text"
                highlights={{ spans: [span(0, 6, ['reload'])] }}
                drawn={1}
            />
        );
        expect(container.querySelector('mark').textContent).toBe('reload');
        expect(container.textContent).toBe('reload now');
    });
});
