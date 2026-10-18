import { describe, it, expect } from 'vitest'
import { middleOf, usualFor, weekDays, showNights, showNightsWords, whatWasOn } from '@/lib/whatWasOn'
import { addDays } from '@/lib/dates'

// His, 17 October: the week's events beside each day's sales, with usual as
// the middle of the same day over the eight weeks before.

const WEEK = '2026-10-04' // Sunday
const ARENA = { id: 'arena', name: '3Arena', short_name: '3Arena' }
const ODEON = { id: 'odeon', name: 'Odeon Point Square', short_name: 'Odeon' }

const sale = (sale_date, net_sales, is_closed = false) => ({ sale_date, net_sales, is_closed })
const listing = (place, date, name, extra = {}) => ({
    event: { id: `${place.id}-${date}-${name}`, name, event_date: date, ends_on: null, status: 'onsale', ...extra.event },
    place, time: extra.time ?? '18:30', ownRow: place === ARENA, checked: extra.checked ?? true,
})

// Eight Thursdays before 8 Oct, the real ones from Point Campus.
const THURSDAYS = [1803.17, 2002.49, 3236.76, 1787.74, 2263.05, 2679.80, 2133.81, 1873.32]
const thursdays = THURSDAYS.map((n, i) => sale(addDays('2026-10-08', -7 * (8 - i)), n))

describe('the middle of a list', () => {
    it('is the one in the middle, or halfway between the two', () => {
        expect(middleOf([3, 1, 2])).toBe(2)
        expect(middleOf(THURSDAYS)).toBeCloseTo(2068.15, 2)
        expect(middleOf([])).toBeNull()
    })
})

describe('a usual day', () => {
    it('is the middle of the same day over the eight weeks before', () => {
        const byDate = new Map(thursdays.map(s => [s.sale_date, s]))
        expect(usualFor('2026-10-08', byDate)).toEqual({ value: 2068.15, days: 8 })
    })

    it('leaves out closed days and reaches back past them', () => {
        const list = [...thursdays, sale('2026-10-01', 0, true), sale('2026-08-06', 1700)]
        const byDate = new Map(list.map(s => [s.sale_date, s]))
        const usual = usualFor('2026-10-08', byDate)
        expect(usual.days).toBe(8)
        expect(usual.value).not.toBe(0)
    })

    it('is not said with fewer than four of them', () => {
        const byDate = new Map(thursdays.slice(-3).map(s => [s.sale_date, s]))
        expect(usualFor('2026-10-08', byDate)).toBeNull()
    })
})

