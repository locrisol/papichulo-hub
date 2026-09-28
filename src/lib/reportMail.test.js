import { describe, it, expect, vi } from 'vitest'

// The module reaches for the browser client at import time. Nothing here calls
// it: sendWords is words about a result somebody else fetched.
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

const { sendWords } = await import('./reportMail')

describe('sendWords, after a publish', () => {
    it('says how many people got it', () => {
        expect(sendWords({ sent: 3 })).toBe('Published and sent to 3 people.')
    })

    it('counts one person as a person', () => {
        expect(sendWords({ sent: 1 })).toBe('Published and sent to 1 person.')
    })

    // A week written up and frozen with nobody to send it to is still a week
    // written up, so this is not a failure and does not read as one.
    it('says so when there is nobody on the list', () => {
        expect(sendWords({ sent: 0 })).toBe('Published. Nobody is on the list, so no mail went out.')
    })
})

describe('sendWords, after a test', () => {
    it('says it was a test and how far it went', () => {
        expect(sendWords({ sent: 2 }, { test: true })).toBe('Test sent to 2 addresses.')
    })

    it('counts one address as an address, not a person', () => {
        expect(sendWords({ sent: 1 }, { test: true })).toBe('Test sent to 1 address.')
    })

    it('says so when the list is empty', () => {
        expect(sendWords({ sent: 0 }, { test: true }))
            .toBe('The test went nowhere: there is nobody on the list.')
    })
})

// The reason this function exists. An address the function dropped is an
// address the card on the report still names, so saying nothing turns that card
// into a lie that nobody notices for a fortnight.
describe('sendWords, when an address was skipped', () => {
    it('names the one that was dropped', () => {
        expect(sendWords({ sent: 2, skipped: ['test.owner@papichulo.test'] }))
            .toBe('Published and sent to 2 people. One address was skipped, because it cannot '
                + 'receive mail: test.owner@papichulo.test.')
    })

    it('names all of them when there are several', () => {
        expect(sendWords({ sent: 1, skipped: ['a@b.test', 'c@d.invalid'] }))
            .toBe('Published and sent to 1 person. 2 addresses were skipped, because they cannot '
                + 'receive mail: a@b.test, c@d.invalid.')
    })

    it('says it after a test too, where finding out is the whole point', () => {
        expect(sendWords({ sent: 1, skipped: ['a@b.test'] }, { test: true }))
            .toContain('One address was skipped')
    })

    // Nothing skipped is the normal case and it should read as normal, not as
    // a sentence about an empty list.
    it('says nothing extra when nothing was skipped', () => {
        expect(sendWords({ sent: 2, skipped: [] })).toBe('Published and sent to 2 people.')
        expect(sendWords({ sent: 2 })).toBe('Published and sent to 2 people.')
    })
})

describe('sendWords, given nothing much', () => {
    it('does not throw on an empty or missing result', () => {
        expect(sendWords({})).toBe('Published. Nobody is on the list, so no mail went out.')
        expect(sendWords(null)).toBe('Published. Nobody is on the list, so no mail went out.')
        expect(sendWords(undefined)).toBe('Published. Nobody is on the list, so no mail went out.')
    })
})
