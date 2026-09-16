import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards on the stylesheet, which no component test can see: jsdom applies no CSS.
const css = readFileSync(resolve(process.cwd(), 'src/ui/chat.module.css'), 'utf8');

/** The declarations of the first rule whose selector list contains every given selector. */
function declarationsOf(...selectors) {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g);
    for (const [, selectorList, body] of rules) {
        const listed = selectorList.split(',').map((s) => s.trim());
        if (selectors.every((selector) => listed.includes(selector))) return body;
    }
    return null;
}

describe('selectable message text', () => {
    it('switches text selection back on for bodies, detail quotes and names', () => {
        // The Qlik Sense client sets user-select: none on every element (textview.qs GOTCHAS 14).
        const body = declarationsOf(
            '.root .body',
            '.root .body *',
            '.root .detailQuote',
            '.root .detailQuote *',
            '.root .author',
            '.root .author *'
        );
        expect(body).not.toBeNull();
        expect(body).toMatch(/(^|;|\s)user-select:\s*text/);
        expect(body).toMatch(/-webkit-user-select:\s*text/);
    });
});

describe('highlights in the stylesheet', () => {
    it('never lets a category label be selected or copied with the text', () => {
        const label = declarationsOf(".root[data-labels='true'] .mark[data-label]::after");
        expect(label).not.toBeNull();
        expect(label).toMatch(/content:\s*attr\(data-label\)/);
        expect(label).toMatch(/(^|;|\s)user-select:\s*none/);
    });

    it('repeats a highlight’s tint on every line of a value that wraps', () => {
        const mark = declarationsOf('.mark');
        expect(mark).toMatch(/(^|;|\s)box-decoration-break:\s*clone/);
        expect(mark).toMatch(/-webkit-box-decoration-break:\s*clone/);
    });

    it('keeps the bar from being squeezed to nothing by a long conversation', () => {
        expect(declarationsOf('.bar')).toMatch(/flex:\s*none/);
    });

    it('uses no color-mix(), which the browser that renders exports may not know', () => {
        // Comments may name it; rules may not.
        expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/color-mix\(/);
    });
});
