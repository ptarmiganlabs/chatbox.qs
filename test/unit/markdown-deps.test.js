import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The markdown projection parses bodies with the same processor react-markdown builds. If a
// dependency bump split them into two copies of different majors, the projection and the rendered
// body could disagree, and marks would silently stop being drawn.
const read = (path) => JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8'));
const major = (range) => /\d+/.exec(String(range))?.[0];

describe('markdown pipeline dependencies', () => {
    const pkg = read('package.json');
    const reactMarkdown = read('node_modules/react-markdown/package.json');
    const lock = read('package-lock.json');

    it.each(['unified', 'remark-parse', 'remark-rehype'])(
        'declares %s at the major react-markdown uses',
        (name) => {
            expect(pkg.dependencies[name], name).toBeTruthy();
            expect(major(pkg.dependencies[name])).toBe(major(reactMarkdown.dependencies[name]));
        }
    );

    it('resolves a single copy of each, shared with react-markdown', () => {
        for (const name of ['unified', 'remark-parse', 'remark-rehype']) {
            expect(
                lock.packages[`node_modules/react-markdown/node_modules/${name}`],
                name
            ).toBeUndefined();
            expect(lock.packages[`node_modules/${name}`], name).toBeTruthy();
        }
    });
});
