import { describe, it, expect } from 'vitest'
import {
    sectionKey,
    weekReadiness,
    weekIsOver,
    reportableWeeks,
    reportFigures,
    platformShare,
    carriedItems,
    wasChanged,
    weeksOpen,
    reviewNeedsNote,
    blockers,
    ratingMove,
} from './weeklyReport'

// The till, as it stands. Every row counts toward the day balancing.
const TENDERS = [
    { key: 'cash', label: 'Cash', sort_order: 1, is_active: true, counts_toward_gross: true },
    { key: 'card', label: 'Card', sort_order: 2, is_active: true, counts_toward_gross: true },
]

function day(date, cash, card, gross, extra = {}) {
    return {
        sale_date: date,
        gross_sales: gross,
        net_sales: gross / 1.0925,
        tender_sales: { cash, card },
        is_closed: false,
        ...extra,
    }
}

// A week that balances on every day.
function fullWeek() {
    const dates = ['09', '10', '11', '12', '13', '14', '15']
    return dates.map(d => day(`2026-08-${d}`, 100, 900, 1000))
}

describe('sectionKey', () => {
    it('makes a key from a title', () => {
        expect(sectionKey('Priorities follow-up')).toBe('priorities_follow_up')
    })

    it('does not collide with a key already in use', () => {
        expect(sectionKey('Marketing', ['marketing'])).toBe('marketing_2')
        expect(sectionKey('Marketing', ['marketing', 'marketing_2'])).toBe('marketing_3')
    })

    it('always returns something, even for a title with nothing in it', () => {
        expect(sectionKey('!!!')).toBe('section')
        expect(sectionKey('')).toBe('section')
    })
})

describe('weekReadiness', () => {
    it('is ready when all seven days balance', () => {
        const out = weekReadiness('2026-08-09', fullWeek(), TENDERS)
        expect(out.ready).toBe(true)
        expect(out.missing).toEqual([])
        expect(out.unbalanced).toEqual([])
    })

    it('names the days with no figures at all', () => {
        const days = fullWeek().filter(d => !['2026-08-13', '2026-08-14'].includes(d.sale_date))
        const out = weekReadiness('2026-08-09', days, TENDERS)
        expect(out.ready).toBe(false)
        expect(out.missing).toEqual(['2026-08-13', '2026-08-14'])
    })

    it('names a day that does not balance, and by how much', () => {
        const days = fullWeek()
        days[6] = day('2026-08-15', 100, 887.60, 1000)
        const out = weekReadiness('2026-08-09', days, TENDERS)
        expect(out.unbalanced).toHaveLength(1)
        expect(out.unbalanced[0].date).toBe('2026-08-15')
        expect(out.unbalanced[0].out).toBeCloseTo(-12.40, 2)
    })

    it('does not stop a week over a day that is short, only says so', () => {
        const days = fullWeek()
        days[6] = day('2026-08-15', 100, 897, 1000)
        expect(weekReadiness('2026-08-09', days, TENDERS).ready).toBe(true)
    })

    it('still stops a week that is missing a day', () => {
        const days = fullWeek().slice(0, 6)
        expect(weekReadiness('2026-08-09', days, TENDERS).ready).toBe(false)
    })

    it('does not ask a closed day to balance', () => {
        const days = fullWeek()
        days[0] = { sale_date: '2026-08-09', is_closed: true, tender_sales: {}, gross_sales: 0, net_sales: 0 }
        expect(weekReadiness('2026-08-09', days, TENDERS).ready).toBe(true)
    })

    it('a closed day still has to exist', () => {
        const days = fullWeek().slice(1)
        const out = weekReadiness('2026-08-09', days, TENDERS)
        expect(out.missing).toEqual(['2026-08-09'])
    })
})

describe('weekIsOver', () => {
    it('is not over on its last day', () => {
        expect(weekIsOver('2026-08-09', '2026-08-15')).toBe(false)
    })

    it('is over the day after', () => {
        expect(weekIsOver('2026-08-09', '2026-08-16')).toBe(true)
    })
})

describe('reportableWeeks', () => {
    it('never offers the week that is still running', () => {
        const weeks = reportableWeeks(3, '2026-08-19')
        expect(weeks).toEqual(['2026-08-09', '2026-08-02', '2026-07-26'])
    })

    it('does not offer this week even on its last day', () => {
        expect(reportableWeeks(1, '2026-08-22')[0]).toBe('2026-08-09')
    })
})

