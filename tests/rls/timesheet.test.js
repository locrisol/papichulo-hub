import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// The hours the database stores on a timesheet row, on the two nights a year
// the clocks change. They were worked out on the clock face, so eight to two
// was six hours whatever night it was: seven really worked the night the
// clocks go back, five the night they go forward. Found by the audit of 28
// September, closed by migration 030. Until 030 is run on this project these
// fail, which is them saying so.
//
// This one writes to live, and it may never touch real data. His words, 1
// October 2026: "Ok if it's never going to touch real data. It can be done
// for example on weeks where there is nothing yet." So the rows are for a
// typed name rather than anybody on the team, in three weeks of 2030, and
// before anything is written it reads whether the restaurant has anything at
// all in those weeks: a timesheet row or a timesheet week. If it has, it
// writes nothing and fails saying so. Each row it makes is deleted again by
// its id at the end, and nothing else is ever deleted.
//
// Changes still records the test rows going in and coming out, the same as
// the diary and place tests do.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

const NAME = 'A database test, deleted when it ends'

// Each night the test works on, and the Sunday its week starts.
const NIGHTS = [
    { day: '2030-10-26', week: '2030-10-20' },
    { day: '2030-03-30', week: '2030-03-24' },
    { day: '2030-09-14', week: '2030-09-08' },
]

const sixDaysOn = day => {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 6)
    return d.toISOString().slice(0, 10)
}

maybe('the hours on the nights the clocks change', () => {
    let manager, restaurantId
    // Only true once the weeks have been read and found empty.
    let clear = false
    const made = []

    beforeAll(async () => {
        manager = await signInAs('manager')
        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager
            .from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = me.restaurant_id
        expect(restaurantId, 'the test manager has no restaurant set').toBeTruthy()

        const found = []
        for (const { week } of NIGHTS) {
            const { data: rows, error: e1 } = await manager.from('timesheet_entries').select('work_date')
                .eq('restaurant_id', restaurantId).gte('work_date', week).lte('work_date', sixDaysOn(week))
            const { data: weeks, error: e2 } = await manager.from('timesheet_weeks').select('week_start')
                .eq('restaurant_id', restaurantId).eq('week_start', week)
            if (e1 || e2) {
                throw new Error(`Could not check the week of ${week} for timesheet rows, so this test wrote nothing. `
                    + `${(e1 || e2).message}`)
            }
            if (rows?.length || weeks?.length) found.push(week)
        }
        if (found.length) {
            throw new Error(`The test restaurant already has timesheet rows or a timesheet week in the week of `
                + `${found.join(', ')}, so this test wrote nothing. Move it to weeks nobody has used.`)
        }
        clear = true
    })

    afterAll(async () => {
        if (made.length) await manager.from('timesheet_entries').delete().in('id', made)
        if (manager) await manager.auth.signOut()
    })

    async function hoursFor(workDate, startsAt, endsAt) {
        // Never written unless the check above found the weeks empty.
        expect(clear, 'the weeks were not checked, so nothing is written').toBe(true)
        expect(NIGHTS.map(n => n.day), 'a day the check did not cover').toContain(workDate)
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
