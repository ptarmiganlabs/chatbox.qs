import { describe, it, expect, beforeEach } from 'vitest';
import dataTargets from '../../src/data';
import { ATTR_ORDER } from '../../src/ext/metadata-section';
import { DEFAULT_CIDS, ROLES } from '../../src/qix/column-map';

const target = dataTargets.targets[0];

let uidCounter = 0;
/** Stand-in for stardust's uid(): unique, and never one of our role cIds. */
const uid = () => `uid${(uidCounter += 1)}`;

/** Resolve a FieldTarget limit the way stardust's defFn does. */
const limit = (value, otherAxisCount) =>
    typeof value === 'function' ? value(otherAxisCount) : value;

function makeProperties(chatbox = {}) {
    return { qHyperCubeDef: { qDimensions: [], qMeasures: [] }, chatbox };
}

/**
 * Add a dimension the way stardust's hypercube handler does.
 *
 * Order matters and is copied from stardust.dev.js (addDimension): the uid cId
 * is assigned FIRST, the dimension is pushed, and only then is added() called —
 * so added() sees the new dimension, uid and all, inside the properties it gets.
 * Past max, stardust parks the dimension in qLayoutExclude and never calls added().
 */
function addDimension(properties, { field = 'Field', cId } = {}) {
    const hc = properties.qHyperCubeDef;
    const dimension = {
        qDef: {
            cId: cId || uid(),
            qFieldDefs: [field],
            qSortCriterias: [{ qSortByLoadOrder: 1, qSortByNumeric: 1, qSortByAscii: 1 }],
        },
        qAttributeExpressions: [],
        qAttributeDimensions: [],
    };
    if (hc.qDimensions.length >= limit(target.dimensions.max, hc.qMeasures.length)) return null;
    hc.qDimensions.push(dimension);
    target.dimensions.added(dimension, properties);
    return dimension;
}

function addMeasure(properties, { expression = 'Sum(x)', cId } = {}) {
    const hc = properties.qHyperCubeDef;
    const measure = {
        qDef: { cId: cId || uid(), qDef: expression },
        qAttributeExpressions: [],
        qAttributeDimensions: [],
    };
    if (hc.qMeasures.length >= limit(target.measures.max, hc.qDimensions.length)) return null;
    hc.qMeasures.push(measure);
    target.measures.added(measure, properties);
    return measure;
}

const dimensionCIds = (properties) => properties.qHyperCubeDef.qDimensions.map((d) => d.qDef.cId);

beforeEach(() => {
    uidCounter = 0;
});

describe('data targets: limits', () => {
    it('states min 0 on both axes', () => {
        // Sense manufactures a placeholder column to satisfy a non-zero minimum,
        // and that placeholder renders as "Invalid dimension" on drop.
        expect(limit(target.dimensions.min, 0)).toBe(0);
        expect(limit(target.measures.min, 0)).toBe(0);
    });

    it('states max explicitly, since FieldTarget.max defaults to 1000', () => {
        // Message ID, author, recipient and thread.
        expect(limit(target.dimensions.max, 0)).toBe(4);
        expect(limit(target.measures.max, 0)).toBe(10);
    });

    it('refuses a dimension past the maximum', () => {
        const properties = makeProperties();
        for (let i = 0; i < 4; i += 1) addDimension(properties);
        expect(addDimension(properties)).toBeNull();
        expect(properties.qHyperCubeDef.qDimensions).toHaveLength(4);
    });

    it('is a plain number, because stardust calls max() with only the measure count', () => {
        // A function could not see the conversation model, so the limit has to
        // fit both models as a constant.
        expect(typeof target.dimensions.max).toBe('number');
    });
});