describe('reportFigures', () => {
    const days = [
        { sale_date: '2026-08-09', net_sales: 14180.03, gross_sales: 15491.53, is_closed: false },
    ]
    const invoices = [
        { category: 'food', total_amount: 4013.85 },
        { category: 'packaging', total_amount: 1080.43 },
        { category: 'other', total_amount: 500 },
    ]
    const labour = [{ labour_cost: 3965.42 }]
    const overheads = [{ amount: 865 }, { amount: 346 }]
    const delivery = [{ amount: 660.24 }, { amount: 383.99 }, { amount: 124.14 }]

    it('works the week out against net sales', () => {
        const f = reportFigures({ days, invoices, labour, overheads, delivery })
        expect(f.net).toBeCloseTo(14180.03, 2)
        expect(f.foodPct).toBeCloseTo(28.31, 2)
        expect(f.labourPct).toBeCloseTo(27.96, 2)
        expect(f.packagingPct).toBeCloseTo(7.62, 2)
    })

    it('also carries the gross percentages, which is what the mail used to quote', () => {
        const f = reportFigures({ days, invoices, labour, overheads, delivery })
        expect(f.foodPctGross).toBeCloseTo(25.91, 2)
        expect(f.labourPctGross).toBeCloseTo(25.60, 2)
    })

    it('leaves an invoice that is neither food nor packaging out of both', () => {
        const f = reportFigures({ days, invoices, labour, overheads, delivery })
        expect(f.food).toBeCloseTo(4013.85, 2)
        expect(f.packaging).toBeCloseTo(1080.43, 2)
    })

    it('adds cleaning in with packaging', () => {
        const f = reportFigures({
            days, labour, overheads, delivery,
            invoices: [...invoices, { category: 'cleaning', total_amount: 100 }],
        })
        expect(f.packaging).toBeCloseTo(1180.43, 2)
    })

    it('adds the delivery lines up rather than taking a total', () => {
        const f = reportFigures({ days, invoices, labour, overheads, delivery })
        expect(f.deliveryTotal).toBeCloseTo(1168.37, 2)
        expect(f.overhead).toBeCloseTo(2379.37, 2)
    })

    it('works down to net earnings', () => {
        const f = reportFigures({ days, invoices, labour, overheads, delivery })
        expect(f.grossMargin).toBeCloseTo(9085.75, 2)
        expect(f.grossProfit).toBeCloseTo(5120.33, 2)
        expect(f.earnings).toBeCloseTo(2740.96, 2)
    })

    it('leaves closed days out of the totals', () => {
        const f = reportFigures({
            days: [...days, { sale_date: '2026-08-10', net_sales: 0, gross_sales: 0, is_closed: true }],
            invoices, labour, overheads, delivery,
        })
        expect(f.tradingDays).toBe(1)
        expect(f.net).toBeCloseTo(14180.03, 2)
    })

    it('says nothing rather than dividing by nothing on a week with no sales', () => {
        const f = reportFigures({ days: [], invoices: [], labour: [], overheads: [], delivery: [] })
        expect(f.net).toBe(0)
        expect(f.foodPct).toBe(null)
        expect(f.earningsPct).toBe(null)
    })
})

describe('platformShare', () => {
    it('gives what a platform kept of its own takings', () => {
        expect(platformShare(660.24, 1535.42)).toBeCloseTo(43.0, 1)
        expect(platformShare(124.14, 269.44)).toBeCloseTo(46.1, 1)
    })

    it('says nothing about a platform that took nothing', () => {
        expect(platformShare(50, 0)).toBe(null)
    })
})

