import { describe, it, expect } from 'vitest'
import {
    workingThatWeek, checkedPeople, paperworkState, paperworkSummary, paperworkFor, permissionNeedsExpiry,
    daysUntil, WARN_DAYS,
} from '@/lib/reportPeople'
import { WORK_PERMISSIONS } from '@/lib/workRules'

const WEEK = '2026-08-09'

function person(name, extra = {}) {
    return { id: name, full_name: name, ...extra }
}

describe('workingThatWeek', () => {
    it('keeps somebody with no dates at all', () => {
        expect(workingThatWeek([person('A')], WEEK)).toHaveLength(1)
    })

    it('drops somebody who left before the week', () => {
        expect(workingThatWeek([person('A', { ended_on: '2026-06-30' })], WEEK)).toHaveLength(0)
    })

    it('keeps somebody who left during the week', () => {
        expect(workingThatWeek([person('A', { ended_on: '2026-08-12' })], WEEK)).toHaveLength(1)
    })

    it('drops somebody who had not started yet', () => {
        expect(workingThatWeek([person('A', { started_on: '2026-09-01' })], WEEK)).toHaveLength(0)
    })

    it('keeps somebody who started mid week', () => {
        expect(workingThatWeek([person('A', { started_on: '2026-08-14' })], WEEK)).toHaveLength(1)
    })
})

describe('paperworkState', () => {
    const people = [
        person('in date', { food_safety_expires: '2027-05-01' }),
        person('also in date', { food_safety_expires: '2028-01-01' }),
        person('running out', { food_safety_expires: '2026-09-28' }),
        person('run out', { food_safety_expires: '2026-07-01' }),
        person('never recorded'),
    ]

    it('sorts everybody into one of four states', () => {
        const out = paperworkState(people, 'food_safety_expires', WEEK)
        expect(out.total).toBe(5)
        expect(out.fine).toBe(2)
        expect(out.expiring).toHaveLength(1)
        expect(out.expired).toHaveLength(1)
        expect(out.missing).toHaveLength(1)
        expect(out.ok).toBe(false)
    })

    it('counts nothing recorded as its own problem, not as in date', () => {
        const out = paperworkState([person('nobody knows')], 'food_safety_expires', WEEK)
        expect(out.fine).toBe(0)
        expect(out.missing).toHaveLength(1)
    })

    it('says it is fine only when there is nothing at all to say', () => {
        const out = paperworkState(
            [person('A', { food_safety_expires: '2028-01-01' })], 'food_safety_expires', WEEK)
        expect(out.ok).toBe(true)
    })

    it('is quiet about something running out beyond the warning', () => {
        const far = { food_safety_expires: '2026-12-25' }
        const out = paperworkState([person('A', far)], 'food_safety_expires', WEEK)
        expect(out.expiring).toHaveLength(0)
        expect(out.fine).toBe(1)
    })

    it('warns on the very last day of the window and not the day after', () => {
        const inside = paperworkState(
            [person('A', { work_permission_expires: '2026-10-08' })], 'work_permission_expires', WEEK)
        const outside = paperworkState(
            [person('A', { work_permission_expires: '2026-10-09' })], 'work_permission_expires', WEEK)

        expect(daysUntil('2026-10-08', WEEK)).toBe(WARN_DAYS)
        expect(inside.expiring).toHaveLength(1)
        expect(outside.expiring).toHaveLength(0)
    })

    it('puts the soonest first, since that is the one to act on', () => {
        const out = paperworkState([
            person('later', { food_safety_expires: '2026-10-01' }),
            person('sooner', { food_safety_expires: '2026-08-20' }),
        ], 'food_safety_expires', WEEK)

        expect(out.expiring.map(e => e.person.full_name)).toEqual(['sooner', 'later'])
    })
})

describe('daysUntil', () => {
    it('counts forward', () => {
        expect(daysUntil('2026-08-16', WEEK)).toBe(7)
    })

    it('counts backward as a negative', () => {
        expect(daysUntil('2026-08-02', WEEK)).toBe(-7)
    })
})

