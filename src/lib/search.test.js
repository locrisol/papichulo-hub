import { describe, it, expect } from 'vitest'
import { fold, matches } from './search'

describe('fold', () => {
    it('takes the accents off', () => {
        expect(fold('Chile de Árbol')).toBe('chile de arbol')
        expect(fold('Jalapeño')).toBe('jalapeno')
        expect(fold('Piña')).toBe('pina')
    })

    it('lowers the case and trims the ends', () => {
        expect(fold('  Chicken Breast  ')).toBe('chicken breast')
    })

    it('leaves an ordinary name alone', () => {
        expect(fold('Tortilla chips')).toBe('tortilla chips')
    })

    it('has nothing to fold in nothing', () => {
        expect(fold('')).toBe('')
        expect(fold(null)).toBe('')
        expect(fold(undefined)).toBe('')
    })
})

describe('matches', () => {
    it('finds an accented name from a plain search', () => {
        // The one that started it: nobody types the accent.
        expect(matches('Dried Chile de Árbol', 'arbol')).toBe(true)
        expect(matches('Jalapeño slices', 'jalapeno')).toBe(true)
    })

    it('works the other way round too', () => {
        expect(matches('Chile de Arbol', 'Árbol')).toBe(true)
    })

    it('still matches the accent typed properly', () => {
        expect(matches('Chile de Árbol', 'Árbol')).toBe(true)
    })

    it('finds a word in the middle of a name', () => {
        expect(matches('Dried Chile de Árbol', 'chile')).toBe(true)
    })

    it('does not care about case', () => {
        expect(matches('Chicken Breast', 'CHICKEN')).toBe(true)
    })

    it('says no when it is genuinely not there', () => {
        expect(matches('Chicken Breast', 'pork')).toBe(false)
    })

    it('matches everything on an empty search', () => {
        // A list that empties itself when the box is cleared looks broken.
        expect(matches('Anything', '')).toBe(true)
        expect(matches('Anything', '   ')).toBe(true)
    })

    it('has nothing to search in a nameless row', () => {
        expect(matches(null, 'chicken')).toBe(false)
    })
})
