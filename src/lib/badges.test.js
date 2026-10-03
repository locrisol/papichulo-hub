import { describe, it, expect } from 'vitest'
import {
    weeksToPublish, rosterWaiting, reportsOwed, badgesFrom, menuDotFrom,
    freedUncovered, salesWaiting, timesheetWaiting, checklistsDue, permitsWaiting,
} from '@/lib/badges'

// Weeks run Sunday to Saturday. 4 October 2026 is a Sunday.
const WED = '2026-10-07'
const THU = '2026-10-08'
const shift = (date, published = true) => ({ shift_date: date, published_at: published ? '2026-10-01T10:00:00Z' : null })

describe('weeks to publish on the roster', () => {
    it('counts the rest of this week when something in it is not out', () => {
        expect(weeksToPublish([shift('2026-10-09', false), shift('2026-10-10')], WED)).toBe(1)
        expect(weeksToPublish([shift('2026-10-09'), shift('2026-10-10')], WED)).toBe(0)
    })

    // A shift already gone is not something to publish now.
    it('does not count a day already gone', () => {
        expect(weeksToPublish([shift('2026-10-05', false), shift('2026-10-09')], WED)).toBe(0)
    })

    it('from Thursday, counts next week not all out, an empty one included', () => {
        const thisWeek = [shift('2026-10-09')]
        expect(weeksToPublish(thisWeek, WED)).toBe(0)
        expect(weeksToPublish(thisWeek, THU)).toBe(1)
        expect(weeksToPublish([...thisWeek, shift('2026-10-12'), shift('2026-10-13', false)], THU)).toBe(1)
        expect(weeksToPublish([...thisWeek, shift('2026-10-12'), shift('2026-10-13')], THU)).toBe(0)
    })

    // A restaurant that does not roster in the Hub would have it three days a week.
    it('says nothing about next week where nothing is rostered at all', () => {
        expect(weeksToPublish([], THU)).toBe(0)
    })
})

describe('what waits on the roster, by who is asking', () => {
    const own = { employee_id: 'me', kind: 'holiday', asker_role: 'store_manager' }
    const staff = { employee_id: 'e2', kind: 'holiday', asker_role: 'employee' }
    const manager = { employee_id: 'm2', kind: 'day_off', asker_role: 'store_manager' }
    const base = { me: 'me', swaps: 1, absences: [own, staff, manager], has_store_manager: true, shifts: [], today: WED }

    // A store manager's own holiday is an owner's to answer.
    it('gives a store manager everything but their own full days', () => {
        expect(rosterWaiting({ ...base, role: 'store_manager' })).toBe(1 + 2)
    })

    it('gives an owner only the managers’ time off, not their own', () => {
        expect(rosterWaiting({ ...base, role: 'owner', me: 'm2' })).toBe(1)
    })

    // A manager's part of a day stays the manager's to answer.
    it('leaves a manager’s part of a day off an owner’s count', () => {
        const partDay = { employee_id: 'm2', kind: 'day_off', asker_role: 'store_manager', can_work_to: '15:00' }
        expect(rosterWaiting({ ...base, absences: [manager, partDay], role: 'owner', me: 'o1' })).toBe(1)
    })

    it('gives an owner everything where there is no real store manager', () => {
        expect(rosterWaiting({ ...base, role: 'owner', me: 'o1', has_store_manager: false })).toBe(1 + 3)
    })

    it('adds a week to publish', () => {
        expect(rosterWaiting({ ...base, role: 'super_admin', me: null, shifts: [shift('2026-10-09', false)] })).toBe(1 + 3 + 1)
    })
})

