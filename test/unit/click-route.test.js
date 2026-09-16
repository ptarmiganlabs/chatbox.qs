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
