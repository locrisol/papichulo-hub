import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// A place is shared between restaurants, and a manager at one of them could
// delete a place the other one watches. Events and pairings cascade from a
// place, so that took the other restaurant's pairing and every listing read
// from it, kept and dismissed alike. Found by the audit of 28 September,
// closed by migration 025. Until 025 is run on this project these fail, which
// is them saying so.
//
// Changing a shared place stays open to any manager on purpose. The place is
// the venue itself, and correcting its page for both restaurants is what the
// settings screen is for.
//
// Each test makes its own place, with a name nobody would type, and the super
// admin deletes it again at the end, so nothing survives. Before 025 the
// manager's delete goes through, and all it takes is that test place.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

const NAME = 'A database test place, deleted when it ends'

maybe('places shared between restaurants', () => {
    let manager, superadmin
    let otherRestaurantId
    const made = []

    beforeAll(async () => {
        manager = await signInAs('manager')
        superadmin = await signInAs('superadmin')

        const { data: auth } = await manager.auth.getUser()
        const { data: me } = await manager
            .from('users').select('restaurant_id').eq('id', auth.user.id).single()
        const { data: restaurants } = await superadmin.from('restaurants').select('id')
        otherRestaurantId = (restaurants || []).map(r => r.id).find(id => id !== me?.restaurant_id)
        expect(otherRestaurantId, 'need a second restaurant for the cross-restaurant checks').toBeTruthy()
    })

    afterAll(async () => {
        // The super admin may still delete, and the pairing and the listing go
        // with the place.
        if (made.length) await superadmin.from('places').delete().in('id', made)
        for (const c of [manager, superadmin]) {
            if (c) await c.auth.signOut()
        }
    })

    // A place only the other restaurant watches, with one listing read from it.
    async function theirPlace() {
        const { data: place, error } = await superadmin
            .from('places').insert({ name: NAME }).select('id').single()
        expect(error, 'the super admin could not add a place').toBeNull()
        made.push(place.id)

        const { error: paired } = await superadmin.from('restaurant_places')
            .insert({ restaurant_id: otherRestaurantId, place_id: place.id, walk_minutes: 5 })
        expect(paired, 'the super admin could not pair the place').toBeNull()

        const { data: listing, error: listed } = await superadmin.from('events')
            .insert({ name: NAME, event_date: '2026-01-01', place_id: place.id, source: 'manual', review: 'kept' })
            .select('id').single()
        expect(listed, 'the super admin could not add a listing').toBeNull()

        return { place: place.id, listing: listing.id }
    }

    it('will not let a manager delete a place another restaurant watches', async () => {
        const { place } = await theirPlace()

        const { data, error } = await manager.from('places').delete().eq('id', place).select('id')
        expect(error).toBeNull()
        expect(data).toEqual([])

        const { data: pairing } = await superadmin.from('restaurant_places').select('id').eq('place_id', place)
        expect(pairing).toHaveLength(1)
    })

    it('will not let a manager delete the listings read from it either', async () => {
        const { listing } = await theirPlace()

        const { data, error } = await manager.from('events').delete().eq('id', listing).select('id')
        expect(error).toBeNull()
        expect(data).toEqual([])

        const { data: still } = await superadmin.from('events').select('id').eq('id', listing)
        expect(still).toHaveLength(1)
    })

    // What taking a place off the list in Settings does once nobody watches it,
    // and it has to keep working.
    it('still lets a manager delete a place nobody watches and nothing was read from', async () => {
        const { data: place, error } = await manager.from('places').insert({ name: NAME }).select('id').single()
        expect(error).toBeNull()
        made.push(place.id)

        const { data } = await manager.from('places').delete().eq('id', place.id).select('id')
        expect(data).toHaveLength(1)
    })

    // Migration 028. Every Ticketmaster sync writes how it went on the place,
    // and the settings row, the roster and the calendar read it from there.
    // A page read that fails says why in read_problem. Until 028 is run on
    // this project the columns are not there to read.
    it('lets a manager read how the last Ticketmaster sync and page read went', async () => {
        const { error } = await manager.from('places')
            .select('feed_synced_at, feed_count, feed_problem, read_problem').limit(1)
        expect(error).toBeNull()
    })

    // Every sync writes when it ran and how many it listed, twice a day and on
    // every manager's visit, so Changes leaves those out. What went wrong is
    // news and is still logged.
    it('keeps a sync that only ran out of Changes, and logs what went wrong', async () => {
        const { data: place, error } = await superadmin.from('places').insert({ name: NAME }).select('id').single()
        expect(error).toBeNull()
        made.push(place.id)

        const updates = () => superadmin.from('change_log').select('changes')
            .eq('table_name', 'places').eq('row_id', place.id).eq('action', 'update')

        await superadmin.from('places')
            .update({ feed_synced_at: new Date().toISOString(), feed_count: 3 }).eq('id', place.id)
        expect((await updates()).data).toEqual([])

        await superadmin.from('places').update({ feed_problem: 'Ticketmaster said no (401).' }).eq('id', place.id)
        await superadmin.from('places').update({ read_problem: 'Gemini said no (429).' }).eq('id', place.id)
        const { data: logged } = await updates()
        expect(logged.map(l => Object.keys(l.changes)).sort()).toEqual([['feed_problem'], ['read_problem']])
    })
})
