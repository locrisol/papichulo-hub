import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// Where a diary entry is on Google belongs to the calendar function.
//
// diary-calendar acts on google_event_ids as hub@, which reaches every calendar
// in the group, so a person able to write that column could point the function
// at an event that is not theirs. Found by the audit of 28 September, closed
// by migration 025. Until 025 is run on this project these fail, which is them
// saying so.
//
// The entries here are private, so nobody else sees them, and each one is
// deleted again at the end, so nothing survives: the rule the rest of this
// folder follows. Nothing here calls the function, so Google never hears of
// any of it.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

// Somebody else's event on the group calendar, which is what was copied.
const SOMEBODY_ELSES = { 'allsites@group.calendar.google.com': 'aneventthatisnotyours' }

maybe('the Google columns on a diary entry', () => {
    let manager, me
    const made = []

    beforeAll(async () => {
        manager = await signInAs('manager')
        const { data: auth } = await manager.auth.getUser()
        me = auth.user.id
    })

    afterAll(async () => {
        if (made.length) await manager.from('diary_entries').delete().in('id', made)
        if (manager) await manager.auth.signOut()
    })

    async function privateEntry(extra = {}) {
        const { data, error } = await manager.from('diary_entries').insert({
            kind: 'other',
            title: 'A database test, deleted when it ends',
            scope: 'private',
            starts_on: '2026-01-01',
            created_by: me,
            ...extra,
        }).select('id, title, google_event_ids, google_synced_at').single()
        expect(error, 'a manager could not add a private entry').toBeNull()
        made.push(data.id)
        return data
    }

    it('are not taken from a person adding an entry', async () => {
        const row = await privateEntry({
            google_event_ids: SOMEBODY_ELSES,
            google_synced_at: '2026-01-01T00:00:00Z',
        })
        expect(row.google_event_ids).toBeNull()
        expect(row.google_synced_at).toBeNull()
    })

    it('are not changed by a person editing an entry, and the rest of the edit still lands', async () => {
        const row = await privateEntry()
        const { data, error } = await manager.from('diary_entries')
            .update({ title: 'A database test, changed', google_event_ids: SOMEBODY_ELSES })
            .eq('id', row.id)
            .select('title, google_event_ids')
            .single()

        expect(error).toBeNull()
        expect(data.title).toBe('A database test, changed')
        expect(data.google_event_ids).toBeNull()
    })
})
