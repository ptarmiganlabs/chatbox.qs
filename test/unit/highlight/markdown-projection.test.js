import { describe, it, expect, vi } from 'vitest';
import { createValueMatcher, prepareText } from '../../../src/match/index';
import {
    BLOCK_SEPARATOR as SEP,
    createProjections,
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
