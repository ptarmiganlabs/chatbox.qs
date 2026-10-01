/**
 * The toolbar's buttons, and the icons they carry.
 *
 * One icon per concept, stroked in `currentColor`, so a light and a dark theme need one drawing
 * between them. Sizes are in `em` off the bar's own font size, so the controls keep their place
 * whatever size the conversation's text is set to.
 *
 * Adapted from textview.qs `src/render/controls.js`.
 */
import styles from './chat.module.css';

/** The icon paths, 16x16, drawn with `stroke: currentColor` and no fill. */
export const ICONS = Object.freeze({
    /** One sheet over another. */
    copy: Object.freeze(['M6 5.5h7.5v8H6z', 'M10.5 3.5H2.5v8']),
    /** Two speech bubbles, the second behind the first: a message among its conversation. */
    whole: Object.freeze(['M2.5 3.5h8v5h-5l-3 2.5z', 'M6.5 10.5h3l3 2.5V6h-2']),
});

/**
 * Render one icon.
 *
 * @param {object} props - Component props.
 * @param {string[]} props.paths - The path data, from {@link ICONS}.
 * @returns {object} The rendered icon.
 */
export function Icon({ paths }) {
    return (
        <svg
            className={styles.icon}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            {paths.map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}

/**
 * Render a toolbar button.
 *
 * `type="button"` matters: Qlik Sense puts extensions inside its own forms, and a button without it
 * submits one. A button that does not toggle carries no `aria-pressed` at all, rather than `false`.
 *
 * @param {object} props - Component props.
 * @param {string} props.className - The button's class.
 * @param {string} props.label - Its name, used as both the tooltip and the accessible name.
 * @param {string} [props.text] - A glyph, when the button carries no icon.
 * @param {string[]} [props.paths] - Icon paths, from {@link ICONS}.
 * @param {boolean} [props.pressed] - The toggle state, or undefined for a button that does not toggle.
 * @param {boolean} [props.disabled] - Whether it is disabled.
 * @param {boolean} [props.tabbable] - Whether it takes the object's tab stop.
 * @param {string} [props.keyShortcuts] - The keys that do the same thing.
 * @param {Function} props.onClick - What a click does; takes the event.
 * @returns {object} The rendered button.
 */
export function ToolButton({
    className,
    label,
    text = '',
    paths = null,
    pressed = undefined,
    disabled = false,
    tabbable = true,
    keyShortcuts = undefined,
    onClick,
}) {
    return (
        <button
            type="button"
            className={className}
            title={keyShortcuts ? `${label} (${keyShortcuts})` : label}
            aria-label={label}
            aria-pressed={pressed === undefined ? undefined : String(pressed)}
            aria-keyshortcuts={keyShortcuts}
            disabled={disabled}
            tabIndex={tabbable ? 0 : -1}
            onClick={onClick}
        >
            {paths === null ? text : <Icon paths={paths} />}
        </button>
    );
}

export default ToolButton;
