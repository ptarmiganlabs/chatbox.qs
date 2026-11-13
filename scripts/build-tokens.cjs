/**
 * The build tokens: names in the source for what is known only when the extension is built, and
 * what each one becomes.
 *
 * `src/util/logger.js` reads all four as bare names, such as `__BUILD_TYPE__`, and
 * `src/index.js` reads `__EXTENSION_TYPE__` as well. While nebula builds, Rollup's replace plugin
 * puts each one's value in its place, before terser minifies: nebula.config.cjs hands them to
 * nebula as `replacementStrings`, the one option name nebula reads for them (docs/GOTCHAS.md #58).
 * `scripts/post-build.mjs` then fails the build if a name is left in a bundle. vitest.config.js and
 * eslint.config.js declare the same names, and test/guards/nebula-config.test.js keeps all of them
 * in step.
 *
 * CommonJS on purpose, like build-date.cjs: nebula.config.cjs requires it, and the ESM scripts and
 * the tests read it through createRequire. It replaces nothing itself.
 */

const pkg = require('../package.json');
const { buildDateString } = require('./build-date.cjs');

/**
 * The visualization type Qlik Sense registers, before any `EXTENSION_SUFFIX`. The supernova has no
 * implicit name, so it must be set explicitly and kept in sync with the qext `name` slug, or Sense
 * cannot resolve the extension once it is added to a sheet.
 */
const EXTENSION_NAME = 'chatbox-qs';

/**
 * Work out what each build token becomes in this build.
 *
 * @param {object} [options] - What the build knows.
 * @param {string} [options.buildType] - The build type: `BUILD_TYPE` from the environment, else
 *     'development'.
 * @param {string} [options.buildDate] - The build date the About section shows: now, by default.
 * @param {string} [options.extensionSuffix] - What follows `chatbox-qs` in the visualization type:
 *     `EXTENSION_SUFFIX` from the environment, else nothing. post-build.mjs, zip-extension.mjs and
 *     verify-airgap.mjs read the same variable.
 * @returns {object} Each token's replacement, by its name, as JavaScript source: a string literal.
 */
function buildTokens({
    buildType = process.env.BUILD_TYPE || 'development',
    buildDate = buildDateString(),
    extensionSuffix = process.env.EXTENSION_SUFFIX || '',
} = {}) {
    return {
        __BUILD_TYPE__: JSON.stringify(buildType),
        __EXTENSION_TYPE__: JSON.stringify(`${EXTENSION_NAME}${extensionSuffix}`),
        __PACKAGE_VERSION__: JSON.stringify(pkg.version),
        __BUILD_DATE__: JSON.stringify(buildDate),
    };
}

/** Every build token's name. */
const TOKEN_NAMES = Object.freeze(
    Object.keys(buildTokens({ buildType: '', buildDate: '', extensionSuffix: '' }))
);

module.exports = { EXTENSION_NAME, TOKEN_NAMES, buildTokens };
