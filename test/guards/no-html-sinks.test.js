import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * No source file may reach an API that parses a string as HTML.
 *
 * chatbox.qs renders field values — message bodies, names, highlight values, category names — that
 * come straight from the data model, so every node is a React child or an attribute. No sink may appear
 * at all, which is why the scan does not strip comments: a comment stripper also cuts every line after
 * "//" inside a URL string, and a sink hidden behind one would go unseen. Source comments say "HTML
 * sink" rather than naming the property.
 *
 * Ported from textview.qs test/guards/no-html-sinks.test.js at df84a5e; it also scans .jsx files and
 * knows React's own sink.
 */

const REPO_ROOT = resolve(process.cwd());
const SRC_ROOT = join(REPO_ROOT, 'src');

/** Every API that turns a string into markup or script. */
const SINKS = [
    /\binnerHTML\b/,
    /\bdangerouslySetInnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bcreateContextualFragment\b/,
    /\bsetHTMLUnsafe\b/,
    /\bparseFromString\b/,
    /\bsrcdoc\b/,
    /\bdocument\s*\.\s*write(ln)?\s*\(/,
    /\bnew\s+Function\s*\(/,
    /\beval\s*\(/,
];

/**
 * List every sink mentioned in a piece of source.
 *
 * @param {string} source - JavaScript source.
 * @returns {string[]} "line N: pattern" for each hit.
 */
function findSinks(source) {
    const hits = [];
    source.split('\n').forEach((line, index) => {
        for (const sink of SINKS) {
            if (sink.test(line)) hits.push(`line ${index + 1}: ${sink.source}`);
        }
    });
    return hits;
}

/**
 * Recursively collect every .js and .jsx file under a directory.
 *
 * @param {string} dir - Directory to walk.
 * @returns {string[]} Absolute paths.
 */
function sourceFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) files.push(...sourceFiles(full));
        else if (/\.jsx?$/.test(entry.name)) files.push(full);
    }
    return files;
}

describe('no value reaches an HTML sink', () => {
    const files = sourceFiles(SRC_ROOT);

    it('finds source files to check, React components included', () => {
        // Otherwise a wrong root would leave this guard permanently green.
        expect(files.length).toBeGreaterThan(20);
        expect(files.some((file) => file.endsWith('.jsx'))).toBe(true);
    });

    it('no file in src/ names an HTML-parsing API', () => {
        const offenders = files.flatMap((file) =>
            findSinks(readFileSync(file, 'utf8')).map(
                (hit) => `${relative(REPO_ROOT, file)} ${hit}`
            )
        );
        expect(offenders, 'Render text as React children instead.').toEqual([]);
    });
});

describe('guard self-check', () => {
    it.each([
        ['el.innerHTML = value;'],
        ['<div dangerouslySetInnerHTML={{ __html: body }} />'],
        ["el['outerHTML'] = x;"],
        ['Object.assign(el, { innerHTML: x });'],
        ['el.insertAdjacentHTML("beforeend", x);'],
        ['range.createContextualFragment(x);'],
        ['el.setHTMLUnsafe(x);'],
        ['new DOMParser().parseFromString(x, "text/html");'],
        ['frame.srcdoc = x;'],
        ['document.write(x);'],
        ['document . writeln(x);'],
        ['const f = new Function(code);'],
        ['eval(code);'],
    ])('flags %s', (sample) => {
        expect(findSinks(sample).length).toBeGreaterThan(0);
    });

    it('sees a sink hidden after a URL on the same line', () => {
        // The reason comments are not stripped before scanning.
        expect(findSinks("const u = 'https://x'; el.innerHTML = y;")).toHaveLength(1);
    });

    it('does not flag textContent, attributes or look-alike identifiers', () => {
        expect(findSinks('el.textContent = `${x}`; el.setAttribute("title", x);')).toEqual([]);
        expect(findSinks('const innerHTMLish = 1; evaluate(x); retrieval();')).toEqual([]);
    });
});
