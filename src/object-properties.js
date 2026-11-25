/**
 * Default object properties, including the hypercube definition.
 *
 * The hypercube shape is load-bearing and every flag here is deliberate — see
 * the notes on each. The single most important constraint: a straight-mode
 * hypercube emits one row per distinct combination of dimension values, so a
 * unique message-id dimension must lead the cube or separate messages with
 * identical text merge into one bubble.
 */
import { DEFAULT_CIDS, ROLES } from './qix/column-map';
import { kindChipsBag } from './chat/kind-chips';
import { lanesBag } from './chat/lanes';
import { textToolSettingsBag } from './highlight/settings';

/**
 * Column budget for the initial fetch.
 *
 * Sized for the contract's 4 dimensions (message id, author, recipient, thread)
 * + 2 measures plus room for a few KPI measures. A cube WIDER than this still works — paging refetches it properly —
 * but only a cube that fits gets its first page for free, inside getLayout.
 */
const COLS = 10;

/** The engine caps a GetHyperCubeData call at 10 000 cells (qWidth x qHeight). */
export const MAX_CELLS = 10000;

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

        // 'participant' | 'fromTo'. Steers which role a newly added dimension
        // gets; rendering follows the roles that actually resolve.
        conversationModel: 'participant',
        order: 'oldest', // 'oldest' | 'newest'
        layoutMode: 'rail', // 'rail' | 'sided'
        density: 'auto', // 'auto' | 'comfortable' | 'compact' | 'ultra'
        groupGapSec: 120,
        showAvatars: true,
        dateSeparators: true,
        ownParticipant: '',
        bodyFormat: 'text', // 'text' | 'markdown'  — markdown is opt-in
        maxMessages: 5000,
        onBubbleClick: 'selectAuthor',
        revealMode: 'auto', // 'auto' | 'pane' | 'overlay' | 'inline'
        virtualize: true,

        // Message kinds as chips above the text; see src/chat/kind-chips.js.
        kindChips: kindChipsBag(),

        // Conversations side by side, one lane per thread; see src/chat/lanes.js. Lanes combine with
        // either layout, so they are not a layoutMode.
        lanes: lanesBag(),

        // highlight, match, category: keyword highlighting. One definition in
        // src/highlight/settings.js serves these defaults, the property panel and
        // the render code, so they cannot drift apart.
        ...textToolSettingsBag(),
    },
};

export { COLS, ROLES };
