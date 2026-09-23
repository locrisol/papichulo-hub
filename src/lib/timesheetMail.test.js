import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const upload = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('@/lib/supabase', () => ({
    supabase: {
        functions: { invoke: (...args) => invoke(...args) },
        storage: { from: (...args) => ({ upload: (...rest) => upload(...args, ...rest) }) },
    },
}))

const { sendTimesheet, sentWords, HOURS_BUCKET } = await import('@/lib/timesheetMail')

beforeEach(() => {
    invoke.mockReset()
    upload.mockReset()
    upload.mockResolvedValue({ error: null })
})

describe('what the browser is allowed to post', () => {
    // Which pay period, and a sentence to put at the top. Every figure in the mail is
    // read out of the database by the function, so nothing here can send a set
    // of hours of its own under our name.
    it('posts the period and nothing that could become a figure', async () => {
        invoke.mockResolvedValue({ data: { sent: 2 }, error: null })

        await sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1', comment: 'Two corrections' })

        const [name, options] = invoke.mock.calls[0]
        expect(name).toBe('weekly-report-email')
        expect(options.body).toEqual({
            kind: 'timesheet',
            periodStart: '2026-10-25',
            restaurantId: 'r1',
            comment: 'Two corrections',
            test: false,
            attachment: null,
        })
    })

    it('says when it is a rehearsal', async () => {
        invoke.mockResolvedValue({ data: { sent: 1 }, error: null })
        await sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1', test: true })
        expect(invoke.mock.calls[0][1].body.test).toBe(true)
    })

    it('hands back what the function said', async () => {
        invoke.mockResolvedValue({ data: { sent: 3, to: ['a@b.ie'] }, error: null })
        const out = await sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1' })
        expect(out).toEqual({ sent: 3, to: ['a@b.ie'] })
    })

    // invoke treats any non-2xx as an error and throws the function's own
    // sentence away unless somebody reads the body.
    it('raises the reason the function gave, not the status', async () => {
        invoke.mockResolvedValue({
            data: null,
            error: {
                message: 'Edge Function returned a non-2xx status code',
                context: { json: async () => ({ error: 'That pay period belongs to another restaurant.' }) },
            },
        })

        await expect(sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1' }))
            .rejects.toThrow('That pay period belongs to another restaurant.')
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


// The paper goes up before the mail goes out. The browser draws it, because
// that is where jsPDF and the logo are, and the function attaches it, because
// that is where the mail is sent.
describe('the PDF that travels with it', () => {
    const aPdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' })

    it('puts it in the restaurant own folder, named for the period', async () => {
        invoke.mockResolvedValue({ data: { sent: 1 }, error: null })

        await sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1', pdf: aPdf })

        expect(upload).toHaveBeenCalledWith(
            HOURS_BUCKET,
            'r1/2026-10-25.pdf',
            aPdf,
            { contentType: 'application/pdf', upsert: true },
        )
    })

    it('tells the function where it put it', async () => {
        invoke.mockResolvedValue({ data: { sent: 1 }, error: null })
        await sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1', pdf: aPdf })
        expect(invoke.mock.calls[0][1].body.attachment).toBe('r1/2026-10-25.pdf')
    })

    // He asked for the hours and the paper together, so a mail that quietly
    // arrives without it is the kind of thing nobody notices until the
    // accountant asks.
    it('sends nothing at all when the upload fails', async () => {
        upload.mockResolvedValue({ error: { message: 'no' } })

        await expect(sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1', pdf: aPdf }))
            .rejects.toThrow(/went nowhere/)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('uploads nothing when there is no PDF to send', async () => {
        invoke.mockResolvedValue({ data: { sent: 1 }, error: null })
        await sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1' })
        expect(upload).not.toHaveBeenCalled()
    })

    // A rehearsal that arrived without the attachment would not be a rehearsal
    // of the thing being sent.
    it('goes with a test as well', async () => {
        invoke.mockResolvedValue({ data: { sent: 1 }, error: null })
        await sendTimesheet({ periodStart: '2026-10-25', restaurantId: 'r1', pdf: aPdf, test: true })
        expect(upload).toHaveBeenCalled()
        expect(invoke.mock.calls[0][1].body.test).toBe(true)
        expect(invoke.mock.calls[0][1].body.attachment).toBe('r1/2026-10-25.pdf')
    })
})
