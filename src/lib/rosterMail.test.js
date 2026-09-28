import { describe, it, expect, vi, beforeEach } from 'vitest'

// What this file is for.
//
// Nothing in rosterMail is ever awaited, and a failure only reaches
// console.warn. That is on purpose: a saved request is saved whether or not the
// mail goes. The cost of it is that **a wrong event name changes nothing on
// screen**. The function answers "Bad request", the browser shrugs, and the
// person who asked for a Saturday off goes on believing somebody was told.
//
// So the names are pinned here, next to the id each one carries. The function
// reads both and will not act on either being wrong.

const invoke = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }))

// timeOffPdf pulls jsPDF in, which this file has no use for.
vi.mock('@/lib/timeOffPdf', () => ({
    timeOffRecordBase64: vi.fn(() => Promise.resolve('JVBERi0=')),
    recordName: () => 'time-off-majo',
}))

const mail = await import('./rosterMail')

const sent = () => invoke.mock.calls[0]?.[1]?.body

beforeEach(() => invoke.mockClear())

describe('which function it calls', () => {
    // It was time-off-email until the swaps moved in. The app calls it by name,
    // so the day this string and the deployed function disagree is the day
    // every mail stops without a word.
    it('is always roster-email', () => {
        mail.emailTheAsk('a1')
        expect(invoke.mock.calls[0][0]).toBe('roster-email')
    })
})

describe('time off', () => {
    it('sends the ask as asked', () => {
        mail.emailTheAsk('a1')
        expect(sent()).toMatchObject({ absenceId: 'a1', event: 'asked' })
    })

    it('sends the answer as answered, with the record', async () => {
        await mail.emailTheAnswer({
            absence: { id: 'a1', starts_on: '2026-10-12' },
            employeeName: 'Majo',
        })
        expect(sent()).toMatchObject({ absenceId: 'a1', event: 'answered', pdf: 'JVBERi0=' })
    })

    // Leaving at three on a Tuesday is a note between two people. The function
    // refuses it as well; this stops a PDF nobody will send being built.
    it('says nothing about part of a day', async () => {
        await mail.emailTheAnswer({
            absence: { id: 'a1', starts_on: '2026-10-12', can_work_to: '15:00' },
            employeeName: 'Majo',
        })
        expect(invoke).not.toHaveBeenCalled()
    })
})

describe('swapping a shift', () => {
    it('sends the ask as swap-asked', () => {
        mail.emailTheShiftAsk('r1')
        expect(sent()).toMatchObject({ requestId: 'r1', event: 'swap-asked' })
    })

    it('sends the answer as swap-answered', () => {
        mail.emailTheShiftAnswer('r1')
        expect(sent()).toMatchObject({ requestId: 'r1', event: 'swap-answered' })
    })

    it('sends the decision as swap-decided', () => {
        mail.emailTheShiftDecision('r1')
        expect(sent()).toMatchObject({ requestId: 'r1', event: 'swap-decided' })
    })
})

// A missing id would post an event the function cannot look anything up for,
// and it would answer 400 into a console nobody is reading.
describe('nothing to send about', () => {
    it('does not post without an id', () => {
        mail.emailTheAsk(null)
        mail.emailTheShiftAsk(undefined)
        mail.emailTheShiftAnswer('')
        mail.emailTheShiftDecision(null)
        expect(invoke).not.toHaveBeenCalled()
    })
})

// The one thing every caller depends on: it never throws back at them. A shift
// swap that saved is saved, and the screen must not turn red because an SMTP
// server somewhere had a bad morning.
describe('when the send fails', () => {
    it('swallows an error from the function', async () => {
        invoke.mockResolvedValueOnce({ error: new Error('no') })
        expect(() => mail.emailTheShiftAsk('r1')).not.toThrow()
    })

    it('swallows a thrown one too', async () => {
        invoke.mockRejectedValueOnce(new Error('offline'))
        expect(() => mail.emailTheShiftAsk('r1')).not.toThrow()
    })
})