// The bug this was written for: two people with no restriction on their right
// to work were being read as two people with no paperwork on file.
describe('right to work', () => {
    const team = [
        person('citizen', { work_permission: 'unrestricted' }),
        person('also a citizen', { work_permission: 'unrestricted' }),
        person('student, no date', { work_permission: 'stamp2' }),
        person('nobody asked', { work_permission: '' }),
        person('student, in date', { work_permission: 'stamp2', work_permission_expires: '2027-06-01' }),
    ]

    it('does not ask for an expiry from somebody who has nothing to expire', () => {
        expect(permissionNeedsExpiry({ work_permission: 'unrestricted' })).toBe(false)
    })

    it('asks for one from every stamp that runs out', () => {
        for (const stamp of ['stamp1', 'stamp1g', 'stamp2', 'stamp2a']) {
            expect(permissionNeedsExpiry({ work_permission: stamp })).toBe(true)
        }
    })

    it('treats a permission nobody recorded as needing one, because we do not know', () => {
        expect(permissionNeedsExpiry({ work_permission: '' })).toBe(true)
        expect(permissionNeedsExpiry({})).toBe(true)
    })

    it('counts the citizens as in date rather than as gaps', () => {
        const out = paperworkState(team, 'work_permission_expires', WEEK, permissionNeedsExpiry)
        expect(out.fine).toBe(3)
        expect(out.missing.map(p => p.full_name)).toEqual(['student, no date', 'nobody asked'])
    })

    it('still checks a date entered against a permission that usually has none', () => {
        const stampFour = [person('stamp 4', {
            work_permission: 'unrestricted', work_permission_expires: '2026-07-01',
        })]
        const out = paperworkState(stampFour, 'work_permission_expires', WEEK, permissionNeedsExpiry)
        expect(out.expired).toHaveLength(1)
        expect(out.fine).toBe(0)
    })

    it('leaves food safety asking everybody, since anybody handling food needs it', () => {
        const out = paperworkState(team, 'food_safety_expires', WEEK)
        expect(out.missing).toHaveLength(5)
    })
})

// Whether somebody applied to renew is the difference between waiting on the
// post and not being allowed on next week's roster, and it has to be frozen
// with the report: renewed in October must not change what September said.
describe('carrying the renewal into the frozen figures', () => {
    const team = [
        { full_name: 'Iliana', work_permission: 'stamp2', work_permission_expires: '2026-08-23', permission_renewal_applied: '2026-08-01' },
        { full_name: 'Majo', work_permission: 'stamp2', work_permission_expires: '2026-09-13' },
        { full_name: 'Ana', work_permission: 'unrestricted' },
    ]
    const state = paperworkState(team, 'work_permission_expires', '2026-09-20', permissionNeedsExpiry)

    it('says when one was applied for', () => {
        const summary = paperworkSummary(state, { renewals: true })
        expect(summary.expired.find(p => p.name === 'Iliana').applied).toBe('2026-08-01')
    })

    // Null, not missing. The mail reads undefined as "this kind of paperwork has
    // no renewals at all" and null as "it does and nobody applied", and the two
    // must not collapse into one another.
    it('says null when nobody did, rather than leaving it out', () => {
        const summary = paperworkSummary(state, { renewals: true })
        const majo = summary.expired.find(p => p.name === 'Majo')
        expect(majo.applied).toBe(null)
        expect('applied' in majo).toBe(true)
    })

    it('leaves the key off entirely when it was not asked for', () => {
        const summary = paperworkSummary(state)
        expect('applied' in summary.expired[0]).toBe(false)
    })

    // You cannot have applied to renew a permission nobody has recorded.
    it('says nothing about a renewal for somebody with nothing on file', () => {
        const none = paperworkState(
            [{ full_name: 'Sam', work_permission: 'stamp2' }],
            'work_permission_expires', '2026-09-20', permissionNeedsExpiry)
        const summary = paperworkSummary(none, { renewals: true })
        expect('applied' in summary.missing[0]).toBe(false)
    })

    // The whole point of freezing it. A key that vanishes through JSON is a
    // key the mail never sees, and the figures make that trip every time.
    it('survives being stored and read back', () => {
        const summary = JSON.parse(JSON.stringify(paperworkSummary(state, { renewals: true })))
        expect(summary.expired.find(p => p.name === 'Majo').applied).toBe(null)
        expect(summary.expired.find(p => p.name === 'Iliana').applied).toBe('2026-08-01')
    })
})

