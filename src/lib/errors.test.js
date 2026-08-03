import { describe, it, expect } from 'vitest'
import { friendlyError, isPermissionError } from './errors'

describe('friendlyError', () => {
    it('gives nothing when there is no error', () => {
        expect(friendlyError(null)).toBe('')
    })

    // The one that started this. It appeared on screen during testing and
    // means nothing to anyone.
    it('explains the single object message', () => {
        const e = { message: 'Cannot coerce the result to a single JSON object' }
        expect(friendlyError(e)).toBe('That could not be found, or you do not have permission to see it.')
    })

    it('explains a row level security refusal by code', () => {
        expect(friendlyError({ code: '42501' })).toBe('You do not have permission to do that.')
    })

    it('explains a row level security refusal by message', () => {
        const e = { message: 'new row violates row-level security policy for table "products"' }
        expect(friendlyError(e)).toBe('You do not have permission to do that.')
    })

    it('explains a duplicate', () => {
        expect(friendlyError({ code: '23505' })).toBe('That already exists.')
    })

    it('explains being signed out', () => {
        expect(friendlyError({ message: 'JWT expired' })).toContain('signed out')
    })

    it('explains the network being down', () => {
        expect(friendlyError({ message: 'Failed to fetch' })).toContain('Could not reach the server')
    })

    // Anything unrecognised is more useful raw than replaced with a shrug.
    it('passes an unknown message straight through', () => {
        const e = { message: 'something nobody has seen before' }
        expect(friendlyError(e)).toBe('something nobody has seen before')
    })

    it('copes with an error that has no message at all', () => {
        expect(friendlyError({})).toBe('Something went wrong.')
    })
})

describe('isPermissionError', () => {
    it('spots a refusal by code', () => {
        expect(isPermissionError({ code: '42501' })).toBe(true)
    })

    it('spots a refusal by message', () => {
        expect(isPermissionError({ message: 'violates row-level security policy' })).toBe(true)
    })

    it('does not mistake a duplicate for a refusal', () => {
        expect(isPermissionError({ code: '23505' })).toBe(false)
    })

    it('is false when there is no error', () => {
        expect(isPermissionError(null)).toBe(false)
    })
})