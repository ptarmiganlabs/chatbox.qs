/**
 * Post-build step.
 *
 * 1. Re-substitutes the build tokens across dist/ and the generated extension
 *    folder. Rollup handles most of them, but `nebula sense` emits its own
 *    entry file after that pass, so this is the belt to Rollup's braces.
 * 2. Injects the shared `.qs Library` bundle metadata into the generated .qext
 *    and syncs its version from package.json, so the artifact can never drift
 *    from the manifest.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const { buildDateString } = require('./build-date.cjs');

const EXTENSION_SUFFIX = process.env.EXTENSION_SUFFIX || '';
const EXT_NAME = `chatbox-qs${EXTENSION_SUFFIX}`;
const EXT_DIR = `${EXT_NAME}-ext`;

const BUNDLE_METADATA = {
    id: 'dot-qs-library',
    name: '.qs Library',
    description:
        'Extensions from Ptarmigan Labs that enhance the user experience with help capabilities, onboarding tours and more.',
};

const TOKENS = {
    __BUILD_TYPE__: process.env.BUILD_TYPE || 'development',
    __EXTENSION_TYPE__: EXT_NAME,
    __PACKAGE_VERSION__: pkg.version,
    __BUILD_DATE__: buildDateString(),
};

/**
 * Recursively collect every .js file under a directory.
 *
 * @param {string} dir - Directory to walk.
 * @returns {Promise<string[]>} Absolute paths of the .js files found.
 */
async function jsFiles(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }
    const out = [];
    for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await jsFiles(full)));
        else if (extname(entry.name) === '.js') out.push(full);
    }
    return out;
}

/**
 * Replace any surviving build tokens in a file.
 *
 * @param {string} file - Path of the file to rewrite.
 * @returns {Promise<boolean>} True when the file was modified.
 */
async function substitute(file) {
    const original = await readFile(file, 'utf8');
    let next = original;
    for (const [token, value] of Object.entries(TOKENS)) {
        next = next.split(token).join(JSON.stringify(value));
    }
    if (next === original) return false;
    await writeFile(file, next, 'utf8');
    return true;
}

/**
 * Inject bundle metadata and sync the version into the generated .qext.
 *
 * @returns {Promise<void>} Resolves once the .qext has been rewritten.
 */
async function patchQext() {
    const qextPath = join(EXT_DIR, `${EXT_NAME}.qext`);
    try {
        await stat(qextPath);
    } catch {
        console.warn(`post-build: ${qextPath} not found — did "nebula sense" run?`);
        return;
    }
    const qext = JSON.parse(await readFile(qextPath, 'utf8'));
    qext.version = pkg.version;
    qext.bundle = BUNDLE_METADATA;
    await writeFile(qextPath, `${JSON.stringify(qext, null, 2)}\n`, 'utf8');
    console.log(`post-build: patched ${qextPath} (version ${pkg.version})`);
}

/**
 * Fail the build if the JSX dev runtime leaked into the bundle.
 *
 * Babel's preset-react derives its `development` flag from BABEL_ENV/NODE_ENV,
 * defaulting to "development" when neither is set, while nebula's rollup mode
 * defaults to "production". Left to disagree, JSX compiles to `jsxDEV()` calls
 * against React's production dev-runtime stub, where `jsxDEV` is `undefined`.
 *
 * The result is a bundle that builds, packages and uploads cleanly, then throws
 * "jsxDEV is not a function" and renders nothing — a failure that only appears
 * inside a real Sense client. Cheap to assert here, expensive to diagnose there.
 *
 * @returns {Promise<void>} Resolves when the check passes; exits non-zero otherwise.
 */
async function assertNoDevJsxRuntime() {
    // A development build legitimately contains jsxDEV: there both halves agree,
    // and React's dev runtime really does export it. Only a production build is
    // required to be free of it.
    if ((process.env.BUILD_TYPE || 'development') !== 'production') {
        console.log('post-build: JSX runtime check skipped (development build)');
        return;
    }
    const bundle = join('dist', 'chatbox-qs.js');
    let source;
    try {
        source = await readFile(bundle, 'utf8');
    } catch {
        return;
    }
    if (source.includes('jsxDEV')) {
        console.error(
            `post-build: FAILED — ${bundle} contains jsxDEV calls.\n` +
                '  Babel compiled JSX in development mode while Rollup bundled the production\n' +
                '  React runtime, where jsxDEV is undefined. The extension would render nothing.\n' +
                '  Fix: ensure NODE_ENV matches the nebula --mode in the build script.'
        );
        process.exit(1);
    }
    console.log('post-build: JSX runtime check passed (no jsxDEV in bundle)');
}

/**
 * Entry point.
 *
 * @returns {Promise<void>} Resolves when the post-build step is complete.
 */
async function main() {
    const files = [...(await jsFiles('dist')), ...(await jsFiles(EXT_DIR))];
    let changed = 0;
    for (const file of files) if (await substitute(file)) changed += 1;
    console.log(`post-build: scanned ${files.length} js file(s), rewrote ${changed}`);
    await patchQext();
    await assertNoDevJsxRuntime();
}

await main();
