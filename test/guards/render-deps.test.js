import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The object renders from one big effect, and nebula re-runs it only when something in its
 * dependency list changes. State the object holds itself — a reader's text size, the window of
 * conversations, the whole-conversations toggle — changes nothing the engine reports, so a piece of
 * state left out of that list is a button that does nothing at all, silently and only in Sense.
 */
const source = readFileSync(resolve(process.cwd(), 'src/index.js'), 'utf8');

/** The dependency array of the render effect: the last `}, [ … ]);` in the file's component. */
function renderDeps() {
    const closings = [...source.matchAll(/\n\s*\}, \[([^\]]*)\]\);/g)];
    // The render effect is the one whose list names the element it renders into.
    const match = closings.find(([, list]) => /\belement\b/.test(list));
    return match ? match[1] : null;
}

describe('the render effect depends on every piece of state the object holds', () => {
    it('lists each useState value in its dependency array', () => {
        const deps = renderDeps();
        expect(deps, 'the render effect was not found').not.toBeNull();
        const names = [...source.matchAll(/const \[(\w+), set\w+\] = useState\(/g)].map(
            (m) => m[1]
        );
        expect(names.length).toBeGreaterThan(3);
        for (const name of names) {
            expect(
                new RegExp(`(^|[\\s,])${name}([\\s,]|$)`).test(deps),
                `${name} is held by the object but is not a dependency of the render effect`
            ).toBe(true);
        }
    });
});