describe('reports owed', () => {
    // Report weeks are named by their Sunday, and can go out from the Monday
    // the statements come out, eight days on.
    const sent = w => ({ week_start: w, status: 'published', send_count: 1, sent_to: ['a@b.ie'] })

    it('counts finished weeks after the last one sent, once their statements are out', () => {
        const today = '2026-10-14'
        expect(reportsOwed([sent('2026-09-20')], today)).toBe(2)
        expect(reportsOwed([sent('2026-09-20'), sent('2026-09-27')], today)).toBe(1)
        expect(reportsOwed([sent('2026-09-20'), { week_start: '2026-09-27', status: 'draft', send_count: 0 }], today)).toBe(2)
    })

    // Not sent on the list, with a Send button.
    it('counts a published report whose mail never went', () => {
        expect(reportsOwed([sent('2026-09-27'), { week_start: '2026-10-04', status: 'published', send_count: 1, sent_to: null }], '2026-10-14')).toBe(1)
    })

    // The list shows ten weeks, so the badge counts no further back.
    it('counts nothing older than the weeks the list shows', () => {
        expect(reportsOwed([sent('2026-10-04'), { week_start: '2026-06-07', status: 'draft', send_count: 1 }], '2026-10-14')).toBe(0)
    })

    it('counts a report reopened and not sent again', () => {
        expect(reportsOwed([sent('2026-09-27'), { week_start: '2026-10-04', status: 'draft', send_count: 1 }], '2026-10-14')).toBe(1)
    })

    // A restaurant that does not use the reports is not owed twelve of them.
    it('owes nothing where none has ever been sent', () => {
        expect(reportsOwed([], '2026-10-14')).toBe(0)
    })
})

describe('the badges', () => {
    it('gives somebody on the staff only their own asks', () => {
        expect(badgesFrom({ asks: 2 })).toEqual({
            '/my-shifts': { count: 2, tone: 'waiting', words: '2 shift requests waiting for your answer' },
        })
        expect(badgesFrom({ asks: 0 })).toEqual({})
    })

    const manager = {
        role: 'store_manager', me: null, today: WED, swaps: 0, absences: [], shifts: [], reports: [],
        sheet: { printed_at: '2026-10-01T10:00:00Z', every_months: 3, changed_at: '2026-09-01T10:00:00Z' },
        empty_dishes: 0, stock_open: 0, claims_late: 0, unlinked: 0,
    }

    it('shows nothing when nothing is waiting', () => {
        expect(badgesFrom(manager)).toEqual({})
    })

    // The paper on the wall is wrong: red.
    it('marks the allergen sheet red once something on it has changed since it was printed', () => {
        const badges = badgesFrom({ ...manager, sheet: { ...manager.sheet, changed_at: '2026-10-02T10:00:00Z' } })
        expect(badges['/inventory/public-allergens']).toEqual({ dot: true, tone: 'urgent', words: 'A new allergen sheet needs printing' })
    })

    it('marks it amber when it has simply never been printed', () => {
        expect(badgesFrom({ ...manager, sheet: { ...manager.sheet, printed_at: null } })['/inventory/public-allergens'].tone).toBe('waiting')
    })

    it('counts each kind of job on its own item', () => {
        const badges = badgesFrom(
            { ...manager, empty_dishes: 2, stock_open: 1, claims_late: 3, unlinked: 1 },
            { found: 4, review: 5 },
        )
        expect(badges['/catalogue/menu-items'].count).toBe(2)
        expect(badges['/inventory/stock-takes'].dot).toBe(true)
        expect(badges['/invoices/claims'].words).toBe('3 delivery problems with no credit after a week')
        expect(badges['/team'].words).toBe('1 account not linked to anybody on the team')
        expect(badges['/calendar'].count).toBe(4)
        expect(badges['/invoices/import'].count).toBe(5)
    })

    it('counts an owner’s unopened reports, not what is owed', () => {
        const badges = badgesFrom({ ...manager, role: 'owner', unread: 2, reports: undefined })
        expect(badges['/reports']).toEqual({ count: 2, tone: 'waiting', words: '2 reports you have not opened' })
    })
})

describe('the dot on a phone', () => {
    it('is on when any badge is, in the most urgent colour', () => {
        expect(menuDotFrom({})).toBeNull()
        expect(menuDotFrom({ a: { tone: 'waiting' } })).toEqual({ tone: 'waiting' })
        expect(menuDotFrom({ a: { tone: 'waiting' }, b: { tone: 'urgent' } })).toEqual({ tone: 'urgent' })
    })
})

