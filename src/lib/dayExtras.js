// The other things a day has on it.
//
// What is on reads the Arena and arrives on its own. This is everything that
// does not: Feedr, Lunch Team, Clockmeal, an office delivery, somebody coming
// in to look at the extraction. None of it is in an API and all of it changes
// how many people you want on the floor.
//
// Each one is a name and a time, and that is the whole of it. The time is what
// makes it worth having on the grid rather than in a note: a delivery at eleven
// and a delivery at three are different problems.
//
// The usual ones live on the restaurant and are ticked onto a day. Ticking
// copies the name and the time rather than pointing at them, so renaming Feedr
// next year does not quietly rewrite last March.

import { toMinutes, shortTime } from './roster'

// Tidy up whatever came back from the database.
//
// A name is required and a time is not. Something arriving "some time Tuesday"
// is still worth having on the roster, and refusing it would only mean somebody
// inventing a time to get it in.
export function cleanExtras(list) {
    if (!Array.isArray(list)) return []
    return list
        .filter(e => e && String(e.name || '').trim())
        .map(e => ({
            name: String(e.name).trim(),
            time: e.time ? shortTime(e.time) : '',
        }))
}

// In the order they happen, and anything with no time last.
//
// Last rather than first on purpose. A row reads down as the day goes on, and
// something with no time attached is the one thing that cannot be placed in
// that order, so it belongs at the end rather than at the top of it.
export function sortExtras(list) {
    return cleanExtras(list).sort((a, b) => {
        if (!a.time && !b.time) return a.name.localeCompare(b.name)
        if (!a.time) return 1
        if (!b.time) return -1
        return toMinutes(a.time) - toMinutes(b.time) || a.name.localeCompare(b.name)
    })
}

export function extrasFor(dayNote) {
    return sortExtras(dayNote?.extras)
}

// How one reads in a row: the time then the name, or just the name.
export function extraLabel(extra) {
    return extra?.time ? `${extra.time} ${extra.name}` : String(extra?.name || '')
}

// Is this usual one already on the day? By name, because that is what somebody
// ticking a box means by it.
export function hasExtra(list, name) {
    const wanted = String(name || '').trim().toLowerCase()
    return cleanExtras(list).some(e => e.name.toLowerCase() === wanted)
}

// Ticking one on, or off again.
export function toggleExtra(list, extra) {
    const current = cleanExtras(list)
    return hasExtra(current, extra?.name)
        ? current.filter(e => e.name.toLowerCase() !== String(extra.name).trim().toLowerCase())
        : [...current, ...cleanExtras([extra])]
}

// Changing the time on one that is already there.
//
// A usual list holds the time it normally arrives, and a day can disagree with
// it. That is the whole reason the time is copied onto the day rather than read
// back off the list every time.
export function setExtraTime(list, name, time) {
    const wanted = String(name || '').trim().toLowerCase()
    return cleanExtras(list).map(e => (
        e.name.toLowerCase() === wanted ? { ...e, time: time ? shortTime(time) : '' } : e
    ))
}

export function removeExtra(list, name) {
    const wanted = String(name || '').trim().toLowerCase()
    return cleanExtras(list).filter(e => e.name.toLowerCase() !== wanted)
}

// What is wrong with the usual list before it is saved.
export function usualProblem(list) {
    const seen = new Set()
    for (const extra of list || []) {
        const name = String(extra?.name || '').trim()
        if (!name) return 'One of them has no name.'
        const key = name.toLowerCase()
        if (seen.has(key)) return `${name} is in the list twice.`
        seen.add(key)
    }
    return ''
}
