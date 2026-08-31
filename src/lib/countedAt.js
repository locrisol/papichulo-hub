// When a count was written down, as it should read on the line.
//
// The choice is between "12 minutes ago" and "18:11", and they answer different
// questions. Ago answers "was that me just now"; the time answers "was that
// before or after the delivery came in", which is the one that settles an
// argument. A count can also be reopened the next morning, and "19 hours ago"
// tells nobody which day that was.
//
// So it is the time it happened, with the day added once it was not today. The
// one exception is the first minute, where "just now" is what somebody who has
// this second pressed the button expects to see, and a timestamp reads as
// something to parse.

const TIME = { hour: '2-digit', minute: '2-digit' }

export function countedAt(iso, now = new Date()) {
    if (!iso) return ''
    const at = new Date(iso)
    if (isNaN(at.getTime())) return ''

    const seconds = (now - at) / 1000
    if (seconds >= 0 && seconds < 60) return 'just now'

    const time = at.toLocaleTimeString('en-IE', TIME)

    if (sameDay(at, now)) return time

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (sameDay(at, yesterday)) return `yesterday ${time}`

    // Anything older says the date outright. A count that has been open for a
    // week is exactly when the day matters most.
    return `${at.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })} ${time}`
}

// The whole line under a count, which is the time and who wrote it.
//
// Who matters the moment two people are counting at once, and it is the first
// question asked when a number looks wrong. Left out when nobody knows, rather
// than guessed at.
export function countedLine(iso, name, now = new Date()) {
    const when = countedAt(iso, now)
    if (!when) return name ? `Counted by ${name}` : ''
    return name ? `Counted ${when} by ${name}` : `Counted ${when}`
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate()
}
