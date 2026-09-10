import { describe, it, expect } from 'vitest';
import ext from '../../src/ext/index';
import { ATTR_ORDER, metadataSection } from '../../src/ext/metadata-section';

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
