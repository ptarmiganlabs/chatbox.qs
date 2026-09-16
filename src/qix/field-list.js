/**
 * Listing the app's fields, for the highlight field dropdown.
 *
 * The property panel hands its option providers an app handle whose shape depends on the host: Qlik
 * Cloud and nebula pass an enigma.js Doc, while client-managed Sense passes a Capability API app,
 * whose enigma Doc sits at `model.enigmaModel` (filter-pane-header.qs). The first candidate that can
 * create a session object lists the fields, through a temporary field-list object it then destroys.
 *
 * System, hidden and derived fields are left out: they are rarely what an author means, and a hidden
 * field can still be typed by name. It never throws. A list that cannot be read is null, so the
 * dropdown can say so instead of looking like an app without fields.
 *
 * Ported from textview.qs `src/qix/field-list.js` at df84a5e, unchanged.
 */

/** The temporary session object that lists the fields. */
const FIELD_LIST_DEFINITION = Object.freeze({
    qInfo: Object.freeze({ qType: 'FieldList' }),
    qFieldListDef: Object.freeze({
        qShowSystem: false,
        qShowHidden: false,
        qShowDerivedFields: false,
        qShowSemantic: true,
        qShowSrcTables: false,
        qShowImplicit: false,
    }),
});

/** Field names sort the same way on every host, whatever its locale. */
const NAME_ORDER = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Find the enigma.js Doc behind an app handle.
 *
 * @param {*} candidate - An enigma Doc, a Capability API app, or anything else.
 * @returns {?object} A Doc that can create and destroy session objects, or null.
 */
export function enigmaDoc(candidate) {
    for (const doc of [candidate, candidate?.model?.enigmaModel]) {
        if (
            typeof doc?.createSessionObject === 'function' &&
            typeof doc?.destroySessionObject === 'function'
        ) {
            return doc;
        }
    }
    return null;
}

/**
 * Destroy a temporary session object without letting a failure escape.
 *
 * @param {object} doc - The enigma Doc.
 * @param {string} id - The session object's id.
 * @returns {void}
 */
function destroyQuietly(doc, id) {
    // The engine drops session objects with the session, so a failed clean-up costs nothing.
    Promise.resolve()
        .then(() => doc.destroySessionObject(id))
        .catch(() => {});
}

/**
 * List the app's fields.
 *
 * @param {Array<*>} candidates - App handles to try, in order.
 * @param {object} [options] - Options.
 * @param {{warn: Function}} [options.logger] - Where failures are reported.
 * @returns {Promise<?string[]>} The field names in alphabetical order, or null when no candidate
 *     could list them.
 */
export async function listFields(candidates, { logger } = {}) {
    for (const candidate of candidates) {
        const doc = enigmaDoc(candidate);
        if (doc === null) continue;

        let model = null;
        try {
            model = await doc.createSessionObject(FIELD_LIST_DEFINITION);
            const layout = await model.getLayout();
            const items = layout?.qFieldList?.qItems ?? [];
            return items
                .filter(
                    (item) =>
                        typeof item?.qName === 'string' &&
                        !item.qIsSystem &&
                        !item.qIsHidden &&
                        !item.qIsDerivedField
                )
                .map((item) => item.qName)
                .sort(NAME_ORDER.compare);
        } catch (error) {
            logger?.warn?.('The field list could not be read:', error);
        } finally {
            if (model?.id) destroyQuietly(doc, model.id);
        }
    }
    return null;
}
