import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent, NOBODY } from './helpers'

// Answering a request for time off.
//
// Approving used to be two writes from the browser, the shifts taken off and
// then the request marked, and the second matched nothing when the request
// had been taken back in between. answer_time_off does both at once and only
// for a request still waiting.
//
// These run against live and must never answer a real request, so every call
// names a request that cannot exist. That is enough to show who may call it
// and that a request no longer waiting is refused rather than overwritten,
// which is the half that went wrong. The shifts and the answer going together
// were checked against a copy of the database before it went in.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

const NOT_RUN = 'the function did not answer, so 029 has not been run on this project'

maybe('answering time off', () => {
    let employee, manager

    beforeAll(async () => {
        employee = await signInAs('employee')
        manager = await signInAs('manager')
    })

    afterAll(async () => {
        if (employee) await employee.auth.signOut()
        if (manager) await manager.auth.signOut()
    })

    const said = async call => (await call).error?.message || ''

    it('is a manager\'s to do', async () => {
        const answer = await said(employee.rpc('answer_time_off', {
            request_id: NOBODY, answer: 'approved', clear_shift_ids: [],
        }))
        expect(answer, NOT_RUN).toMatch(/Only a manager can answer time off/)
    })

    it('refuses a request that is not waiting any more', async () => {
        const answer = await said(manager.rpc('answer_time_off', {
            request_id: NOBODY, answer: 'declined', clear_shift_ids: [],
        }))
        expect(answer, NOT_RUN).toMatch(/already been answered or was taken back/)
    })
})