describe('carriedItems', () => {
    const previous = [
        { kind: 'overhead', key: 'rent', label: 'Rent', amount: 865, sort_order: 1 },
        { kind: 'rating', key: 'deliveroo', label: 'Deliveroo', amount: 4.5, sort_order: 1 },
        { kind: 'action', key: null, label: 'Extraction quote', opened_on: '2026-07-12', sort_order: 1 },
        { kind: 'action', key: null, label: 'Equipment list', opened_on: '2026-07-19', done_on: '2026-08-09' },
        { kind: 'refund', label: 'Deliveroo', amount: 1.8, note: 'Dip' },
        { kind: 'review', label: 'Deliveroo', meta: { stars: 1 }, note: 'Flavour' },
        { kind: 'comment', note: 'Packaging includes Sherpack' },
    ]

    it('carries the overheads with what they were set to', () => {
        const out = carriedItems(previous, '2026-08-16')
        const rent = out.find(i => i.key === 'rent')
        expect(rent.amount).toBe(865)
        expect(rent.carried_from).toBe(865)
    })

    it('carries a rating so the next week can tell whether it moved', () => {
        const rating = carriedItems(previous, '2026-08-16').find(i => i.kind === 'rating')
        expect(rating.amount).toBe(4.5)
        expect(rating.carried_from).toBe(4.5)
    })

    it('carries an action that is still open, keeping when it first appeared', () => {
        const actions = carriedItems(previous, '2026-08-16').filter(i => i.kind === 'action')
        expect(actions).toHaveLength(1)
        expect(actions[0].label).toBe('Extraction quote')
        expect(actions[0].opened_on).toBe('2026-07-12')
    })

    it('leaves a ticked off action behind', () => {
        const labels = carriedItems(previous, '2026-08-16').map(i => i.label)
        expect(labels).not.toContain('Equipment list')
    })

    it('carries nothing that belonged to its own week', () => {
        const kinds = carriedItems(previous, '2026-08-16').map(i => i.kind)
        expect(kinds).not.toContain('refund')
        expect(kinds).not.toContain('review')
        expect(kinds).not.toContain('comment')
    })
})

describe('wasChanged', () => {
    it('is quiet about a line nobody touched', () => {
        expect(wasChanged({ amount: 346, carried_from: 346 })).toBe(false)
    })

    it('notices a line that was opened and changed', () => {
        expect(wasChanged({ amount: 412, carried_from: 346 })).toBe(true)
    })

    it('does not call a brand new line a change', () => {
        expect(wasChanged({ amount: 412, carried_from: null })).toBe(false)
    })

    it('ignores a difference too small to be one', () => {
        expect(wasChanged({ amount: 346.001, carried_from: 346 })).toBe(false)
    })
})

describe('weeksOpen', () => {
    it('is nought for something raised this week', () => {
        expect(weeksOpen({ opened_on: '2026-08-09' }, '2026-08-09')).toBe(0)
    })

    it('counts whole weeks since it was raised', () => {
        expect(weeksOpen({ opened_on: '2026-07-12' }, '2026-08-09')).toBe(4)
    })

    it('says nothing about an item with no date on it', () => {
        expect(weeksOpen({}, '2026-08-09')).toBe(0)
    })
})

describe('reviewNeedsNote', () => {
    it('asks for a comment on three stars or under', () => {
        expect(reviewNeedsNote({ meta: { stars: 1 }, note: '' })).toBe(true)
        expect(reviewNeedsNote({ meta: { stars: 3 }, note: '   ' })).toBe(true)
    })

    it('is satisfied once something has been said', () => {
        expect(reviewNeedsNote({ meta: { stars: 1 }, note: 'Flavour' })).toBe(false)
    })

    it('does not ask about a good review', () => {
        expect(reviewNeedsNote({ meta: { stars: 4 }, note: '' })).toBe(false)
        expect(reviewNeedsNote({ meta: { stars: 5 }, note: '' })).toBe(false)
    })
})

describe('blockers', () => {
    it('says in words what is holding the week back', () => {
        const out = blockers([
            { kind: 'review', label: 'Deliveroo', meta: { stars: 1 }, note: '' },
            { kind: 'refund', label: 'Uber Eats', amount: 4.5, note: '' },
        ])
        expect(out).toHaveLength(2)
        expect(out[0]).toContain('1 star review on Deliveroo')
        expect(out[1]).toContain('refund on Uber Eats')
    })

    it('has nothing to say about a week that is finished', () => {
        expect(blockers([
            { kind: 'review', label: 'Deliveroo', meta: { stars: 5 }, note: '' },
            { kind: 'refund', label: 'Uber Eats', amount: 4.5, note: 'Late' },
        ])).toEqual([])
    })
})

describe('ratingMove', () => {
    it('is quiet about a rating that held', () => {
        expect(ratingMove({ amount: 4.4, carried_from: 4.4 })).toBe(null)
    })

    it('reports one that moved, and which way', () => {
        expect(ratingMove({ amount: 4.6, carried_from: 4.5 })).toEqual({ from: 4.5, to: 4.6, up: true })
        expect(ratingMove({ amount: 4.3, carried_from: 4.5 })).toEqual({ from: 4.5, to: 4.3, up: false })
    })

    it('says nothing about the first week, which has nothing to compare against', () => {
        expect(ratingMove({ amount: 4.6, carried_from: null })).toBe(null)
    })
})
