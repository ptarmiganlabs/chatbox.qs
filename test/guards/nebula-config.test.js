// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import initConfig from '@nebula.js/cli-build/lib/init-config.js';
import nebulaRollupConfig from '@nebula.js/cli-build/lib/config.js';
import eslintConfig from '../../eslint.config.js';
import vitestConfig from '../../vitest.config.js';

/**
 * nebula.config.cjs says only what nebula reads, and nebula's own pipeline replaces every build
 * token.
 *
 * nebula reads the config file's `build` section as its command-line options, and never reads a key
 * it does not know, without a word (docs/GOTCHAS.md #58): `replacement` and a `rollup()` hook sat in
 * the file unread until 2026-11-13, and Rollup replaced no token. So this reads the options as nebula
 * does, the declared ones from nebula's own lib/init-config.js and the few lib/config.js reads
 * besides, and it builds nebula's Rollup configuration from the file, to see the replace plugin in it
 * replace each token. Every list of the tokens' names agrees with scripts/build-tokens.cjs, and with
 * the names the source reads.
 *
 * It runs in Node: under jsdom, @rollup/plugin-babel cannot load nebula's configuration, because it
 * gets jsdom's `URL` class in place of Node's.
 */

const require = createRequire(import.meta.url);
const nebulaConfig = require('../../nebula.config.cjs');
const pkg = require('../../package.json');
const { EXTENSION_NAME, TOKEN_NAMES, buildTokens } = require('../../scripts/build-tokens.cjs');

/** What @nebula.js/cli-build's lib/config.js reads from the parsed options without declaring it. */
const READ_UNDECLARED = ['replacementStrings', 'reactNative', 'reactNativePath', 'cwd'];

/** A build token's name, by its shape. */
const TOKEN_SHAPE = /^__[A-Z][A-Z0-9_]*__$/;

/** The options nebula's init-config declares, read by handing it a stand-in for yargs. */
function declaredOptions() {
    const declared = {};
    const yargs = {
        parserConfiguration: () => yargs,
        options: (options) => {
            Object.assign(declared, options);
            return yargs;
        },
        config: () => yargs,
        middleware: () => yargs,
    };
    initConfig(yargs);
    return Object.keys(declared);
}

/** The keys of an object that are build tokens by their shape, sorted. */
function tokensIn(object) {
    return Object.keys(object ?? {})
        .filter((key) => TOKEN_SHAPE.test(key))
        .sort();
}

/** Every .js and .jsx file under a directory. */
function sourceFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.jsx?$/.test(entry.name) ? [path] : [];
    });
}

const SORTED_NAMES = [...TOKEN_NAMES].sort();

describe('nebula.config.cjs', () => {
    it('holds only the section nebula build reads', () => {
        expect(Object.keys(nebulaConfig)).toEqual(['build']);
    });

    it('sets only options that nebula reads', () => {
        const declared = declaredOptions();
        // A stand-in that read nothing would let every key through.
        expect(declared).toEqual(expect.arrayContaining(['config', 'mode', 'preferBuiltins']));
        const read = new Set([...declared, ...READ_UNDECLARED]);
        expect(Object.keys(nebulaConfig.build).filter((key) => !read.has(key))).toEqual([]);
    });

    it("gets every build token replaced by the replace plugin of nebula's own Rollup configuration", () => {
        const { input } = nebulaRollupConfig({
            mode: 'production',
            format: 'umd',
            argv: { ...nebulaConfig.build, sourcemap: false },
        });
        const replace = input.plugins.find((plugin) => plugin?.name === 'replace');
        expect(replace, 'nebula runs no replace plugin').toBeDefined();

        const source = TOKEN_NAMES.map((name, i) => `export const v${i} = ${name};`).join('\n');
        const { code } = replace.transform(source, 'src/util/logger.js');
        TOKEN_NAMES.forEach((name, i) => {
            expect(code).toContain(
                `export const v${i} = ${nebulaConfig.build.replacementStrings[name]};`
            );
        });
        for (const name of TOKEN_NAMES) expect(code).not.toContain(name);
    });

    it('is named by every script that runs nebula build or nebula serve', () => {
        // Without --config, nebula looks for nebula.config.js and, finding none, uses no options.
        const scripts = Object.entries(pkg.scripts).filter(([, command]) =>
            /\bnebula (build|serve)\b/.test(command)
        );
        expect(scripts.map(([name]) => name)).toEqual(
            expect.arrayContaining(['build', 'build:dist', 'start'])
        );
        for (const [name, command] of scripts) {
            expect(command, `npm run ${name}`).toContain('--config nebula.config.cjs');
        }
    });
});

describe('the build tokens', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('have the same names in every list of them', () => {
        expect(SORTED_NAMES).toEqual([
            '__BUILD_DATE__',
            '__BUILD_TYPE__',
            '__EXTENSION_TYPE__',
            '__PACKAGE_VERSION__',
        ]);
        expect(Object.keys(nebulaConfig.build.replacementStrings).sort()).toEqual(SORTED_NAMES);
        expect(tokensIn(vitestConfig.define)).toEqual(SORTED_NAMES);
        const eslintGlobals = eslintConfig.flatMap((entry) =>
            tokensIn(entry.languageOptions?.globals)
        );
        expect(eslintGlobals.sort()).toEqual(SORTED_NAMES);
    });

    it('are the names the source reads, and no other', () => {
        // A name the source reads that is not in the list reaches the bundle unreplaced, and one in
        // the list that the source no longer reads is a list nobody checks.
        const read = new Set();
        for (const file of sourceFiles('src')) {
            for (const [name] of readFileSync(file, 'utf8').matchAll(/\b__[A-Z][A-Z0-9_]*__\b/g)) {
                read.add(name);
            }
        }
        expect([...read].sort()).toEqual(SORTED_NAMES);
    });

    it('become string literals of what the build knows', () => {
        const tokens = buildTokens({
            buildType: 'production',
            buildDate: '13 November 2026, 07:00',
            extensionSuffix: '',
        });
        const values = Object.fromEntries(
            Object.entries(tokens).map(([name, literal]) => [name, JSON.parse(literal)])
        );
        expect(values).toEqual({
            __BUILD_TYPE__: 'production',
            __EXTENSION_TYPE__: EXTENSION_NAME,
            __PACKAGE_VERSION__: pkg.version,
            __BUILD_DATE__: '13 November 2026, 07:00',
        });
        expect(EXTENSION_NAME).toBe('chatbox-qs');
    });

    it('take the build type from BUILD_TYPE, and development without it', () => {
        vi.stubEnv('BUILD_TYPE', 'production');
        expect(buildTokens().__BUILD_TYPE__).toBe('"production"');
        vi.stubEnv('BUILD_TYPE', '');
        expect(buildTokens().__BUILD_TYPE__).toBe('"development"');
    });

    it('put EXTENSION_SUFFIX after the visualization type, as the packaging scripts do', () => {
        vi.stubEnv('EXTENSION_SUFFIX', '-dev');
        expect(buildTokens().__EXTENSION_TYPE__).toBe('"chatbox-qs-dev"');
        vi.stubEnv('EXTENSION_SUFFIX', '');
        expect(buildTokens().__EXTENSION_TYPE__).toBe('"chatbox-qs"');
    });
});
