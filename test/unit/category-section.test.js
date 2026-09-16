// Adapted from textview.qs test/unit/ext/category-section.test.js at df84a5e.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { categoryFieldOptions, tidyCategorySettings } from '../../src/ext/category-section';
import { extensionState } from '../../src/util/extension-state';

/** An enigma Doc whose field list holds the given names. */
function docWithFields(names) {
    return {
        createSessionObject: vi.fn(async () => ({
            id: 'fields',
            getLayout: async () => ({ qFieldList: { qItems: names.map((qName) => ({ qName })) } }),
        })),
        destroySessionObject: vi.fn(async () => true),
    };
}

describe('categoryFieldOptions', () => {
    afterEach(() => {
        extensionState.app = null;
    });

    it("offers the app's fields, keeping the category field stored now", async () => {
        const data = { chatbox: { category: { field: '[_hidden_pattern]' } } };
        const options = await categoryFieldOptions(data, {}, { app: docWithFields(['pattern']) });
        expect(options).toEqual([
            { value: '', label: 'None' },
            { value: '_hidden_pattern', label: '_hidden_pattern (not in the field list)' },
            { value: 'pattern', label: 'pattern' },
        ]);
    });

    it('says the list could not be read', async () => {
        await expect(categoryFieldOptions({}, undefined, undefined)).resolves.toEqual([
            { value: '', label: 'The field list could not be read: type the name below' },
        ]);
    });
});

describe('tidyCategorySettings', () => {
    it('stores a plain field name, and leaves the colour expression as typed', () => {
        const data = {
            chatbox: { category: { field: ' [pattern] ', colorExpression: '=Red()' } },
        };
        tidyCategorySettings(data);
        expect(data.chatbox.category).toEqual({ field: 'pattern', colorExpression: '=Red()' });
    });

    it('leaves properties without category settings alone', () => {
        expect(() => tidyCategorySettings({ chatbox: {} })).not.toThrow();
        expect(() => tidyCategorySettings(undefined)).not.toThrow();
    });
});
