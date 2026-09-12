import { describe, it, expect } from 'vitest'
import { workingThatWeek, paperworkState, permissionNeedsExpiry, daysUntil, WARN_DAYS } from './reportPeople'

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
