// Ported from textview.qs test/unit/qix/field-list.test.js at df84a5e.
import { describe, it, expect, vi } from 'vitest';
import { enigmaDoc, listFields } from '../../src/qix/field-list';
import { flushPromises } from '../fakes/engine';

/** An enigma Doc whose field-list object answers with the given items. */
function docWithFields(items) {
    const doc = {
        created: [],
        createSessionObject: vi.fn(async (definition) => {
            const model = {
                id: `fields-${doc.created.length + 1}`,
                getLayout: vi.fn(async () => ({ qFieldList: { qItems: items } })),
            };
            doc.created.push({ definition, model });
            return model;
        }),
        destroySessionObject: vi.fn(async () => true),
    };
    return doc;
}

describe('enigmaDoc', () => {
    it('accepts an enigma Doc as it is', () => {
        const doc = docWithFields([]);
        expect(enigmaDoc(doc)).toBe(doc);
    });

    it("finds the Doc inside a Capability API app, as client-managed Sense's panel passes it", () => {
        const doc = docWithFields([]);
        expect(enigmaDoc({ model: { enigmaModel: doc }, getObject: vi.fn() })).toBe(doc);
    });

    it('rejects anything that cannot create and destroy session objects', () => {
        expect(enigmaDoc(undefined)).toBeNull();
        expect(enigmaDoc({ createSessionObject: vi.fn() })).toBeNull();
        expect(enigmaDoc({ model: {} })).toBeNull();
    });
});

describe('listFields', () => {
    it('lists visible fields alphabetically, the same way on every host', async () => {
        const doc = docWithFields([
            { qName: 'match' },
            { qName: 'Keyword' },
            { qName: 'source_id' },
            { qName: 'item10' },
            { qName: 'item9' },
        ]);
        await expect(listFields([doc])).resolves.toEqual([
            'item9',
            'item10',
            'Keyword',
            'match',
            'source_id',
        ]);
    });

    it('leaves out system, hidden and derived fields', async () => {
        const doc = docWithFields([
            { qName: 'match' },
            { qName: '$Field', qIsSystem: true },
            { qName: '_hidden_match', qIsHidden: true },
            { qName: 'date.autoCalendar.Year', qIsDerivedField: true },
            { qName: 42 },
        ]);
        await expect(listFields([doc])).resolves.toEqual(['match']);
    });

    it('asks the engine for visible, non-derived fields only', async () => {
        const doc = docWithFields([]);
        await listFields([doc]);
        expect(doc.created[0].definition.qFieldListDef).toMatchObject({
            qShowSystem: false,
            qShowHidden: false,
            qShowDerivedFields: false,
        });
    });

    it('destroys the temporary field-list object', async () => {
        const doc = docWithFields([{ qName: 'match' }]);
        await listFields([doc]);
        await flushPromises();
        expect(doc.destroySessionObject).toHaveBeenCalledWith('fields-1');
    });

    it('tries the next candidate when one has no usable API or fails', async () => {
        const logger = { warn: vi.fn() };
        const failing = docWithFields([]);
        failing.createSessionObject.mockRejectedValueOnce(new Error('Access denied'));
        const working = docWithFields([{ qName: 'match' }]);

        await expect(
            listFields([undefined, { getObject: vi.fn() }, failing, working], { logger })
        ).resolves.toEqual(['match']);
        expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    });

    it('answers null, not an empty list, when no candidate can list fields', async () => {
        await expect(listFields([undefined, {}])).resolves.toBeNull();
    });

    it('answers an empty list for an app that really has no fields', async () => {
        await expect(listFields([docWithFields([])])).resolves.toEqual([]);
    });

    it('does not let a failed clean-up escape', async () => {
        const doc = docWithFields([{ qName: 'match' }]);
        doc.destroySessionObject.mockImplementation(() => {
            throw new Error('Socket closed');
        });
        await expect(listFields([doc])).resolves.toEqual(['match']);
        await flushPromises();
    });
});
