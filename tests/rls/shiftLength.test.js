import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent, NOBODY } from './helpers'

// A shift that starts and finishes at the same time.
//
// An end at or before the start is the next morning, everywhere hours are
// worked out, so 09:00 to 09:00 came to 24 hours: on the roster, in the
// timesheet's hours column and in the pay mail. The database refuses one now.
//
// These run against live, so nothing here may land. Each one names an
// employee that cannot exist: with 029 run the check refuses the row before
// anything else looks at it, and without it the row is still refused, by the
// missing employee, and the message says which.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

const NOT_RUN = 'the check did not answer, so 029 has not been run on this project'

maybe('a shift with no length', () => {
    let manager, restaurantId

    beforeAll(async () => {
        manager = await signInAs('manager')
        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager
            .from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = me?.restaurant_id
    })

    afterAll(async () => {
        if (manager) await manager.auth.signOut()
    })

    const said = async call => (await call).error?.message || ''

    it('is refused on the roster', async () => {
        const answer = await said(manager.from('roster_shifts').insert({
            restaurant_id: restaurantId,
            employee_id: NOBODY,
            shift_date: '2026-01-05',
            starts_at: '09:00',
            ends_at: '09:00',
        }))
        expect(answer, NOT_RUN).toMatch(/roster_shifts_not_zero_length/)
    })

    it('is refused on the timesheet', async () => {
        const answer = await said(manager.from('timesheet_entries').insert({
            restaurant_id: restaurantId,
            employee_id: NOBODY,
            work_date: '2026-01-05',
            starts_at: '09:00:00',
            ends_at: '09:00:00',
        }))
        expect(answer, NOT_RUN).toMatch(/timesheet_entries_not_zero_length/)
    })
})
