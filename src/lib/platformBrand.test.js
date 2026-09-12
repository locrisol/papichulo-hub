import { describe, it, expect } from 'vitest'
import { brandFor, NEUTRAL } from './platformBrand'

describe('brandFor', () => {
    it('gives each of the three its own colour', () => {
        const roo = brandFor('Deliveroo')
        const uber = brandFor('Uber Eats')
        const just = brandFor('Just Eat')

        expect(new Set([roo.mark, uber.mark, just.mark]).size).toBe(3)
    })

    it('is not thrown by how the name happens to be typed', () => {
        expect(brandFor('deliveroo').mark).toBe(brandFor('Deliveroo').mark)
        expect(brandFor('JustEat').mark).toBe(brandFor('Just Eat').mark)
        expect(brandFor('Uber').mark).toBe(brandFor('Uber Eats').mark)
    })

    it('hands a platform it does not know the neutral rather than nothing', () => {
        expect(brandFor('Manna')).toEqual(NEUTRAL)
        expect(brandFor('')).toEqual(NEUTRAL)
        expect(brandFor(null)).toEqual(NEUTRAL)
    })

    it('keeps the mark and the lettering apart, because they do different jobs', () => {
        for (const name of ['Deliveroo', 'Uber Eats', 'Just Eat']) {
            const b = brandFor(name)
            expect(b.ink).not.toBe(b.mark)
        }
    })

    // The point of picking them by hand rather than taking the brand hex. Both
    // checks are about the colour still working on a white page.
    it('gives every name a colour dark enough to read on white', () => {
        function contrast(hex) {
            const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
                .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
            return 1.05 / (l + 0.05)
        }

        for (const name of ['Deliveroo', 'Uber Eats', 'Just Eat']) {
            const b = brandFor(name)
            // 4.5 is the bar for lettering, 3 for a dot or a line.
            expect(contrast(b.ink)).toBeGreaterThanOrEqual(4.5)
            expect(contrast(b.mark)).toBeGreaterThanOrEqual(3)
        }
    })
})
