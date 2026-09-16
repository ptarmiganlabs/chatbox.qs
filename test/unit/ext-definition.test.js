import { describe, it, expect } from 'vitest';
import ext from '../../src/ext/index';
import { ATTR_ORDER, metadataSection } from '../../src/ext/metadata-section';
import { categoryFieldIsSet } from '../../src/ext/category-section';
import { clickHelpIsShown, highlightFieldIsSet } from '../../src/ext/highlight-section';
import { ON_OFF } from '../../src/ext/items';
import { TEXT_TOOL_DEFAULTS } from '../../src/highlight/settings';

const definition = ext({}).definition;

/** Walk every item in the panel definition, yielding [path, item]. */
function walk(node, path = []) {
    const out = [];
    if (!node || typeof node !== 'object') return out;
    if (node.ref) out.push([path.join('.'), node]);
    for (const [key, child] of Object.entries(node.items ?? {})) {
        out.push(...walk(child, [...path, key]));
    }
    return out;
}

describe('property panel definition', () => {
    it('is an accordion of named sections', () => {
        expect(definition.component).toBe('accordion');
        expect(Object.keys(definition.items)).toEqual(
            expect.arrayContaining([
                'data',
                'appearance',
                'metadata',
                'detail',
                'behaviour',
                'about',
            ])
        );
    });

    it('NEVER binds a top-level item to an absolute hypercube path', () => {
        // Regression, and the reason this whole file exists.
        //
        // A panel item materialises the property path it binds to as soon as the
        // panel is built, REGARDLESS of any `show` guard. An item bound to
        // qHyperCubeDef.qDimensions.0.* therefore creates an empty dimension, and
        // Sense renders that as a red "Invalid dimension" the moment the object is
        // dropped on a sheet — before the user has done anything.
        //
        // The panel cannot be previewed locally (nebula serve ignores
        // ext.definition entirely), so this assertion is the only cheap guard.
        const offenders = walk(definition)
            .filter(([, item]) => /^qHyperCubeDef\./.test(item.ref))
            .map(([path, item]) => `${path} -> ${item.ref}`);
        expect(offenders).toEqual([]);
    });

    it("binds every metadata item to the extension's own property bag", () => {
        for (const item of Object.values(metadataSection().items)) {
            expect(item.ref).toMatch(/^chatbox\.attrs\./);
        }
    });

    it('uses the single combined data section', () => {
        // Splitting this into uses:'dimensions' + uses:'measures' makes Sense
        // reject the definition and render NO panel at all, silently.
        expect(definition.items.data).toEqual({ uses: 'data' });
        expect(definition.items.dimensions).toBeUndefined();
        expect(definition.items.measures).toBeUndefined();
    });

    it('offers showDetails as a click action', () => {
        const opts = definition.items.behaviour.items.onBubbleClick.options.map((o) => o.value);
        expect(opts).toContain('showDetails');
        expect(opts).toContain('none');
    });

    it('offers the recipient and conversation click actions', () => {
        const opts = definition.items.behaviour.items.onBubbleClick.options.map((o) => o.value);
        expect(opts).toEqual(
            expect.arrayContaining(['selectAuthor', 'selectRecipient', 'selectConversation'])
        );
    });

    it('defaults the detail presentation to automatic', () => {
        // A Sense object spans roughly 300 to 4000 px, so a fixed presentation
        // is wrong at one end of that range.
        expect(definition.items.detail.items.revealMode.defaultValue).toBe('auto');
    });

    it('does not expose the generic sorting section', () => {
        // Chronological order is load-bearing for grouping and date separators,
        // so it is controlled by an explicit Oldest/Newest setting instead.
        expect(walk(definition).some(([p]) => p.includes('sorting'))).toBe(false);
        expect(definition.items.sorting).toBeUndefined();
    });

    it('declares every metadata slot exactly once, in a stable order', () => {
        const refs = Object.values(metadataSection().items).map((i) => i.ref);
        expect(new Set(refs).size).toBe(refs.length);
        expect(refs).toHaveLength(ATTR_ORDER.length);
        // The panel order and the slot order are one contract: the engine
        // returns attribute-expression values positionally.
        expect(refs).toEqual(ATTR_ORDER.map((id) => `chatbox.attrs.${id}`));
    });
});

