/**
 * Logging with a build-type gate.
 *
 * Debug output is compiled out of production builds: `__BUILD_TYPE__` is folded
 * to a literal by Rollup, so the branch is statically dead and tree-shaken.
 */

export const PACKAGE_VERSION = __PACKAGE_VERSION__;
export const BUILD_DATE = __BUILD_DATE__;
export const BUILD_TYPE = __BUILD_TYPE__;
export const EXTENSION_TYPE = __EXTENSION_TYPE__;

const PREFIX = 'Chatbox.qs:';
const isDev = BUILD_TYPE !== 'production';

const logger = {
    /**
     * Log a debug message. Suppressed in production builds.
     *
     * @param {...*} args - Values to log.
     * @returns {void}
     */
    debug(...args) {
        if (isDev) console.log(PREFIX, ...args);
    },

    /**
     * Log an informational message. Suppressed in production builds.
     *
     * @param {...*} args - Values to log.
     * @returns {void}
     */
    info(...args) {
        if (isDev) console.info(PREFIX, ...args);
    },

    /**
     * Log a warning. Always emitted.
     *
     * @param {...*} args - Values to log.
     * @returns {void}
     */
    warn(...args) {
        console.warn(PREFIX, ...args);
    },

    /**
     * Log an error. Always emitted.
     *
     * @param {...*} args - Values to log.
     * @returns {void}
     */
    error(...args) {
        console.error(PREFIX, ...args);
    },
};

export default logger;
