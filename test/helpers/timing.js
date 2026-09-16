/**
 * Time some work by its fastest run, after one warm-up run.
 *
 * Ratio tests compare how time grows between two input sizes. A single run, or even a median, picks up
 * whatever else the machine is doing — and the test suite itself runs files in parallel — while the
 * fastest of several runs is the one least disturbed: contention only ever adds time.
 *
 * @param {Function} work - The work to time.
 * @param {number} [runs] - How many timed runs to take the fastest of.
 * @returns {number} The fastest duration in milliseconds.
 */
export function fastestTime(work, runs = 7) {
    work();
    let fastest = Infinity;
    for (let run = 0; run < runs; run++) {
        const started = performance.now();
        work();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}
