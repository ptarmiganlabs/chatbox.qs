/**
 * Default object properties, including the hypercube definition.
 *
 * The hypercube shape is load-bearing and every flag here is deliberate — see
 * the notes on each. The single most important constraint: a straight-mode
 * hypercube emits one row per distinct combination of dimension values, so a
 * unique message-id dimension must lead the cube or separate messages with
 * identical text merge into one bubble.
 */
import { ATTR_IDS } from './qix/attr-map';
import { DEFAULT_CIDS, ROLES } from './qix/column-map';

/**
 * Column budget for the initial fetch.
 *
 * Sized for the contract's 3 dimensions + 2 measures plus room for a few KPI
 * measures. A cube WIDER than this still works — paging refetches it properly —
 * but only a cube that fits gets its first page for free, inside getLayout.
 */
const COLS = 10;

/** The engine caps a GetHyperCubeData call at 10 000 cells (qWidth x qHeight). */
export const MAX_CELLS = 10000;

/**
 * Attribute expressions carrying per-message metadata.
 *
 * These ride on the message-id dimension and, critically, do **not** count
 * against the 10 000-cell page budget — that limit is qWidth x qHeight only.
 * So metadata is free, which is what makes the data-driven design viable.
 *
 * The `id` is a plain lowercase string of our choosing, echoed back by the
 * engine on `qAttrExprInfo[i].id`. There is no `qId` field in the schema.
 *
 * Order matters only in that values return positionally; never read by index,
 * always through the id -> index map built from the layout.
 *
 * @returns {object[]} Attribute-expression definitions, all initially empty.
 */
export function defaultAttributeExpressions() {
    return [
        { id: ATTR_IDS.TS, qExpression: '', qAttribute: true },
        { id: ATTR_IDS.TS_TEXT, qExpression: '', qAttribute: true },
        { id: ATTR_IDS.AVATAR, qExpression: '', qAttribute: true },
        { id: ATTR_IDS.MEDIA, qExpression: '', qAttribute: true },
        { id: ATTR_IDS.KIND, qExpression: '', qAttribute: true },
        { id: ATTR_IDS.SIDE, qExpression: '', qAttribute: true },
        { id: ATTR_IDS.ACCENT, qExpression: '', qAttribute: true },
        { id: ATTR_IDS.BADGE, qExpression: '', qAttribute: true },
    ];
}

export default {
    showTitles: true,
    title: 'Conversation',
    subtitle: '',
    footnote: '',

    qHyperCubeDef: {
        qDimensions: [],
        qMeasures: [],
        qColumnOrder: [],

        // Straight table. The engine defaults to 'S' but stating it documents intent.
        qMode: 'S',

        // Both suppressions are pinned off deliberately: a zero-valued KPI must
        // not delete its message, and a message whose text expression returns
        // NULL must still render (as an empty bubble we can flag), not vanish.
        qSuppressZero: false,
        qSuppressMissing: false,
        qPopulateMissing: true,

        qInitialDataFetch: [
            { qTop: 0, qLeft: 0, qWidth: COLS, qHeight: Math.floor(MAX_CELLS / COLS) },
        ],
    },

    chatbox: {
        // Role -> cId. Resolution is by cId so that dragging a column in the
        // property panel — a one-gesture, unwarned operation — cannot silently
        // repoint "author" at the message body.
        roles: { ...DEFAULT_CIDS },

        order: 'oldest', // 'oldest' | 'newest'
        layoutMode: 'rail', // 'rail' | 'sided' | 'lanes'
        density: 'auto', // 'auto' | 'comfortable' | 'compact' | 'ultra'
        groupGapSec: 120,
        showAvatars: true,
        dateSeparators: true,
        ownParticipant: '',
        bodyFormat: 'text', // 'text' | 'markdown'  — markdown is opt-in
        maxMessages: 5000,
        onBubbleClick: 'selectAuthor',
        virtualize: true,
    },
};

export { COLS, ROLES };
