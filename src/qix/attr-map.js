/**
 * Map attribute-expression ids to their positional index in cell data.
 *
 * Attribute expressions are how per-message metadata rides along without extra
 * hypercube columns — and, importantly, without counting against the engine's
 * 10,000-cell page budget, which is `qWidth × qHeight` only.
 *
 * The engine returns their values **positionally**, as
 * `cell.qAttrExps.qValues[i]`, in definition order. The layout echoes the
 * definitions back as `qAttrExprInfo`, each carrying the plain lowercase `id`
 * we set on the definition. (There is no `qId` field — it does not exist in the
 * schema, despite appearing in some documentation.)
 *
 * Everything therefore hangs on building an id → index map per layout and
 * never hardcoding an index: inserting one expression shifts every later read,
 * silently producing the wrong avatar or the wrong colour with no error.
 */

/** The attribute-expression ids this extension defines, in seeding order. */
export const ATTR_IDS = {
    TS: 'ts',
    TS_TEXT: 'tsText',
    AVATAR: 'avatar',
    MEDIA: 'media',
    KIND: 'kind',
    SIDE: 'side',
    ACCENT: 'accent',
    BADGE: 'badge',
};

/**
 * Build an id → index map for one column's attribute expressions.
 *
 * @param {object} [columnInfo] - A qDimensionInfo or qMeasureInfo entry.
 * @returns {object} Map of attribute id to its index in qAttrExps.qValues.
 */
export function buildAttrMap(columnInfo) {
    const info = columnInfo?.qAttrExprInfo ?? [];
    const map = {};
    info.forEach((entry, index) => {
        if (entry && typeof entry.id === 'string' && entry.id) map[entry.id] = index;
    });
    return map;
}

/**
 * Read one attribute-expression value from a cell by id.
 *
 * @param {object} [cell] - The NxCell carrying qAttrExps.
 * @param {object} [attrMap] - Map from {@link buildAttrMap}.
 * @param {string} id - The attribute id to read.
 * @returns {?object} The NxSimpleValue ({ qText, qNum }), or null when absent.
 */
export function attrValue(cell, attrMap, id) {
    if (!cell || !attrMap) return null;
    const index = attrMap[id];
    if (index === undefined) return null;
    return cell.qAttrExps?.qValues?.[index] ?? null;
}
