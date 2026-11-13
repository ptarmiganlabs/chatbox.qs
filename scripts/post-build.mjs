/**
 * Post-build step, run after `nebula build` and `nebula sense`.
 *
 * 1. Fails the build if a build token is left in a .js file in dist/, or in the extension folder
 *    that `nebula sense` writes, with its copy of the bundle. Rollup replaces every one while
 *    nebula builds (`replacementStrings` in nebula.config.cjs, scripts/build-tokens.cjs), so one
 *    left here means that the replacement stopped working, and the bundle would stop at the first
 *    line that reads it. It is reported, never patched: a patch here once hid that nebula did not
 *    read the replacement at all (docs/GOTCHAS.md #58). No bundle in dist/ fails the build too, so
 *    a check that found nothing to read never passes as one that found nothing wrong.
 * 2. Injects the shared `.qs Library` bundle metadata into the generated .qext and syncs its
 *    version from package.json, so the artifact can never drift from the manifest.
 * 3. Fails a production build if the JSX dev runtime leaked into the bundle (docs/GOTCHAS.md #4).
 *
 * It does not build, replace or zip anything itself.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const { TOKEN_NAMES } = require('./build-tokens.cjs');

const EXTENSION_SUFFIX = process.env.EXTENSION_SUFFIX || '';
const EXT_NAME = `chatbox-qs${EXTENSION_SUFFIX}`;
const EXT_DIR = `${EXT_NAME}-ext`;

const BUNDLE_METADATA = {
    id: 'dot-qs-library',
    name: '.qs Library',
    description:
        'Extensions from Ptarmigan Labs that enhance the user experience with help capabilities, onboarding tours and more.',
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
 * Find files that still contain a build token.
 *
 * @param {string[]} files - Paths to scan.
 * @returns {Promise<string[]>} "file: token" descriptions of every token left.
 */
async function tokensLeft(files) {
    const found = [];
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        for (const token of TOKEN_NAMES) {
            if (source.includes(token)) found.push(`${file}: ${token}`);
        }
    }
    return found;
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
    // Match an INVOCATION, `jsxDEV(`, not the bare identifier. Libraries that
    // support both runtimes — hast-util-to-jsx-runtime, via react-markdown —
    // legitimately name jsxDEV as an option and guard it behind a development
    // flag, so `source.includes('jsxDEV')` reports them as a broken build.
    // The defect this exists to catch produces real call sites: `rl.jsxDEV("img", …)`.
    if (/jsxDEV\s*\(/.test(source)) {
        console.error(
            `post-build: FAILED — ${bundle} contains jsxDEV CALL sites.\n` +
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
    const bundles = await jsFiles('dist');
    if (bundles.length === 0) {
        console.error(
            'post-build: FAILED — no bundle in dist/ to check. Build first: "npm run build" or "npm run build:dist".'
        );
        process.exit(1);
    }
    const files = [...bundles, ...(await jsFiles(EXT_DIR))];

    const left = await tokensLeft(files);
    if (left.length) {
        console.error('post-build: FAILED — build tokens are left in the bundle:');
        for (const line of left) console.error(`  ${line}`);
        console.error(
            '  Rollup replaces them through replacementStrings in nebula.config.cjs ' +
                '(docs/GOTCHAS.md #58). Fix the replacement there; this step patches nothing.'
        );
        process.exit(1);
    }
    console.log(`post-build: checked ${files.length} js file(s), no build token left`);

    await patchQext();
    await assertNoDevJsxRuntime();
}

await main();
