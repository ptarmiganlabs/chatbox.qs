import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
    {
        ignores: ['dist/**', 'chatbox-qs-ext/**', 'node_modules/**', '*.zip', 'coverage/**'],
    },
    js.configs.recommended,
    jsdoc.configs['flat/recommended'],
    {
        files: ['**/*.{js,mjs,cjs,jsx}'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: {
                ...globals.browser,
                ...globals.node,
                // Build-time tokens substituted by nebula.config.cjs + post-build.mjs.
                __BUILD_TYPE__: 'readonly',
                __EXTENSION_TYPE__: 'readonly',
                __PACKAGE_VERSION__: 'readonly',
                __BUILD_DATE__: 'readonly',
                define: 'readonly',
            },
        },
        rules: {
            'no-console': 'off',
            'no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            // Strict JSDoc on source: every function needs typed params and returns,
            // with descriptions. This is a blocking lint gate, not a reviewer preference.
            'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        FunctionDeclaration: true,
                        MethodDefinition: true,
                        ClassDeclaration: true,
                        ArrowFunctionExpression: true,
                        FunctionExpression: true,
                    },
                },
            ],
            'jsdoc/require-description': 'error',
            'jsdoc/require-param': 'error',
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-param-name': 'error',
            'jsdoc/require-param-type': 'error',
            'jsdoc/require-returns': 'error',
            'jsdoc/require-returns-description': 'error',
            'jsdoc/require-returns-type': 'error',
            // The house style uses `*` and `Function` freely in JSDoc; these
            // two rules fight that without adding safety in a plain-JS project.
            'jsdoc/reject-any-type': 'off',
            'jsdoc/reject-function-type': 'off',
        },
    },
    {
        // Tests are exempt from the JSDoc gate.
        files: ['test/**/*.{js,jsx}'],
        languageOptions: { globals: { ...globals.node } },
        rules: {
            // Tests document themselves through their names; the JSDoc gate
            // applies to src/ and scripts/ only.
            ...Object.fromEntries(
                Object.keys(jsdoc.configs['flat/recommended'].rules ?? {}).map((r) => [r, 'off'])
            ),
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-description': 'off',
            'jsdoc/require-param': 'off',
            'jsdoc/require-returns': 'off',
        },
    },
    prettier,
];
