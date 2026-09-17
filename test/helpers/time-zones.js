/**
 * Run a test as if the machine were in another time zone.
 *
 * CI runs in UTC, where a local getter and a UTC getter give the same date, so a test of dates that stays
 * in the machine's zone cannot see a date read by the wrong clock there. Node takes a new `process.env.TZ`
 * at once, for `Date` and for `Intl` alike; each switch is checked, so a runtime that ignored it would fail
 * the test rather than leave it green.
 */

/**
 * The zones tests run in, with each one's offset from UTC in January as `getTimezoneOffset` gives it: in
 * minutes, positive west of UTC.
 */
export const TIME_ZONES = Object.freeze([
    // Where CI runs.
    { zone: 'UTC', januaryOffset: 0 },
    // East of UTC, with daylight saving: clocks go forward on 29 March 2026 and back on 25 October.
    { zone: 'Europe/Stockholm', januaryOffset: -60 },
    // West of UTC, with daylight saving: clocks go forward on 8 March 2026 and back on 1 November.
    { zone: 'America/New_York', januaryOffset: 300 },
    // Half an hour off the hour.
    { zone: 'Asia/Kolkata', januaryOffset: -330 },
    // The furthest east, UTC+14, and the furthest west, UTC−12 (an Etc zone's sign is reversed).
    { zone: 'Pacific/Kiritimati', januaryOffset: -840 },
    { zone: 'Etc/GMT+12', januaryOffset: 720 },
]);

/** The zone names, for `it.each`. */
export const ZONE_NAMES = TIME_ZONES.map(({ zone }) => zone);

/**
 * Run some code in a time zone, then put the machine's zone back.
 *
 * @param {string} zone - One of {@link TIME_ZONES}.
 * @param {Function} run - The code to run, synchronously: the zone is put back as soon as it returns.
 * @returns {*} What `run` returns.
 */
export function inTimeZone(zone, run) {
    const known = TIME_ZONES.find((entry) => entry.zone === zone);
    if (!known) throw new Error(`Add ${zone} to TIME_ZONES, with its offset, before testing in it`);
    const before = process.env.TZ;
    process.env.TZ = zone;
    try {
        const offset = new Date(Date.UTC(2026, 0, 15, 12)).getTimezoneOffset();
        if (offset !== known.januaryOffset) {
            throw new Error(`TZ=${zone} did not take effect: the offset is ${offset} minutes`);
        }
        return run();
    } finally {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
    }
}
