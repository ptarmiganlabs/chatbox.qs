import { describe, it, expect, afterEach } from 'vitest';
import { routeClick } from '../../src/ui/click-route';

/** A bubble with a body text and a link, attached to the document so selections work. */
function bubble() {
    const container = document.createElement('div');
    container.innerHTML = '<div class="body">Call Ada <a href="https://x.se">here</a> now</div>';
    document.body.append(container);
    return container;
}

/** Select characters of a text node, as a mouse drag would. */
function selectText(node, start, end) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

afterEach(() => {
    document.getSelection().removeAllRanges();
    document.body.replaceChildren();
});

describe('routeClick', () => {
    it('is for the bubble when the reader simply clicks it', () => {
        const container = bubble();
        const body = container.querySelector('.body');
        expect(routeClick({ currentTarget: container, target: body })).toEqual({
            kind: 'container',
        });
    });

    it('is for nothing when the click ends a text selection inside the bubble', () => {
        const container = bubble();
        const body = container.querySelector('.body');
        selectText(body.firstChild, 5, 8);
        expect(routeClick({ currentTarget: container, target: body })).toEqual({ kind: 'none' });
    });

    it('is for the bubble when the selection is only a caret, or lies elsewhere', () => {
        const container = bubble();
        const body = container.querySelector('.body');
        selectText(body.firstChild, 5, 5);
        expect(routeClick({ currentTarget: container, target: body }).kind).toBe('container');

        const elsewhere = document.createElement('p');
        elsewhere.textContent = 'another object';
        document.body.append(elsewhere);
        selectText(elsewhere.firstChild, 0, 7);
        expect(routeClick({ currentTarget: container, target: body }).kind).toBe('container');
    });

    it('is for nothing when the click lands on a link, which opens on its own', () => {
        const container = bubble();
        const link = container.querySelector('a');
        expect(routeClick({ currentTarget: container, target: link }).kind).toBe('none');
    });

    it('is for the bubble without a container to judge by', () => {
        expect(routeClick({}).kind).toBe('container');
        expect(routeClick(undefined).kind).toBe('container');
    });
});

describe('routeClick on highlights', () => {
    /** A bubble with a highlight, and one inside a link. */
    function marked() {
        const container = document.createElement('div');
        container.innerHTML =
            '<div class="body">Run <mark data-h="2">reload</mark> or ' +
            '<a href="https://x.se"><mark data-h="3">task</mark></a></div>';
        document.body.append(container);
        return container;
    }

    it('is for the highlight while clicking selects, toggling with Ctrl or Cmd', () => {
        const container = marked();
        const mark = container.querySelector('mark[data-h="2"]');
        expect(routeClick({ currentTarget: container, target: mark }, 'select')).toEqual({
            kind: 'highlight',
            ordinal: 2,
            toggle: false,
        });
        expect(
            routeClick({ currentTarget: container, target: mark, ctrlKey: true }, 'select').toggle
        ).toBe(true);
        expect(
            routeClick({ currentTarget: container, target: mark, metaKey: true }, 'select').toggle
        ).toBe(true);
    });

    it('is still the highlight’s click on a locked field, so the reader can be told why', () => {
        const container = marked();
        const mark = container.querySelector('mark[data-h="2"]');
        expect(routeClick({ currentTarget: container, target: mark }, 'locked').kind).toBe(
            'highlight'
        );
    });

    it('is for the bubble while clicking a highlight does not select', () => {
        const container = marked();
        const mark = container.querySelector('mark[data-h="2"]');
        expect(routeClick({ currentTarget: container, target: mark }, null).kind).toBe('container');
    });

    it('leaves a highlight inside a link to the link', () => {
        const container = marked();
        const mark = container.querySelector('mark[data-h="3"]');
        expect(routeClick({ currentTarget: container, target: mark }, 'select').kind).toBe('none');
    });
});
