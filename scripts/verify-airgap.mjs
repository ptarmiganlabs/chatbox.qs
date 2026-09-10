/**
 * Fail the build if the shipped bundle references an external host.
 *
 * A Qlik Sense extension must be self-contained: many installations are
 * air-gapped, and Qlik does not support exporting or printing an extension that
 * uses external resources. A CDN reference that works on a developer's laptop is
 * a broken extension on a customer's server, and nothing in the build would
 * otherwise notice.
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/**
 * The generated extension folder — the tree that is zipped and shipped.
 *
 * Deliberately not `dist/`. `dist/` happens to hold the same bundle today only
 * because `nebula sense` copies it here, so checking it validates something
 * adjacent to the artifact rather than the artifact itself. Anything added to
 * this folder later — a stylesheet, a second bundle — is caught here and would
 * not have been caught there.
 */
const EXT_DIR = `chatbox-qs${process.env.EXTENSION_SUFFIX || ''}-ext`;

/** File types worth scanning for URLs. Binary assets cannot fetch anything. */
const TEXT_TYPES = new Set([
    '.js',
    '.mjs',
    '.cjs',
    '.css',
    '.json',
    '.qext',
    '.html',
    '.htm',
    '.md',
]);

/**
 * Hosts that are allowed to appear in the bundle.
 *
 * These are all inert string constants rather than anything fetched at runtime:
 * XML namespace URIs, React's error-explainer URL, our own repository links, and
 * the base used by the URL parser in sanitize.js.
 */
const ALLOWED = [
    /^https?:\/\/(www\.)?w3\.org\//,
    /^https?:\/\/react\.dev\//,
    /^https?:\/\/github\.com\/ptarmiganlabs\//,
    /^https?:\/\/localhost\//,
];

/**
 * Recursively collect scannable text files under a directory.
 *
 * @param {string} dir - Directory to walk.
 * @returns {Promise<?string[]>} File paths, or null when the directory is absent.
 */
async function textFiles(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return null;
    }
    const out = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...((await textFiles(full)) ?? []));
        else if (TEXT_TYPES.has(extname(entry.name))) out.push(full);
    }
    return out;
}

/**
 * Entry point.
 *
 * @returns {Promise<void>} Resolves when the check passes; exits non-zero otherwise.
 */
async function main() {
    const files = await textFiles(EXT_DIR);
    if (files === null) {
        console.error(`airgap: ${EXT_DIR} not found — run "npm run pack:prod" first.`);
        process.exit(1);
    }

    let total = 0;
    const offenders = [];
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        const found = source.match(/https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g) ?? [];
        total += found.length;
        for (const url of new Set(found)) {
            if (!ALLOWED.some((re) => re.test(url))) offenders.push(`${file}: ${url}`);
        }
    }

    if (offenders.length) {
        console.error('airgap: FAILED — the shipped extension references external hosts:');
        for (const url of offenders) console.error(`  ${url}`);
        console.error(
            '\n  A Sense extension must be self-contained. Inline the asset, or add the URL to\n' +
                '  the allow-list in scripts/verify-airgap.mjs if it is an inert string constant.'
        );
        process.exit(1);
    }

    console.log(
        `airgap: passed (${files.length} file(s), ${total} URL string(s), all allow-listed)`
    );
}

await main();
