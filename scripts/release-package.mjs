/**
 * Build the outer release archive attached to a GitHub release.
 *
 * Users download `chatbox-qs-v<version>.zip` and upload the `chatbox-qs.zip`
 * inside it to Sense. The outer archive carries the licence and a readme so the
 * download is self-explanatory.
 *
 * Uses archiver rather than the system `zip` so the release job has one less
 * dependency on what happens to be installed on a self-hosted runner.
 */
import { createWriteStream } from 'node:fs';
import { readFile, stat, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ZipArchive } from 'archiver';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const EXT_NAME = 'chatbox-qs';
const VERSION = process.env.RELEASE_VERSION || pkg.version;
const INNER = `${EXT_NAME}.zip`;
const STAGING = 'release-staging';
const OUTER = `${EXT_NAME}-v${VERSION}.zip`;

/** Everything the outer archive must contain, as [source, name-in-archive]. */
const ENTRIES = [
    [INNER, INNER],
    ['LICENSE', 'LICENSE'],
    [join(STAGING, 'readme.txt'), 'readme.txt'],
];

/**
 * Render the readme shipped beside the extension zip.
 *
 * @returns {Promise<string>} The readme text with the version substituted.
 */
async function renderReadme() {
    const template = await readFile(join('release-config', 'readme-template.txt'), 'utf8');
    return template.split('__VERSION__').join(VERSION);
}

/**
 * Entry point.
 *
 * @returns {Promise<void>} Resolves once the outer archive is written.
 */
async function main() {
    try {
        await stat(INNER);
    } catch {
        console.error(`release: ${INNER} not found — run "npm run pack:prod" first.`);
        process.exit(1);
    }

    await rm(STAGING, { recursive: true, force: true });
    await mkdir(STAGING, { recursive: true });
    await writeFile(join(STAGING, 'readme.txt'), await renderReadme(), 'utf8');

    await new Promise((resolve, reject) => {
        const output = createWriteStream(OUTER);
        const archive = new ZipArchive({ zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`release: wrote ${OUTER} (${archive.pointer()} bytes)`);
            resolve();
        });
        // archiver reports a missing input as a `warning`, not an `error`, and
        // continues. Unhandled, that ships a release archive quietly missing its
        // licence and still exits 0. Treat it as fatal.
        archive.on('warning', reject);
        archive.on('error', reject);

        archive.pipe(output);
        for (const [source, name] of ENTRIES) archive.file(source, { name });
        archive.finalize();
    });

    await assertComplete();
}

/**
 * Confirm the finished archive contains every entry that was asked for.
 *
 * Belt to the warning handler's braces: a release that ships without its licence
 * is a licensing problem, not a build annoyance, and it is exactly the kind of
 * thing that goes unnoticed because the build was green.
 *
 * @returns {Promise<void>} Resolves when every expected entry is present.
 */
async function assertComplete() {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    let listing;
    try {
        const { stdout } = await promisify(execFile)('unzip', ['-Z1', OUTER]);
        listing = stdout
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
    } catch {
        // No unzip on this machine: the warning handler above is still in force.
        console.warn('release: could not verify archive contents (unzip unavailable)');
        return;
    }
    const missing = ENTRIES.map(([, name]) => name).filter((name) => !listing.includes(name));
    if (missing.length) {
        console.error(`release: FAILED — ${OUTER} is missing: ${missing.join(', ')}`);
        process.exit(1);
    }
    console.log(`release: verified ${listing.length} entries`);
}

try {
    await main();
} catch (err) {
    console.error(`release: FAILED — ${err?.message ?? err}`);
    process.exit(1);
}
