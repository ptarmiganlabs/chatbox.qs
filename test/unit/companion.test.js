// Ported from textview.qs test/unit/qix/companion.test.js at df84a5e, without the text key, and with
// tests for release() and for a missing highlight field.
import { describe, it, expect, vi } from 'vitest';
import {
    COLOR_ATTRIBUTE_ID,
    COMPANION_TYPE,
    HIGHLIGHT_ROWS_IN_LAYOUT,
    companionDefinition,
    createCompanion,
} from '../../src/qix/companion';
import { deferred, fakeApp, flushPromises } from '../fakes/engine';

const match = companionDefinition({ highlight: { field: 'match', limit: 1000 } });
const keyword = companionDefinition({ highlight: { field: 'keyword', limit: 1000 } });

describe('companionDefinition', () => {
    it('evaluates nothing without a highlight field, so no session object is made for nothing', () => {
        expect(companionDefinition({})).toBeNull();
        expect(companionDefinition({ highlight: { field: '', limit: 10 } })).toBeNull();
        expect(companionDefinition({ category: { field: 'pattern' } })).toBeNull();
    });

    it('is typed as the chatbox companion, visible in engine logs', () => {
        expect(match.qInfo).toEqual({ qType: COMPANION_TYPE });
        expect(COMPANION_TYPE).toBe('chatbox-companion');
        expect(match).not.toHaveProperty('textKey');
    });

    it("follows the object's alternate state, and leaves the default state implicit", () => {
        const highlight = { field: 'match', limit: 10 };
        expect(companionDefinition({ highlight, stateName: 'Compare' }).qStateName).toBe('Compare');
        expect(companionDefinition({ highlight, stateName: '$' })).not.toHaveProperty('qStateName');
    });

    it('counts the highlight field selections, telling an unknown field apart as -1', () => {
        const definition = companionDefinition({ highlight: { field: 'odd]name', limit: 1000 } });
        expect(definition.highlightSelected).toEqual({
            qValueExpression: { qExpr: '=Alt(GetSelectedCount([odd]]name], False()), -1)' },
        });
        expect(definition.highlightSelectedAll).toEqual({
            qValueExpression: { qExpr: '=Alt(GetSelectedCount([odd]]name], True()), -1)' },
        });
    });

    it('holds a hypercube of the possible values of the highlight field', () => {
        const { qHyperCubeDef } = companionDefinition({
            highlight: { field: 'match', limit: 1000, possibleWhenNoneSelected: true },
        });
        expect(qHyperCubeDef).toMatchObject({
            qDimensions: [
                {
                    qDef: { qFieldDefs: ['match'], qSortCriterias: [{ qSortByAscii: 1 }] },
                    qNullSuppression: true,
                },
            ],
            qMeasures: [],
            qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 1000 }],
        });
        // With nothing selected, the possible values stand in, so the cube is needed then too.
        expect(qHyperCubeDef).not.toHaveProperty('qCalcCondition');
        expect(qHyperCubeDef).not.toHaveProperty('qStateName');
    });

    it('computes the cube only while something is selected when possible values are switched off', () => {
        const { qHyperCubeDef } = companionDefinition({
            highlight: { field: 'match', limit: 1000, possibleWhenNoneSelected: false },
        });
        expect(qHyperCubeDef.qCalcCondition).toEqual({
            qCond: { qv: '=GetSelectedCount([match], False()) > 0' },
        });
    });

    it('fetches no more highlight rows with the layout than one call can carry beside a category', () => {
        const { qHyperCubeDef } = companionDefinition({
            highlight: { field: 'match', limit: 10000 },
        });
        expect(HIGHLIGHT_ROWS_IN_LAYOUT).toBe(5000);
        expect(qHyperCubeDef.qInitialDataFetch[0].qHeight).toBe(5000);
    });

    it('counts and lists highlight values in the alternate state, quoting its name', () => {
        const definition = companionDefinition({
            stateName: "Bob's",
            highlight: { field: 'match', limit: 10 },
        });
        expect(definition.highlightSelected.qValueExpression.qExpr).toBe(
            "=Alt(GetSelectedCount([match], False(), 'Bob''s'), -1)"
        );
        expect(definition.qHyperCubeDef.qStateName).toBe("Bob's");
    });

    it('lists each value with its categories, keeping values without one', () => {
        const definition = companionDefinition({
            highlight: { field: 'match', limit: 1000 },
            category: { field: 'pattern', colorExpression: '' },
        });
        expect(definition.qHyperCubeDef.qDimensions).toEqual([
            {
                qDef: { qFieldDefs: ['match'], qSortCriterias: [{ qSortByAscii: 1 }] },
                qNullSuppression: true,
            },
            {
                qDef: { qFieldDefs: ['pattern'], qSortCriterias: [{ qSortByAscii: 1 }] },
                qNullSuppression: false,
            },
        ]);
        expect(definition.qHyperCubeDef.qInitialDataFetch).toEqual([
            { qTop: 0, qLeft: 0, qWidth: 2, qHeight: 1000 },
        ]);
    });

    it('counts the possible values and checks the category field, since rows no longer count values', () => {
        const definition = companionDefinition({
            stateName: 'Compare',
            highlight: { field: 'match', limit: 1000 },
            category: { field: 'pattern' },
        });
        expect(definition.highlightPossible).toEqual({
            qValueExpression: { qExpr: '=GetPossibleCount([match])' },
        });
        expect(definition.categorySelectedAll).toEqual({
            qValueExpression: { qExpr: "=Alt(GetSelectedCount([pattern], True(), 'Compare'), -1)" },
        });
    });

    it('evaluates the colour expression for each category, as an attribute found by id', () => {
        const { qHyperCubeDef } = companionDefinition({
            highlight: { field: 'match', limit: 1000 },
            category: { field: 'pattern', colorExpression: "If(pattern = 'isbn', RGB(255, 0, 0))" },
        });
        expect(qHyperCubeDef.qDimensions[1].qAttributeExpressions).toEqual([
            { qExpression: "If(pattern = 'isbn', RGB(255, 0, 0))", id: COLOR_ATTRIBUTE_ID },
        ]);
    });
});

