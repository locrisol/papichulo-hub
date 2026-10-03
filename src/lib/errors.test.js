import { describe, it, expect } from 'vitest'
import { friendlyError, isPermissionError, functionError, functionSaid, signInProblem, isConnectionError } from '@/lib/errors'

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
        expect(friendlyError({})).toBe('Something went wrong. Please try again.')
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

    // An expired sign in is not a refusal: the weekly sales grid threw away a
    // typed week on it, which would have saved after signing in again.
    it('does not take an expired sign in for a refusal, and says to sign in', () => {
        expect(isPermissionError({ code: 'PGRST301' })).toBe(false)
        expect(isPermissionError({ code: 'PGRST303' })).toBe(false)
        expect(friendlyError({ code: 'PGRST301', message: 'JWSError' })).toBe('You have been signed out. Sign in again and try once more.')
    })
})
// supabase.functions.invoke treats any non-2xx as an error, hands back a
// FunctionsHttpError with the response hanging off it, and leaves data null. So
// a function that carefully answers "nothing found for that, paste the
// coordinates instead" has that sentence thrown away, and the person sees "Edge
// Function returned a non-2xx status code", which tells them nothing they can
// act on. He typed a restaurant name into the address box and got exactly that.
describe('what a function actually said', () => {
    const refusal = (body, message = 'Edge Function returned a non-2xx status code') => ({
        message,
        context: { json: async () => body },
    })

    it('reads the sentence out of the body', async () => {
        await expect(functionError(refusal({ error: 'Nothing found for "Papi Chulo". Paste the coordinates instead.' })))
            .resolves.toBe('Nothing found for "Papi Chulo". Paste the coordinates instead.')
    })

    it('falls back when the body says nothing useful', async () => {
        await expect(functionError(refusal({}), 'Could not reach the listings'))
            .resolves.toBeTruthy()
    })

    // A body that is not JSON, or one already read, must not take the screen
    // down with it.
    it('copes with a body it cannot read', async () => {
        const broken = { message: 'boom', context: { json: async () => { throw new Error('read') } } }
        await expect(functionError(broken)).resolves.toBe('boom')
        await expect(functionError(null, 'fallback')).resolves.toBe('fallback')
    })

    // Only what the function itself said, with no fallback, for a caller that
    // has to tell the function's own answer apart from one it never gave.
    it('gives only what the function itself said, or nothing', async () => {
        await expect(functionSaid(refusal({ error: 'That entry is gone' }))).resolves.toBe('That entry is gone')
        await expect(functionSaid(refusal({}))).resolves.toBe('')
        await expect(functionSaid({ message: 'boom', context: { json: async () => { throw new Error('read') } } }))
            .resolves.toBe('')
        await expect(functionSaid(null)).resolves.toBe('')
    })
})

// It said "Invalid email or password" for everything, no signal included.
describe('signInProblem', () => {
    it('keeps the one sentence for a wrong email or password', () => {
        expect(signInProblem({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' }))
            .toBe('Invalid email or password')
    })

    it('says when the Hub could not be reached', () => {
        expect(signInProblem({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }))
            .toBe('Could not reach the Hub. Check your connection and try again.')
        expect(signInProblem({ message: 'TypeError: Load failed' }))
            .toBe('Could not reach the Hub. Check your connection and try again.')
    })

    it('says to wait after too many tries', () => {
        expect(signInProblem({ status: 429, code: 'over_request_rate_limit' }))
            .toBe('Too many attempts. Wait a few minutes and try again.')
    })

    it('says when signing in itself is down', () => {
        expect(signInProblem({ status: 503, message: 'Service Unavailable' }))
            .toBe('Signing in is not working right now. Try again in a few minutes.')
    })

    it('says nothing when nothing went wrong', () => {
        expect(signInProblem(null)).toBe('')
    })
})

describe('isConnectionError', () => {
    it('knows a connection failure by its message or its name', () => {
        expect(isConnectionError('TypeError: Failed to fetch')).toBe(true)
        expect(isConnectionError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true)
        expect(isConnectionError({ name: 'AuthRetryableFetchError', message: '' })).toBe(true)
        expect(isConnectionError({ message: 'Load failed' })).toBe(true)
    })

    it('does not take anything else for one', () => {
        expect(isConnectionError('JSON object requested, multiple (or no) rows returned')).toBe(false)
        expect(isConnectionError(null)).toBe(false)
    })
})
