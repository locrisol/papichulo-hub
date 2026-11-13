import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent, countVisible } from './helpers'

// The monthly report (migration 016, his of 13 November 2026): a row in
// weekly_reports with weeks 4, made by the database when the fourth weekly
// report of a block of 28 days is sent, and only once its days are over.
//
// These make real rows, so they only run against a local database. They use a
// block in 2030, which is never over while they run, so nothing they publish
// can make a monthly report for real.

const local = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.VITE_SUPABASE_URL || '')
const maybe = credentialsPresent() && local ? describe : describe.skip

const addDays = (iso, n) => {
    const d = new Date(`${iso}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
}
// A block on the count, far ahead: 4 October 2026 and fifty blocks of 28 days.
const START = addDays('2026-10-04', 28 * 50)
const WEEKS = [0, 7, 14, 21].map(n => addDays(START, n))

maybe('the monthly report', () => {
    let manager, owner, employee, restaurantId
    const ids = []

    async function report(row) {
        const { data, error } = await manager.from('weekly_reports')
            .insert({ restaurant_id: restaurantId, ...row }).select('id').single()
        if (data) ids.push(data.id)
        return { data, error }
    }

    beforeAll(async () => {
        manager = await signInAs('manager')
        owner = await signInAs('owner')
        employee = await signInAs('employee')
        const { data: { user } } = await manager.auth.getUser()
        const { data: me } = await manager.from('users').select('restaurant_id').eq('id', user.id).single()
        restaurantId = me.restaurant_id
    })

    afterAll(async () => {
        if (manager && ids.length) await manager.from('weekly_reports').delete().in('id', ids)
    })

    it('keeps a week and its block on the same Sunday, and refuses anything else', async () => {
        expect((await report({ week_start: START, weeks: 1 })).error).toBeNull()
        expect((await report({ week_start: START, weeks: 4 })).error).toBeNull()
        expect((await report({ week_start: START, weeks: 4 })).error?.code).toBe('23505')
        expect((await report({ week_start: WEEKS[1], weeks: 4 })).error?.code).toBe('23514')
        expect((await report({ week_start: addDays(START, 56), weeks: 2 })).error?.code).toBe('23514')
    })

    // His "only of the 4 weeks that are already completed".
    it('makes nothing for a block whose days are not over, even with all four weeks sent', async () => {
        for (const w of WEEKS.slice(1)) {
            const { error } = await report({ week_start: w, weeks: 1, status: 'published' })
            expect(error).toBeNull()
        }
        const { error } = await manager.from('weekly_reports').update({ status: 'published' })
            .eq('restaurant_id', restaurantId).eq('week_start', START).eq('weeks', 1)
        expect(error).toBeNull()
        const { data } = await manager.from('weekly_reports').select('id')
            .eq('restaurant_id', restaurantId).eq('week_start', START).eq('weeks', 4)
        // Only the one this test made by hand above.
        expect(data).toHaveLength(1)
    })

    it('cannot be made by anybody signed in calling it', async () => {
        const { error } = await manager.rpc('make_four_week_reports', { only_restaurant: null, since: '2026-10-04' })
        expect(error?.code).toBe('42501')
    })

    it('is read by an owner, who cannot write one', async () => {
        const { data } = await owner.from('weekly_reports').select('id').eq('week_start', START).eq('weeks', 4)
        expect(data).toHaveLength(1)
        const { error } = await owner.from('weekly_reports')
            .insert({ restaurant_id: restaurantId, week_start: addDays(START, 28), weeks: 4 })
        expect(error).not.toBeNull()
    })

    it('is nothing to somebody on the staff', async () => {
        const { count } = await countVisible(employee, 'weekly_reports')
        expect(count).toBe(0)
    })

    it('tells the badge how many weeks each report covers', async () => {
        const { data, error } = await manager.rpc('my_badges', { restaurant: restaurantId })
        expect(error).toBeNull()
        const ours = (data?.reports || []).filter(r => r.week_start === START)
        expect(ours.map(r => r.weeks).sort()).toEqual([1, 4])
    })
})
