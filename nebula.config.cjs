// nebula reads this file's `build` section as its command-line options, and never reads a key it
// does not know: it gives no error and no warning (docs/GOTCHAS.md #58). So this file can only set
// the options nebula has; it cannot add to nebula's Rollup pipeline. A key nebula does not read
// fails test/guards/nebula-config.test.js, which also checks that nebula's own pipeline replaces
// every build token.
const { buildTokens } = require('./scripts/build-tokens.cjs');

module.exports = {
    build: {
        // nebula hands these to the Rollup replace plugin that its build already runs, so each build
        // token in the source becomes its value before terser minifies (scripts/build-tokens.cjs).
        replacementStrings: buildTokens(),
    },
};
