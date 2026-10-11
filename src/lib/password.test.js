import { describe, it, expect } from 'vitest'
import { passwordProblem, MIN_LENGTH, PASSWORD_RULES, linkFrom } from '@/lib/password'

// His, 11 October: eight characters and nothing else. The first staff could
// not choose PapiChulo_7586, @PapiChulo_4598 or #WgagasdASUFHASOIDGA.
describe('what makes a password good enough', () => {
    it('takes any eight characters or more', () => {
        expect(MIN_LENGTH).toBe(8)
        expect(passwordProblem('PapiChulo_7586')).toBe('')
        expect(passwordProblem('@PapiChulo_4598')).toBe('')
        expect(passwordProblem('#WgagasdASUFHASOIDGA')).toBe('')
        expect(passwordProblem('12345678')).toBe('')
    })

    it('asks for one when the box is empty', () => {
        expect(passwordProblem('')).toBe('Enter a password.')
    })

    it('says what is missing when it is too short', () => {
        expect(passwordProblem('seven77')).toBe('The password needs: at least 8 characters.')
    })

    it('lists each rule, met or not, for the box to tick as somebody types', () => {
        expect(PASSWORD_RULES.map(r => r.label)).toEqual(['At least 8 characters'])
        expect(PASSWORD_RULES[0].met('short')).toBe(false)
        expect(PASSWORD_RULES[0].met('long enough')).toBe(true)
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