// Somebody who did one trial shift and left the same day was on the books that
// week, and the report checked the Monday after still listed him.
describe('checkedPeople', () => {
    const MONDAY_AFTER = '2026-08-17'

    it('leaves out somebody who left during the week, once they have gone', () => {
        const gone = person('A', { started_on: '2026-08-12', ended_on: '2026-08-12' })
        expect(workingThatWeek([gone], WEEK)).toHaveLength(1)
        expect(checkedPeople([gone], WEEK, MONDAY_AFTER)).toHaveLength(0)
    })

    it('keeps somebody whose last day is the day it is checked, like the team page', () => {
        expect(checkedPeople([person('A', { ended_on: MONDAY_AFTER })], WEEK, MONDAY_AFTER)).toHaveLength(1)
    })

    it('keeps somebody whose last day is still ahead', () => {
        expect(checkedPeople([person('A', { ended_on: '2026-09-30' })], WEEK, MONDAY_AFTER)).toHaveLength(1)
    })

    it('still leaves out somebody who had not started', () => {
        expect(checkedPeople([person('A', { started_on: '2026-09-01' })], WEEK, MONDAY_AFTER)).toHaveLength(0)
    })
})

// His rule, 27 September: somebody on trial is still listed with no food
// safety certificate, but as on trial, and after the ones that are a job to do.
describe('paperworkFor', () => {
    const MONDAY_AFTER = '2026-08-17'
    const team = [
        person('Ana', { food_safety_expires: '2028-01-01', work_permission: 'unrestricted' }),
        person('Tom', { on_trial: true, work_permission: 'stamp2' }),
        person('Sam', { work_permission: 'unrestricted' }),
        person('Kim', { on_trial: true, work_permission: 'stamp2', work_permission_expires: '2027-01-01' }),
        person('Lee', {
            on_trial: true, started_on: '2026-08-13', ended_on: '2026-08-13', work_permission: 'stamp2',
        }),
    ]
    const out = paperworkFor(team, WEEK, MONDAY_AFTER)

    it('counts only the people still here', () => {
        expect(out.people).toBe(4)
        expect(out.food.total).toBe(4)
        expect(out.permits.total).toBe(4)
    })

    it('lists somebody on trial with no certificate as on trial, after everybody else', () => {
        expect(out.food.missing.map(p => p.name)).toEqual(['Sam', 'Tom (on trial)', 'Kim (on trial)'])
        expect(out.food.fine).toBe(1)
    })

    it('says nothing about a trial beside a work permit', () => {
        expect(out.permits.missing.map(p => p.name)).toEqual(['Tom'])
    })

    it('says it beside a date too', () => {
        const dated = paperworkFor([person('Tom', { on_trial: true, food_safety_expires: '2026-08-01' })], WEEK, MONDAY_AFTER)
        expect(dated.food.expired).toEqual([{ name: 'Tom (on trial)', on: '2026-08-01' }])
    })

    it('never names anybody who has left', () => {
        const all = [...out.food.missing, ...out.permits.missing, ...out.permits.expired]
        expect(all.map(p => p.name).join()).not.toMatch(/Lee/)
    })
})

// The team page and the report read the same list, so a permission cannot be
// a gap on one and fine on the other.
describe('which permissions run out', () => {
    it('says so on every option', () => {
        for (const option of WORK_PERMISSIONS) expect(typeof option.expires).toBe('boolean')
    })

    it('is what the report asks for', () => {
        for (const option of WORK_PERMISSIONS) {
            expect(permissionNeedsExpiry({ work_permission: option.value })).toBe(option.expires)
        }
    })
})
