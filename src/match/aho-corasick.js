/**
 * Multi-term search with an Aho-Corasick automaton: one pass over the text finds every occurrence of
 * every term.
 *
 * Why not one regular expression alternating all the terms? On V8 it would not be slower: measured
 * on Node 24 against a 4.6 MB text (2026-09-15), an alternation of 10,000 literal values ran in about
 * the same time as this automaton. The automaton is used for what a regular expression does not give:
 * - every occurrence of every term, overlapping ones included, each with the term that produced it,
 *   which the whole-value and overlap rules need;
 * - no limit on the number of terms;
 * - time proportional to the text length plus the number of occurrences on every browser engine,
 *   not only on those whose regular-expression compiler happens to optimise large alternations.
 *   Safari's and Firefox's engines were not measured.
 *
 * It works on UTF-16 code units and reports raw occurrences, overlapping ones included. Which of them
 * count — whole values, overlaps — is decided by the callers.
 *
 * Ported from textview.qs `src/match/aho-corasick.js` at df84a5e, unchanged.
 */

const ROOT = 0;

/** Above this many children a node gets a Map; below it, scanning its children is faster. */
const MAP_THRESHOLD = 8;

/**
 * @callback MatchCallback
 * @param {number} start - Offset of the occurrence's first code unit.
 * @param {number} end - Offset just past its last code unit.
 * @param {number} termId - Index of the term in the list the automaton was built from.
 * @returns {boolean|void} Return false to stop the search.
 */

/**
 * Build a search automaton for a list of terms.
 *
 * @param {string[]} terms - The terms. Empty strings are ignored; for duplicates, the first index is
 *     the one reported.
 * @returns {{nodeCount: number, search: function(string, MatchCallback): boolean}} The automaton.
 *     `search` returns false if the callback stopped it, true if it read the whole text.
 */
export function buildAutomaton(terms) {
    // The root is hit on almost every character, so its transitions are a dense table.
    const rootChild = new Int32Array(0x10000).fill(-1);
    const firstChild = [-1];
    const nextSibling = [-1];
    const unitOf = [0];
    const childCount = [0];
    const childMaps = [undefined];
    const depthOf = [0];
    const termAt = [-1];

    /**
     * Find a node's child for a code unit.
     *
     * @param {number} node - The node.
     * @param {number} unit - The code unit.
     * @returns {number} The child node, or -1 when there is none.
     */
    function childOf(node, unit) {
        if (node === ROOT) return rootChild[unit];
        const map = childMaps[node];
        if (map !== undefined) return map.get(unit) ?? -1;
        for (let child = firstChild[node]; child !== -1; child = nextSibling[child]) {
            if (unitOf[child] === unit) return child;
        }
        return -1;
    }

    /**
     * Add a child to a node.
     *
     * @param {number} node - The parent node.
     * @param {number} unit - The code unit on the edge to the child.
     * @returns {number} The new child node.
     */
    function addChild(node, unit) {
        const child = unitOf.length;
        unitOf.push(unit);
        firstChild.push(-1);
        nextSibling.push(firstChild[node]);
        childCount.push(0);
        childMaps.push(undefined);
        depthOf.push(depthOf[node] + 1);
        termAt.push(-1);
        firstChild[node] = child;
        childCount[node]++;

        if (node === ROOT) {
            rootChild[unit] = child;
        } else if (childMaps[node] !== undefined) {
            childMaps[node].set(unit, child);
        } else if (childCount[node] > MAP_THRESHOLD) {
            const map = new Map();
            for (let sibling = firstChild[node]; sibling !== -1; sibling = nextSibling[sibling]) {
                map.set(unitOf[sibling], sibling);
            }
            childMaps[node] = map;
        }
        return child;
    }

    for (let termId = 0; termId < terms.length; termId++) {
        const term = terms[termId];
        if (term.length === 0) continue;
        let node = ROOT;
        for (let i = 0; i < term.length; i++) {
            const unit = term.charCodeAt(i);
            const child = childOf(node, unit);
            node = child === -1 ? addChild(node, unit) : child;
        }
        if (termAt[node] === -1) termAt[node] = termId;
    }

    const nodeCount = unitOf.length;
    const depth = Int32Array.from(depthOf);
    const fail = new Int32Array(nodeCount);
    // For each node, the nearest node on its failure chain where a term ends.
    const output = new Int32Array(nodeCount).fill(-1);

    // Failure links, breadth first, so every node's parent is linked before the node itself.
    const queue = new Int32Array(nodeCount);
    let head = 0;
    let tail = 0;
    for (let child = firstChild[ROOT]; child !== -1; child = nextSibling[child]) {
        queue[tail++] = child;
    }
    while (head < tail) {
        const node = queue[head++];
        for (let child = firstChild[node]; child !== -1; child = nextSibling[child]) {
            const unit = unitOf[child];
            let candidate = fail[node];
            let target = childOf(candidate, unit);
            while (target === -1 && candidate !== ROOT) {
                candidate = fail[candidate];
                target = childOf(candidate, unit);
            }
            const failTo = target === -1 ? ROOT : target;
            fail[child] = failTo;
            output[child] = termAt[failTo] !== -1 ? failTo : output[failTo];
            queue[tail++] = child;
        }
    }

    /**
     * Report every occurrence of every term in a text, in order of where they end.
     *
     * Occurrences ending at the same offset are reported longest first.
     *
     * @param {string} text - The text to search.
     * @param {MatchCallback} onMatch - Called once per occurrence.
     * @returns {boolean} False if `onMatch` stopped the search, otherwise true.
     */
    function search(text, onMatch) {
        let state = ROOT;
        for (let i = 0; i < text.length; i++) {
            const unit = text.charCodeAt(i);
            let target = childOf(state, unit);
            while (target === -1 && state !== ROOT) {
                state = fail[state];
                target = childOf(state, unit);
            }
            state = target === -1 ? ROOT : target;

            let found = termAt[state] !== -1 ? state : output[state];
            while (found !== -1) {
                if (onMatch(i + 1 - depth[found], i + 1, termAt[found]) === false) return false;
                found = output[found];
            }
        }
        return true;
    }

    return { nodeCount, search };
}
