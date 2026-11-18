/**
 * The export dialog: which conversation, in which format, and how.
 *
 * Opened from the object's context menu, inside the object. With conversations side by side it asks
 * whether to export the one right-clicked or every one shown, preselecting the one right-clicked; then
 * PDF, PNG or HTML, and for a PNG whether it is cut into 16:9 slides or drawn as one tall image, and
 * whether its background is transparent. The title block is on by default and can be left out, for a
 * slide that has a title of its own.
 *
 * Keys pressed in it stay in it: the conversation underneath moves its focus on the arrow keys.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { formatCount } from '../util/format';
import styles from './chat.module.css';

/** What the dialog offers first, before the reader has chosen anything. */
export const EXPORT_DEFAULTS = Object.freeze({
    format: 'pdf',
    shape: 'slides',
    transparent: false,
    title: true,
});

/** What each format does, said under the choice. */
const FORMAT_HINTS = {
    pdf: 'Opens the print dialog: choose Save as PDF there.',
    png: {
        slides: 'Images sized for a 16:9 slide. A long conversation becomes several, saved as a zip.',
        tall: 'One tall image. A very long conversation becomes several, saved as a zip.',
    },
    html: 'One file that opens in any browser.',
};

/**
 * Say what a format will do.
 *
 * @param {string} format - 'pdf', 'png' or 'html'.
 * @param {string} shape - For a PNG, 'slides' or 'tall'.
 * @returns {string} The hint.
 */
export function formatHint(format, shape) {
    if (format === 'png') return FORMAT_HINTS.png[shape] ?? FORMAT_HINTS.png.slides;
    return FORMAT_HINTS[format] ?? FORMAT_HINTS.pdf;
}

/**
 * Render the export dialog.
 *
 * @param {object} props - Component props.
 * @param {?Array<{label: string, count: number}>} [props.lanes] - The conversations shown side by side;
 *     null for one conversation.
 * @param {?number} [props.lane] - The lane right-clicked, or null when the click was not in one.
 * @param {object} [props.initial] - The choices to start from: the last export's, or the defaults.
 * @param {Function} props.onCancel - Closes the dialog.
 * @param {function(object, function(number, number): void): Promise<void>} props.onExport - Runs the
 *     export with the choice (`format`, `lane`, `title`, `shape`, `transparent`) and a progress callback.
 * @returns {object} The dialog.
 */
