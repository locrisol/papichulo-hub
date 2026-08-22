// Date helpers shared across the app.
//
// Never use toISOString to get a date string. It converts to UTC, so local
// midnight becomes the previous day anywhere ahead of UTC, and every date
// quietly shifts back by one. That bug cost us an afternoon in the sales grid.

// Format a Date as YYYY-MM-DD using local time.
export function toISODate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export function todayISO() {
    return toISODate(new Date())
}

// The Sunday that starts the week containing the given date. Weeks run Sunday
// to Saturday everywhere in this system, for sales and for costs alike.
export function weekStartOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() - d.getDay())
    return toISODate(d)
}

// A short readable date, for example 19 Jul.
export function shortDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })
}

// A date with the month written out, for example 6 September.
//
// The short form is right in a table, where the column is narrow and the month
// is repeated on every row. It is wrong in a heading, where it is the thing you
// are reading and "Sept" only saves four letters.
export function dayMonth(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'long' })
}

// A full date with the year, for example 23/08/2026.
//
// Used on the sales and labour grids. "23 Aug" on its own is not enough when
// the screen is full of numbers and you are trying to be sure which week you
// are typing into. Built by hand rather than with toLocaleDateString, so the
// format is the same on every machine whatever the browser locale is set to.
export function fullDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${d.getFullYear()}`
}

// The month and year a week belongs to, for a heading.
//
// Most weeks sit inside one month and read "August 2026". A week that runs into
// the next one reads "August to September 2026", and the few that cross new year
// read "December 2026 to January 2027".
export function weekMonthLabel(weekStart) {
    const start = new Date(weekStart + 'T00:00:00')
    const end = new Date(weekStart + 'T00:00:00')
    end.setDate(end.getDate() + 6)

    const startMonth = start.toLocaleDateString('en-IE', { month: 'long' })
    const endMonth = end.toLocaleDateString('en-IE', { month: 'long' })

    if (start.getFullYear() !== end.getFullYear()) {
        return `${startMonth} ${start.getFullYear()} to ${endMonth} ${end.getFullYear()}`
    }
    if (startMonth !== endMonth) {
        return `${startMonth} to ${endMonth} ${end.getFullYear()}`
    }
    return `${startMonth} ${end.getFullYear()}`
}

// The seven dates, Sunday through Saturday, for a week starting at weekStart.
export function weekDates(weekStart) {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart + 'T00:00:00')
        d.setDate(d.getDate() + i)
        return toISODate(d)
    })
}

// Move a date string by a number of days. Negative goes backwards. Used by the
// day and week arrows, so they always land on a real local date.
export function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + days)
    return toISODate(d)
}

// The first day of the month containing the given date.
export function monthStart(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(1)
    return toISODate(d)
}

// Move a date by a number of months. Always call this on the first of a month:
// moving 31 January forward gives 3 March, because February has no 31st.
export function addMonths(dateStr, months) {
    const d = new Date(dateStr + 'T00:00:00')
    d.setMonth(d.getMonth() + months)
    return toISODate(d)
}

// A month and year, for a heading. For example August 2026.
export function monthLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
}