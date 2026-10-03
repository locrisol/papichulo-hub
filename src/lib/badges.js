// What each sidebar badge says, from my_badges() and the two counts the app
// works out itself (things found nearby, and lines waiting on Review).
//
// A badge goes on an item only when something there is waiting on the person
// looking, they can deal with it on that page, and leaving it costs money,
// trouble or risk. Most are off most days. The rules, 29 September 2026:
//
// - A number when each thing is its own job; a dot when it is one state (a
//   sheet to print, a count left open).
// - Amber is waiting on you. Red is already wrong where a customer or the law
//   is exposed: here, only the allergen sheet changed since it was printed.
//   (Products with no allergen answer are red too; that count is AppLayout's.)
// - It follows the real state. Opening the page does not clear it; doing the
//   job does. The one exception is a report for its owner, where looking is
//   the job.
//
// Where a page already has a tested rule, it is used here, so a badge and its
// page cannot come to disagree.
import { cannotAnswer, isPartDay } from '@/lib/timeOff'
import { publishState } from '@/lib/roster'
import { reportableWeeks, statementWeek, mailMissing, WEEKS_LISTED } from '@/lib/weeklyReport'
import { reprintDue } from '@/lib/allergenSheet'
import { addDays, weekStartOf } from '@/lib/dates'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Weeks on the roster that need publishing: the rest of this week if anything
// in it is not out, and from Thursday, next week if it is not all out. Weeks
// run Sunday to Saturday (weekStartOf). Next week only counts when this week
// has a roster at all, or a restaurant that does not roster in the Hub would
// have it on three days a week.
export function weeksToPublish(shifts, today) {
    const start = weekStartOf(today)
    const end = addDays(start, 6)
    const thisWeek = (shifts || []).filter(s => s.shift_date >= today && s.shift_date <= end)
    const nextWeek = (shifts || []).filter(s => s.shift_date > end && s.shift_date <= addDays(start, 13))
    let weeks = 0
    if (thisWeek.some(s => !s.published_at)) weeks += 1
    const fromThursday = today >= addDays(start, 4)
    if (fromThursday && thisWeek.length > 0 && publishState(nextWeek) !== 'published') weeks += 1
    return weeks
}

// What waits on this person on the Roster.
//
// A store manager or the super admin answers swaps and time off, except a
// store manager's own full days, which an owner answers. An owner answers a
// manager's holiday or day off, not their own, and nothing else unless there
// is no real store manager at the restaurant, when everything is theirs.
export function rosterWaiting(answer) {
    const { role, me, swaps = 0, absences = [], has_store_manager: hasManager, shifts = [], today } = answer || {}
    const publish = weeksToPublish(shifts, today)
    if (role === 'owner' && hasManager) {
        // A manager's part of a day stays the manager's to answer (cannotAnswer).
        return absences.filter(a => a.asker_role === 'store_manager' && a.employee_id !== me && !isPartDay(a)).length
    }
    const timeOff = absences.filter(a => !cannotAnswer(a, me, role)).length
    return swaps + timeOff + publish
}

// Finished weeks with no report sent, from the Monday their statements come
// out, newer than the last one sent; reports reopened and not sent again; and
// published ones whose mail never went (Not sent on the list, mailMissing).
// A restaurant that has never sent one is not owed any: it does not use them.
export function reportsOwed(reports, today) {
    // Only the weeks the Reports list shows, so it never counts one it does not.
    const weeks = new Set(reportableWeeks(WEEKS_LISTED, today))
    const list = (reports || []).filter(r => weeks.has(r.week_start))
    const reopened = list.filter(r => (r.status === 'draft' && r.send_count > 0) || mailMissing(r)).length
    const sent = list.filter(r => r.send_count > 0).map(r => r.week_start).sort()
    if (!sent.length) return reopened
    const lastSent = sent[sent.length - 1]
    const byWeek = new Map(list.map(r => [r.week_start, r]))
    const owed = [...weeks]
        .filter(w => w > lastSent && statementWeek(w).out <= today)
        .filter(w => {
            const report = byWeek.get(w)
            return !report || (report.status === 'draft' && !(report.send_count > 0))
        }).length
    return owed + reopened
}

// Every badge, by the path of its sidebar item. `extras` is { found, review }:
// the two counts worked out by the app with the same reads its pages use.
export function badgesFrom(answer, extras = {}) {
    const a = answer || {}
    const out = {}
    const count = (path, n, words, tone = 'waiting') => {
        if (n > 0) out[path] = { count: n, tone, words: words(n) }
    }
    const dot = (path, words, tone = 'waiting') => { out[path] = { dot: true, tone, words } }

    count('/my-shifts', a.asks || 0, n => `${plural(n, 'shift request', 'shift requests')} waiting for your answer`)

    if (!a.role) return out

    count('/roster', rosterWaiting(a), n => `${n} waiting for you on the roster`)

    const reports = a.role === 'owner' ? (a.unread || 0) : reportsOwed(a.reports, a.today)
    count('/reports', reports, n => (a.role === 'owner'
        ? `${plural(n, 'report', 'reports')} you have not opened`
        : `${plural(n, 'report', 'reports')} to send`))

    const due = a.sheet ? reprintDue({
        printedAt: a.sheet.printed_at, everyMonths: a.sheet.every_months, changedAt: a.sheet.changed_at, today: a.today,
    }) : null
    if (due) dot('/inventory/public-allergens', 'A new allergen sheet needs printing', due.reason === 'changed' ? 'urgent' : 'waiting')

    count('/catalogue/menu-items', a.empty_dishes || 0, n => `${plural(n, 'dish', 'dishes')} on the allergen sheet with no ingredients`)
    if (a.stock_open > 0) dot('/inventory/stock-takes', 'A stock take has been left open for a day')
    count('/invoices/claims', a.claims_late || 0, n => `${plural(n, 'delivery problem', 'delivery problems')} with no credit after a week`)
    count('/team', a.unlinked || 0, n => `${plural(n, 'account', 'accounts')} not linked to anybody on the team`)
    if (a.dead_pages > 0) dot('/settings/restaurant', 'A listings page has not been read for over a week')
    count('/calendar', extras.found || 0, n => `${plural(n, 'listing', 'listings')} found nearby to check`)
    count('/invoices/import', extras.review || 0, n => `${plural(n, 'invoice line', 'invoice lines')} waiting on Review`)

    return out
}

// The dot on a phone's menu button: on when any badge is, in the most urgent
// colour among them.
export function menuDotFrom(badges) {
    const all = Object.values(badges || {})
    if (!all.length) return null
    return { tone: all.some(b => b.tone === 'urgent') ? 'urgent' : 'waiting' }
}
