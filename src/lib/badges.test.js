import { describe, it, expect } from 'vitest'
import { weeksToPublish, rosterWaiting, reportsOwed, badgesFrom, menuDotFrom } from '@/lib/badges'

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
