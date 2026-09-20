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

import { toMinutes, shortTime } from '@/lib/roster'

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

// Which line of the strip each one goes on.
//
// Two things landing half an hour apart put their labels on top of each other,
// which is what happened the first time this was drawn: 11:30 Lunch Team and
// 12:00 Feedr came out as one unreadable word.
//
// Greedy, and it reuses a line as soon as there is room. Anything far enough
// from the last thing on a line shares it, so a day with a delivery in the
// morning and one at night is still one line rather than two.
//
// The gap is in minutes rather than in pixels because this file cannot measure
// letters. Two hours is about as much room as a short label needs on a normal
// day, and being wrong here costs a line of height and never a collision.
export function extraLanes(list, minGapMinutes = 120) {
    const lanes = []
    for (const extra of sortExtras(list)) {
        if (!extra.time) {
            // No time, no place on the strip. These are named beside the label
            // instead, since the one thing they cannot say is when.
            continue
        }
        const at = toMinutes(extra.time)
        const lane = lanes.findIndex(row => at - toMinutes(row[row.length - 1].time) >= minGapMinutes)
        if (lane === -1) lanes.push([extra])
        else lanes[lane].push(extra)
    }
    return lanes
}

// Everything a day has on it, in the order it happens.
//
// Three tables and one question. A catering job is a diary entry, Feedr is a
// tick on the day, a concert next door is a listing at a place, and a row that
// reads down the day cannot care which of the three a thing came out of.
//
// They used to be drawn as two groups on the week view, the diary first, on the
// argument that something somebody committed to outranks something that merely
// turns up. That reads as a ranking on paper and it does not on a screen: a
// catering job at 13:00 sitting above a Lunch Team drop at 11:30 just looks
// like the times are wrong, which is worse than a standing order being a line
// higher than it deserves. **His call, 20 September.**
//
// The day view already did it this way, through the lane packer, which is why
// only the week was wrong and why this is the second place needing it.
//
// **Nothing is capped here and nothing should be.** The calendar month caps a
// day at three because a month is six rows and one busy Friday must not make
// all six taller. The roster is seven columns, the height cost lands once, and
// a row that hides the fourth thing on the one day that has four things hides
// exactly the day you opened it for. His call, and the consequence is that a
// chip has to be cheap in height rather than rare.
//
// Each one keeps whatever it arrived as, under `entry`, `extra` or `near`,
// because the three are drawn differently and only the caller knows how.
export function whatIsOn(entries, dayNote, near) {
    const items = [
        ...(entries || []).map(entry => ({
            time: entry?.starts_at ? shortTime(entry.starts_at) : '',
            entry,
        })),
        ...(near || []).map(row => ({ time: row?.time || '', near: row })),
        ...extrasFor(dayNote).map(extra => ({ time: extra.time, extra })),
    ]

    // Anything with no time last, the same rule sortExtras follows and for the
    // same reason: it is the one thing that cannot be placed in the day's
    // order. Two at the same time keep the order they came in, which is why the
    // three are listed above in the order they are: at half six exactly, a job
    // somebody booked comes before a concert, and a concert before the standing
    // delivery that arrives every week anyway.
    return items.sort((a, b) => {
        if (!a.time && !b.time) return 0
        if (!a.time) return 1
        if (!b.time) return -1
        return toMinutes(a.time) - toMinutes(b.time)
    })
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

// The whole week at once, which is the shape the schedule arrives in.
//
// The Feedr schedule comes every Thursday and the Lunch Team one every Friday,
// each of them about one delivery across a week. Entering that a day at a time
// means opening seven days to type three times, and the time that differs on
// one of them is the easiest thing in the world to miss.
//
// A row per delivery, a column per day, and a cell holds the time rather than a
// tick. The time is the half that varies, showing it costs the same as showing
// a tick, and it answers the question a tick raises.
//
// null means it is not on that day. An empty string means it is on and nobody
// said when, which is a real answer and not the same as not being on.
export function weekGrid(usualExtras, dayNotes, dates) {
    const days = dates || []
    const onDate = {}
    for (const date of days) {
        onDate[date] = extrasFor((dayNotes || []).find(n => n.note_date === date))
    }

    // The usual list first and in its own order, because that is the order
    // somebody set and the order they will look for. Anything ticked onto a day
    // that is not on the usual list follows, since a one off still has to be
    // visible or the grid disagrees with the roster beside it.
    const rows = []
    const seen = new Set()

    for (const usual of cleanExtras(usualExtras)) {
        seen.add(usual.name.toLowerCase())
        rows.push({ name: usual.name, usualTime: usual.time, usual: true })
    }

    for (const date of days) {
        for (const extra of onDate[date]) {
            const key = extra.name.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            rows.push({ name: extra.name, usualTime: '', usual: false })
        }
    }

    return rows.map(row => ({
        ...row,
        onDay: Object.fromEntries(days.map(date => {
            const found = onDate[date].find(e => e.name.toLowerCase() === row.name.toLowerCase())
            return [date, found ? (found.time || '') : null]
        })),
        count: days.filter(date => onDate[date]
            .some(e => e.name.toLowerCase() === row.name.toLowerCase())).length,
    }))
}
