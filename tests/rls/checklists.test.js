import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent } from './helpers'

// What the database lets happen to a checklist tick.
//
// Nothing here creates a row. The one write is aimed at a task already ticked
// on its round, so it is refused whatever happens: by the guard once 027 is
// run, and before that by the rule that a task is ticked once a round.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

maybe('checklist ticks', () => {
    let employee
    let tick = null

    beforeAll(async () => {
        employee = await signInAs('employee')

        // A tick already saved on a round still going, for something still on
        // the list, to aim the write at. Not one on a task that has since had
        // things put under it, because the guard refuses that first with a
        // different message.
        const { data } = await employee.from('checklist_ticks')
            .select('round_id, task_id, restaurant_id, checklist_rounds!inner(ended_at), checklist_tasks!inner(is_active)')
            .is('checklist_rounds.ended_at', null)
            .eq('checklist_tasks.is_active', true)
            .limit(50)
        const ids = [...new Set((data || []).map(t => t.task_id))]
        const { data: under } = ids.length
            ? await employee.from('checklist_tasks').select('parent_id').in('parent_id', ids).eq('is_active', true)
            : { data: [] }
        const parents = new Set((under || []).map(t => t.parent_id))
        tick = (data || []).find(t => !parents.has(t.task_id)) || null
    })

    afterAll(async () => {
        if (employee) await employee.auth.signOut()
    })

    // The audit of 28 September. A photo waiting on a phone for more than a
    // day was deleted by the nightly job, and Submit still saved the tick
    // pointing at it, so the task counted as done with no photo behind it.
    // Shown as skipped, not passed, when there is nothing to aim at.
    it('refuses a photo that is not in storage', async ({ skip }) => {
        skip(!tick, 'there is no open round with a tick on it to aim at')
        const { error } = await employee.from('checklist_ticks').insert({
            round_id: tick.round_id,
            task_id: tick.task_id,
            photos: [`${tick.restaurant_id}/rounds/${tick.round_id}/never-taken.jpg`],
        })
        expect(error?.message).toMatch(/is missing\. Remove it and take a new one\./)
    })
})
