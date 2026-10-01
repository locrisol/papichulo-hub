import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// The hours the database stores on a timesheet row, on the two nights a year
// the clocks change. They were worked out on the clock face, so eight to two
// was six hours whatever night it was: seven really worked the night the
// clocks go back, five the night they go forward. Found by the audit of 28
// September, closed by migration 030. Until 030 is run on this project these
// fail, which is them saying so.
//
// The rows are for a typed name rather than anybody on the team, dated in 2030
// so no week anybody reads holds them, and each one is deleted again at the
// end, so nothing survives.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

const NAME = 'A database test, deleted when it ends'

maybe('the hours on the nights the clocks change', () => {
    let manager, restaurantId
    const made = []

    beforeAll(async () => {
        manager = await signInAs('manager')
        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager
            .from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = me.restaurant_id
    })

    afterAll(async () => {
        if (made.length) await manager.from('timesheet_entries').delete().in('id', made)
        if (manager) await manager.auth.signOut()
    })

    async function hoursFor(workDate, startsAt, endsAt) {
        const { data, error } = await manager.from('timesheet_entries').insert({
            restaurant_id: restaurantId,
            person_name: NAME,
            work_date: workDate,
            starts_at: startsAt,
            ends_at: endsAt,
            source: 'typed',
        }).select('id, hours').single()
        expect(error, 'a manager could not add a timesheet row').toBeNull()
        made.push(data.id)
        return Number(data.hours)
    }

    // The clocks go back at two on Sunday 27 October 2030.
    it('counts the hour the clocks go back', async () => {
        expect(await hoursFor('2030-10-26', '20:00:00', '02:00:00')).toBe(7)
    })

    // And forward at one on Sunday 31 March 2030.
    it('leaves out the hour the clocks go forward', async () => {
        expect(await hoursFor('2030-03-30', '20:00:00', '02:00:00')).toBe(5)
    })

    it('is the clock face on any other night', async () => {
        expect(await hoursFor('2030-09-14', '20:00:00', '02:00:00')).toBe(6)
        expect(await hoursFor('2030-09-14', '09:00:00', '17:30:15')).toBe(8.5)
    })
})