describe('hours freed by time off', () => {
    const gap = (date, starts_at = '09:00:00', ends_at = '17:00:00') => ({ date, starts_at, ends_at })
    const freed = [{ id: 'a1', employee_id: 'e1', status: 'approved', cleared_shifts: [gap('2026-10-09'), gap('2026-10-05')] }]

    it('counts a freed shift still to come that nobody is on over', () => {
        expect(freedUncovered(freed, [], WED)).toBe(1)
    })

    // Any overlap on the day is cover (isCovered), the roster's own rule.
    it('is cleared by anybody rostered over those hours', () => {
        const cover = [{ employee_id: 'e2', shift_date: '2026-10-09', starts_at: '12:00:00', ends_at: '20:00:00' }]
        expect(freedUncovered(freed, cover, WED)).toBe(0)
    })

    it('adds to what waits on the roster for a store manager', () => {
        const base = { role: 'store_manager', me: 'me', swaps: 1, absences: [], has_store_manager: true, shifts: [], today: WED }
        expect(rosterWaiting({ ...base, freed })).toBe(2)
        expect(rosterWaiting({ ...base, role: 'owner', me: 'o1', freed })).toBe(0)
    })
})

describe('last week on Weekly sales', () => {
    it('is waiting while a day has nothing saved, where the Hub keeps the sales', () => {
        expect(salesWaiting({ keeps_sales: true, sales_missing: 2 })).toBe(true)
        expect(salesWaiting({ keeps_sales: true, sales_missing: 0 })).toBe(false)
    })

    // A restaurant with nothing saved in the ten weeks before is not reminded.
    it('says nothing where the sales are not kept here', () => {
        expect(salesWaiting({ keeps_sales: false, sales_missing: 7 })).toBe(false)
    })
})

describe('the Timesheet', () => {
    const week = {
        week_start: '2026-09-27', imported: false,
        people: [{ id: 'e1' }], shifts: [{ employee_id: 'e1', shift_date: '2026-09-29' }], entries: [], absences: [],
    }

    it('is waiting while a rostered shift has nothing said about it', () => {
        expect(timesheetWaiting({ today: WED, timesheet: week })).toBe('week')
    })

    // The till's file answers it (dayCell), and so does time off.
    it('is answered by the file being read in, or by time off', () => {
        expect(timesheetWaiting({ today: WED, timesheet: { ...week, imported: true } })).toBeNull()
        const away = [{ employee_id: 'e1', kind: 'sick', starts_on: '2026-09-29', ends_on: '2026-09-29', status: 'approved' }]
        expect(timesheetWaiting({ today: WED, timesheet: { ...week, absences: away } })).toBeNull()
    })

    it('still asks about a clock in with no clock out on an imported week', () => {
        const open = [{ id: 't1', employee_id: 'e1', work_date: '2026-09-29', starts_at: '09:00:00', ends_at: null, kind: 'worked', source: 'import' }]
        expect(timesheetWaiting({ today: WED, timesheet: { ...week, imported: true, entries: open } })).toBe('week')
    })

    // Fortnights from 13 September: 13 to 26 September is the last one over on
    // 7 October. Both of its weeks have to have gone.
    it('is waiting while the last finished pay period is not all sent', () => {
        const pay = { start: '2026-09-13', ever_filed: true, filed: ['2026-09-13'] }
        expect(timesheetWaiting({ today: WED, pay })).toBe('period')
        expect(timesheetWaiting({ today: WED, pay: { ...pay, filed: ['2026-09-13', '2026-09-20'] } })).toBeNull()
    })

    // A test send never files a week, so a restaurant that has never really
    // sent one is not using them.
    it('says nothing about pay periods where none has ever been sent', () => {
        expect(timesheetWaiting({ today: WED, pay: { start: '2026-09-13', ever_filed: false, filed: [] } })).toBeNull()
    })
})

