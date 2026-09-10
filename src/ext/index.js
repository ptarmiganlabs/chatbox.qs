/**
 * Property-panel definition.
 *
 * Two constraints shape everything here.
 *
 * On client-managed Sense the client's own AngularJS panel renders this, so the
 * full classic component set is available — not just the subset nebula
 * documents. But `nebula serve` ignores `ext.definition` entirely (its editor
 * introspects raw properties by JavaScript type), so nothing here can be
 * previewed locally: every change needs a `nebula sense` build and an upload to
 * a real server. A wrong `component` string fails silently, rendering a default
 * text box or nothing at all, with no console error.
 *
 * Hence: keep this a pure data structure, and unit-test its shape.
 */
import { aboutSection } from './about-section';
import { appearanceSection } from './appearance-section';
import { behaviourSection } from './behaviour-section';
import { detailSection } from './detail-section';
import { metadataSection } from './metadata-section';

/**
 * Build the extension definition.
 *
 * @param {object} [_galaxy] - The nebula environment (unused).
 * @returns {object} The ext object attached to the supernova.
 */
export default function ext(_galaxy) {
    return {
        support: {
            // Snapshot and export re-render from the captured layout in a
            // backend browser, so the view state a reader cares about — scroll
            // position, the open detail — is written into that layout by
            // onTakeSnapshot and read back on the far side. Virtualization is
            // also turned off for those renders: the export browser photographs
            // whatever it is given, and a virtualized render would capture one
            // screen of the conversation and silently drop the rest.
            snapshot: true,
            export: true,
            exportData: true,
            sharing: false,
            viewData: false,
        },
        definition: {
            type: 'items',
            component: 'accordion',
            items: {
                // `uses: 'data'` and nothing else. Splitting it into separate
                // `uses: 'dimensions'` / `uses: 'measures'` sections makes Sense
                // reject the definition and render NO property panel at all —
                // silently, with no console error.
                data: { uses: 'data' },
                appearance: appearanceSection(),
                metadata: metadataSection(),
                detail: detailSection(),
                behaviour: behaviourSection(),
                addons: { uses: 'addons', items: { dataHandling: { uses: 'dataHandling' } } },
                about: aboutSection(),
            },
        },
    };
}