describe('conversation model', () => {
    const item = definition.items.conversation.items.conversationModel;

    it('comes right after the data section, since it decides what dimensions become', () => {
        const keys = Object.keys(definition.items);
        expect(keys.indexOf('conversation')).toBe(keys.indexOf('data') + 1);
    });

    it('binds to the extension’s own bag and defaults to today’s model', () => {
        expect(item.ref).toBe('chatbox.conversationModel');
        expect(item.defaultValue).toBe('participant');
        expect(item.options.map((o) => o.value)).toEqual(['participant', 'fromTo']);
    });

    it('uses a component string the panel already renders elsewhere', () => {
        // A wrong component string fails silently in the classic panel (GOTCHAS 6).
        const shipped = new Set(
            walk(definition)
                .filter(([path]) => !path.startsWith('conversation'))
                .map(([, i]) => i.component)
        );
        expect(shipped.has(item.component)).toBe(true);
    });
});

describe('appearance: density', () => {
    it('offers density with automatic as the default', () => {
        const density = definition.items.appearance.items.density;
        expect(density.defaultValue).toBe('auto');
        expect(density.options.map((o) => o.value)).toEqual([
            'auto',
            'comfortable',
            'compact',
            'ultra',
        ]);
    });

    it('keeps date separators switchable', () => {
        expect(definition.items.appearance.items.dateSeparators.defaultValue).toBe(true);
    });
});

describe('support flags', () => {
    it('declares snapshot and export support', () => {
        const support = ext({}).support;
        expect(support.snapshot).toBe(true);
        expect(support.export).toBe(true);
        expect(support.exportData).toBe(true);
    });
});

