import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { signInAs, credentialsPresent, NOBODY } from './helpers'

// What the people in a swap can do to the request itself.
//
// The manager's desk believes the row: it says "Ana and Ben agreed this" and
// approving moves whichever shifts it names. Until 024 an employee calling the
// API by hand could send one already agreed without Ben ever being asked,
// name somebody else's shift, or change it after Ben said yes. My shifts
// never did any of that; a hand written call could.
//
// These run against live, and nothing here may leave a row behind whether 024
// has been run or not. So every write also breaks a rule the database checks
// after the guard: the asker and the person asked are the same person, or no
// shift is named at all. Without the guard it is refused for that. With it,
// the guard answers first, and its words are what each test looks for, since
// a test that only looked for a refusal would pass with the hole still open.
//
// What is not proved here is that an ordinary ask, yes, no and taking back
// still go through, because that means writing a real request on live. Those
// were run against a copy of the guard before it went in.

const run = credentialsPresent()
const maybe = run ? describe : describe.skip

if (!run) {
    console.warn('Skipping the database tests: the TEST_ credentials are not set in .env')
}

const NOT_RUN = 'the guard did not answer, so 024 has not been run on this project'
const NOT_RUN_029 = 'the guard did not answer, so 029 has not been run on this project'

maybe('what the people in a swap can do to it', () => {
    let employee, restaurantId, me, colleagueShift, ownShift, mine

    beforeAll(async () => {
        employee = await signInAs('employee')

        const { data: auth } = await employee.auth.getUser()
        const { data: row } = await employee
            .from('users').select('restaurant_id').eq('id', auth.user.id).single()
        restaurantId = row?.restaurant_id

        // Their place on the team list, when the test account has one.
        // Without one the asker is nobody, and the guard still answers first.
        const { data: id } = await employee.rpc('get_my_employee_id')
        me = id || NOBODY

        // A published shift of somebody else's, the only kind an employee
        // can see that is not their own.
        const { data: shifts } = await employee
            .from('roster_shifts').select('id').neq('employee_id', me).limit(1)
        colleagueShift = shifts?.[0]?.id || null

        // One of their own, for the check on the hours of part of a shift.
        const { data: own } = await employee
            .from('roster_shifts').select('id, starts_at, ends_at').eq('employee_id', me).limit(1)
        ownShift = own?.[0] || null

        // A request they are part of, for the checks on changing one.
        const { data: asks } = await employee
            .from('shift_requests').select('id, from_employee_id, to_employee_id')
            .or(`from_employee_id.eq.${me},to_employee_id.eq.${me}`)
            .limit(1)
        mine = asks?.[0] || null
    })

    afterAll(async () => {
        if (employee) await employee.auth.signOut()
    })

    const said = async write => (await write).error?.message || ''

    it('refuses a request that arrives already agreed', async () => {
        const answer = await said(employee.from('shift_requests').insert({
            restaurant_id: restaurantId,
            from_employee_id: me,
            to_employee_id: me,
            give_shift_id: NOBODY,
            status: 'accepted',
        }))
        expect(answer, NOT_RUN).toMatch(/wait for the other person to answer/)
    })

    it('refuses giving away somebody else\'s shift', async () => {
        if (!colleagueShift) return console.warn('No published shift of a colleague to try it with.')
        const answer = await said(employee.from('shift_requests').insert({
            restaurant_id: restaurantId,
            from_employee_id: me,
            to_employee_id: me,
            give_shift_id: colleagueShift,
        }))
        expect(answer, NOT_RUN).toMatch(/give away a shift of your own/)
    })

    it('refuses asking for a shift the person asked does not have', async () => {
        if (!colleagueShift) return console.warn('No published shift of a colleague to try it with.')
        const answer = await said(employee.from('shift_requests').insert({
            restaurant_id: restaurantId,
            from_employee_id: me,
            to_employee_id: me,
            take_shift_id: colleagueShift,
        }))
        expect(answer, NOT_RUN).toMatch(/shift of the person you are asking/)
    })

    // Approving keeps whatever sits either side of the hours named, so hours
    // outside the shift were hours invented. From its end back to its start
    // is outside it however long the shift is.
    it('refuses part of a shift that is not inside the shift', async () => {
        if (!ownShift) return console.warn('The test employee has no shift of their own to try it with.')
        const answer = await said(employee.from('shift_requests').insert({
            restaurant_id: restaurantId,
            from_employee_id: me,
            to_employee_id: me,
            give_shift_id: ownShift.id,
            give_from: ownShift.ends_at,
            give_to: ownShift.starts_at,
        }))
        expect(answer, NOT_RUN_029).toMatch(/must be within the shift/)
    })

    it('refuses asking somebody who does not work here', async () => {
        const answer = await said(employee.from('shift_requests').insert({
            restaurant_id: restaurantId,
            from_employee_id: me,
            to_employee_id: NOBODY,
        }))
        expect(answer, NOT_RUN).toMatch(/somebody at your own restaurant/)
    })

    // Pointing it at the other person, so the two ends are the same and it
    // could never be saved even without the guard.
    const onePerson = request => (request.from_employee_id === me
        ? { from_employee_id: request.to_employee_id }
        : { to_employee_id: request.from_employee_id })

    it('refuses changing who a request is between', async () => {
        if (!mine) return console.warn('The test employee is not part of any request to try it with.')
        const answer = await said(employee.from('shift_requests')
            .update(onePerson(mine)).eq('id', mine.id))
        expect(answer, NOT_RUN).toMatch(/cannot be changed once it is sent/)
    })

    // The way it got through before: a yes and a change in the same write.
    it('refuses a change sent along with a yes', async () => {
        if (!mine) return console.warn('The test employee is not part of any request to try it with.')
        const answer = await said(employee.from('shift_requests')
            .update({ ...onePerson(mine), status: 'accepted' }).eq('id', mine.id))
        expect(answer, NOT_RUN).toMatch(/cannot be changed once it is sent/)
    })
})
