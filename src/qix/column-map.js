/**
 * Resolve hypercube columns to the roles this extension needs.
 *
 * Two facts govern this module:
 *
 *  1. `qMatrix` rows are **always** dimensions first, then measures, in
 *     definition order. `qColumnOrder` is *display* order only and must never
 *     be used to index into a row; `qEffectiveInterColumnSortOrder` only says
 *     which column drives the sort.
 *  2. Roles are bound to a dimension's / measure's `cId`, not its position.
 *     A user can drag a column in the property panel with one gesture and no
 *     warning; positional binding breaks silently when they do.
 */

/** Role identifiers, used as the keys of a resolved role map. */
export const ROLES = {
    MESSAGE_ID: 'messageId',
    AUTHOR: 'author',
    THREAD: 'thread',
    TEXT: 'text',
    DUP_CHECK: 'dupCheck',
};

/** The `cId` values seeded into the initial properties, by role. */
export const DEFAULT_CIDS = {
    [ROLES.MESSAGE_ID]: 'd_msgid',
    [ROLES.AUTHOR]: 'd_author',
    [ROLES.THREAD]: 'd_thread',
    [ROLES.TEXT]: 'm_text',
    [ROLES.DUP_CHECK]: 'm_dupcheck',
};

/**
 * Build the flat column list for a layout, in qMatrix order.
 *
 * @param {object} [layout] - The object layout containing qHyperCube.
 * @returns {object[]} One descriptor per column: { col, kind, cId, label, info }.
 */
export function buildColumns(layout) {
    const hc = layout?.qHyperCube;
    if (!hc) return [];

    const dims = hc.qDimensionInfo ?? [];
    const measures = hc.qMeasureInfo ?? [];

    const columns = dims.map((info, i) => ({
        col: i,
        kind: 'dim',
        cId: info?.cId ?? null,
        label: info?.qFallbackTitle ?? '',
        info,
    }));

    measures.forEach((info, i) => {
        columns.push({
            // Measures follow every dimension in the matrix row.
            col: dims.length + i,
            kind: 'msr',
            cId: info?.cId ?? null,
            label: info?.qFallbackTitle ?? '',
            info,
        });
    });

    return columns;
}

/** Which axis each role lives on. A role never binds a column of the other kind. */
const ROLE_KIND = {
    [ROLES.MESSAGE_ID]: 'dim',
    [ROLES.AUTHOR]: 'dim',
    [ROLES.THREAD]: 'dim',
    [ROLES.TEXT]: 'msr',
    [ROLES.DUP_CHECK]: 'msr',
};

/**
 * Merge a stored role → cId bag over the defaults.
 *
 * A saved object's bag only holds the roles that existed when it was created,
 * so a role added later must still resolve through its default cId.
 *
 * @param {object} [roleCIds] - Role → cId map from the object properties.
 * @returns {object} A complete role → cId map.
 */
function mergeRoleCIds(roleCIds) {
    const merged = { ...DEFAULT_CIDS };
    for (const [role, cId] of Object.entries(roleCIds ?? {})) {
        if (typeof cId === 'string' && cId) merged[role] = cId;
    }
    return merged;
}

/**
 * Resolve role names to column descriptors.
 *
 * Resolution is by `cId` first. When a role finds no column that way — an older
 * object, or a chart converted from another type, whose columns carry uids — it
 * falls back to the positional convention the initial properties establish, so
 * the extension still renders.
 *
 * The fallback may only take a column that no role has claimed AND that carries
 * no role cId. Without that guard, deleting the Participant dimension moved the
 * thread column into its slot and bound it as the speaker too: every bubble was
 * labelled with a conversation id and the not-configured state never appeared.
 *
 * @param {object} [layout] - The object layout containing qHyperCube.
 * @param {object} [roleCIds] - Role → cId map from the object properties.
 * @returns {object} { columns, byRole, missing } where byRole maps a role to a
 *   column descriptor (or null) and missing lists unresolved required roles.
 */
export function resolveRoles(layout, roleCIds = DEFAULT_CIDS) {
    const columns = buildColumns(layout);
    const cIds = mergeRoleCIds(roleCIds);
    const roleCIdSet = new Set(Object.values(cIds));

    const pools = {
        dim: columns.filter((c) => c.kind === 'dim'),
        msr: columns.filter((c) => c.kind === 'msr'),
    };

    // Positional fallback, matching the slot order the initial properties create.
    const positional = {
        [ROLES.MESSAGE_ID]: pools.dim[0],
        [ROLES.AUTHOR]: pools.dim[1],
        [ROLES.THREAD]: pools.dim[2],
        [ROLES.TEXT]: pools.msr[0],
        [ROLES.DUP_CHECK]: pools.msr[1],
    };

    const byRole = {};
    const claimed = new Set();

    // Pass 1: by cId, within the role's own axis. The first match wins, so a
    // duplicated column cannot take a second role.
    for (const role of Object.values(ROLES)) {
        const column = pools[ROLE_KIND[role]].find(
            (c) => c.cId === cIds[role] && !claimed.has(c.col)
        );
        byRole[role] = column ?? null;
        if (column) claimed.add(column.col);
    }

    // Pass 2: the exact slot, for columns nothing else owns or is tagged for.
    for (const role of Object.values(ROLES)) {
        if (byRole[role]) continue;
        const column = positional[role];
        if (column && !claimed.has(column.col) && !roleCIdSet.has(column.cId)) {
            byRole[role] = column;
            claimed.add(column.col);
        }
    }

    const required = [ROLES.MESSAGE_ID, ROLES.AUTHOR, ROLES.TEXT];
    const missing = required.filter((role) => !byRole[role]);

    return { columns, byRole, missing };
}

/**
 * Collect the measure columns not claimed by a named role.
 *
 * Measures beyond the message text and the integrity probe are per-message KPIs,
 * shown in the detail view. They are identified by exclusion rather than by
 * position, so inserting a role measure later cannot turn it into a KPI.
 *
 * @param {object[]} columns - Column descriptors from {@link buildColumns}.
 * @param {object} byRole - Role map from {@link resolveRoles}.
 * @returns {object[]} Unclaimed measure columns, in cube order.
 */
export function kpiColumns(columns, byRole) {
    const claimed = new Set(
        Object.values(byRole ?? {})
            .filter(Boolean)
            .map((c) => c.col)
    );
    return columns.filter((c) => c.kind === 'msr' && !claimed.has(c.col));
}

/**
 * Find a dimension's index among dimensions only.
 *
 * `selectHyperCubeValues` addresses a dimension by its index in the dimension
 * list, which is not the same as its column index in a qMatrix row once
 * measures exist. Conflating the two is the classic selection bug.
 *
 * @param {object} [column] - A column descriptor from {@link buildColumns}.
 * @returns {number} The dimension index, or -1 when the column is not a dimension.
 */
export function dimensionIndex(column) {
    if (!column || column.kind !== 'dim') return -1;
    return column.col;
}
