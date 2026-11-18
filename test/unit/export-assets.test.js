import { describe, it, expect, vi } from 'vitest';
import {
    avatarUrls,
    cssString,
    facesFromFiles,
    fontFaceCss,
    fontFamilies,
    inlineAvatars,
} from '../../src/export/export-assets';

const SENSE_FONTS = [
    'https://sense.example/resources/qmfe/frontend-assets/1.70.1/fonts/SourceSansPro-Regular.woff',
    'https://sense.example/resources/qmfe/frontend-assets/1.70.1/fonts/SourceSansPro-SemiBold.woff',
    'https://sense.example/resources/qmfe/frontend-assets/1.70.1/fonts/SourceSansPro-SemiBoldItalic.woff',
    'https://sense.example/resources/qmfe/frontend-assets/1.70.1/fonts/SourceCodePro-Regular.ttf',
    'https://sense.example/resources/qmfe/frontend-assets/1.70.1/fonts/qlikview-sans-bold.woff',
    'https://sense.example/resources/qmfe/frontend-assets/1.70.1/fonts/lui-icons.woff',
    'https://sense.example/resources/assets/app.js',
];

describe('finding the theme font', () => {
    it('reads the families a font-family names', () => {
        expect(fontFamilies('\'QlikView Sans\', "Segoe UI", sans-serif')).toEqual([
            'qlikview sans',
            'segoe ui',
            'sans-serif',
        ]);
        expect(fontFamilies(undefined)).toEqual([]);
    });

    it('finds the font files Sense loaded from script, with weight and style from their names', () => {
        const faces = facesFromFiles(SENSE_FONTS, ['source sans pro', 'sans-serif']);
        expect(faces.map((face) => [face.weight, face.style, face.sources[0].format])).toEqual([
            ['400', 'normal', 'woff'],
            ['600', 'normal', 'woff'],
            ['600', 'italic', 'woff'],
        ]);
        expect(faces.every((face) => face.family === 'source sans pro')).toBe(true);
    });

    it('tells semibold from bold, and a family from one that only starts like it', () => {
        expect(facesFromFiles(SENSE_FONTS, ['qlikview sans'])[0].weight).toBe('700');
        expect(facesFromFiles(SENSE_FONTS, ['source code pro'])[0].sources[0].format).toBe(
            'truetype'
        );
        expect(facesFromFiles(SENSE_FONTS, ['lui'])).toHaveLength(1);
        expect(facesFromFiles(SENSE_FONTS, ['ui'])).toHaveLength(0);
    });

    it('writes the faces as rules, by address or inlined', async () => {
        const [face] = facesFromFiles(SENSE_FONTS, ['source sans pro']);
        expect(await fontFaceCss([face])).toBe(
            `@font-face { font-family: "source sans pro"; src: url("${SENSE_FONTS[0]}") format("woff"); font-style: normal; font-weight: 400; }`
        );
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            blob: async () => new Blob(['font'], { type: 'font/woff' }),
        }));
        const inlined = await fontFaceCss([face], { inline: true, fetchImpl });
        expect(inlined).toContain('url("data:font/woff;base64,');
        const refused = await fontFaceCss([face], {
            inline: true,
            fetchImpl: async () => ({ ok: false }),
        });
        expect(refused).toBe('');
    });

    it('quotes a CSS string so nothing can close it', () => {
        expect(cssString('a"b\\c')).toBe('"a\\22 b\\5c c"');
    });
});

describe('avatars', () => {
    const cell = (url, showAuthor = true) => ({
        showAuthor,
        message: { author: { avatarUrl: url } },
    });

    it('lists each picture shown once, only where the sender is shown', () => {
        const model = {
            avatars: true,
            rows: [
                { kind: 'day' },
                { kind: 'messages', cells: [cell('https://a/1.png'), null] },
                {
                    kind: 'messages',
                    cells: [cell('https://a/1.png'), cell('https://a/2.png', false)],
                },
            ],
        };
        expect(avatarUrls(model)).toEqual(['https://a/1.png']);
        expect(avatarUrls({ ...model, avatars: false })).toEqual([]);
    });

    it('inlines what can be fetched, and maps the rest to null', async () => {
        const fetchImpl = vi.fn(async (url) =>
            url.includes('ok')
                ? { ok: true, blob: async () => new Blob(['x'], { type: 'image/png' }) }
                : { ok: false }
        );
        const map = await inlineAvatars(['https://a/ok.png', 'https://a/no.png'], { fetchImpl });
        expect(map.get('https://a/ok.png')).toMatch(/^data:image\/png;base64,/);
        expect(map.get('https://a/no.png')).toBeNull();
    });

    it('takes no answer that is not a picture', async () => {
        const fetchImpl = async () => ({
            ok: true,
            blob: async () => new Blob(['<html>'], { type: 'text/html' }),
        });
        const map = await inlineAvatars(['https://a/login'], { fetchImpl });
        expect(map.get('https://a/login')).toBeNull();
    });
});
