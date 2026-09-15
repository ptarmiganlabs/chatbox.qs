import { describe, it, expect } from 'vitest';
import {
    CONVERSATION_MODELS,
    DEFAULT_CIDS,
    ROLES,
    buildColumns,
    conversationModelOf,
    dimensionIndex,
    dimensionRoleOrder,
    requiredRoles,
    resolveRoles,
} from '../../src/qix/column-map';

const layout = (dims, measures) => ({
    qHyperCube: { qDimensionInfo: dims, qMeasureInfo: measures },
});

describe('buildColumns', () => {
    it('places measures AFTER every dimension, matching qMatrix order', () => {
        const cols = buildColumns(
            layout([{ cId: 'a' }, { cId: 'b' }], [{ cId: 'm1' }, { cId: 'm2' }])
        );
        expect(cols.map((c) => [c.cId, c.col, c.kind])).toEqual([
            ['a', 0, 'dim'],
            ['b', 1, 'dim'],
            ['m1', 2, 'msr'],
            ['m2', 3, 'msr'],
        ]);
    });

    it('returns [] for a layout with no hypercube', () => {
        expect(buildColumns(undefined)).toEqual([]);
        expect(buildColumns({})).toEqual([]);
    });
});

describe('resolveRoles', () => {
    const full = layout(
        [{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_thread' }],
        [{ cId: 'm_text' }, { cId: 'm_dupcheck' }]
    );

    it('resolves every role by cId', () => {
        const { byRole, missing } = resolveRoles(full, DEFAULT_CIDS);
        expect(missing).toEqual([]);
        expect(byRole[ROLES.MESSAGE_ID].col).toBe(0);
        expect(byRole[ROLES.AUTHOR].col).toBe(1);
        expect(byRole[ROLES.TEXT].col).toBe(3);
        expect(byRole[ROLES.DUP_CHECK].col).toBe(4);
    });

    it('SURVIVES a user dragging columns — cId binding, not position', () => {
        // Author and thread swapped in the panel. Roles must follow the cId.
        const dragged = layout(
            [{ cId: 'd_msgid' }, { cId: 'd_thread' }, { cId: 'd_author' }],
            [{ cId: 'm_text' }, { cId: 'm_dupcheck' }]
        );
        const { byRole } = resolveRoles(dragged, DEFAULT_CIDS);
        expect(byRole[ROLES.AUTHOR].col).toBe(2);
        expect(byRole[ROLES.THREAD].col).toBe(1);
    });

    it('falls back to positional slots when cIds are absent', () => {
        const noCIds = layout([{}, {}], [{}]);
        const { byRole, missing } = resolveRoles(noCIds, DEFAULT_CIDS);
        expect(missing).toEqual([]);
        expect(byRole[ROLES.MESSAGE_ID].col).toBe(0);
        expect(byRole[ROLES.AUTHOR].col).toBe(1);
        expect(byRole[ROLES.TEXT].col).toBe(2);
    });

    it('reports required roles that cannot be resolved', () => {
        const { missing } = resolveRoles(layout([{ cId: 'd_msgid' }], []), DEFAULT_CIDS);
        expect(missing).toContain(ROLES.AUTHOR);
        expect(missing).toContain(ROLES.TEXT);
        expect(missing).not.toContain(ROLES.MESSAGE_ID);
    });

    it('never hands a column another role owns to a missing role — regression', () => {
        // The Participant dimension was deleted, so the thread column moved into
        // slot 2. The positional fallback used to bind it as the author as well:
        // conversation ids rendered as speakers and nothing said "not configured".
        const { byRole, missing } = resolveRoles(
            layout([{ cId: 'd_msgid' }, { cId: 'd_thread' }], [{ cId: 'm_text' }]),
            DEFAULT_CIDS
        );
        expect(byRole[ROLES.AUTHOR]).toBeNull();
        expect(byRole[ROLES.THREAD].col).toBe(1);
        expect(missing).toEqual([ROLES.AUTHOR]);
    });

    it('still binds by position for a chart converted from another type', () => {
        // stardust gives every added column a uid cId, so a converted chart has
        // no role cIds at all — position is the only information there is.
        const converted = layout(
            [{ cId: 'uidA' }, { cId: 'uidB' }, { cId: 'uidC' }],
            [{ cId: 'uidD' }, { cId: 'uidE' }]
        );
        const { byRole, missing } = resolveRoles(converted, DEFAULT_CIDS);
        expect(missing).toEqual([]);
        expect(byRole[ROLES.AUTHOR].col).toBe(1);
        expect(byRole[ROLES.THREAD].col).toBe(2);
        expect(byRole[ROLES.DUP_CHECK].col).toBe(4);
    });

    it('lets an untagged column fill its slot beside tagged ones', () => {
        const { byRole } = resolveRoles(
            layout([{ cId: 'd_msgid' }, { cId: 'uidB' }], [{ cId: 'm_text' }]),
            DEFAULT_CIDS
        );
        expect(byRole[ROLES.AUTHOR].col).toBe(1);
    });

    it('never binds a dimension role to a measure carrying its cId', () => {
        const { byRole, missing } = resolveRoles(
            layout([{ cId: 'd_msgid' }], [{ cId: 'd_author' }, { cId: 'm_text' }]),
            DEFAULT_CIDS
        );
        expect(byRole[ROLES.AUTHOR]).toBeNull();
        expect(byRole[ROLES.TEXT].col).toBe(2);
        // The measure in the probe's slot is tagged for another role, so it is
        // not quietly reinterpreted as the probe either.
        expect(byRole[ROLES.DUP_CHECK]).toBeNull();
        expect(missing).toEqual([ROLES.AUTHOR]);
    });

    it('binds a duplicated cId once and does not reinterpret the copy', () => {
        const { byRole } = resolveRoles(
            layout(
                [{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_author' }],
                [{ cId: 'm_text' }]
            ),
            DEFAULT_CIDS
        );
        expect(byRole[ROLES.AUTHOR].col).toBe(1);
        expect(byRole[ROLES.THREAD]).toBeNull();
    });

    it('resolves a role the stored bag predates through its default cId', () => {
        // A saved object's chatbox.roles only lists the roles that existed when
        // it was created.
        const { byRole, missing } = resolveRoles(
            layout(
                [{ cId: 'd_thread' }, { cId: 'd_msgid' }, { cId: 'd_author' }],
                [{ cId: 'm_text' }, { cId: 'm_dupcheck' }]
            ),
            { messageId: 'd_msgid', author: 'd_author', text: '' }
        );
        expect(missing).toEqual([]);
        expect(byRole[ROLES.THREAD].col).toBe(0);
        expect(byRole[ROLES.TEXT].col).toBe(3);
        expect(byRole[ROLES.DUP_CHECK].col).toBe(4);
    });

    it('treats the optional thread role as absent without complaint', () => {
        const { byRole, missing } = resolveRoles(
            layout([{ cId: 'd_msgid' }, { cId: 'd_author' }], [{ cId: 'm_text' }]),
            DEFAULT_CIDS
        );
        expect(missing).toEqual([]);
        expect(byRole[ROLES.THREAD]).toBeNull();
    });
});

describe('dimensionIndex', () => {
    it('returns the dimension index for a dimension and -1 for a measure', () => {
        const cols = buildColumns(layout([{ cId: 'a' }], [{ cId: 'm' }]));
        expect(dimensionIndex(cols[0])).toBe(0);
        // A measure has no dimension index; sending its column index to
        // selectHyperCubeValues would select the wrong field.
        expect(dimensionIndex(cols[1])).toBe(-1);
        expect(dimensionIndex(null)).toBe(-1);
    });
});

describe('conversation models', () => {
    it('reads the participant model for anything but an explicit fromTo', () => {
        // Objects saved before the setting existed carry nothing.
        expect(conversationModelOf(undefined)).toBe(CONVERSATION_MODELS.PARTICIPANT);
        expect(conversationModelOf({})).toBe(CONVERSATION_MODELS.PARTICIPANT);
        expect(conversationModelOf({ conversationModel: 'nonsense' })).toBe(
            CONVERSATION_MODELS.PARTICIPANT
        );
        expect(conversationModelOf({ conversationModel: 'fromTo' })).toBe(
            CONVERSATION_MODELS.FROM_TO
        );
    });

    it('requires a recipient only in the From → To model', () => {
        expect(requiredRoles('participant')).not.toContain(ROLES.RECIPIENT);
        expect(requiredRoles('fromTo')).toContain(ROLES.RECIPIENT);
    });

    it('keeps the participant slot order and adds the recipient fourth', () => {
        expect(dimensionRoleOrder('participant')).toEqual([
            ROLES.MESSAGE_ID,
            ROLES.AUTHOR,
            ROLES.THREAD,
            ROLES.RECIPIENT,
        ]);
        expect(dimensionRoleOrder('fromTo')).toEqual([
            ROLES.MESSAGE_ID,
            ROLES.AUTHOR,
            ROLES.RECIPIENT,
            ROLES.THREAD,
        ]);
    });

    it('reports a missing To when a thread sits where the From → To model expects it', () => {
        // A participant object switched to From → To: its third column is still
        // tagged as the thread and must not be read as the recipient.
        const { byRole, missing } = resolveRoles(
            layout(
                [{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_thread' }],
                [{ cId: 'm_text' }]
            ),
            DEFAULT_CIDS,
            { conversationModel: 'fromTo' }
        );
        expect(byRole[ROLES.RECIPIENT]).toBeNull();
        expect(byRole[ROLES.THREAD].col).toBe(2);
        expect(missing).toEqual([ROLES.RECIPIENT]);
    });

    it('never reads a tagged recipient as the thread in the participant model', () => {
        const { byRole, missing } = resolveRoles(
            layout(
                [{ cId: 'd_msgid' }, { cId: 'd_author' }, { cId: 'd_recipient' }],
                [{ cId: 'm_text' }]
            ),
            DEFAULT_CIDS
        );
        expect(byRole[ROLES.THREAD]).toBeNull();
        expect(byRole[ROLES.RECIPIENT].col).toBe(2);
        expect(missing).toEqual([]);
    });

    it('resolves a fourth recipient dimension in the participant model', () => {
        const { byRole } = resolveRoles(
            layout(
                [
                    { cId: 'd_msgid' },
                    { cId: 'd_author' },
                    { cId: 'd_thread' },
                    { cId: 'd_recipient' },
                ],
                [{ cId: 'm_text' }]
            ),
            DEFAULT_CIDS
        );
        expect(byRole[ROLES.RECIPIENT].col).toBe(3);
    });

    it('binds by cId whatever order the From → To dimensions are in', () => {
        const { byRole, missing } = resolveRoles(
            layout(
                [
                    { cId: 'd_msgid' },
                    { cId: 'd_author' },
                    { cId: 'd_thread' },
                    { cId: 'd_recipient' },
                ],
                [{ cId: 'm_text' }]
            ),
            DEFAULT_CIDS,
            { conversationModel: 'fromTo' }
        );
        expect(missing).toEqual([]);
        expect(byRole[ROLES.RECIPIENT].col).toBe(3);
        expect(byRole[ROLES.THREAD].col).toBe(2);
    });

    it('follows the model’s slot order for columns without role cIds', () => {
        const converted = layout(
            [{ cId: 'uidA' }, { cId: 'uidB' }, { cId: 'uidC' }, { cId: 'uidD' }],
            [{ cId: 'uidE' }]
        );
        const fromTo = resolveRoles(converted, DEFAULT_CIDS, { conversationModel: 'fromTo' });
        expect(fromTo.byRole[ROLES.RECIPIENT].col).toBe(2);
        expect(fromTo.byRole[ROLES.THREAD].col).toBe(3);

        const participant = resolveRoles(converted, DEFAULT_CIDS);
        expect(participant.byRole[ROLES.THREAD].col).toBe(2);
        expect(participant.byRole[ROLES.RECIPIENT].col).toBe(3);
    });
});
