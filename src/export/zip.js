/**
 * A zip archive of files that are already compressed.
 *
 * The images of one export are PNGs, which a zip cannot shrink further, so they are stored rather than
 * deflated, and this writer is all the extension needs: no library, and nothing a bundle has to carry
 * beyond a CRC table. File names are UTF-8, flagged as such, so a conversation called "Möte" keeps its
 * name. Pure: it builds bytes, and saves nothing.
 */

/** The CRC-32 table, for the polynomial zip uses. */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

/**
 * Work out the CRC-32 of some bytes.
 *
 * @param {Uint8Array} bytes - The bytes.
 * @returns {number} The checksum, unsigned.
 */
export function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index++) {
        crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Write a time as MS-DOS writes it, which is how a zip dates its files.
 *
 * @param {number} wallClock - Wall-clock milliseconds: the reader's local time, read with UTC getters.
 * @returns {{time: number, date: number}} The two 16-bit fields.
 */
export function dosDateTime(wallClock) {
    const d = new Date(wallClock);
    const year = Math.min(Math.max(d.getUTCFullYear(), 1980), 2107);
    return {
        time:
            (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
        date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
    };
}

/**
 * Build a zip archive.
 *
 * @param {Array<{name: string, data: Uint8Array}>} files - The files, in order.
 * @param {object} [options] - Options.
 * @param {number} [options.wallClock] - When the files were made, as the reader's clock shows it.
 * @returns {Uint8Array} The archive.
 */
export function createZip(files, { wallClock = Date.now() } = {}) {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(wallClock);
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
        const name = encoder.encode(file.name);
        const data = file.data;
        const crc = crc32(data);

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true); // version needed: 2.0
        lv.setUint16(6, 0x0800, true); // the name is UTF-8
        lv.setUint16(8, 0, true); // stored
        lv.setUint16(10, time, true);
        lv.setUint16(12, date, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, data.length, true);
        lv.setUint32(22, data.length, true);
        lv.setUint16(26, name.length, true);
        lv.setUint16(28, 0, true);
        local.set(name, 30);

        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true); // made by: 2.0
        cv.setUint16(6, 20, true);
        cv.setUint16(8, 0x0800, true);
        cv.setUint16(10, 0, true);
        cv.setUint16(12, time, true);
        cv.setUint16(14, date, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, data.length, true);
        cv.setUint32(24, data.length, true);
        cv.setUint16(28, name.length, true);
        cv.setUint32(42, offset, true);
        central.set(name, 46);

        locals.push(local, data);
        centrals.push(central);
        offset += local.length + data.length;
    }
    const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, directorySize, true);
    ev.setUint32(16, offset, true);

    const out = new Uint8Array(offset + directorySize + end.length);
    let at = 0;
    for (const part of [...locals, ...centrals, end]) {
        out.set(part, at);
        at += part.length;
    }
    return out;
}
