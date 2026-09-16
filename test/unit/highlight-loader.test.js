import { describe, it, expect, vi } from 'vitest';
import { COMPANION_TYPE } from '../../src/qix/companion';
import { HIGHLIGHT_KINDS } from '../../src/qix/highlight-source';
import { createHighlightLoader } from '../../src/qix/highlight-loader';
import { fakeApp, flushPromises } from '../fakes/engine';

/** A companion layout with two values of the highlight field possible and nothing selected. */
const possibleValues = {
    highlightSelected: 0,
    highlightSelectedAll: 0,
    qHyperCube: {
        qSize: { qcx: 1, qcy: 2 },
        qDataPages: [
            {
                qArea: { qTop: 0, qLeft: 0, qWidth: 1, qHeight: 2 },
                qMatrix: [
                    [{ qText: 'reload', qElemNumber: 0 }],
                    [{ qText: 'task', qElemNumber: 1 }],
                ],
            },
        ],
    },
};

/** An object layout carrying highlight settings. */
function layoutWith(chatbox, extra = {}) {
    return { qHyperCube: { qSize: { qcx: 3, qcy: 10 }, ...extra }, chatbox };
}

describe('createHighlightLoader', () => {
    it('answers off without touching the engine when no highlight field is set', async () => {
        const app = fakeApp({ layout: possibleValues });
        const loader = createHighlightLoader();
        await expect(loader.load({ app, layout: layoutWith({}) })).resolves.toEqual({
            kind: HIGHLIGHT_KINDS.OFF,
        });
        expect(app.createSessionObject).not.toHaveBeenCalled();
    });

    it('reads the highlight field through a companion object', async () => {
        const app = fakeApp({ layout: possibleValues });
        const loader = createHighlightLoader();
        const answer = await loader.load({
            app,
            layout: layoutWith({ highlight: { field: '[match]', limit: 50 } }),
        });
        expect(answer).toMatchObject({
            kind: HIGHLIGHT_KINDS.VALUES,
            field: 'match',
            source: 'possible',
            values: ['reload', 'task'],
            limit: 50,
            categories: null,
        });
        const { definition } = app.created[0];
        expect(definition.qInfo.qType).toBe(COMPANION_TYPE);
        expect(definition.qHyperCubeDef.qDimensions[0].qDef.qFieldDefs).toEqual(['match']);
    });

    it("asks in the object's alternate state", async () => {
        const app = fakeApp({ layout: possibleValues });
        const loader = createHighlightLoader();
        await loader.load({
            app,
            layout: layoutWith({ highlight: { field: 'match' } }, { qStateName: 'Compare' }),
        });
        expect(app.created[0].definition.qStateName).toBe('Compare');
    });

    it('adds the category column only with a category field set', async () => {
        const app = fakeApp({ layout: possibleValues });
        const loader = createHighlightLoader();
        await loader.load({
            app,
            layout: layoutWith({ highlight: { field: 'match' }, category: { field: '' } }),
        });
        expect(app.created[0].definition.qHyperCubeDef.qDimensions).toHaveLength(1);

        await loader.load({
            app,
            layout: layoutWith({ highlight: { field: 'match' }, category: { field: 'pattern' } }),
        });
        expect(app.created[1].definition.qHyperCubeDef.qDimensions).toHaveLength(2);
    });

    it('releases the companion when the field is cleared, so the engine stops computing it', async () => {
        const app = fakeApp({ layout: possibleValues });
        const loader = createHighlightLoader();
        await loader.load({ app, layout: layoutWith({ highlight: { field: 'match' } }) });
        await loader.load({ app, layout: layoutWith({ highlight: { field: '' } }) });
        await flushPromises();
        expect(app.destroySessionObject).toHaveBeenCalledWith('companion-1');
    });

    it("passes the companion's changes on, as an unassociated field selection only reaches it", async () => {
        const app = fakeApp({ layout: possibleValues });
        const loader = createHighlightLoader();
        const listener = vi.fn();
        const stop = loader.subscribe(listener);
        await loader.load({ app, layout: layoutWith({ highlight: { field: 'match' } }) });

        app.created[0].emit('changed');
        expect(listener).toHaveBeenCalledTimes(1);

        stop();
        app.created[0].emit('changed');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('destroys the companion when the object leaves the sheet', async () => {
        const app = fakeApp({ layout: possibleValues });
        const loader = createHighlightLoader();
        await loader.load({ app, layout: layoutWith({ highlight: { field: 'match' } }) });
        loader.destroy();
        await flushPromises();
        expect(app.destroySessionObject).toHaveBeenCalledWith('companion-1');
        await expect(
            loader.load({ app, layout: layoutWith({ highlight: { field: 'match' } }) })
        ).resolves.toMatchObject({ kind: HIGHLIGHT_KINDS.ERROR });
    });
});
