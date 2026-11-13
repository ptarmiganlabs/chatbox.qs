import { defineConfig } from 'vitest/config';

export default defineConfig({
    // The build tokens (scripts/build-tokens.cjs) must be declared here, with test values, or
    // source modules fail to load under test: Rollup replaces them at build time only.
    // test/guards/nebula-config.test.js keeps these names in step with that list.
    define: {
        __BUILD_TYPE__: JSON.stringify('test'),
        __EXTENSION_TYPE__: JSON.stringify('chatbox-qs'),
        __PACKAGE_VERSION__: JSON.stringify('0.1.0'),
        __BUILD_DATE__: JSON.stringify('test-build'),
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./test/setup.js'],
        include: ['test/**/*.test.{js,jsx}'],
    },
});