describe('highlights and categories sections', () => {
    /** Walk every node of the definition, with or without a ref. */
    function walkAll(node, path = []) {
        const out = [];
        if (!node || typeof node !== 'object') return out;
        out.push([path.join('.'), node]);
        for (const [key, child] of Object.entries(node.items ?? {})) {
            out.push(...walkAll(child, [...path, key]));
        }
        return out;
    }

    /** Read a dotted path from an object. */
    const get = (object, path) => path.split('.').reduce((node, key) => node?.[key], object);

    /** Every leaf path of the defaults, e.g. 'highlight.limit'. */
    function leafPaths(object, prefix = []) {
        return Object.entries(object).flatMap(([key, value]) =>
            value && typeof value === 'object'
                ? leafPaths(value, [...prefix, key])
                : [[...prefix, key].join('.')]
        );
    }

    const highlights = definition.items.highlights;
    const categories = definition.items.categories;
    const TEXT_TOOL_REF = /^chatbox\.((highlight|match|category)\.|showRuler$|showSearch$)/;
    const SECTION_REF = /^chatbox\.(highlight|match|category)\./;

    it('sit after the message metadata and before the details', () => {
        const keys = Object.keys(definition.items);
        expect(keys.slice(keys.indexOf('metadata'), keys.indexOf('detail') + 1)).toEqual([
            'metadata',
            'highlights',
            'categories',
            'detail',
        ]);
    });

    it('uses only component strings the panel already renders', () => {
        // A wrong component string, or a section Sense rejects, removes the WHOLE panel without
        // an error (GOTCHAS 6), and nebula serve cannot show the panel to catch it.
        const components = new Set(
            walkAll(definition)
                .map(([, node]) => node.component)
                .filter(Boolean)
        );
        for (const component of components) {
            expect(['accordion', 'dropdown', 'switch', 'slider', 'text', 'link']).toContain(
                component
            );
        }
    });

    it('binds their settings only under chatbox.highlight, match and category', () => {
        const refs = [...walk(highlights), ...walk(categories)].map(([, item]) => item.ref);
        expect(refs.length).toBeGreaterThan(0);
        for (const ref of refs) expect(ref).toMatch(SECTION_REF);
    });

    it('gives every setting the default from src/highlight/settings.js, and covers them all', () => {
        const bound = walk(definition).filter(([, item]) => TEXT_TOOL_REF.test(item.ref));
        for (const [, item] of bound) {
            const path = item.ref.replace(/^chatbox\./, '');
            expect(item.defaultValue, item.ref).toEqual(get(TEXT_TOOL_DEFAULTS, path));
        }
        const refs = new Set(bound.map(([, item]) => item.ref));
        for (const path of leafPaths(TEXT_TOOL_DEFAULTS)) {
            expect(refs.has(`chatbox.${path}`), path).toBe(true);
        }
    });

    it('builds every switch in the panel with On and Off options', () => {
        const switches = walkAll(definition).filter(([, node]) => node.component === 'switch');
        expect(switches.length).toBeGreaterThan(0);
        for (const [path, node] of switches) {
            expect(node.type, path).toBe('boolean');
            expect(node.options, path).toEqual(ON_OFF);
        }
    });

    it('binds the dropdown and the typed name to the same property, never as expressions', () => {
        for (const section of [highlights, categories]) {
            const { field, fieldName } = section.items;
            expect(field.component).toBe('dropdown');
            expect(typeof field.options).toBe('function');
            expect(fieldName.ref).toBe(field.ref);
            expect(fieldName.component).toBeUndefined();
            expect(field.expression).toBeUndefined();
            expect(fieldName.expression).toBeUndefined();
            expect(typeof field.change).toBe('function');
            expect(fieldName.change).toBe(field.change);
        }
    });

    it('stores the limit as an integer, tidied on change', () => {
        const { limit } = highlights.items;
        expect(limit.type).toBe('integer');
        const data = { chatbox: { highlight: { field: '[match]', limit: 250000 } } };
        limit.change(data);
        expect(data.chatbox.highlight).toEqual({ field: 'match', limit: 10000 });
    });

    it('keeps the colour expression plain text, so the engine evaluates it per category', () => {
        const { colorExpression, colorExpressionHelp } = categories.items;
        expect(colorExpression.expression).toBeUndefined();
        expect(colorExpression.component).toBeUndefined();
        expect(colorExpressionHelp.component).toBe('text');
        expect(colorExpressionHelp.ref).toBeUndefined();
    });

    it('shows everything but the field only once a highlight field is set', () => {
        const none = { chatbox: { highlight: { field: '' } } };
        const set = { chatbox: { highlight: { field: 'match' } } };
        for (const [key, item] of Object.entries(highlights.items)) {
            if (key === 'field' || key === 'fieldName') {
                expect(item.show, key).toBeUndefined();
                continue;
            }
            expect(item.show(none), key).toBe(false);
            expect(item.show(set), key).toBe(true);
        }
        expect(highlightFieldIsSet({ chatbox: { highlight: { field: ' [match] ' } } })).toBe(true);
    });

    it('explains the click only while clicking a highlight selects', () => {
        expect(clickHelpIsShown({ chatbox: { highlight: { field: 'match' } } })).toBe(true);
        expect(
            clickHelpIsShown({ chatbox: { highlight: { field: 'match', clickToSelect: false } } })
        ).toBe(false);
        expect(clickHelpIsShown({ chatbox: { highlight: { field: '' } } })).toBe(false);
    });

    it('shows the categories once a highlight field is set, their details once a category is', () => {
        expect(categories.show).toBe(highlightFieldIsSet);
        const noCategory = { chatbox: { highlight: { field: 'match' }, category: { field: '' } } };
        const category = {
            chatbox: { highlight: { field: 'match' }, category: { field: 'pattern' } },
        };
        for (const key of ['colorExpression', 'colorExpressionHelp', 'showLegend', 'showLabels']) {
            expect(categories.items[key].show, key).toBe(categoryFieldIsSet);
            expect(categoryFieldIsSet(noCategory)).toBe(false);
            expect(categoryFieldIsSet(category)).toBe(true);
        }
    });
});

describe('appearance: the overview ruler', () => {
    it('is a switch under Appearance, since it shows search matches as well as highlights', () => {
        const item = definition.items.appearance.items.showRuler;
        expect(item).toMatchObject({
            ref: 'chatbox.showRuler',
            component: 'switch',
            defaultValue: true,
        });
        expect(item.show).toBeUndefined();
    });
});

describe('appearance: the search box', () => {
    it('is a switch under Appearance, on by default', () => {
        const item = definition.items.appearance.items.showSearch;
        expect(item).toMatchObject({
            ref: 'chatbox.showSearch',
            component: 'switch',
            defaultValue: true,
        });
        expect(item.show).toBeUndefined();
    });
});
