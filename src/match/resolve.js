/**
 * Leftmost-longest selection: from occurrences that may overlap, keep the ones a reader expects.
 *
 * Reading from the start of the text, the occurrence that starts first wins; of two that start at the
 * same place, the longer one wins; anything overlapping a winner is dropped. With "New York" and
 * "York City" both selected, "New York City" highlights "New York"; with "ABC 123" and "ABC 1234"
 * both selected and whole values off, "ABC 1234" is highlighted whole.
 *
 * It does not merge adjacent occurrences or split one that crosses a line break; that belongs to the
 * viewer.
 *
 * Ported from textview.qs `src/match/resolve.js` at df84a5e, unchanged.
 */

/**
 * @typedef {object} Occurrence
 * @property {number} start - Offset of the first code unit.
 * @property {number} end - Offset just past the last code unit.
 */

/**
 * Order occurrences by where they start, the longer first when they start together.
 *
 * @param {Occurrence} a - One occurrence.
 * @param {Occurrence} b - Another.
 * @returns {number} Negative when `a` comes first, positive when `b` does.
 */
function byStartThenLongest(a, b) {
    return a.start - b.start || b.end - a.end;
}

/**
 * Keep the leftmost-longest non-overlapping occurrences.
 *
 * @template {Occurrence} T
 * @param {T[]} occurrences - Occurrences in any order. The array is sorted in place.
 * @returns {T[]} The kept occurrences, in text order, none overlapping another.
 */
export function selectLeftmostLongest(occurrences) {
    // The automaton reports by end offset, which for non-overlapping text is already start order,
    // so this sort usually finds a single sorted run.
    occurrences.sort(byStartThenLongest);
    const kept = [];
    let reach = 0;
    for (const occurrence of occurrences) {
        if (occurrence.start >= reach) {
            kept.push(occurrence);
            reach = occurrence.end;
        }
    }
    return kept;
}
