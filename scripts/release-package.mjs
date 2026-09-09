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
        archive.on('error', reject);

        archive.pipe(output);
        archive.file(INNER, { name: INNER });
        archive.file('LICENSE', { name: 'LICENSE' });
        archive.file(join(STAGING, 'readme.txt'), { name: 'readme.txt' });
        archive.finalize();
    });
}

await main();
