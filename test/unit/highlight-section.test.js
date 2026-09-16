// Adapted from textview.qs test/unit/ext/highlight-section.test.js at df84a5e.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { highlightFieldOptions, tidyHighlightSettings } from '../../src/ext/highlight-section';
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

const withField = (field) => ({ chatbox: { highlight: { field } } });

describe('highlightFieldOptions', () => {
    afterEach(() => {
        extensionState.app = null;
        vi.restoreAllMocks();
    });

    it('offers None and every listed field', async () => {
        const app = docWithFields(['match', 'Keyword']);
        await expect(highlightFieldOptions(withField(''), {}, { app })).resolves.toEqual([
            { value: '', label: 'None' },
            { value: 'Keyword', label: 'Keyword' },
            { value: 'match', label: 'match' },
        ]);
    });

    it('finds the app on the handler, as client-managed Sense passes it', async () => {
        const handler = { app: { model: { enigmaModel: docWithFields(['match']) } } };
        const options = await highlightFieldOptions(withField(''), handler, {});
        expect(options.map((option) => option.value)).toEqual(['', 'match']);
    });

    it("falls back to the component's own app handle", async () => {
        extensionState.app = docWithFields(['pattern']);
        const options = await highlightFieldOptions(withField(''), {}, undefined);
        expect(options.map((option) => option.value)).toEqual(['', 'pattern']);
    });

    it('keeps a typed field that the list does not show, such as a hidden one', async () => {
        const app = docWithFields(['match']);
        const options = await highlightFieldOptions(withField('_hidden_match'), {}, { app });
        expect(options[1]).toEqual({
            value: '_hidden_match',
            label: '_hidden_match (not in the field list)',
        });
    });

    it('says the list could not be read instead of offering an empty list', async () => {
        await expect(highlightFieldOptions(withField(''), {}, {})).resolves.toEqual([
            { value: '', label: 'The field list could not be read: type the name below' },
        ]);
        await expect(highlightFieldOptions(withField('match'), {}, {})).resolves.toEqual([
            { value: '', label: 'None' },
            { value: 'match', label: 'match (the field list could not be read)' },
        ]);
    });
});

describe('tidyHighlightSettings', () => {
    it('stores a plain field name and a limit within range', () => {
        const data = { chatbox: { highlight: { field: ' [odd]]name] ', limit: 250000 } } };
        tidyHighlightSettings(data);
        expect(data.chatbox.highlight).toEqual({ field: 'odd]name', limit: 10000 });
    });

    it('leaves properties without highlight settings alone', () => {
        const data = { chatbox: {} };
        expect(() => tidyHighlightSettings(data)).not.toThrow();
        expect(data).toEqual({ chatbox: {} });
        expect(() => tidyHighlightSettings(undefined)).not.toThrow();
    });
});
