import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * No source file may read a date by the local clock, or write one in the local time zone.
 *
 * A Qlik timestamp has no time zone: `qlikTimeToEpochMs` makes it the milliseconds of its wall-clock time
 * read as UTC, and `wallClockOf` in src/chat/grouping.js turns every message's timestamp into that form.
 * A local getter moves such a time by the reader's zone, onto another day near midnight, and CI runs in
 * UTC, where nothing shows (GOTCHAS 32). Dates are read with the UTC getters and written by an
 * `Intl.DateTimeFormat` that names its time zone, everywhere. As in the HTML-sink guard, comments are not
 * stripped before scanning; comments say "local getters" rather than naming one.
 */

const REPO_ROOT = resolve(process.cwd());
const SRC_ROOT = join(REPO_ROOT, 'src');

/** Every way to read or set a date's fields by the local clock, or to write a date in the local zone. */
const LOCAL_CLOCK = [
    /\.get(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\s*\(/g,
    /\.set(FullYear|Month|Date|Hours|Minutes|Seconds)\s*\(/g,
    /\.to(Locale)?(Date|Time)String\s*\(/g,
    /\.toLocaleString\s*\(/g,
    // A date built from its fields, new Date(year, month, …), is built on the local clock.
    /\bnew\s+Date\s*\([^()]*,/g,
];

/**
 * Read a call's arguments.
 *
 * @param {string} source - JavaScript source.
 * @param {number} start - The index just after the call's opening parenthesis.
 * @returns {string} Everything up to the parenthesis that closes the call.
 */
function argumentsFrom(source, start) {
    let depth = 1;
    for (let index = start; index < source.length; index++) {
        if (source[index] === '(') depth += 1;
        else if (source[index] === ')' && --depth === 0) return source.slice(start, index);
    }
    return source.slice(start);
}

/**
 * List every local-clock read in a piece of source.
 *
 * @param {string} source - JavaScript source.
 * @returns {string[]} "line N: what" for each hit.
 */
function findLocalClock(source) {
    const lineOf = (index) => source.slice(0, index).split('\n').length;
    const hits = [];
    for (const pattern of LOCAL_CLOCK) {
        for (const match of source.matchAll(pattern)) {
            hits.push(`line ${lineOf(match.index)}: ${match[0]}`);
        }
    }
    // A formatter without a time zone writes in the zone it was made in.
    for (const match of source.matchAll(/\bDateTimeFormat\s*\(/g)) {
        const args = argumentsFrom(source, match.index + match[0].length);
        if (!/\btimeZone\s*:/.test(args)) {
            hits.push(`line ${lineOf(match.index)}: DateTimeFormat without timeZone`);
        }
    }
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

describe('no date is read by the local clock', () => {
    const files = sourceFiles(SRC_ROOT);

    it('finds source files to check, the day grouping and React components included', () => {
        // Otherwise a wrong root would leave this guard permanently green.
        expect(files.length).toBeGreaterThan(20);
        expect(files.some((file) => file.endsWith(join('chat', 'grouping.js')))).toBe(true);
        expect(files.some((file) => file.endsWith('.jsx'))).toBe(true);
    });

    it('no file in src/ reads or writes a date in the local time zone', () => {
        const offenders = files.flatMap((file) =>
            findLocalClock(readFileSync(file, 'utf8')).map(
                (hit) => `${relative(REPO_ROOT, file)} ${hit}`
            )
        );
        expect(
            offenders,
            'Read a message’s date through wallClockOf and the UTC getters, and give a DateTimeFormat ' +
                "timeZone: 'UTC' (GOTCHAS 32)."
        ).toEqual([]);
    });
});

describe('guard self-check', () => {
    it.each([
        ['const day = d.getDate();'],
        ['d.getFullYear() !== now.getFullYear()'],
        ['const weekday = new Date(ts).getDay();'],
        ['midnight.setHours(0, 0, 0, 0);'],
        ['label = d.toLocaleDateString();'],
        ['label = d.toLocaleString(undefined, { month: "short" });'],
        ['label = d.toDateString();'],
        ['const start = new Date(y, m - 1, d);'],
        ['const start = new Date(\n    year,\n    month\n);'],
        ['new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);'],
        ['new Intl.DateTimeFormat().format(d);'],
    ])('flags %s', (sample) => {
        expect(findLocalClock(sample).length).toBeGreaterThan(0);
    });

    it('does not flag UTC reads, instants or a formatter that names its time zone', () => {
        const sound = [
            'const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;',
            'const offset = new Date(instant).getTimezoneOffset();',
            'const at = new Date(Date.UTC(y, m - 1, d)); const now = new Date(); new Date(ts);',
            'const iso = new Date(ts).toISOString();',
            "new Intl.DateTimeFormat(undefined, {\n    weekday: 'short',\n    timeZone: 'UTC',\n});",
            'const groups = board.getDayGroups(); map.get(key); String(n).padStart(2, "0");',
        ];
        for (const sample of sound) expect(findLocalClock(sample)).toEqual([]);
    });
});
