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
import { KIND_CHIP_DEFAULTS, KIND_CHIPS_MAX, clampKindChipsMax } from '../chat/kind-chips';
import { ATTR_IDS } from '../qix/attr-map';
import { switchItem } from './items';

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
 * Show an item only while kinds show as chips.
 *
 * @param {object} data - The object properties.
 * @returns {boolean} True when kind chips are switched on.
 */
export function kindChipsShown(data) {
    return data?.chatbox?.kindChips?.show === true;
}

/**
 * Tidy the stored chip count after an edit.
 *
 * @param {object} data - The object properties.
 * @returns {void}
 */
export function tidyKindChipSettings(data) {
    const chips = data?.chatbox?.kindChips;
    if (chips) chips.max = clampKindChipsMax(chips.max);
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
                'Puts messages in time order and groups them by time and by day, e.g. ' +
                    'Num(Min([SentAt])). A Qlik timestamp has no time zone, so each message stays ' +
                    'under the date the data holds, wherever the reader is.'
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
            kind: attrItem(
                ATTR_IDS.KIND,
                'Message kind',
                'e.g. Only([MsgKind]) — text, system. Shown as chips, a message can have several: ' +
                    "Concat(DISTINCT [MsgKind], ',')."
            ),
            // Not attribute expressions: bound under chatbox.kindChips, and left out of ATTR_ORDER.
            kindChipsShow: switchItem({
                ref: 'chatbox.kindChips.show',
                label: 'Show kinds as chips',
                defaultValue: KIND_CHIP_DEFAULTS.show,
            }),
            kindChipsHelp: {
                component: 'text',
                label:
                    'Each kind becomes a chip above the message text. Only() returns nothing for a ' +
                    "message with several kinds, so use Concat(DISTINCT [MsgKind], ',') with the " +
                    'separator chosen below. A comma also splits a value such as 1,000.',
                show: kindChipsShown,
            },
            kindChipsSeparator: {
                ref: 'chatbox.kindChips.separator',
                type: 'string',
                component: 'dropdown',
                label: 'Kinds are separated by',
                defaultValue: KIND_CHIP_DEFAULTS.separator,
                options: [
                    { value: ',', label: 'Comma (,)' },
                    { value: ';', label: 'Semicolon (;)' },
                    { value: '|', label: 'Vertical bar (|)' },
                    { value: 'none', label: 'Do not split' },
                ],
                show: kindChipsShown,
            },
            kindChipsMax: {
                ref: 'chatbox.kindChips.max',
                type: 'number',
                component: 'slider',
                label: 'Most chips per message',
                min: 1,
                max: KIND_CHIPS_MAX,
                step: 1,
                defaultValue: KIND_CHIP_DEFAULTS.max,
                change: tidyKindChipSettings,
                show: kindChipsShown,
            },
            side: attrItem(
                ATTR_IDS.SIDE,
                'Own message (1/0)',
                'Puts a message on the right for 1 or true and on the left for 0 or false, in any ' +
                    "layout, e.g. Only([Direction]) = 'outbound'. Null leaves it to the layout."
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