describe('data targets: dimension seeding', () => {
    it('seeds dimension roles in slot order', () => {
        const properties = makeProperties();
        for (let i = 0; i < 3; i += 1) addDimension(properties);
        expect(dimensionCIds(properties)).toEqual([
            DEFAULT_CIDS[ROLES.MESSAGE_ID],
            DEFAULT_CIDS[ROLES.AUTHOR],
            DEFAULT_CIDS[ROLES.THREAD],
        ]);
    });

    it('seeds by ROLE, not slot, after a middle dimension is removed', () => {
        // Delete the author and add another dimension: it must become the author
        // again, even though it lands in the third slot. Slot-based seeding would
        // hand it the thread cId a surviving column already holds.
        const properties = makeProperties();
        for (let i = 0; i < 3; i += 1) addDimension(properties);
        properties.qHyperCubeDef.qDimensions.splice(1, 1);

        const replacement = addDimension(properties);
        expect(replacement.qDef.cId).toBe(DEFAULT_CIDS[ROLES.AUTHOR]);
        expect(dimensionCIds(properties)).toEqual([
            DEFAULT_CIDS[ROLES.MESSAGE_ID],
            DEFAULT_CIDS[ROLES.THREAD],
            DEFAULT_CIDS[ROLES.AUTHOR],
        ]);
    });

    it('gives the message-id dimension numeric sort and every attribute expression, empty', () => {
        const properties = makeProperties();
        const id = addDimension(properties);

        expect(id.qDef.qSortCriterias).toEqual([{ qSortByNumeric: 1, qSortByAscii: 0 }]);
        // The seeding list and the panel's slot order are two separate arrays in
        // two files. The engine returns attribute values positionally, so they
        // must never drift apart.
        expect(id.qAttributeExpressions.map((e) => e.id)).toEqual(ATTR_ORDER);
        expect(id.qAttributeExpressions.every((e) => e.qExpression === '')).toBe(true);
        expect(id.qAttributeExpressions.every((e) => e.qAttribute === true)).toBe(true);
    });

    it('gives other dimensions ascii sort and no attribute expressions', () => {
        const properties = makeProperties();
        addDimension(properties);
        const author = addDimension(properties);
        const thread = addDimension(properties);

        for (const dimension of [author, thread]) {
            expect(dimension.qDef.qSortCriterias).toEqual([{ qSortByAscii: 1 }]);
            expect(dimension.qAttributeExpressions).toEqual([]);
        }
    });

    it('pins autoSort and null suppression off on every dimension', () => {
        // autoSort left on lets the panel overwrite the deliberate sort criteria —
        // the "why is my chat in random order" bug.
        const properties = makeProperties();
        for (let i = 0; i < 3; i += 1) addDimension(properties);
        for (const dimension of properties.qHyperCubeDef.qDimensions) {
            expect(dimension.qDef.autoSort).toBe(false);
            expect(dimension.qNullSuppression).toBe(false);
        }
    });

    it('reassigns a copied dimension whose role cId another column already holds', () => {
        const properties = makeProperties();
        addDimension(properties);
        addDimension(properties);
        const copy = addDimension(properties, { cId: DEFAULT_CIDS[ROLES.AUTHOR] });
        expect(copy.qDef.cId).toBe(DEFAULT_CIDS[ROLES.THREAD]);
    });

    it('leaves the cId alone when every role is already taken', () => {
        const properties = makeProperties();
        for (let i = 0; i < 4; i += 1) addDimension(properties);
        const extra = { qDef: { cId: 'uid-extra' } };
        properties.qHyperCubeDef.qDimensions.push(extra);
        target.dimensions.added(extra, properties);
        expect(extra.qDef.cId).toBe('uid-extra');
    });

    it('does not throw when handed no properties', () => {
        const dimension = { qDef: {} };
        expect(() => target.dimensions.added(dimension, undefined)).not.toThrow();
        expect(dimension.qDef.cId).toBe(DEFAULT_CIDS[ROLES.MESSAGE_ID]);

        const measure = { qDef: {} };
        expect(() => target.measures.added(measure, undefined)).not.toThrow();
        expect(measure.qDef.cId).toBe(DEFAULT_CIDS[ROLES.TEXT]);
    });
});

describe('data targets: measure seeding', () => {
    it('seeds the text and probe roles, then leaves KPI measures their own cId', () => {
        const properties = makeProperties();
        addMeasure(properties);
        addMeasure(properties);
        const kpi = addMeasure(properties, { cId: 'uid-kpi' });
        expect(properties.qHyperCubeDef.qMeasures.map((m) => m.qDef.cId)).toEqual([
            DEFAULT_CIDS[ROLES.TEXT],
            DEFAULT_CIDS[ROLES.DUP_CHECK],
            'uid-kpi',
        ]);
        expect(kpi.qDef.cId).toBe('uid-kpi');
    });
});

