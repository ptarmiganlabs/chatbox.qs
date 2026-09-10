import { describe, it, expect } from 'vitest';
import {
    argbToHex,
    attrText,
    parseMediaRefs,
    qlikTimeToEpochMs,
    safeColor,
    safeUrl,
} from '../../src/chat/sanitize';

describe('safeUrl', () => {
    it('accepts https and Qlik same-origin content paths', () => {
        expect(safeUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
        expect(safeUrl('/content/Default/a.png')).toBe('/content/Default/a.png');
        expect(safeUrl('/appcontent/abc-123/a.png')).toBe('/appcontent/abc-123/a.png');
    });

    it('keeps Qlik paths relative so a virtual-proxy prefix still applies', () => {
        expect(safeUrl('/content/Default/x.png')).toMatch(/^\/content\//);
    });

    it('accepts data:image but rejects data:text/html', () => {
        expect(safeUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
        expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it.each([
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        '  javascript:alert(1)  ',
    ])('rejects the dangerous scheme %s', (url) => {
        expect(safeUrl(url)).toBeNull();
    });

    it('rejects non-strings and blanks', () => {
        expect(safeUrl(null)).toBeNull();
        expect(safeUrl(42)).toBeNull();
        expect(safeUrl('   ')).toBeNull();
    });
});

describe('safeColor', () => {
    it('accepts hex and rgb strings', () => {
        expect(safeColor({ qText: '#ff0000' })).toBe('#ff0000');
        expect(safeColor({ qText: 'rgb(255, 0, 0)' })).toBe('rgb(255, 0, 0)');
    });

    it('converts a packed ARGB number', () => {
        expect(safeColor({ qNum: 0xffff0000, qText: '-' })).toBe('#ff0000');
    });

    it("returns null for the '-' sentinel with no number", () => {
        expect(safeColor({ qText: '-' })).toBeNull();
        expect(safeColor(null)).toBeNull();
    });

    it('rejects arbitrary strings that are not colours', () => {
        expect(safeColor({ qText: 'url(javascript:alert(1))' })).toBeNull();
    });
});

describe('argbToHex', () => {
    it('handles the sign bit without producing a negative index', () => {
        expect(argbToHex(0xff0000ff)).toBe('#0000ff');
        expect(argbToHex(-1)).toBe('#ffffff');
    });
});

describe('parseMediaRefs', () => {
    it('returns an empty array for blanks and the null sentinel', () => {
        expect(parseMediaRefs('')).toEqual([]);
        expect(parseMediaRefs('-')).toEqual([]);
        expect(parseMediaRefs(null)).toEqual([]);
    });

    it('defaults an unprefixed ref to an image', () => {
        expect(parseMediaRefs('/content/Default/a.png')).toEqual([
            {
                ref: '/content/Default/a.png',
                kind: 'image',
                caption: null,
                mime: null,
                sizeBytes: null,
            },
        ]);
    });

    it('parses kind prefixes and captions, and splits on pipes', () => {
        const out = parseMediaRefs('video:vid-1::Demo clip|file:doc-7::Report.pdf');
        expect(out).toHaveLength(2);
        expect(out[0]).toMatchObject({ kind: 'video', ref: 'vid-1', caption: 'Demo clip' });
        expect(out[1]).toMatchObject({ kind: 'file', ref: 'doc-7', caption: 'Report.pdf' });
    });
});

describe('engine null sentinel — regressions', () => {
    it("rejects the engine's '-' sentinel as a URL", () => {
        // Regression: '-' is a valid RELATIVE url, so new URL('-', base) resolved
        // to https://host/- with an allowed scheme. It reached the DOM as
        // <img src="-">, which requested the hub page and suppressed the
        // initials fallback for every participant without an avatar.
        expect(safeUrl('-')).toBeNull();
    });

    it('still accepts a path that merely contains a dash', () => {
        expect(safeUrl('/content/Default/ada-avatar.png')).toBe('/content/Default/ada-avatar.png');
    });
});

describe('attrText', () => {
    it("maps the engine's '-' sentinel and blanks to null", () => {
        expect(attrText({ qText: '-' })).toBeNull();
        expect(attrText({ qText: '' })).toBeNull();
        expect(attrText({ qText: '   ' })).toBeNull();
        expect(attrText(null)).toBeNull();
    });

    it('passes real text through, trimmed', () => {
        expect(attrText({ qText: '  09:41  ' })).toBe('09:41');
    });
});

describe('qlikTimeToEpochMs', () => {
    it('converts a Qlik DAY SERIAL to epoch milliseconds', () => {
        // Verified against the live engine: Num(Min(SentAt)) for 2026-09-08
        // 08:12:04 returns 46273.341712963, NOT 1788855124000.
        const ms = qlikTimeToEpochMs(46273.341712963);
        expect(new Date(ms).toISOString()).toBe('2026-09-08T08:12:04.000Z');
    });

    it('round-trips the Qlik epoch itself', () => {
        expect(qlikTimeToEpochMs(25569)).toBe(0);
    });

    it('passes a value already in epoch milliseconds through unchanged', () => {
        // No real Qlik day serial reaches 1e11 — that would be year 275,000 —
        // so the two ranges cannot be confused.
        expect(qlikTimeToEpochMs(1788855124000)).toBe(1788855124000);
    });

    it('returns null for non-numbers and NaN', () => {
        expect(qlikTimeToEpochMs('NaN')).toBeNull();
        expect(qlikTimeToEpochMs(undefined)).toBeNull();
        expect(qlikTimeToEpochMs(Number.NaN)).toBeNull();
    });

    it('makes a two-minute gap actually measure two minutes', () => {
        // Regression: the grouping threshold is gapSec * 1000. With raw day
        // serials the delta was ~0.0014 against 120000, so time-based
        // clustering could never fire.
        const a = qlikTimeToEpochMs(46273.341712963); // 08:12:04
        const b = qlikTimeToEpochMs(46273.342592593); // 08:13:20
        expect(Math.round((b - a) / 1000)).toBe(76);
    });
});

describe('qlikTimeToEpochMs — day-boundary precision', () => {
    it('lands exactly on midnight rather than one millisecond before it', () => {
        // Regression: (serial - 25569) * 86400000 does not produce a whole
        // millisecond. Midnight came back as ...999.9995, which Date truncates
        // to 23:59:59.999 of the previous day — so a message sent at midnight
        // appeared under the previous day's separator.
        const midnight = new Date(2026, 0, 1).getTime();
        const serial = midnight / 86400000 + 25569;
        expect(qlikTimeToEpochMs(serial)).toBe(midnight);
    });

    it('always returns a whole number of milliseconds', () => {
        for (const serial of [46022.95833333333, 46273.341712963, 25569.5, 1.25]) {
            expect(Number.isInteger(qlikTimeToEpochMs(serial))).toBe(true);
        }
    });

    it('still round-trips a range of times exactly', () => {
        for (const iso of [
            '2026-01-01T00:00:00Z',
            '2026-09-08T08:12:04Z',
            '2024-02-29T23:59:59Z',
        ]) {
            const ms = Date.parse(iso);
            expect(qlikTimeToEpochMs(ms / 86400000 + 25569)).toBe(ms);
        }
    });
});
