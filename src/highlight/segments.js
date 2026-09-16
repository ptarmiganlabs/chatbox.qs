/**
 * Cutting rows of text into plain and marked pieces, by offset.
 *
 * Marks come in layers — highlights, find matches, the current match — and each layer is a list of
 * spans of the whole text, in text order and never overlapping within the layer. Spans of different
 * layers may overlap in any way: a find match can fall inside a highlight, or straddle two. A span can
 * also cross from one row into the next: a phone number broken over two lines is one match on two
 * rows, and a line cut into rows of 10,000 characters can be cut inside a match. Each row gets the
 * part of every span that falls inside it, cut wherever any layer starts or ends.
 *
 * In chatbox.qs a "row" is a whole text: a message body, a name in the header line, or the detail
 * quote. The layers are the same three: highlights, search matches, the current one.
 *
 * Offsets in, offsets out: it builds no DOM.
 *
 * Ported from textview.qs `src/render/segments.js` at df84a5e, unchanged.
 */

/**
 * Find the first item, at or after a starting index, whose end lies after an offset.
 *
 * @param {Array<{start: number, end: number}>} items - Spans or rows, in text order.
 * @param {number} offset - The offset.
 * @param {number} [from] - The index to search from; everything before it ends at or before the offset.
 * @returns {number} The index, or `items.length` when every item ends at or before the offset.
 */
export function firstEndingAfter(items, offset, from = 0) {
    let low = from;
    let high = items.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (items[middle].end > offset) high = middle;
        else low = middle + 1;
    }
    return low;
}

/**
 * Cut one row into pieces across several layers of spans.
 *
 * @param {number} rowStart - Offset of the row's first character.
 * @param {number} rowEnd - Offset just past its last character.
 * @param {Array<Array<{start: number, end: number}>>} layers - Each layer's spans, in text order.
 * @returns {Array<{start: number, end: number, spans: number[]}>} Pieces covering the row exactly, in
 *     order. `spans` holds, for each layer, the index of the span the piece belongs to, or -1.
 */
export function layeredPieces(rowStart, rowEnd, layers) {
    const cuts = new Set([rowStart, rowEnd]);
    const cursors = layers.map((spans) => firstEndingAfter(spans, rowStart));
    layers.forEach((spans, layer) => {
        for (
            let index = cursors[layer];
            index < spans.length && spans[index].start < rowEnd;
            index++
        ) {
            cuts.add(Math.max(spans[index].start, rowStart));
            cuts.add(Math.min(spans[index].end, rowEnd));
        }
    });

    const points = [...cuts].sort((a, b) => a - b);
    if (points.length === 1) return [{ start: rowStart, end: rowEnd, spans: layers.map(() => -1) }];

    const pieces = [];
    for (let point = 0; point + 1 < points.length; point++) {
        const start = points[point];
        const end = points[point + 1];
        const spans = layers.map((layerSpans, layer) => {
            while (cursors[layer] < layerSpans.length && layerSpans[cursors[layer]].end <= start) {
                cursors[layer]++;
            }
            const span = layerSpans[cursors[layer]];
            return span !== undefined && span.start <= start ? cursors[layer] : -1;
        });
        pieces.push({ start, end, spans });
    }
    return pieces;
}
