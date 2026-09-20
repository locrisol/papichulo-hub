import { describe, it, expect } from 'vitest'
import { friendlyError, isPermissionError, functionError } from '@/lib/errors'

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
})
