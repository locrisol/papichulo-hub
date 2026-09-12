import { describe, it, expect } from 'vitest'
import { toSlices, slicePath, TENDER_COLOURS, OTHER_COLOUR } from './weekTaken'

const row = (label, amount) => ({ label, amount })

describe('toSlices', () => {
    it('puts the biggest first', () => {
        const out = toSlices([row('Cash', 100), row('Card', 900), row('Feedr', 400)])
        expect(out.map(s => s.label)).toEqual(['Card', 'Feedr', 'Cash'])
    })

    const colourOf = name => TENDER_COLOURS.find(c => c.name === name).colour

    it('gives a row the colour that belongs to it, not the colour of its place', () => {
        const big = toSlices([row('Card', 900), row('Feedr', 100)])
        const small = toSlices([row('Card', 100), row('Feedr', 900)])

        expect(big.find(s => s.label === 'Feedr').colour).toBe(colourOf('feedr'))
        expect(small.find(s => s.label === 'Feedr').colour).toBe(colourOf('feedr'))
    })

    it('does not mind a stray capital or a trailing space on the till', () => {
        const out = toSlices([row(' LUNCH TEAM ', 900)])
        expect(out[0].colour).toBe(colourOf('lunch team'))
    })

    it('gives a row it does not know a colour nobody else is using', () => {
        const out = toSlices([row('Card', 900), row('Ordu App', 100)])
        const card = out.find(s => s.label === 'Card').colour
        const ordu = out.find(s => s.label === 'Ordu App').colour

        expect(card).toBe(colourOf('card'))
        expect(ordu).not.toBe(card)
        expect(TENDER_COLOURS.map(c => c.colour)).toContain(ordu)
    })

    it('never gives two rows the same colour', () => {
        const rows = [
            row('Kiosk', 800), row('Card', 700), row('Cash Sales', 600),
            row('Online Platforms', 500), row('Feedr', 400), row('Lunch Team', 300),
            row('Clockmeal', 200), row('Ordu App', 100),
        ]
        const out = toSlices(rows)
        expect(new Set(out.map(s => s.colour)).size).toBe(out.length)
    })

    it('drops rows that took nothing', () => {
        const out = toSlices([row('Card', 900), row('Ordu App', 0), row('Feedr', null)])
        expect(out.map(s => s.label)).toEqual(['Card'])
    })

    it('drops a row that somehow went negative rather than drawing it backwards', () => {
        const out = toSlices([row('Card', 900), row('Refunds', -20)])
        expect(out.map(s => s.label)).toEqual(['Card'])
    })

    it('copes with nothing at all', () => {
        expect(toSlices([])).toEqual([])
        expect(toSlices(null)).toEqual([])
    })

    it('keeps all eight when there are exactly eight', () => {
        const rows = TENDER_COLOURS.map((c, i) => row(c.name, 100 - i))
        const out = toSlices(rows)
        expect(out).toHaveLength(8)
        expect(out.map(s => s.colour)).toEqual(TENDER_COLOURS.map(c => c.colour))
    })

    it('folds the tail into one grey slice once there are more than eight', () => {
        const rows = Array.from({ length: 11 }, (_, i) => row(`Row ${i}`, 100 - i))
        const out = toSlices(rows)

        expect(out).toHaveLength(8)
        const last = out[7]
        expect(last.label).toBe('Other (4)')
        expect(last.colour).toBe(OTHER_COLOUR)
        // Rows 7, 8, 9 and 10: 93 + 92 + 91 + 90.
        expect(last.amount).toBe(366)
    })

    it('folds only the rows that took something, so empty ones are not counted in', () => {
        const rows = [
            ...Array.from({ length: 9 }, (_, i) => row(`Row ${i}`, 100 - i)),
            row('Ordu App', 0),
            row('Not used', 0),
        ]
        const out = toSlices(rows)
        expect(out[7].label).toBe('Other (2)')
    })

    it('still adds up to the same money after folding', () => {
        const rows = Array.from({ length: 12 }, (_, i) => row(`Row ${i}`, 100 - i))
        const before = rows.reduce((t, r) => t + r.amount, 0)
        const after = toSlices(rows).reduce((t, s) => t + s.amount, 0)
        expect(after).toBe(before)
    })

    it('leaves the rows it was given alone', () => {
        const rows = [row('Cash Sales', 100), row('Card', 900)]
        toSlices(rows)
        expect(rows.map(r => r.label)).toEqual(['Cash Sales', 'Card'])
        expect(rows[0].colour).toBeUndefined()
    })
})

describe('slicePath', () => {
    it('starts at the top and goes clockwise', () => {
        const d = slicePath(0, 90, 46, 27)
        // Top of the outer edge: straight up from the middle of a 100 square.
        expect(d.startsWith('M 50 4')).toBe(true)
        // A quarter turn clockwise ends at the right hand side.
        expect(d).toContain('A 46 46 0 0 1 96 50')
    })

    it('sets the long way flag only past a half turn', () => {
        expect(slicePath(0, 179, 46, 27)).toContain('0 0 1')
        expect(slicePath(0, 181, 46, 27)).toContain('0 1 1')
    })

    it('draws a whole circle as two half circles', () => {
        // One arc from the start point back to itself draws nothing at all, so
        // a week taken entirely one way would come out blank.
        const d = slicePath(0, 360, 46, 27)
        expect(d.match(/A /g)).toHaveLength(4)
        expect(d).toContain('M 50 4')
        expect(d).toContain('M 50 23')
    })

    it('cuts the middle out, so it is a ring and not a pie', () => {
        const d = slicePath(0, 90, 46, 27)
        expect(d).toContain('A 27 27')
        expect(d.endsWith('Z')).toBe(true)
    })

    it('stays inside the square it is drawn on', () => {
        for (let from = 0; from < 360; from += 17) {
            const numbers = slicePath(from, from + 40, 46, 27).match(/-?\d+(\.\d+)?/g).map(Number)
            for (const n of numbers) {
                expect(n).toBeGreaterThanOrEqual(0)
                expect(n).toBeLessThanOrEqual(100)
            }
        }
    })
})
