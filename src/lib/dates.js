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