// Ported from textview.qs test/unit/qix/expression-check.test.js at df84a5e.
import { describe, it, expect, vi } from 'vitest';
import { createExpressionChecker } from '../../src/qix/expression-check';

/** An app whose CheckExpression answers as the engine did on the test server. */
function appAnswering(answer) {
    return { checkExpression: vi.fn(async () => answer) };
}

const SOUND = { qErrorMsg: '', qBadFieldNames: [], qDangerousFieldNames: [] };

describe('createExpressionChecker', () => {
    it('reports a syntax error in words, without the engine prefix', async () => {
        // Captured from the engine for "If(pattern = , RGB(1,2,3)".
        const app = appAnswering({
            qErrorMsg: "Error in expression:\n')' expected",
            qBadFieldNames: [],
            qDangerousFieldNames: [],
        });
        await expect(
            createExpressionChecker().check(app, 'If(pattern = , RGB(1,2,3)')
        ).resolves.toEqual({ kind: 'syntax', message: "')' expected" });
    });

    it('keeps a message that is only the prefix', async () => {
        const app = appAnswering({ qErrorMsg: 'Error in expression' });
        await expect(createExpressionChecker().check(app, 'x')).resolves.toEqual({
            kind: 'syntax',
            message: 'Error in expression',
        });
    });

    it('names fields that are not in the data model, from their position in the expression', async () => {
        // Captured from the engine for "If(no_such = 1, RGB(1,2,3))".
        const app = appAnswering({
            qErrorMsg: '',
            qBadFieldNames: [
                { qFrom: 3, qCount: 7 },
                { qFrom: 3, qCount: 7 },
            ],
        });
        await expect(
            createExpressionChecker().check(app, 'If(no_such = 1, RGB(1,2,3))')
        ).resolves.toEqual({ kind: 'unknown-fields', names: ['no_such'] });
    });

    it('checks a sound expression once per app', async () => {
        const app = appAnswering(SOUND);
        const checker = createExpressionChecker();
        await expect(checker.check(app, 'Red()')).resolves.toBeNull();
        await expect(checker.check(app, 'Red()')).resolves.toBeNull();
        expect(app.checkExpression).toHaveBeenCalledTimes(1);

        const other = appAnswering(SOUND);
        await checker.check(other, 'Red()');
        expect(other.checkExpression).toHaveBeenCalledTimes(1);
    });

    it('checks a wrong expression again, so a fix in the data model shows', async () => {
        const app = appAnswering({ qErrorMsg: '', qBadFieldNames: [{ qFrom: 0, qCount: 4 }] });
        const checker = createExpressionChecker();
        await checker.check(app, 'nope');
        app.checkExpression.mockResolvedValue(SOUND);
        await expect(checker.check(app, 'nope')).resolves.toBeNull();
        expect(app.checkExpression).toHaveBeenCalledTimes(2);
    });

    it('answers null, and logs, when the check fails or cannot be made', async () => {
        const logger = { warn: vi.fn() };
        const failure = new Error('Socket closed');
        const app = { checkExpression: vi.fn(async () => Promise.reject(failure)) };
        const checker = createExpressionChecker({ logger });
        await expect(checker.check(app, 'Red()')).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(expect.any(String), failure);

        await expect(checker.check({}, 'Red()')).resolves.toBeNull();
        await expect(checker.check(app, '')).resolves.toBeNull();
    });

    it('ignores field ranges it cannot read', async () => {
        const app = appAnswering({ qErrorMsg: '', qBadFieldNames: [null, { qFrom: 2 }] });
        await expect(createExpressionChecker().check(app, 'Red()')).resolves.toBeNull();
    });
});
