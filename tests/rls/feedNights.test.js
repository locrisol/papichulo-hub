import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// Hiding a Ticketmaster night, and showing one again, is the super admin's
// alone (migration 012, his of 23 October 2026: the 3Arena nights). A night
// read off a page stays with the managers, and so does everything else about
// a feed night, its name among it.
//
// These make real rows, so they only run against a local database.

const local = /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(process.env.VITE_SUPABASE_URL || '')
const maybe = credentialsPresent() && local ? describe : describe.skip

maybe('hiding a night on the calendar', () => {
    let manager, superadmin
    const stamp = Date.now()
    const ids = []

    async function night(source, review) {
        const { data, error } = await manager.from('events').insert({
            name: `RLS ${stamp} ${source}`, event_date: '2030-01-05', source, review,
            ...(source === 'ticketmaster' ? { ticketmaster_id: `rls-${stamp}-${ids.length}` } : { source_key: `rls-${stamp}-${ids.length}` }),
        }).select('id').single()
        if (error) throw error
        ids.push(data.id)
        return data.id
    }
    const reviewOf = async id => (await superadmin.from('events').select('review').eq('id', id).single()).data.review

    beforeAll(async () => {
        manager = await signInAs('manager')
        superadmin = await signInAs('superadmin')
    })

    afterAll(async () => {
        if (superadmin && ids.length) await superadmin.from('events').delete().in('id', ids)
    })

    it('refuses a store manager hiding a Ticketmaster night', async () => {
        const id = await night('ticketmaster', 'trusted')
        const { error } = await manager.from('events').update({ review: 'dismissed' }).eq('id', id)
        expect(error?.code).toBe('42501')
        expect(await reviewOf(id)).toBe('trusted')
    })

    it('lets the super admin hide one and show it again, and nobody else show it', async () => {
        const id = await night('ticketmaster', 'trusted')
        expect((await superadmin.from('events').update({ review: 'dismissed' }).eq('id', id)).error).toBeNull()
        const { error } = await manager.from('events').update({ review: 'trusted' }).eq('id', id)
        expect(error?.code).toBe('42501')
        expect(await reviewOf(id)).toBe('dismissed')
        expect((await superadmin.from('events').update({ review: 'trusted' }).eq('id', id)).error).toBeNull()
        expect(await reviewOf(id)).toBe('trusted')
    })

    it('leaves a store manager renaming a Ticketmaster night', async () => {
        const id = await night('ticketmaster', 'trusted')
        expect((await manager.from('events').update({ display_name: 'Short name' }).eq('id', id)).error).toBeNull()
    })

    it('leaves a night read off a page with the managers', async () => {
        const id = await night('page', 'kept')
        expect((await manager.from('events').update({ review: 'dismissed' }).eq('id', id)).error).toBeNull()
        expect((await manager.from('events').update({ review: 'kept' }).eq('id', id)).error).toBeNull()
        expect(await reviewOf(id)).toBe('kept')
    })
})
