import { describe, it, expect } from 'vitest'
import { passwordProblem, MIN_LENGTH, linkFrom } from '@/lib/password'

describe('what makes a password good enough', () => {
    it('takes three or four random words', () => {
        expect(passwordProblem('kettle orange harbour lamp', 'maria@papichulo.ie')).toBe('')
    })

    it('asks for one when the box is empty', () => {
        expect(passwordProblem('')).toBe('Enter a password.')
    })

    it('asks for twelve characters', () => {
        expect(MIN_LENGTH).toBe(12)
        expect(passwordProblem('short words')).toBe('Use at least 12 characters.')
        expect(passwordProblem('twelve chars')).toBe('')
    })

    // The leaked password check is Pro plan only, so the obvious ones are
    // refused here.
    it('refuses the obvious ones, whatever the case and spacing', () => {
        expect(passwordProblem('MyPassword2026!')).toMatch(/too easy to guess/)
        expect(passwordProblem('Papi Chulo Point Campus')).toMatch(/too easy to guess/)
        expect(passwordProblem('qwertyuiopasdf')).toMatch(/too easy to guess/)
        expect(passwordProblem('aaaaaaaaaaaaaa')).toMatch(/too easy to guess/)
    })

    it('refuses the name part of the email', () => {
        expect(passwordProblem('georgiana is the best', 'georgiana@papichulo.ie')).toBe('Do not use your email in your password.')
        // A short name part would refuse half the dictionary.
        expect(passwordProblem('a long sentence about joe', 'joe@papichulo.ie')).toBe('')
    })
})

// The token sits after the # in the emailed link.
describe('reading the link', () => {
    it('takes a reset and an invite', () => {
        expect(linkFrom('#token_hash=abc&type=recovery')).toEqual({ token: 'abc', type: 'recovery' })
        expect(linkFrom('#token_hash=abc&type=invite')).toEqual({ token: 'abc', type: 'invite' })
    })

    it('takes nothing else', () => {
        expect(linkFrom('')).toBeNull()
        expect(linkFrom('#type=recovery')).toBeNull()
        expect(linkFrom('#token_hash=abc&type=signup')).toBeNull()
        expect(linkFrom('#access_token=x&type=recovery')).toBeNull()
    })
})
