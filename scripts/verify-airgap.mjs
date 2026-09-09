/**
 * Fail the build if the shipped bundle references an external host.
 *
 * A Qlik Sense extension must be self-contained: many installations are
 * air-gapped, and Qlik does not support exporting or printing an extension that
 * uses external resources. A CDN reference that works on a developer's laptop is
 * a broken extension on a customer's server, and nothing in the build would
 * otherwise notice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const BUNDLE = join('dist', 'chatbox-qs.js');

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
 * Entry point.
 *
 * @returns {Promise<void>} Resolves when the check passes; exits non-zero otherwise.
 */
async function main() {
    let source;
    try {
        source = await readFile(BUNDLE, 'utf8');
    } catch {
        console.error(`airgap: ${BUNDLE} not found — run a build first.`);
        process.exit(1);
    }

    const found = source.match(/https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+/g) ?? [];
    const offenders = [...new Set(found)].filter((url) => !ALLOWED.some((re) => re.test(url)));

    if (offenders.length) {
        console.error('airgap: FAILED — the bundle references external hosts:');
        for (const url of offenders) console.error(`  ${url}`);
        console.error(
            '\n  A Sense extension must be self-contained. Inline the asset, or add the URL to\n' +
                '  the allow-list in scripts/verify-airgap.mjs if it is an inert string constant.'
        );
        process.exit(1);
    }

    console.log(`airgap: passed (${found.length} URL string(s), all allow-listed)`);
}

await main();