describe('checklists running out of time', () => {
    const weekly = { id: 'w', repeats: 'weeks', every_weeks: 1, starts_on: '2026-09-06', finish_by: null, ended_at: null }
    const monthly = { id: 'm', repeats: 'monthly', every_weeks: null, starts_on: '2026-09-06', finish_by: null, ended_at: null }
    const once = { id: 'o', repeats: 'once', every_weeks: null, starts_on: '2026-10-01', finish_by: '2026-10-08', ended_at: null }

    it('counts a weekly list in the last two days of its week', () => {
        expect(checklistsDue([weekly], WED).count).toBe(0)
        expect(checklistsDue([weekly], '2026-10-09').count).toBe(1)
        expect(checklistsDue([weekly], '2026-10-10').count).toBe(1)
    })

    it('counts a monthly list in its last seven days', () => {
        expect(checklistsDue([monthly], '2026-10-24').count).toBe(0)
        expect(checklistsDue([monthly], '2026-10-25').count).toBe(1)
    })

    // A round ended early clears it too, as it does on the card.
    it('is cleared by a round ended in the same stretch', () => {
        expect(checklistsDue([{ ...weekly, ended_at: '2026-10-05T10:00:00' }], '2026-10-09').count).toBe(0)
        expect(checklistsDue([{ ...weekly, ended_at: '2026-10-01T10:00:00' }], '2026-10-09').count).toBe(1)
    })

    it('counts a list done once from the day before its date, red once past it', () => {
        expect(checklistsDue([once], '2026-10-06')).toEqual({ count: 0, tone: 'waiting' })
        expect(checklistsDue([once], WED)).toEqual({ count: 1, tone: 'waiting' })
        expect(checklistsDue([once], '2026-10-09')).toEqual({ count: 1, tone: 'urgent' })
        expect(checklistsDue([{ ...once, ended_at: '2026-10-02T10:00:00' }], '2026-10-09').count).toBe(0)
        expect(checklistsDue([{ ...once, finish_by: null }], '2026-10-09').count).toBe(0)
    })
})

describe('permission to work on Team', () => {
    // This week and next end on 17 October.
    const soon = { id: 'e1', work_permission_expires: '2026-10-15', permission_renewal_applied: null }
    const gone = { id: 'e2', work_permission_expires: '2026-10-01', permission_renewal_applied: null }

    it('counts somebody rostered whose permission runs out by the end of next week', () => {
        expect(permitsWaiting([soon], null, WED)).toEqual({ count: 1, tone: 'waiting' })
        expect(permitsWaiting([{ ...soon, permission_renewal_applied: '2026-09-01' }], null, WED).count).toBe(0)
    })

    it('is red for somebody rostered with permission already run out', () => {
        expect(permitsWaiting([gone, soon], null, WED)).toEqual({ count: 2, tone: 'urgent' })
    })

    // The roster's own rule (graceFor): applied for in time covers them for
    // the restaurant's grace, applied for after it ran out covers nothing.
    it('leaves out a renewal applied for in time, under the restaurant rule', () => {
        const inTime = { ...gone, permission_renewal_applied: '2026-09-20' }
        expect(permitsWaiting([inTime], null, WED).count).toBe(0)
        expect(permitsWaiting([inTime], { permissionGrace: { on: false } }, WED)).toEqual({ count: 1, tone: 'urgent' })
        expect(permitsWaiting([{ ...gone, permission_renewal_applied: '2026-10-03' }], null, WED).tone).toBe('urgent')
    })
})

describe('the five badges on the sidebar', () => {
    const once = { id: 'o', repeats: 'once', every_weeks: null, starts_on: '2026-10-01', finish_by: '2026-10-05', ended_at: null }

    it('gives somebody on the staff the checklists too', () => {
        expect(badgesFrom({ asks: 0, today: WED, checklists: [once] })).toEqual({
            '/checklists': { count: 1, tone: 'urgent', words: '1 checklist running out of time' },
        })
    })

    const manager = {
        role: 'store_manager', me: null, today: WED, swaps: 0, absences: [], shifts: [], reports: [],
        empty_dishes: 0, stock_open: 0, claims_late: 0, unlinked: 0,
    }

    it('puts a dot on Weekly sales and the Timesheet', () => {
        const badges = badgesFrom({
            ...manager, keeps_sales: true, sales_missing: 1,
            pay: { start: '2026-09-13', ever_filed: true, filed: [] },
        })
        expect(badges['/sales/weekly']).toEqual({ dot: true, tone: 'waiting', words: 'Last week has a day with no sales saved' })
        expect(badges['/costs/timesheet']).toEqual({ dot: true, tone: 'waiting', words: 'The last pay period has not been sent' })
    })

    it('counts permission to work and unlinked logins together on Team', () => {
        const permits = [{ id: 'e2', work_permission_expires: '2026-10-01', permission_renewal_applied: null }]
        const badges = badgesFrom({ ...manager, unlinked: 1, permits })
        expect(badges['/team']).toEqual({
            count: 2, tone: 'urgent',
            words: '1 person rostered with permission to work run out or running out, 1 account not linked to anybody on the team',
        })
    })
})
