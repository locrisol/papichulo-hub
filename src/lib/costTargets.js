// Works out which cost target was actually in force for a given week.
//
// Targets change over time, and a change only applies from the day it is made.
// So looking back at July has to use July's target, not whatever is set today,
// otherwise the app quietly rewrites how past weeks were judged.
//
// An override applies to a week when it started on or before that week and
// either has not ended yet or ends on or after it. With no override, the
// restaurant's own default is used.

// targetType is 'food', 'labour' or 'packaging'.
export function resolveTarget(overrides, targetType, weekStart, fallback) {
    const matching = (overrides || []).filter(o =>
        o.target_type === targetType &&
        o.effective_from <= weekStart &&
        (o.effective_until == null || o.effective_until >= weekStart)
    )

    if (matching.length === 0) return fallback ?? null

    // More than one should not happen, but if it does the newest one wins,
    // since that is the most recent decision someone made.
    const newest = matching.reduce((a, b) =>
        (a.created_at || '') >= (b.created_at || '') ? a : b
    )
    return Number(newest.override_value)
}