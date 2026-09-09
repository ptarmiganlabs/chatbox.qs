const replace = require('@rollup/plugin-replace');
const pkg = require('./package.json');
const { buildDateString } = require('./scripts/build-date.cjs');

const BUILD_DATE = buildDateString();

// The visualization type Qlik Sense registers. The supernova has no implicit
// name, so it must be set explicitly and kept in sync with the qext `name`
// slug, or Sense cannot resolve the extension once it is added to a sheet.
const EXTENSION_SUFFIX = process.env.EXTENSION_SUFFIX || '';
const EXTENSION_TYPE = `chatbox-qs${EXTENSION_SUFFIX}`;

const TOKENS = {
    __BUILD_TYPE__: JSON.stringify(process.env.BUILD_TYPE || 'development'),
    __EXTENSION_TYPE__: JSON.stringify(EXTENSION_TYPE),
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
};

module.exports = {
    build: {
        replacement: TOKENS,
        /**
         * Extend nebula's built-in Rollup pipeline with the token replacement.
         *
         * @param {object} config - The Rollup config nebula assembled.
         * @returns {object} The mutated Rollup config.
         */
        rollup(config) {
            config.plugins.push(replace({ preventAssignment: true, values: TOKENS }));
            return config;
        },
    },
};
