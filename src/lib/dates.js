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
// Which week of the year a week is, counting the way the reports always have.
//
// Not the ISO week number. ISO weeks run Monday to Sunday and this system runs
// Sunday to Saturday, so the two are off by a day all year and would disagree
// about the number on most weeks. The weekly report has been calling 9 August
// 2026 week 32 since long before any of this was in a database, and a screen
// that renumbered it would be wrong no matter how defensible the arithmetic.
//
// Week 1 is the one starting on the first Sunday of the year. A week that
// starts in late December and runs into January belongs to the year it started
// in, and keeps counting from there, which is why 2026 can have a week 53.
export function weekNumber(weekStart) {
    const start = new Date(weekStart + 'T00:00:00')
    const year = start.getFullYear()

    const firstSunday = new Date(year, 0, 1)
    firstSunday.setDate(firstSunday.getDate() + ((7 - firstSunday.getDay()) % 7))

    if (start < firstSunday) {
        // A week that began before this year had its first Sunday is the last
        // week of the year before, so ask that year instead.
        const previous = new Date(year - 1, 0, 1)
        previous.setDate(previous.getDate() + ((7 - previous.getDay()) % 7))
        return Math.round((start - previous) / 604800000) + 1
    }

    return Math.round((start - firstSunday) / 604800000) + 1
}

// A week written out with its year. For example 9 Aug to 15 Aug 2026.
//
// The year is on it because a list of weeks is read across the turn of the
// year, and "28 Dec to 3 Jan" beside "21 Dec to 27 Dec" says nothing about
// which December. Week numbers restart too, so week 52 and week 1 can sit
// beside each other with nothing but the year telling them apart.
//
// Only the end year, unless the week crosses into a new one, in which case both
// are shown. Repeating the same year twice on a row that does not need it is
// noise, and this is a column that is read at a glance.
export function weekRange(weekStart) {
    const start = new Date(weekStart + 'T00:00:00')
    const end = new Date(weekStart + 'T00:00:00')
    end.setDate(end.getDate() + 6)

    const from = shortDate(weekStart)
    const to = shortDate(toISODate(end))

    if (start.getFullYear() !== end.getFullYear()) {
        return `${from} ${start.getFullYear()} to ${to} ${end.getFullYear()}`
    }
    return `${from} to ${to} ${end.getFullYear()}`
}

// A timestamp as a date, for example 23/08/2026.
//
// fullDate above takes a plain YYYY-MM-DD and adds T00:00:00 so it is read as
// local rather than UTC. A timestamp out of the database already carries a time
// and a zone, so it needs its own door rather than being fed through that one.
//
// Built by hand for the same reason fullDate is: toLocaleDateString follows
// whatever locale the browser is set to, so the same screen reads 23/08/2026 on
// one machine and 8/23/2026 on another. Ten places were calling it directly
// with 'en-IE' passed in by hand, which works until somebody changes the format
// in one of them and not the other nine.
export function stampDate(stamp) {
    if (!stamp) return ''
    const d = new Date(stamp)
    if (isNaN(d)) return ''
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${day}/${month}/${d.getFullYear()}`
}

// The same with the time on it, for example 23/08/2026, 14:05.
export function stampDateTime(stamp) {
    if (!stamp) return ''
    const d = new Date(stamp)
    if (isNaN(d)) return ''
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    return `${stampDate(stamp)}, ${hours}:${minutes}`
}

// The month a timestamp falls in, written out. For example September 2026.
export function monthYearOf(stamp) {
    if (!stamp) return ''
    const d = new Date(stamp)
    if (isNaN(d)) return ''
    return d.toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
}
