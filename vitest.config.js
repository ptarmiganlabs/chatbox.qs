import { defineConfig } from 'vitest/config';

export default defineConfig({
    // The build tokens must be re-declared here or source modules fail to load
    // under test — they are substituted by Rollup at build time only.
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