export function ExportDialog({
    lanes = null,
    lane = null,
    initial = EXPORT_DEFAULTS,
    onCancel,
    onExport,
}) {
    const several = Array.isArray(lanes) && lanes.length > 1;
    const clicked =
        several && Number.isInteger(lane) && lane >= 0 && lane < lanes.length ? lane : null;
    const [scope, setScope] = useState(clicked !== null ? 'lane' : 'all');
    const [format, setFormat] = useState(initial.format ?? EXPORT_DEFAULTS.format);
    const [shape, setShape] = useState(initial.shape ?? EXPORT_DEFAULTS.shape);
    const [transparent, setTransparent] = useState(Boolean(initial.transparent));
    const [title, setTitle] = useState(initial.title !== false);
    const [busy, setBusy] = useState(null);
    const firstRef = useRef(null);
    const id = useId();

    useEffect(() => {
        firstRef.current?.focus({ preventScroll: true });
    }, []);

    /**
     * Run the export with what is chosen.
     *
     * @param {object} event - The form's submit event.
     * @returns {Promise<void>} Resolves once the export has run.
     */
    const submit = async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy('Exporting…');
        // One conversation on a board is exported as itself, under its own name.
        let chosen = null;
        if (several) chosen = scope === 'lane' ? clicked : null;
        else if (Array.isArray(lanes) && lanes.length === 1) chosen = 0;
        await onExport({ format, lane: chosen, title, shape, transparent }, (index, count) =>
            setBusy(
                count > 1
                    ? `Drawing image ${formatCount(index)} of ${formatCount(count)}…`
                    : 'Exporting…'
            )
        );
    };

    /**
     * Keep keys in the dialog, and close it on Escape.
     *
     * @param {object} event - The keyboard event.
     * @returns {void}
     */
    const onKeyDown = (event) => {
        event.stopPropagation();
        if ((event.key === 'Escape' || event.key === 'Esc') && !busy) {
            event.preventDefault();
            onCancel();
        }
    };

    /**
     * Render one radio button of a group.
     *
     * @param {string} name - The group.
     * @param {string} value - This button's value.
     * @param {string} current - The group's value now.
     * @param {function(string): void} set - Sets the group's value.
     * @param {*} label - What the button says.
     * @param {?object} [ref] - Receives the input, for the one focused first.
     * @returns {object} The button.
     */
    const radio = (name, value, current, set, label, ref) => (
        <label className={styles.exportChoice}>
            <input
                ref={ref}
                type="radio"
                name={`${id}-${name}`}
                value={value}
                checked={current === value}
                disabled={Boolean(busy)}
                onChange={() => set(value)}
            />
            <span>{label}</span>
        </label>
    );

    return (
        <div
            className={styles.exportOverlay}
            onKeyDown={onKeyDown}
            onPointerDown={(event) => {
                event.stopPropagation();
                if (event.target === event.currentTarget && !busy) onCancel();
            }}
            onContextMenu={(event) => event.stopPropagation()}
        >
            <form
                className={styles.exportDialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                onSubmit={submit}
            >
                <h2 id={`${id}-title`} className={styles.exportTitle}>
                    Export conversation
                </h2>
                {several ? (
                    <fieldset className={styles.exportGroup}>
                        <legend>Conversations</legend>
                        {clicked !== null
                            ? radio(
                                  'scope',
                                  'lane',
                                  scope,
                                  setScope,
                                  <>
                                      This one: <strong>{lanes[clicked].label}</strong>
                                  </>,
                                  firstRef
                              )
                            : null}
                        {radio(
                            'scope',
                            'all',
                            scope,
                            setScope,
                            `All ${formatCount(lanes.length)} shown, side by side`,
                            clicked === null ? firstRef : undefined
                        )}
                    </fieldset>
                ) : null}
                <fieldset className={styles.exportGroup}>
                    <legend>Format</legend>
                    <div className={styles.exportSegments}>
                        {[
                            ['pdf', 'PDF'],
                            ['png', 'PNG'],
                            ['html', 'HTML'],
                        ].map(([value, label]) => (
                            <label key={value} className={styles.exportSegment}>
                                <input
                                    ref={!several && value === format ? firstRef : undefined}
                                    type="radio"
                                    name={`${id}-format`}
                                    value={value}
                                    checked={format === value}
                                    disabled={Boolean(busy)}
                                    onChange={() => setFormat(value)}
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                    </div>
                    <p className={styles.exportHint}>{formatHint(format, shape)}</p>
                </fieldset>
                {format === 'png' ? (
                    <fieldset className={styles.exportGroup}>
                        <legend>Image</legend>
                        {radio('shape', 'slides', shape, setShape, 'Slide-sized, 16:9')}
                        {radio('shape', 'tall', shape, setShape, 'One tall image')}
                        <label className={styles.exportChoice}>
                            <input
                                type="checkbox"
                                checked={transparent}
                                disabled={Boolean(busy)}
                                onChange={(event) => setTransparent(event.target.checked)}
                            />
                            <span>Transparent background</span>
                        </label>
                    </fieldset>
                ) : null}
                <fieldset className={styles.exportGroup}>
                    <legend>Content</legend>
                    <label className={styles.exportChoice}>
                        <input
                            type="checkbox"
                            checked={title}
                            disabled={Boolean(busy)}
                            onChange={(event) => setTitle(event.target.checked)}
                        />
                        <span>Title with people, dates and counts</span>
                    </label>
                </fieldset>
                <div className={styles.exportActions}>
                    <span className={styles.exportBusy} role="status" aria-live="polite">
                        {busy ?? ''}
                    </span>
                    <button
                        type="button"
                        className={styles.exportButton}
                        disabled={Boolean(busy)}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className={`${styles.exportButton} ${styles.exportPrimary}`}
                        disabled={Boolean(busy)}
                    >
                        Export
                    </button>
                </div>
            </form>
        </div>
    );
}

export default ExportDialog;
