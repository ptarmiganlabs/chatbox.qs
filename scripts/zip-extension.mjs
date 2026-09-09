/**
 * Package the generated extension folder into the .zip that is uploaded to
 * Qlik Sense (QMC on client-managed, the management console on Cloud).
 *
 * Note the import: archiver v8 dropped its default export and ships named
 * classes only, so `import archiver from 'archiver'` silently yields undefined.
 */
import { createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { ZipArchive } from 'archiver';

const EXTENSION_SUFFIX = process.env.EXTENSION_SUFFIX || '';
const EXT_NAME = `chatbox-qs${EXTENSION_SUFFIX}`;
const EXT_DIR = `${EXT_NAME}-ext`;
const ZIP_NAME = `${EXT_NAME}.zip`;

/**
 * Build the zip archive from the generated extension folder.
 *
 * @returns {Promise<void>} Resolves once the archive has been finalised.
 */
async function main() {
    try {
        await stat(EXT_DIR);
    } catch {
        console.error(`zip: ${EXT_DIR} not found — run "nebula sense" first.`);
        process.exit(1);
    }

    await new Promise((resolve, reject) => {
        const output = createWriteStream(ZIP_NAME);
        const archive = new ZipArchive({ zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`zip: wrote ${ZIP_NAME} (${archive.pointer()} bytes) from ${EXT_DIR}/`);
            resolve();
        });
        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') console.warn('zip:', err.message);
            else reject(err);
        });
        archive.on('error', reject);

        archive.pipe(output);
        archive.glob('**/*', { cwd: EXT_DIR, dot: false });
        archive.file('README.md', { name: 'README.md' });
        archive.finalize();
    });
}

await main();
