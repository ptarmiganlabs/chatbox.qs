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
