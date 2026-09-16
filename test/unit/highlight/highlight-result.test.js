import { describe, it, expect, vi } from 'vitest';
import { HIGHLIGHT_KINDS } from '../../../src/qix/highlight-source';
import {
    isCurrentHighlightResult,
    loadHighlightResult,
} from '../../../src/highlight/highlight-result';
import { writeSnapshot } from '../../../src/ui/snapshot';

const layout = { qHyperCube: {}, chatbox: { highlight: { field: 'match' } } };
const values = { kind: HIGHLIGHT_KINDS.VALUES, field: 'match', values: ['reload'] };

describe('loadHighlightResult', () => {
    it('tags the answer with the layout and the companion version it was loaded for', async () => {
        const loader = { load: vi.fn(async () => values) };
        const app = {};
        const result = await loadHighlightResult({ layout, app, loader, version: 3 });
        expect(result).toEqual({ answer: values, derivedFrom: layout, version: 3 });
        expect(loader.load).toHaveBeenCalledWith({ app, layout, isStale: expect.any(Function) });
    });

    it('answers off for an export render, which has no engine to ask', async () => {
        const snapshot = writeSnapshot({ ...layout }, { firstVisibleIndex: 0 });
        const loader = { load: vi.fn() };
        const result = await loadHighlightResult({ layout: snapshot, app: {}, loader, version: 0 });
        expect(result.answer).toEqual({ kind: HIGHLIGHT_KINDS.OFF });
        expect(loader.load).not.toHaveBeenCalled();
    });

    it('answers null without a layout or an app, and when the load went stale', async () => {
        const loader = { load: vi.fn(async () => null) };
        await expect(loadHighlightResult({ layout: null, app: {}, loader })).resolves.toBeNull();
        await expect(loadHighlightResult({ layout, app: null, loader })).resolves.toBeNull();
        await expect(loadHighlightResult({ layout, app: {}, loader })).resolves.toBeNull();
    });

    it('turns a failing load into an error answer rather than failing the conversation', async () => {
        const failure = new Error('Socket closed');
        const loader = { load: vi.fn(async () => Promise.reject(failure)) };
        const result = await loadHighlightResult({ layout, app: {}, loader, version: 1 });
        expect(result.answer).toEqual({
            kind: HIGHLIGHT_KINDS.ERROR,
            field: 'match',
            error: failure,
        });
    });
});

describe('isCurrentHighlightResult', () => {
    it('accepts only an answer for this layout and this companion version', () => {
        const result = { answer: values, derivedFrom: layout, version: 2 };
        expect(isCurrentHighlightResult(result, layout, 2)).toBe(true);
        expect(isCurrentHighlightResult(result, { ...layout }, 2)).toBe(false);
        expect(isCurrentHighlightResult(result, layout, 3)).toBe(false);
        expect(isCurrentHighlightResult(null, layout, 2)).toBe(false);
    });
});
