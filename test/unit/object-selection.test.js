import { describe, it, expect, vi } from 'vitest';
import { selectInObjectSession } from '../../src/qix/object-selection';
import { SELECTION_OUTCOMES } from '../../src/qix/field-selection';

const step = (dimIdx = 2, values = [4]) => ({ dimIdx, values, toggle: true });

/**
 * Selections as useSelections() hands them over, with the session's state kept honestly.
 *
 * @param {object} [over] - Overrides.
 * @param {boolean} [over.active] - Whether a session is already open.
 * @param {Function} [over.select] - What `select` answers.
 * @returns {object} The selections.
 */
function fakeSelections({ active = false, select = vi.fn().mockResolvedValue(true) } = {}) {
    let open = active;
    return {
        isActive: vi.fn(() => open),
        begin: vi.fn(async () => {
            open = true;
        }),
        select,
        cancel: vi.fn(async () => {
            open = false;
        }),
    };
}

describe('selectInObjectSession', () => {
    it('opens the selection mode, takes the step, and leaves it open for the next pick', async () => {
        const selections = fakeSelections();
        const result = await selectInObjectSession({ selections, steps: [step()] });
        expect(result).toEqual({ outcome: SELECTION_OUTCOMES.SELECTED });
        expect(selections.begin).toHaveBeenCalledWith(['/qHyperCubeDef']);
        expect(selections.select).toHaveBeenCalledWith({
            method: 'selectHyperCubeValues',
            params: ['/qHyperCubeDef', 2, [4], true],
        });
        expect(selections.cancel).not.toHaveBeenCalled();
        expect(selections.isActive()).toBe(true);
    });

    it('joins a session already open rather than opening another', async () => {
        const selections = fakeSelections({ active: true });
        await selectInObjectSession({ selections, steps: [step()] });
        expect(selections.begin).not.toHaveBeenCalled();
    });

    it('ends the session when the engine refuses, because stardust has emptied it', async () => {
        // stardust answers a refused step by resetting every selection made in the session, and
        // leaves the session open: a confirm bar with nothing behind it.
        const selections = fakeSelections({ select: vi.fn().mockResolvedValue(false) });
        const result = await selectInObjectSession({ selections, steps: [step()] });
        expect(result).toEqual({ outcome: SELECTION_OUTCOMES.REFUSED });
        expect(selections.cancel).toHaveBeenCalled();
        expect(selections.isActive()).toBe(false);
    });

    it('ends it even when earlier picks opened it, which the refusal took away too', async () => {
        const selections = fakeSelections({
            active: true,
            select: vi.fn().mockResolvedValue(false),
        });
        const result = await selectInObjectSession({ selections, steps: [step()] });
        expect(result.outcome).toBe(SELECTION_OUTCOMES.REFUSED);
        expect(selections.cancel).toHaveBeenCalled();
    });

    it('sends no step after a refused one', async () => {
        const select = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
        const selections = fakeSelections({ select });
        await selectInObjectSession({ selections, steps: [step(1), step(2)] });
        expect(select).toHaveBeenCalledTimes(1);
    });

    it('lets go of a session it opened when a call throws, and answers the error', async () => {
        const error = Object.assign(new Error('engine'), { code: 6003 });
        const warn = vi.fn();
        const selections = fakeSelections({ select: vi.fn().mockRejectedValue(error) });
        const result = await selectInObjectSession({
            selections,
            steps: [step()],
            logger: { warn },
        });
        expect(result).toEqual({ outcome: SELECTION_OUTCOMES.ERROR, error });
        expect(selections.cancel).toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });

    it('leaves a session it joined alone when a call throws: the earlier picks are still real', async () => {
        // Unlike a refusal, a call that throws resets nothing in stardust, so cancelling would drop
        // headers the reader picked and the engine took.
        const selections = fakeSelections({
            active: true,
            select: vi.fn().mockRejectedValue(new Error('engine')),
        });
        const result = await selectInObjectSession({ selections, steps: [step()] });
        expect(result.outcome).toBe(SELECTION_OUTCOMES.ERROR);
        expect(selections.cancel).not.toHaveBeenCalled();
    });

    it('reports a session that could not be ended, rather than throwing into the click', async () => {
        const warn = vi.fn();
        const selections = fakeSelections({ select: vi.fn().mockResolvedValue(false) });
        selections.cancel.mockRejectedValue(new Error('gone'));
        const result = await selectInObjectSession({
            selections,
            steps: [step()],
            logger: { warn },
        });
        expect(result.outcome).toBe(SELECTION_OUTCOMES.REFUSED);
        expect(warn).toHaveBeenCalled();
    });
});
