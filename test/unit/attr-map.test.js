import { describe, it, expect } from 'vitest';
import { ATTR_IDS, attrValue, buildAttrMap } from '../../src/qix/attr-map';

describe('attr-map', () => {
    const info = {
        qAttrExprInfo: [{ id: ATTR_IDS.TS }, { id: ATTR_IDS.AVATAR }, { id: ATTR_IDS.ACCENT }],
    };

    it('maps ids to their positional index', () => {
        expect(buildAttrMap(info)).toEqual({ ts: 0, avatar: 1, accent: 2 });
    });

    it('tolerates a column with no attribute expressions', () => {
        expect(buildAttrMap(undefined)).toEqual({});
        expect(buildAttrMap({})).toEqual({});
    });

    it('skips entries with no id rather than mapping undefined', () => {
        const map = buildAttrMap({ qAttrExprInfo: [{}, { id: 'kept' }] });
        expect(map).toEqual({ kept: 1 });
    });

    it('reads values positionally by id', () => {
        const map = buildAttrMap(info);
        const c = {
            qAttrExps: {
                qValues: [
                    { qNum: 1700000000000 },
                    { qText: '/content/Default/a.png' },
                    { qText: '#ff0000' },
                ],
            },
        };
        expect(attrValue(c, map, ATTR_IDS.AVATAR).qText).toBe('/content/Default/a.png');
        expect(attrValue(c, map, ATTR_IDS.ACCENT).qText).toBe('#ff0000');
    });

    it('SURVIVES a reordered definition — the whole point of the id map', () => {
        // An expression inserted at the front shifts every later index. Reading
        // by id must still return the right value; reading by a hardcoded index
        // would silently return the wrong one, with no error.
        const reordered = {
            qAttrExprInfo: [{ id: 'inserted' }, { id: ATTR_IDS.TS }, { id: ATTR_IDS.AVATAR }],
        };
        const map = buildAttrMap(reordered);
        const c = {
            qAttrExps: { qValues: [{ qText: 'new' }, { qNum: 123 }, { qText: 'avatar.png' }] },
        };
        expect(attrValue(c, map, ATTR_IDS.AVATAR).qText).toBe('avatar.png');
        expect(attrValue(c, map, ATTR_IDS.TS).qNum).toBe(123);
    });

    it('returns null for an unknown id instead of throwing', () => {
        expect(attrValue({ qAttrExps: { qValues: [] } }, {}, 'nope')).toBeNull();
        expect(attrValue(undefined, {}, ATTR_IDS.TS)).toBeNull();
    });
});
