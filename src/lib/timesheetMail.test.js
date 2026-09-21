import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...args) => invoke(...args) } } }))

const { sendTimesheet, sentWords } = await import('@/lib/timesheetMail')

beforeEach(() => invoke.mockReset())

describe('what the browser is allowed to post', () => {
    // Which week, and a sentence to put at the top. Every figure in the mail is
    // read out of the database by the function, so nothing here can send a set
    // of hours of its own under our name.
    it('posts the week and nothing that could become a figure', async () => {
        invoke.mockResolvedValue({ data: { sent: 2 }, error: null })

        await sendTimesheet({ weekStart: '2026-10-25', restaurantId: 'r1', comment: 'Two corrections' })

        const [name, options] = invoke.mock.calls[0]
        expect(name).toBe('weekly-report-email')
        expect(options.body).toEqual({
            kind: 'timesheet',
            weekStart: '2026-10-25',
            restaurantId: 'r1',
            comment: 'Two corrections',
            test: false,
        })
    })

    it('says when it is a rehearsal', async () => {
        invoke.mockResolvedValue({ data: { sent: 1 }, error: null })
        await sendTimesheet({ weekStart: '2026-10-25', restaurantId: 'r1', test: true })
        expect(invoke.mock.calls[0][1].body.test).toBe(true)
    })

    it('hands back what the function said', async () => {
        invoke.mockResolvedValue({ data: { sent: 3, to: ['a@b.ie'] }, error: null })
        const out = await sendTimesheet({ weekStart: '2026-10-25', restaurantId: 'r1' })
        expect(out).toEqual({ sent: 3, to: ['a@b.ie'] })
    })

    // invoke treats any non-2xx as an error and throws the function's own
    // sentence away unless somebody reads the body.
    it('raises the reason the function gave, not the status', async () => {
        invoke.mockResolvedValue({
            data: null,
            error: {
                message: 'Edge Function returned a non-2xx status code',
                context: { json: async () => ({ error: 'That week belongs to another restaurant.' }) },
            },
        })

        await expect(sendTimesheet({ weekStart: '2026-10-25', restaurantId: 'r1' }))
            .rejects.toThrow('That week belongs to another restaurant.')
    })
})

describe('what to tell somebody afterwards', () => {
    it('counts who got it', () => {
        expect(sentWords({ sent: 2 })).toBe('Sent to 2 addresses.')
        expect(sentWords({ sent: 1 })).toBe('Sent to 1 address.')
    })

    it('says a test is a test, and that nothing has been filed', () => {
        expect(sentWords({ sent: 2 }, { test: true }))
            .toBe('Test sent to 2 addresses. Nothing has been filed.')
    })

    it('says plainly when there is nobody to send to', () => {
        expect(sentWords({ sent: 0 })).toBe('Nobody is on the list, so nothing was sent.')
    })

    // The one this was written for. An address that cannot receive is dropped
    // rather than allowed to take the whole send down, and in silence the list
    // on screen becomes a lie about who has the week.
    it('names an address that was dropped', () => {
        expect(sentWords({ sent: 1, skipped: ['payroll@nowhere.invalid'] }))
            .toContain('One address was skipped, because it cannot receive mail: payroll@nowhere.invalid.')
    })

    it('counts more than one of them', () => {
        expect(sentWords({ sent: 1, skipped: ['a@b.invalid', 'c@d.test'] }))
            .toContain('2 addresses were skipped')
    })
})
