import { describe, it, expect } from 'vitest'
import { gapsFor, teamGaps, countGaps } from './teamGaps'

const TODAY = '2026-09-10'

// Somebody whose record is complete, so every test below is about the one
// thing it takes away.
const whole = (extra = {}) => ({
    id: 'e1',
    full_name: 'Ana',
    started_on: '2026-01-06',
    position_id: 'p1',
    hourly_rate: 13.5,
    date_of_birth: '2001-04-11',
    work_permission: 'unrestricted',
    food_safety_level: 'level1',
    food_safety_expires: '2027-05-01',
    ...extra,
})

const fields = employee => gapsFor(employee, TODAY).map(g => g.field)

describe('gapsFor', () => {
    it('says nothing about a record with nothing missing', () => {
        expect(gapsFor(whole(), TODAY)).toEqual([])
    })

    it('names each thing that is not there', () => {
        expect(fields(whole({ started_on: null }))).toEqual(['started_on'])
        expect(fields(whole({ position_id: null }))).toEqual(['position_id'])
        expect(fields(whole({ hourly_rate: null }))).toEqual(['hourly_rate'])
        expect(fields(whole({ date_of_birth: null }))).toEqual(['date_of_birth'])
    })

    it('counts a rate of zero as recorded', () => {
        // Zero is a number somebody typed. It may be wrong, but it is not
        // missing, and chasing it as missing is how a list starts being ignored.
        expect(fields(whole({ hourly_rate: 0 }))).toEqual([])
    })

    it('says nothing about a Hub account', () => {
        // Almost nobody here has one and that is the design. Reporting it would
        // put a line against every person on the list.
        expect(fields(whole({ user_id: null }))).toEqual([])
    })

    describe('permission to work', () => {
        it('asks for one when none is recorded', () => {
            expect(fields(whole({ work_permission: '' }))).toEqual(['work_permission'])
        })

        it('asks for an expiry on the permissions that have one', () => {
            expect(fields(whole({ work_permission: 'stamp2', work_permission_expires: null })))
                .toEqual(['work_permission_expires'])
            expect(fields(whole({ work_permission: 'stamp1', work_permission_expires: null })))
                .toEqual(['work_permission_expires'])
        })

        it('does not ask a citizen for an expiry they do not have', () => {
            // The one that would have put an amber line against half the team.
            expect(fields(whole({ work_permission: 'unrestricted', work_permission_expires: null })))
                .toEqual([])
        })
    })

    describe('food safety', () => {
        it('asks for the training when none is recorded', () => {
            expect(fields(whole({ food_safety_level: '' })))
                .toEqual(['food_safety_level'])
        })

        it('asks for the expiry once there is training to expire', () => {
            expect(fields(whole({ food_safety_expires: null })))
                .toEqual(['food_safety_expires'])
        })

        it('does not ask for an expiry when there is no training yet', () => {
            expect(fields(whole({ food_safety_level: '', food_safety_expires: null })))
                .toEqual(['food_safety_level'])
        })
    })

    it('leaves somebody who has left alone', () => {
        // Their record is history rather than a job to do, holes and all.
        const gone = whole({ started_on: null, date_of_birth: null, ended_on: '2026-06-30' })
        expect(gapsFor(gone, TODAY)).toEqual([])
    })

    it('still asks about somebody who has not started yet', () => {
        // The fortnight before somebody starts is exactly when this wants
        // filling in, not after.
        const soon = whole({ started_on: '2026-10-01', date_of_birth: null })
        expect(fields(soon)).toEqual(['date_of_birth'])
    })

    it('gives nothing for nobody', () => {
        expect(gapsFor(null, TODAY)).toEqual([])
    })
})

describe('teamGaps', () => {
    const people = [
        whole({ id: 'a', full_name: 'Ana' }),
        whole({ id: 'b', full_name: 'Bruno', date_of_birth: null }),
        whole({ id: 'c', full_name: 'Cara', date_of_birth: null, started_on: null, hourly_rate: null }),
    ]

    it('leaves out anybody with nothing missing', () => {
        expect(teamGaps(people, TODAY).map(r => r.employee.full_name))
            .toEqual(['Cara', 'Bruno'])
    })

    it('puts the emptiest record first, since that is the one to open', () => {
        expect(teamGaps(people, TODAY)[0].employee.full_name).toBe('Cara')
    })

    it('counts everything across everybody', () => {
        expect(countGaps(teamGaps(people, TODAY))).toBe(4)
    })

    it('gives an empty list for a team with nothing missing', () => {
        expect(teamGaps([whole()], TODAY)).toEqual([])
        expect(teamGaps()).toEqual([])
        expect(countGaps()).toBe(0)
    })
})
