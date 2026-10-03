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
//   is exposed: the allergen sheet changed since it was printed, a list done
//   once past the day it should have been finished by, somebody rostered
//   with permission to work run out. (Products with no allergen answer are
//   red too; that count is AppLayout's.)
// - It follows the real state. Opening the page does not clear it; doing the
//   job does. The one exception is a report for its owner, where looking is
//   the job.
//
// Where a page already has a tested rule, it is used here, so a badge and its
// page cannot come to disagree.
import { cannotAnswer, isPartDay, openGaps } from '@/lib/timeOff'
import { publishState } from '@/lib/roster'
import { reportableWeeks, statementWeek, mailMissing, WEEKS_LISTED } from '@/lib/weeklyReport'
import { reprintDue } from '@/lib/allergenSheet'
import { personWeek, unanswered } from '@/lib/timesheet'
import { periodOf as payPeriodOf, periodIsOver } from '@/lib/payPeriod'
import { periodOf as stretchOf } from '@/lib/checklists'
import { graceFor, DEFAULT_RULES } from '@/lib/workRules'
import { addDays, weekStartOf, stampDay } from '@/lib/dates'

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

// Hours taken off the roster by time off, from today on, that nobody is on
// over. Each one is a shift to fill. The roster's own rule (openGaps), on the
// approved absences and the shifts on those days.
export function freedUncovered(freed, cover, today) {
    return openGaps(freed, cover).filter(g => g.date >= today).length
}

// What waits on this person on the Roster.
//
// A store manager or the super admin answers swaps and time off, fills hours
// freed by time off and publishes, except a store manager's own full days,
// which an owner answers. An owner answers a manager's holiday or day off,
// not their own, and nothing else unless there is no real store manager at
// the restaurant, when everything is theirs.
export function rosterWaiting(answer) {
    const { role, me, swaps = 0, absences = [], has_store_manager: hasManager, shifts = [], freed, cover, today } = answer || {}
    const publish = weeksToPublish(shifts, today)
    if (role === 'owner' && hasManager) {
        // A manager's part of a day stays the manager's to answer (cannotAnswer).
        return absences.filter(a => a.asker_role === 'store_manager' && a.employee_id !== me && !isPartDay(a)).length
    }
    const timeOff = absences.filter(a => !cannotAnswer(a, me, role)).length
    return swaps + timeOff + publish + freedUncovered(freed, cover, today)
}

// Whether last week's sales are all in, where the Hub keeps them. A day with
// no row saved, which is the Reports list's own test (weekReadiness): a day
// marked closed has a row. A restaurant with nothing saved in the ten weeks
// before last does not keep its sales here and is not reminded every Sunday.
export function salesWaiting(answer) {
    const a = answer || {}
    return Boolean(a.keeps_sales) && (a.sales_missing || 0) > 0
}

// What the Timesheet is waiting on: 'week' while last week is not finished,
// 'period' while the last finished pay period has not been sent, or null.
//
// Last week is judged by the rows the Reports list reads and the rule it
// applies (personWeek and unanswered): a rostered shift with nothing said
// about it, hours the till's file does not have with no comment, a clock in
// with no clock out. The pay period only once the restaurant has really sent
// one: a test send never files a week, and a restaurant that has never sent
// any is not using them.
export function timesheetWaiting(answer) {
    const a = answer || {}
    const t = a.timesheet
    if (t) {
        const rows = (t.people || []).map(person => personWeek({
            person, weekStart: t.week_start, entries: t.entries, absences: t.absences, shifts: t.shifts,
            imported: t.imported, today: a.today,
        }))
        if (unanswered(rows).length) return 'week'
    }
    const pay = a.pay
    if (pay?.ever_filed && pay.start && a.today) {
        // The period yesterday fell in, if it is over, otherwise the one before.
        let period = payPeriodOf(addDays(a.today, -1), pay.start)
        if (period && !periodIsOver(period.start, a.today)) period = payPeriodOf(addDays(period.start, -1), pay.start)
        const filed = new Set(pay.filed || [])
        if (period && !period.weeks.every(w => filed.has(w))) return 'period'
    }
    return null
}

// Lists running out of time with no round ended in their stretch: a weekly
// list in its last two days, one every few weeks or every month in its last
// seven, a list done once from the day before it should be finished by. Red
// once a once-off list is past that day, matching the Late pill on its card.
// A round ended early clears it the same as one finished, as it does on the
// card. The stretch is lib/checklists' periodOf, so the two agree on which
// stretch it is.
export function checklistsDue(lists, today) {
    let count = 0
    let late = false
    for (const list of lists || []) {
        const ended = list.ended_at ? stampDay(list.ended_at) : null
        if (list.repeats === 'once') {
            if (ended || !list.finish_by || today < addDays(list.finish_by, -1)) continue
            count += 1
            if (today > list.finish_by) late = true
            continue
        }
        const stretch = stretchOf(list, today)
        if (ended && ended >= stretch.from) continue
        const lastDays = list.repeats === 'weeks' && list.every_weeks === 1 ? 2 : 7
        if (today > addDays(stretch.to, -lastDays)) count += 1
    }
    return { count, tone: late ? 'urgent' : 'waiting' }
}

// Who is rostered this week or next with permission to work that has run
// out, or runs out by the end of next week, and no renewal covering it. Red
// once one has run out: somebody is on the roster who may not work. Whether
// a renewal applied for in time still covers them is the roster's own rule
// (graceFor), under the restaurant's settings.
export function permitsWaiting(permits, rules, today) {
    const settings = { ...DEFAULT_RULES, ...(rules || {}) }
    const weekEnd = addDays(weekStartOf(today), 13)
    let count = 0
    let out = false
    for (const e of permits || []) {
        if (e.work_permission_expires < today) {
            if (graceFor(e, weekEnd, settings).covered) continue
            count += 1
            out = true
        } else if (!e.permission_renewal_applied) {
            count += 1
        }
    }
    return { count, tone: out ? 'urgent' : 'waiting' }
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

    // Everybody at the restaurant ticks the checklists.
    const lists = checklistsDue(a.checklists, a.today)
    count('/checklists', lists.count, n => `${plural(n, 'checklist', 'checklists')} running out of time`, lists.tone)

    if (!a.role) return out

    count('/roster', rosterWaiting(a), n => `${n} waiting for you on the roster`)

    if (salesWaiting(a)) dot('/sales/weekly', 'Last week has a day with no sales saved')
    const timesheet = timesheetWaiting(a)
    if (timesheet === 'week') dot('/costs/timesheet', 'Last week is not finished on the timesheet')
    if (timesheet === 'period') dot('/costs/timesheet', 'The last pay period has not been sent')

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
    // Team: one number, red if anybody is on the roster with permission to
    // work already run out. The words say which is which.
    const permits = permitsWaiting(a.permits, a.rules, a.today)
    const unlinked = a.unlinked || 0
    count('/team', permits.count + unlinked, () => [
        permits.count > 0 && `${plural(permits.count, 'person', 'people')} rostered with permission to work ${permits.tone === 'urgent' ? 'run out or running out' : 'running out'}`,
        unlinked > 0 && `${plural(unlinked, 'account', 'accounts')} not linked to anybody on the team`,
    ].filter(Boolean).join(', '), permits.tone)
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