describe('each day of the week', () => {
    const rows = [
        listing(ARENA, '2026-10-04', 'The World of Hans Zimmer - a New Dimension', { time: '18:00' }),
        listing(ARENA, '2026-10-04', 'World of Hans Zimmer - Ticket & Hotel Experience', { time: '18:00' }),
        listing(ARENA, '2026-10-07', 'Paul Smith: Happy', { event: { status: 'withdrawn' } }),
        listing(ARENA, '2026-10-09', 'Called off', { event: { status: 'canceled' } }),
        listing(ODEON, '2026-10-08', 'Not looked at yet', { checked: false, time: '11:00' }),
        listing(ODEON, '2026-10-08', 'Avengers: Endgame Encore', { time: '11:00' }),
        listing(ARENA, '2026-10-08', 'Paul Smith: Happy'),
    ]
    const diary = [
        { id: 'd1', kind: 'catering', title: 'Ancestry', scope: 'all_sites', status: 'confirmed', starts_on: '2026-10-07', starts_at: '11:30:00' },
        { id: 'd2', kind: 'catering', title: 'Maybe', scope: 'all_sites', status: 'enquiry', starts_on: '2026-10-07' },
        { id: 'd3', kind: 'meeting', title: 'Private', scope: 'private', status: 'confirmed', starts_on: '2026-10-07' },
    ]
    const notes = [
        { note_date: '2026-10-06', extras: [{ name: 'Feedr', time: '12:10' }, { name: 'Lunch Team', time: '11:30' }] },
    ]
    const sales = [...thursdays, sale('2026-10-08', 3102.37), sale('2026-10-10', 0, true)]
    const days = weekDays({ weekStart: WEEK, sales, rows, diary, notes, restaurantId: 'r1' })
    const on = date => days.find(d => d.date === date)

    it('lists a show listed twice once, under its own name', () => {
        expect(on('2026-10-04').on).toEqual([{ tone: 'show', text: '3Arena, 18:00 · The World of Hans Zimmer - a New Dimension' }])
    })

    it('leaves out what was withdrawn, cancelled or not looked at', () => {
        expect(on('2026-10-07').on.map(l => l.text)).toEqual(['Catering · Ancestry, 11:30'])
        expect(on('2026-10-09').nothingNearby).toBe(true)
        expect(on('2026-10-08').on.map(l => l.text)).toEqual([
            '3Arena, 18:30 · Paul Smith: Happy',
            'Odeon, 11:00 · Avengers: Endgame Encore',
        ])
    })

    it('puts the Also on row on one line, in the order of the day', () => {
        expect(on('2026-10-06').on).toEqual([{ tone: 'also', text: 'Also on: 11:30 Lunch Team, 12:10 Feedr' }])
    })

    it('sets the day against its usual', () => {
        const thu = on('2026-10-08')
        expect(thu.net).toBe(3102.37)
        expect(thu.usual).toBe(2068.15)
        expect(thu.weekday).toBe('Thursday')
        expect(Math.round(thu.change * 100)).toBe(50)
    })

    it('says a closed day is closed and has no usual', () => {
        expect(on('2026-10-10')).toMatchObject({ closed: true, net: null, usual: null })
    })
})

describe('show nights', () => {
    // Twelve weeks of Tuesdays and Wednesdays: a show every other Tuesday.
    const sales = []
    const rows = []
    for (let w = -19; w <= 0; w++) {
        const tue = addDays('2026-10-06', 7 * w)
        const wed = addDays('2026-10-07', 7 * w)
        const show = w % 2 === 0
        sales.push(sale(tue, show ? 3000 : 2000), sale(wed, 2500))
        if (show) rows.push(listing(ARENA, tue, 'A show'))
    }
    const shows = showNights({ weekStart: WEEK, sales, rows })

    it('counts twelve weeks, the 3Arena only', () => {
        expect(shows.place).toBe('3Arena')
        expect(shows.from).toBe('2026-07-19')
        expect(shows.to).toBe('2026-10-10')
        expect(shows.with.days + shows.without.days).toBe(24)
    })

    it('gives the middle of each day with and without a show', () => {
        const tue = shows.byDay.find(d => d.weekday === 'Tuesday')
        expect(tue.with).toEqual({ middle: 3000, days: 6 })
        expect(tue.without).toEqual({ middle: 2000, days: 6 })
    })

    it('says it in one sentence', () => {
        expect(showNightsWords(shows)).toMatch(/^Over the last 12 weeks, days with a show at the 3Arena took \d+% more than usual for that day, and days without one/)
    })

    it('is left out where no place has a row of its own', () => {
        expect(showNights({ weekStart: WEEK, sales, rows: rows.map(r => ({ ...r, ownRow: false })) })).toBeNull()
    })
})

describe('the whole of it', () => {
    it('adds the week up against only the days that have a usual', () => {
        const sales = [...thursdays, sale('2026-10-08', 3102.37), sale('2026-10-09', 1626.52)]
        const out = whatWasOn({ weekStart: WEEK, sales, rows: [], diary: [], notes: [], restaurantId: 'r1' })
        expect(out.week.net).toBe(4728.89)
        expect(out.week.usual).toBe(2068.15)
        expect(out.week.comparedNet).toBe(3102.37)
        expect(out.usualWeeks).toBe(8)
    })
})
