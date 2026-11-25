import { describe, it, expect, vi } from 'vitest';
import { createValueMatcher, prepareText } from '../../../src/match/index';
import {
    BLOCK_SEPARATOR as SEP,
    createProjections,
    isPlainText,
    projectByParsing,
    projectMarkdown,
    walkProjection,
} from '../../../src/highlight/markdown-projection';

describe('projectMarkdown', () => {
    it.each([
        ['Ada **Love**lace', 'Ada Lovelace'],
        ['first\n\nsecond', `first${SEP}second`],
        ['- reload\n- task', `reload${SEP}task`],
        ['- [x] done task\n- item', `done task${SEP}item`],
        ['| a | b |\n|---|---|\n| New | York |', `a${SEP}b${SEP}New${SEP}York`],
        ['```\ncode block\n```\n\nx `inline` y', `code block\n${SEP}x inline y`],
        ['line one  \nline two', 'line one\nline two'],
        ['a <b>raw</b> &amp; \\*x\\*', 'a <b>raw</b> & *x*'],
        ['<div>block</div>\n\nAfter', `<div>block</div>\n${SEP}After`],
        ['![alt text](https://i.png) img', ' img'],
        ['Note[^1] here\n\n[^1]: The foot.', `Note here${SEP}The foot. `],
        ['See https://x.se/y and [link](https://a.b)', 'See https://x.se/y and link'],
        ['# Heading\n\n> quoted', `Heading${SEP}quoted`],
        ['', ''],
    ])('projects %j as the text it renders', (body, projection) => {
        expect(projectMarkdown(body)).toBe(projection);
    });

    it('never lets a whole value match from one block into the next', () => {
        const options = { caseSensitive: false, wholeValues: true, flexibleWhitespace: true };
        const matcher = createValueMatcher([{ value: 'New York' }], options);
        const across = prepareText(projectMarkdown('- New\n- York'), options);
        const within = prepareText(projectMarkdown('- **New** York'), options);
        expect(matcher.match(across).matches).toEqual([]);
        expect(matcher.match(within).matches).toHaveLength(1);
    });
});

describe('isPlainText — the bodies that need no parsing', () => {
    /** A small seeded generator, so a failure names a body that fails again. */
    function seeded(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    it.each([
        'the reload failed again',
        'Göran: shall we restart the service at 02:00?',
        'See www.example.com or mail ada@example.se, or https://x.se/a?b=1',
        'it costs $5 (or 50%) — "really", she said; 3 + 4 = 7',
        'a  double  space and a # mid-line and a - dash',
        'emoji 😀 and accents åäö é',
    ])('takes %j for plain text', (body) => {
        expect(isPlainText(body)).toBe(true);
        expect(projectByParsing(body)).toBe(body);
        expect(projectMarkdown(body)).toBe(body);
    });

    it.each([
        ['**bold**', 'emphasis'],
        ['snake_case', 'underscore emphasis'],
        ['`code`', 'code'],
        ['~~struck~~', 'strikethrough'],
        ['[link](https://a.b)', 'a link'],
        ['![img](https://a.b)', 'an image'],
        ['a <b>tag</b>', 'raw HTML'],
        ['fish &amp; chips', 'an entity'],
        ['a \\* b', 'an escape'],
        ['a | b', 'a table cell'],
        ['1. first', 'an ordered list'],
        ['2026 was a year', 'a leading digit'],
        ['# heading', 'a heading'],
        ['> quote', 'a quote'],
        ['- item', 'a list'],
        ['+ item', 'a list'],
        ['=== under', 'a setext underline'],
        ['two\nlines', 'a line break'],
        [' leading', 'leading whitespace'],
        ['trailing ', 'trailing whitespace'],
        ['a\tb', 'a tab'],
        ['a b', 'a non-breaking space'],
        ['a\u0000b', 'NUL, which the parser replaces'],
        ['', 'nothing'],
    ])('parses %j, which holds %s', (body) => {
        expect(isPlainText(body)).toBe(false);
        expect(projectMarkdown(body)).toBe(projectByParsing(body));
    });

    it('agrees with the parser on every body it lets through', () => {
        // Mostly the characters chat text is made of, with every character the test turns down mixed in,
        // so the bodies let through sit right next to the ones that are not.
        const plain =
            'abcdefghijklmnopqrstuvwxyzåäöé ABC 0123456789.,;:?()"\'/@%$^{}#-+=€😀www.http://x.se';
        const risky = '*_`~[]!<>&\\|\n\t \u0000';
        const random = seeded(61);
        let through = 0;
        for (let n = 0; n < 4000; n++) {
            const length = 1 + Math.floor(random() * 60);
            let body = '';
            for (let i = 0; i < length; i++) {
                const pool = random() < 0.97 ? plain : risky;
                body += pool[Math.floor(random() * pool.length)];
            }
            if (!isPlainText(body)) continue;
            through += 1;
            expect(projectByParsing(body), JSON.stringify(body)).toBe(body);
        }
        // Not a vacuous pass: most bodies of chat-like text take the fast path.
        expect(through).toBeGreaterThan(1000);
    });

    it('projects 20,000 plain bodies in a time a first search can afford', () => {
        // Parsing them took 1.4 seconds on Node 24; the fast path takes a few milliseconds.
        const bodies = Array.from({ length: 20_000 }, (_, i) => `message ${i} about the reload`);
        const started = performance.now();
        for (const body of bodies) projectMarkdown(body);
        expect(performance.now() - started).toBeLessThan(200);
    });
});

describe('walkProjection', () => {
    it('reports where each text node sits, and whether it is inside a link that opens', () => {
        const tree = {
            type: 'root',
            children: [
                {
                    type: 'element',
                    tagName: 'p',
                    properties: {},
                    children: [
                        { type: 'text', value: 'See ' },
                        {
                            type: 'element',
                            tagName: 'a',
                            properties: { href: 'https://x.se' },
                            children: [{ type: 'text', value: 'here' }],
                        },
                        {
                            type: 'element',
                            tagName: 'a',
                            properties: { href: 'javascript:alert(1)' },
                            children: [{ type: 'text', value: 'there' }],
                        },
                    ],
                },
            ],
        };
        const segments = [];
        expect(walkProjection(tree, (segment) => segments.push(segment))).toBe('See herethere');
        expect(segments.map((s) => [s.start, s.end, s.inLink, s.index])).toEqual([
            [0, 4, false, 0],
            [4, 8, true, 0],
            [8, 13, false, 0],
        ]);
    });
});

describe('createProjections', () => {
    it('works a body out once', () => {
        const project = vi.fn((body) => body.toUpperCase());
        const projections = createProjections({ project });
        expect(projections.get('a')).toBe('A');
        expect(projections.get('a')).toBe('A');
        expect(projections.get('b')).toBe('B');
        expect(project).toHaveBeenCalledTimes(2);
    });
});