describe('data targets: conversation models', () => {
    const fromTo = () => makeProperties({ conversationModel: 'fromTo' });

    it('keeps the participant model slots exactly as they were, with a recipient fourth', () => {
        const properties = makeProperties();
        for (let i = 0; i < 4; i += 1) addDimension(properties);
        expect(dimensionCIds(properties)).toEqual([
            DEFAULT_CIDS[ROLES.MESSAGE_ID],
            DEFAULT_CIDS[ROLES.AUTHOR],
            DEFAULT_CIDS[ROLES.THREAD],
            DEFAULT_CIDS[ROLES.RECIPIENT],
        ]);
    });

    it('seeds the From → To model with the recipient third', () => {
        const properties = fromTo();
        for (let i = 0; i < 4; i += 1) addDimension(properties);
        expect(dimensionCIds(properties)).toEqual([
            DEFAULT_CIDS[ROLES.MESSAGE_ID],
            DEFAULT_CIDS[ROLES.AUTHOR],
            DEFAULT_CIDS[ROLES.RECIPIENT],
            DEFAULT_CIDS[ROLES.THREAD],
        ]);
    });

    it('seeds a recipient next after switching models with three dimensions in place', () => {
        // Switching never rewrites existing columns; it only steers the next add.
        const properties = makeProperties();
        for (let i = 0; i < 3; i += 1) addDimension(properties);
        properties.chatbox.conversationModel = 'fromTo';
        expect(addDimension(properties).qDef.cId).toBe(DEFAULT_CIDS[ROLES.RECIPIENT]);
    });

    it('lets a copied dimension keep a role cId no other column holds', () => {
        // stardust pushes the column before calling added(). Counting the column
        // as a holder of its own cId turned a copied recipient into the author.
        const properties = makeProperties();
        addDimension(properties);
        const copy = addDimension(properties, { cId: DEFAULT_CIDS[ROLES.RECIPIENT] });
        expect(copy.qDef.cId).toBe(DEFAULT_CIDS[ROLES.RECIPIENT]);
    });
});

describe('data targets: slot descriptions', () => {
    it('names each slot by model before anything is added', () => {
        const participant = makeProperties();
        expect(target.dimensions.description(participant, 0)).toMatch(/^Dim 1 · Message ID/);
        expect(target.dimensions.description(participant, 1)).toMatch(/^Dim 2 · Participant/);
        expect(target.dimensions.description(participant, 2)).toMatch(/^Dim 3 · Conversation/);
        expect(target.dimensions.description(participant, 3)).toMatch(/^Dim 4 · To \(optional\)/);
        expect(target.dimensions.description(participant, 4)).toBe('');

        const fromTo = makeProperties({ conversationModel: 'fromTo' });
        expect(target.dimensions.description(fromTo, 1)).toMatch(/^Dim 2 · From/);
        expect(target.dimensions.description(fromTo, 2)).toMatch(/^Dim 3 · To —/);
        expect(target.dimensions.description(fromTo, 3)).toMatch(/^Dim 4 · Conversation/);
    });

    it('names a dimension by the role it really has after a drag', () => {
        const properties = makeProperties();
        for (let i = 0; i < 3; i += 1) addDimension(properties);
        const [id, author, thread] = properties.qHyperCubeDef.qDimensions;
        properties.qHyperCubeDef.qDimensions = [id, thread, author];

        expect(target.dimensions.description(properties, 1)).toMatch(/Conversation/);
        expect(target.dimensions.description(properties, 2)).toMatch(/Participant/);
    });

    it('names each dimension for what it is after a model switch', () => {
        const properties = makeProperties();
        for (let i = 0; i < 3; i += 1) addDimension(properties);
        properties.chatbox.conversationModel = 'fromTo';
        // The third column is still the thread; the next one added is the To.
        expect(target.dimensions.description(properties, 2)).toMatch(/Conversation/);
        expect(target.dimensions.description(properties, 3)).toMatch(/^Dim 4 · To —/);
    });

    it('calls out a dimension no role uses', () => {
        const properties = makeProperties();
        addDimension(properties);
        addDimension(properties);
        properties.qHyperCubeDef.qDimensions.push({ qDef: { cId: DEFAULT_CIDS[ROLES.AUTHOR] } });
        expect(target.dimensions.description(properties, 2)).toMatch(/Not used/);
    });

    it('repeats the KPI label for every measure from the third on', () => {
        const properties = makeProperties();
        expect(target.measures.description(properties, 0)).toMatch(/Message text/);
        expect(target.measures.description(properties, 1)).toMatch(/Count\(\[MsgId\]\)/);
        expect(target.measures.description(properties, 2)).toMatch(/KPI/);
        expect(target.measures.description(properties, 7)).toBe(
            target.measures.description(properties, 2)
        );
    });

    it('steers the From → To probe away from a key field', () => {
        // Counting a key field counts the linked table's rows, so Count([MsgId])
        // over a recipients link table reports every group message as merged.
        const properties = makeProperties({ conversationModel: 'fromTo' });
        expect(target.measures.description(properties, 1)).toMatch(/Count\(\[MsgText\]\)/);
    });
});
