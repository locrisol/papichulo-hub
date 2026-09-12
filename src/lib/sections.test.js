import { describe, it, expect } from 'vitest'
import {
    sectionRank, sectionColour, forDropdown, productInk,
    SECTION_ORDER,
} from './sections'

const product = (name, section, extra = {}) => ({ id: name, name, section, unit: 'KG', ...extra })

describe('sectionRank', () => {
    it('puts the store in the order it is walked', () => {
        expect(SECTION_ORDER.map(sectionRank)).toEqual([0, 1, 2, 3, 4])
    })

    it('sends anything it does not know to the end', () => {
        expect(sectionRank('Cellar')).toBe(SECTION_ORDER.length)
        expect(sectionRank(null)).toBe(SECTION_ORDER.length)
    })
})

describe('sectionColour', () => {
    it('gives every section its own colour', () => {
        const inks = SECTION_ORDER.map(s => sectionColour(s).ink)
        expect(new Set(inks).size).toBe(SECTION_ORDER.length)
    })

    it('falls back rather than coming back empty', () => {
        expect(sectionColour('Cellar').ink).toBe(sectionColour('Other').ink)
    })
})

describe('forDropdown', () => {
    const products = [
        product('Peas', 'Freezer'),
        product('Chicken', 'Cold Room'),
        product('Rice', 'Dry'),
        product('Salsa', 'Cold Room', { is_mix: true }),
        product('Bleach', 'Cleaning'),
    ]

    it('puts what we make ourselves first', () => {
        expect(forDropdown(products)[0].label).toMatch(/MIX/)
    })

    it('then the sections in the order the store is walked', () => {
        expect(forDropdown(products).slice(1).map(g => g.label))
            .toEqual(['Freezer', 'Cold Room', 'Dry', 'Cleaning'])
    })

    it('leaves out a group with nobody in it', () => {
        expect(forDropdown(products).some(g => g.label === 'Packaging')).toBe(false)
    })

    it('has no MIX heading when there are none', () => {
        const bought = products.filter(p => !p.is_mix)
        expect(forDropdown(bought).every(g => !/MIX/.test(g.label))).toBe(true)
    })

    it('sorts within a group by name', () => {
        const many = [product('Zucchini', 'Dry'), product('Almonds', 'Dry')]
        expect(forDropdown(many)[0].items.map(p => p.name)).toEqual(['Almonds', 'Zucchini'])
    })

    it('gives each group the colour its section has everywhere else', () => {
        const freezer = forDropdown(products).find(g => g.label === 'Freezer')
        expect(freezer.ink).toBe(sectionColour('Freezer').ink)
    })

    it('files a product with no section under Other', () => {
        expect(forDropdown([product('Mystery', null)])[0].label).toBe('Other')
    })

    it('has nothing to say about nothing', () => {
        expect(forDropdown([])).toEqual([])
        expect(forDropdown(null)).toEqual([])
    })
})

describe('productInk', () => {
    it('gives a product the colour of its shelf', () => {
        expect(productInk({ section: 'Freezer' })).toBe(sectionColour('Freezer').ink)
    })

    it('says where it is kept and nothing else', () => {
        // A house-made salsa lives in the cold room, so the line is green. The
        // row is already amber and the badge already says MIX, so a line saying
        // it a third time would leave nothing saying where to walk.
        expect(productInk({ section: 'Cold Room', is_mix: true })).toBe(sectionColour('Cold Room').ink)
        expect(productInk({ section: 'Dry', category: 'drink' })).toBe(sectionColour('Dry').ink)
    })

    it('falls back rather than coming back empty', () => {
        expect(productInk(null)).toBe(sectionColour('Other').ink)
        expect(productInk({ section: 'Cellar' })).toBe(sectionColour('Other').ink)
    })
})
