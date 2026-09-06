import { describe, it, expect } from 'vitest'
import {
    normalise,
    looksLikeAddress,
    addExtra,
    removeExtra,
    mergeForSend,
    recipientSummary,
} from './reportRecipients'

describe('normalise', () => {
    it('drops case and the spaces round a pasted address', () => {
        expect(normalise('  Ana@Papichulo.ie ')).toBe('ana@papichulo.ie')
    })

    it('gives an empty string for nothing rather than throwing', () => {
        expect(normalise(null)).toBe('')
        expect(normalise(undefined)).toBe('')
    })
})

describe('looksLikeAddress', () => {
    it('takes an ordinary address', () => {
        expect(looksLikeAddress('marta@papichulo.ie')).toBe(true)
    })

    it('takes a domain nobody here has heard of', () => {
        expect(looksLikeAddress('accounts@obrien-kelly.co.uk')).toBe(true)
    })

    it('refuses a name typed into the wrong box', () => {
        expect(looksLikeAddress('Marta')).toBe(false)
    })

    it('refuses half a sentence that came with a paste', () => {
        expect(looksLikeAddress('send it to marta@papichulo.ie')).toBe(false)
    })

    it('refuses an address with no domain part', () => {
        expect(looksLikeAddress('marta@papichulo')).toBe(false)
    })
})

describe('addExtra', () => {
    it('adds one', () => {
        const { list, error } = addExtra([], 'marta@papichulo.ie')
        expect(list).toEqual(['marta@papichulo.ie'])
        expect(error).toBeNull()
    })

    it('lowercases what it stores, so two spellings cannot both get on', () => {
        const first = addExtra([], 'Marta@Papichulo.ie')
        const second = addExtra(first.list, 'marta@PAPICHULO.ie')
        expect(second.list).toEqual(['marta@papichulo.ie'])
        expect(second.error).toBe('That address is already on the list.')
    })

    it('says so rather than adding somebody who is already an owner', () => {
        const { list, error } = addExtra([], 'ana@papichulo.ie', ['Ana@papichulo.ie'])
        expect(list).toEqual([])
        expect(error).toBe('That is an owner, so they are already on it.')
    })

    it('refuses something that is not an address', () => {
        const { error } = addExtra([], 'the accountant')
        expect(error).toBe('That does not look like an email address.')
    })

    it('does nothing at all for an empty box, without complaining', () => {
        const { list, error } = addExtra(['a@b.ie'], '   ')
        expect(list).toEqual(['a@b.ie'])
        expect(error).toBeNull()
    })
})

describe('removeExtra', () => {
    it('takes one off however it was spelled', () => {
        expect(removeExtra(['marta@papichulo.ie', 'x@y.ie'], 'MARTA@papichulo.ie'))
            .toEqual(['x@y.ie'])
    })

    it('leaves the list alone when it is not on it', () => {
        expect(removeExtra(['x@y.ie'], 'nobody@here.ie')).toEqual(['x@y.ie'])
    })
})

describe('mergeForSend', () => {
    it('puts the owners first', () => {
        expect(mergeForSend(['ana@p.ie'], ['marta@p.ie']))
            .toEqual(['ana@p.ie', 'marta@p.ie'])
    })

    it('sends once to somebody who is on both lists', () => {
        expect(mergeForSend(['Ana@P.ie'], ['ana@p.ie'])).toEqual(['Ana@P.ie'])
    })

    it('keeps the address as it was first written', () => {
        expect(mergeForSend([], ['Ana.Murphy@P.ie'])).toEqual(['Ana.Murphy@P.ie'])
    })

    it('drops blanks', () => {
        expect(mergeForSend(['a@b.ie', '', null], [])).toEqual(['a@b.ie'])
    })

    it('gives an empty list for two empty ones', () => {
        expect(mergeForSend()).toEqual([])
    })
})

describe('recipientSummary', () => {
    it('says it will still go somewhere when nobody is on it', () => {
        // Whoever publishes it is always a recipient, so an empty list is
        // not a report that goes nowhere.
        expect(recipientSummary({ owners: [], extras: [] }))
            .toBe('Nobody is on this list, so it will only go to you.')
    })

    it('counts the two kinds separately, and says you get it too', () => {
        // The publisher is not counted: it is not a choice made on this
        // card and it is a different person week to week.
        expect(recipientSummary({ owners: ['a'], extras: ['b', 'c'] }))
            .toBe('Goes to 1 owner and 2 added, and to you.')
    })

    it('leaves out the half that is empty', () => {
        expect(recipientSummary({ owners: ['a', 'b'], extras: [] }))
            .toBe('Goes to 2 owners, and to you.')
    })
})
