// What a correction corrected.
//
// In the function's own folder rather than in src/lib, because only what is
// inside a function's folder gets deployed with it, and this is read by the
// mail. The app's test run imports it straight from here, the same way it
// tests the time off words.

const num = v => (v == null || isNaN(Number(v)) ? 0 : Number(v))

// What a correction actually corrected.
//
// A second mail that says "this replaces the one on Monday" makes everybody who
// got the first one read the whole thing again looking for the difference.
// Saying "food was 31.2%, it is 29.8%" means they read one line.
//
// It needs no new column. Re-opening a report deliberately leaves the frozen
// figures alone, so at the moment somebody publishes a second time the report
// still holds exactly what went out the first time, and the difference is the
// old column against the new figures.
//
// The lines below are the ones the mail leads with. Anything else that moved
// moved because one of these did.
const CHANGE_LINES = [
    { key: 'net', label: 'Net sales', pct: null },
    { key: 'food', label: 'Food', pct: 'foodPct' },
    { key: 'packaging', label: 'Packaging and cleaning', pct: 'packagingPct' },
    { key: 'labour', label: 'Labour', pct: 'labourPct' },
    { key: 'deliveryTotal', label: 'Third party delivery costs', pct: null },
    { key: 'standing', label: 'Fixed overheads', pct: null },
    { key: 'earnings', label: 'Net earnings', pct: 'earningsPct' },
]

// A cent, and a twentieth of a percentage point. Below that it is rounding
// rather than a correction, and a mail that lists rounding trains people to
// stop reading the list.
const MONEY_EPS = 0.005
const PCT_EPS = 0.05

export function changesSince(before, after) {
    if (!before || !after) return []

    const out = []
    for (const line of CHANGE_LINES) {
        const was = num(before[line.key])
        const now = num(after[line.key])
        if (Math.abs(now - was) < MONEY_EPS) continue

        const change = { key: line.key, label: line.label, was, now, up: now > was }

        // The percentage only when it moved too. A food cost that went up by
        // ninety euro on a week whose sales went up with it has not changed as
        // a share of anything, and saying it did would be the wrong story.
        if (line.pct) {
            const wasPct = before[line.pct]
            const nowPct = after[line.pct]
            if (wasPct != null && nowPct != null && Math.abs(nowPct - wasPct) >= PCT_EPS) {
                change.wasPct = wasPct
                change.nowPct = nowPct
            }
        }

        out.push(change)
    }
    return out
}
