/**
 * Checking a colour expression with the engine: its syntax, and the fields it names.
 *
 * An attribute expression with a syntax error evaluates to nothing for every category, with no error
 * anywhere in the layout, which looks exactly like an expression that chose to give no colours
 * (docs/GOTCHAS.md). The engine's CheckExpression tells the two apart, and names fields that are
 * not in the data model as well.
 *
 * An expression found sound is not checked again for the same app. One found wrong is checked again on
 * every load, so the message goes away as soon as a reload brings the missing field. It never throws:
 * an expression that cannot be checked answers null, which means "not known to be wrong".
 *
 * Ported from textview.qs `src/qix/expression-check.js` at df84a5e, unchanged apart from this note:
 * the GOTCHAS reference now points at chatbox.qs's own entry.
 */

/**
 * Turn the engine's error message into a sentence part.
 *
 * @param {string} message - The engine's message, such as "Error in expression:\n')' expected".
 * @returns {string} The message without its "Error in expression:" prefix, on one line.
 */
function describeSyntaxError(message) {
    const detail = message.replace(/^\s*error in expression:?/i, '').replace(/\s+/g, ' ');
    return detail.trim() || message.trim();
}

/**
 * Create a checker for one viewer.
 *
 * @param {object} [options] - Options.
 * @param {{warn: Function}} [options.logger] - Where failures are reported.
 * @returns {{check: function(object, string): Promise<?object>}} The checker. `check(app, expression)`
 *     resolves to null, `{kind: 'syntax', message}` or `{kind: 'unknown-fields', names}`.
 */
export function createExpressionChecker({ logger } = {}) {
    let soundFor = null;
    const sound = new Set();

    /**
     * Check an expression.
     *
     * @param {object} app - The enigma Doc.
     * @param {string} expression - The expression, without a leading "=".
     * @returns {Promise<?{kind: string, message?: string, names?: string[]}>} What is wrong with it, or
     *     null when nothing is known to be.
     */
    async function check(app, expression) {
        if (!expression || typeof app?.checkExpression !== 'function') return null;
        if (soundFor !== app) {
            soundFor = app;
            sound.clear();
        }
        if (sound.has(expression)) return null;

        let answer;
        try {
            answer = await app.checkExpression(expression, []);
        } catch (error) {
            logger?.warn?.('The colour expression could not be checked:', error);
            return null;
        }

        const message = typeof answer?.qErrorMsg === 'string' ? answer.qErrorMsg : '';
        if (message.trim() !== '') return { kind: 'syntax', message: describeSyntaxError(message) };

        const names = (Array.isArray(answer?.qBadFieldNames) ? answer.qBadFieldNames : [])
            .map((range) => expression.slice(range?.qFrom, range?.qFrom + range?.qCount))
            .filter((name) => name !== '');
        if (names.length > 0) return { kind: 'unknown-fields', names: [...new Set(names)] };

        if (soundFor === app) sound.add(expression);
        return null;
    }

    return { check };
}
