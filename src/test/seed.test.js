// A new database watches the 3Arena from Point Campus.
//
// seed.sql still set the venue the way it was before places existed, as
// forecasting_venue_id on the restaurant, which nothing has read since. The
// sync reads the pairings and nothing else, so a database built from
// schema.sql and seed.sql watched no venue at all: no Arena row on the roster
// and nothing on the calendar, with no error anywhere.
//
// The seed is SQL and cannot be run here, so this reads it as text.
import { describe, it, expect } from 'vitest'

const files = import.meta.glob('../../supabase/seed.sql', { query: '?raw', import: 'default', eager: true })
const seed = Object.values(files)[0] || ''
const code = seed.replace(/--.*$/gm, '')

describe('the seed sets up what is on nearby the way live does', () => {
    it('finds the seed', () => {
        expect(seed).toContain('insert into public.restaurants')
    })

    it('makes the 3Arena a place, by its Ticketmaster venue id', () => {
        expect(code).toMatch(/insert into public\.places\s*\([^)]*ticketmaster_venue_id[^)]*\)\s*values\s*\([^)]*'KovZ9177WYV'/)
    })

    it('pairs it with Point Campus, with a row of its own', () => {
        const pairing = code.slice(code.indexOf('insert into public.restaurant_places'))
        expect(pairing).toMatch(/own_row/)
        expect(pairing).toMatch(/'point-campus'/)
        expect(pairing).toMatch(/'KovZ9177WYV'/)
    })

    it('no longer sets the venue on the restaurant, which nothing reads', () => {
        expect(code).not.toMatch(/forecasting_venue_id|forecasting_enabled/)
    })
})
