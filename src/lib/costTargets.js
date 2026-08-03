// Which cost target was actually in force for a given week.
//
// Targets change over time, and a change only applies from the week it is made.
// So looking back at July has to use July's target, not whatever is set today,
// otherwise the app quietly rewrites how past weeks were judged.

// targetType is 'food', 'labour' or 'packaging'.
export function resolveTarget(overrides, targetType, weekStart, fallback) {
    const matching = (overrides || []).filter(o =>
        o.target_type === targetType &&
        o.effective_from <= weekStart &&
        (o.effective_until == null || o.effective_until >= weekStart)
    )

    if (matching.length === 0) return fallback ?? null

    // More than one can match, because setting a new target does not close the
    // old one. The newest wins, since that is the most recent decision.
    const newest = matching.reduce((a, b) =>
        (a.created_at || '') >= (b.created_at || '') ? a : b
    )
    return Number(newest.override_value)
}

// Works out the real story of a target over time, for showing on screen.
//
// resolveTarget already picks the right value. This explains that pick, which
// the app was doing badly: setting a new target does not close the old one, so
// several sit open at once and every one said "ongoing".
//
// A target with no end date is really ended by the next one that starts after
// it. And if the next one starts on the same day, the earlier one never applied
// at all, which is worth saying rather than showing an end date before its own
// start.
//
// Returns each target with:
//   value      the percentage
//   from       the week it starts
//   until      the week it really ends, or null if nothing replaces it
//   ended      'set' if it had an end date, 'replaced' if a later one took over,
//              null if it is still running
//   status     'current', 'finished', 'upcoming' or 'never' relative to weekStart
export function describeTargets(overrides, targetType, weekStart) {
    const mine = (overrides || [])
        .filter(o => o.target_type === targetType)
        .sort((a, b) => {
            if (a.effective_from !== b.effective_from) {
                return a.effective_from < b.effective_from ? -1 : 1
            }
            return (a.created_at || '') < (b.created_at || '') ? -1 : 1
        })

    // Which one applies to the week being looked at. Worked out the same way
    // the dashboard does it, so the screen cannot disagree with the number
    // beside it.
    const inForceId = pickInForceId(mine, weekStart)

    return mine.map((o, i) => {
        const next = mine[i + 1]

        let until = o.effective_until
        let ended = o.effective_until ? 'set' : null
        let neverApplied = false

        if (!until && next) {
            const closed = dayBefore(next.effective_from)
            if (closed < o.effective_from) {
                // Something else started on the same day or earlier, so this one
                // was replaced before it ever took effect.
                neverApplied = true
                until = o.effective_from
                ended = 'replaced'
            } else {
                until = closed
                ended = 'replaced'
            }
        }

        // A temporary target can also be superseded before its stated end.
        if (o.effective_until && next && next.effective_from <= o.effective_from) {
            neverApplied = true
        }

        let status
        if (neverApplied) status = 'never'
        else if (o.id === inForceId) status = 'current'
        else if (o.effective_from > weekStart) status = 'upcoming'
        else status = 'finished'

        return {
            id: o.id,
            value: Number(o.override_value),
            from: o.effective_from,
            until,
            ended,
            status,
            wasTemporary: Boolean(o.effective_until),
        }
    }).reverse() // newest first, which is how you read a list like this
}

// Which override resolveTarget would pick for this week, by id rather than
// value, so two targets with the same percentage are not confused.
function pickInForceId(sorted, weekStart) {
    const matching = sorted.filter(o =>
        o.effective_from <= weekStart &&
        (o.effective_until == null || o.effective_until >= weekStart)
    )
    if (matching.length === 0) return null
    const newest = matching.reduce((a, b) =>
        (a.created_at || '') >= (b.created_at || '') ? a : b
    )
    return newest.id
}

// The day before a date string, in local time.
function dayBefore(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}