describe('createCompanion', () => {
    it('creates the session object on the first read and answers with its layout', async () => {
        const app = fakeApp({ layout: { highlightSelected: 3 } });
        const companion = createCompanion();

        await expect(companion.read(app, match)).resolves.toEqual({ highlightSelected: 3 });
        expect(app.createSessionObject).toHaveBeenCalledTimes(1);
        expect(app.created[0].definition).toEqual(match);
        expect(app.created[0].listens('closed')).toBe(true);
    });

    it('reads the same object again while the definition stays the same', async () => {
        const app = fakeApp();
        const companion = createCompanion();

        await companion.read(app, match);
        app.layout = { highlightSelected: 2 };
        await expect(companion.read(app, { ...match })).resolves.toEqual({ highlightSelected: 2 });

        expect(app.createSessionObject).toHaveBeenCalledTimes(1);
        expect(app.created[0].getLayout).toHaveBeenCalledTimes(2);
    });

    it('replaces the object when the definition changes', async () => {
        const app = fakeApp();
        const companion = createCompanion();

        await companion.read(app, match);
        await companion.read(app, keyword);
        await flushPromises();

        expect(app.createSessionObject).toHaveBeenCalledTimes(2);
        expect(app.created[1].definition).toEqual(keyword);
        expect(app.destroySessionObject).toHaveBeenCalledWith('companion-1');
        expect(app.created[0].listens('closed')).toBe(false);
    });

    it('creates a new object in a new app', async () => {
        const first = fakeApp();
        const second = fakeApp();
        const companion = createCompanion();

        await companion.read(first, match);
        await companion.read(second, match);
        await flushPromises();

        expect(second.createSessionObject).toHaveBeenCalledTimes(1);
        expect(first.destroySessionObject).toHaveBeenCalledWith('companion-1');
    });

    it('recreates the object after the engine closes it', async () => {
        const app = fakeApp();
        const companion = createCompanion();

        await companion.read(app, match);
        app.created[0].emit('closed');
        await expect(companion.read(app, match)).resolves.toEqual({ highlightSelected: 1 });

        expect(app.createSessionObject).toHaveBeenCalledTimes(2);
    });

    it('answers null and warns when the object cannot be created, then tries again', async () => {
        const app = fakeApp();
        const logger = { warn: vi.fn() };
        const failure = new Error('Access denied');
        app.createSessionObject.mockRejectedValueOnce(failure);
        const companion = createCompanion({ logger });

        await expect(companion.read(app, match)).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('companion'), failure);

        await expect(companion.read(app, match)).resolves.toEqual({ highlightSelected: 1 });
        expect(app.createSessionObject).toHaveBeenCalledTimes(2);
    });

    it('answers null and warns when the layout cannot be read, then recreates the object', async () => {
        const app = fakeApp();
        const logger = { warn: vi.fn() };
        const companion = createCompanion({ logger });

        await companion.read(app, match);
        app.created[0].getLayout.mockRejectedValueOnce(new Error('Object not found'));

        await expect(companion.read(app, match)).resolves.toBeNull();
        expect(logger.warn).toHaveBeenCalledTimes(1);
        await expect(companion.read(app, match)).resolves.toEqual({ highlightSelected: 1 });
        expect(app.createSessionObject).toHaveBeenCalledTimes(2);
    });

    it('answers null without an app that can create session objects, or without a definition', async () => {
        const companion = createCompanion();
        await expect(companion.read(undefined, match)).resolves.toBeNull();
        await expect(companion.read({}, match)).resolves.toBeNull();

        const app = fakeApp();
        await expect(companion.read(app, null)).resolves.toBeNull();
        expect(app.createSessionObject).not.toHaveBeenCalled();
    });

    it('destroys the object and refuses further reads', async () => {
        const app = fakeApp();
        const companion = createCompanion();

        await companion.read(app, match);
        companion.destroy();
        await flushPromises();

        expect(app.destroySessionObject).toHaveBeenCalledWith('companion-1');
        await expect(companion.read(app, match)).resolves.toBeNull();
        expect(app.createSessionObject).toHaveBeenCalledTimes(1);
    });

    it('releases the object when highlighting is switched off, keeping subscribers for later', async () => {
        const app = fakeApp();
        const companion = createCompanion();
        const listener = vi.fn();
        companion.subscribe(listener);

        await companion.read(app, match);
        const released = app.created[0];
        companion.release();
        await flushPromises();

        expect(app.destroySessionObject).toHaveBeenCalledWith('companion-1');
        expect(released.listens('changed')).toBe(false);

        // A field set again gets a new object, and changes reach the same subscriber.
        await expect(companion.read(app, match)).resolves.toEqual({ highlightSelected: 1 });
        expect(app.createSessionObject).toHaveBeenCalledTimes(2);
        app.created[1].emit('changed');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('releases nothing when there is no object', async () => {
        const app = fakeApp();
        const companion = createCompanion();
        companion.release();
        await flushPromises();
        expect(app.destroySessionObject).not.toHaveBeenCalled();
    });

    it('destroys an object that was still being created, once it exists', async () => {
        const app = fakeApp();
        const creation = deferred();
        app.createSessionObject.mockReturnValueOnce(creation.promise);
        const companion = createCompanion();

        const reading = companion.read(app, match);
        companion.destroy();
        const model = { id: 'late', on: vi.fn(), removeListener: vi.fn(), getLayout: vi.fn() };
        creation.resolve(model);

        await expect(reading).resolves.toBeNull();
        await flushPromises();
        expect(app.destroySessionObject).toHaveBeenCalledWith('late');
        expect(model.getLayout).not.toHaveBeenCalled();
    });

    it('answers null to a read overtaken by a new definition', async () => {
        const app = fakeApp();
        const creation = deferred();
        app.createSessionObject.mockReturnValueOnce(creation.promise);
        const companion = createCompanion();

        const overtaken = companion.read(app, match);
        const current = companion.read(app, keyword);
        creation.resolve({ id: 'old', on: vi.fn(), removeListener: vi.fn(), getLayout: vi.fn() });

        await expect(overtaken).resolves.toBeNull();
        await expect(current).resolves.toEqual({ highlightSelected: 1 });
    });

    it('answers the model with its layout for reading beyond the layout', async () => {
        const app = fakeApp({ layout: { highlightSelected: 5 } });
        const companion = createCompanion();

        const session = await companion.session(app, match);
        expect(session.model).toBe(app.created[0]);
        expect(session.layout).toEqual({ highlightSelected: 5 });
    });

    it('tells subscribers when the engine reports a change', async () => {
        const app = fakeApp();
        const companion = createCompanion();
        const listener = vi.fn();
        companion.subscribe(listener);

        await companion.read(app, match);
        app.created[0].emit('changed');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('tells subscribers when the engine closes the object, so it is read and recreated', async () => {
        const app = fakeApp();
        const companion = createCompanion();
        const listener = vi.fn();
        companion.subscribe(listener);

        await companion.read(app, match);
        app.created[0].emit('closed');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops listening to an object it has replaced', async () => {
        const app = fakeApp();
        const companion = createCompanion();
        const listener = vi.fn();
        companion.subscribe(listener);

        await companion.read(app, match);
        const replaced = app.created[0];
        await companion.read(app, keyword);
        await flushPromises();

        expect(replaced.listens('changed')).toBe(false);
        expect(app.created[1].listens('changed')).toBe(true);
        expect(listener).not.toHaveBeenCalled();
    });

    it('stops a subscription on request, and all of them when destroyed', async () => {
        const app = fakeApp();
        const companion = createCompanion();
        const first = vi.fn();
        const second = vi.fn();
        const stop = companion.subscribe(first);
        companion.subscribe(second);

        await companion.read(app, match);
        stop();
        app.created[0].emit('changed');
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);

        companion.destroy();
        app.created[0].emit('changed');
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('reports a failing listener without skipping the others', async () => {
        const app = fakeApp();
        const logger = { warn: vi.fn() };
        const companion = createCompanion({ logger });
        const after = vi.fn();
        companion.subscribe(() => {
            throw new Error('Listener broke');
        });
        companion.subscribe(after);

        await companion.read(app, match);
        app.created[0].emit('changed');
        expect(after).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    });

    it('lets a failed clean-up pass, since the engine drops session objects with the session', async () => {
        const app = fakeApp();
        app.destroySessionObject.mockRejectedValue(new Error('Socket closed'));
        const companion = createCompanion();

        await companion.read(app, match);
        companion.destroy();
        await flushPromises();

        expect(app.destroySessionObject).toHaveBeenCalledTimes(1);
    });
});
