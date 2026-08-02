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