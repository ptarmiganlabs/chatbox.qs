/**
 * Per-message metadata, expressed as attribute expressions.
 *
 * These items bind to the extension's OWN property bag (`chatbox.attrs.*`), not
 * to a hypercube path. That indirection exists for one hard-won reason:
 *
 *   A property-panel item materialises the property path it binds to as soon as
 *   the panel is built, regardless of any `show` guard. An item bound to
 *   `qHyperCubeDef.qDimensions.0.qAttributeExpressions.N.qExpression` therefore
 *   CREATES `qDimensions[0]`, and Sense renders that fieldless dimension as a red
 *   "Invalid dimension" the instant the object is dropped on a sheet.
 *
 * Nesting them inside the dimension section fixes that but requires splitting
 * `uses: 'data'` into `uses: 'dimensions'` + `uses: 'measures'`, which Sense
 * rejects — and a rejected section makes the ENTIRE property panel silently fail
 * to render. So: bind here, and let `qix/sync-attrs.js` copy the values into the
 * real attribute expressions once a dimension exists.
 */
import { ATTR_IDS } from '../qix/attr-map';

/**
 * Slot order for the attribute expressions.
 *
 * The engine returns attribute-expression values positionally, so this order is
 * the contract between the panel, the seeding in data.js and the read in
 * attr-map.js. Appending is safe; reordering is not.
 */
export const ATTR_ORDER = [
    ATTR_IDS.TS,
    ATTR_IDS.TS_TEXT,
    ATTR_IDS.AVATAR,
    ATTR_IDS.MEDIA,
    ATTR_IDS.KIND,
    ATTR_IDS.SIDE,
    ATTR_IDS.ACCENT,
    ATTR_IDS.BADGE,
];

/**
 * Build one expression item bound to the extension's own property bag.
 *
 * @param {string} id - The attribute id.
 * @param {string} label - The panel label.
 * @param {string} description - Helper text explaining what to enter.
 * @returns {object} The property-panel item.
 */
function attrItem(id, label, description) {
    return {
        ref: `chatbox.attrs.${id}`,
        type: 'string',
        label,
        description,
        expression: 'optional',
    };
}

/**
 * Build the Message metadata accordion section.
 *
 * @returns {object} The section definition.
 */
export function metadataSection() {
    return {
        type: 'items',
        label: 'Message metadata',
        description:
            'Attribute expressions on the Message ID dimension. They add no columns and do not ' +
            'count against the engine page limit, so they are effectively free. Each must ' +
            'aggregate — use Only([Field]), not a bare field reference.',
        items: {
            ts: attrItem(
                ATTR_IDS.TS,
                'Timestamp (numeric)',
                'Groups messages by time, e.g. Num(Min([SentAt])). Qlik returns a day serial; ' +
                    'the extension converts it to a real time.'
            ),
            tsText: attrItem(
                ATTR_IDS.TS_TEXT,
                'Timestamp (display)',
                'Shown under the bubble, e.g. Only(Time([SentAt])).'
            ),
            avatar: attrItem(
                ATTR_IDS.AVATAR,
                'Avatar URL',
                'https:// or a content library path such as /content/Default/ada.png'
            ),
            media: attrItem(
                ATTR_IDS.MEDIA,
                'Media reference',
                'Reserved for a future release. Store a stable reference, not a signed URL.'
            ),
            kind: attrItem(ATTR_IDS.KIND, 'Message kind', 'e.g. Only([MsgKind]) — text, system.'),
            side: attrItem(
                ATTR_IDS.SIDE,
                'Own message (1/0)',
                'Returns 1 for messages that align right. Applies in any layout.'
            ),
            accent: attrItem(
                ATTR_IDS.ACCENT,
                'Accent colour',
                'Colours the bubble rail, e.g. Only([SpeakerColor]).'
            ),
            badge: attrItem(
                ATTR_IDS.BADGE,
                'Badge text',
                'A short label beside the timestamp, e.g. Only([ThreadId]).'
            ),
        },
    };
}

export default metadataSection;
