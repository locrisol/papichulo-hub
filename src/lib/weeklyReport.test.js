import { describe, it, expect } from 'vitest'
import {
    sectionKey,
    isOwnSection,
    sectionsFor,
    weekReadiness,
    blockedBy,
    weekIsOver,
    reportableWeeks,
    reportFigures,
    figureGaps,
    platformShare,
    carriedItems,
    startsOpen,
    wasChanged,
    weeksOpen,
    reviewNeedsNote,
    blockers,
    ratingMove,
    publishCheck,
    figuresToStore,
    FIGURES_VERSION,
    isCorrection,
    statementWeek,
    statementWords,
    dayWords,
    platformTaken,
    deliveryCost,
    deliveryRows,
    statementSundayIn,
    deliveryBlockers,
    platformWeeks,
} from '@/lib/weeklyReport'

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

describe('the sections a new week starts with', () => {
    const LAST_WEEK = [
        { key: 'sales_costs', title: 'Sales and costs' },
        { key: 'profit_loss', title: 'P and L' },
        { key: 'priorities', title: 'Priorities' },
        { key: 'online_sales', title: 'Online sales' },
        { key: 'corporate_sales', title: 'Corporate sales' },
        { key: 'people_ops', title: 'People and operations' },
        { key: 'marketing', title: 'Marketing and sales development' },
        { key: 'support_actions', title: 'Support / actions needed' },
    ]

    it('is the built-in list for a restaurant that has never written one', () => {
        expect(sectionsFor(null).map(s => s.key)[2]).toBe('prices_suppliers')
    })

    // Prices and suppliers arrived in September, after every restaurant had
    // a week to copy from.
    it('adds a built-in section last week did not have, straight after the one it follows', () => {
        expect(sectionsFor(LAST_WEEK).map(s => s.key)).toEqual([
            'sales_costs', 'profit_loss', 'prices_suppliers', 'priorities', 'online_sales',
            'corporate_sales', 'people_ops', 'marketing', 'support_actions', 'cleaning',
        ])
    })

    // Cleaning arrived on 27 September, and he asked for it at the end.
    it('puts Cleaning last, after a section of their own at the end', () => {
        const withOwn = [...LAST_WEEK, { key: 'follow_up', title: 'Follow up' }]
        expect(sectionsFor(withOwn).map(s => s.key).slice(-2)).toEqual(['follow_up', 'cleaning'])
    })

    it('keeps a renamed heading and a section of their own', () => {
        const next = sectionsFor(LAST_WEEK)
        expect(next.find(s => s.key === 'profit_loss').title).toBe('P and L')
        expect(next.find(s => s.key === 'priorities').title).toBe('Priorities')
    })

    it('changes nothing once it has them all', () => {
        const once = sectionsFor(LAST_WEEK)
        expect(sectionsFor(once)).toEqual(once)
    })
})

describe('isOwnSection', () => {
    it('says no to every one of the nine the report comes with', () => {
        for (const key of ['sales_costs', 'profit_loss', 'prices_suppliers', 'online_sales', 'corporate_sales',
            'people_ops', 'marketing', 'support_actions', 'cleaning']) {
            expect(isOwnSection({ key })).toBe(false)
        }
    })

    it('says yes to one somebody added', () => {
        expect(isOwnSection({ key: 'priorities_follow_up' })).toBe(true)
    })

    it('goes on the key, not the title, so a rename cannot change the answer', () => {
        expect(isOwnSection({ key: 'marketing_2', title: 'Marketing' })).toBe(true)
        expect(isOwnSection({ key: 'marketing', title: 'Anything at all' })).toBe(false)
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

    // Labour is a cost on this report, so a week where somebody was down to
    // work and nobody has said whether they did reports a wage bill that is
    // wrong without looking wrong. That is a harder line than a missing sales
    // day on purpose.
    it('stops a week where a rostered shift has nothing said about it', () => {
        const waiting = [{ person: { id: 'e1', full_name: 'Aoife' }, days: ['2026-08-13'] }]
        const out = weekReadiness('2026-08-09', fullWeek(), TENDERS, waiting)
        expect(out.ready).toBe(false)
        expect(out.unanswered).toBe(waiting)
    })

    it('is ready once the timesheet has nothing waiting', () => {
        expect(weekReadiness('2026-08-09', fullWeek(), TENDERS, []).ready).toBe(true)
    })

    it('still minds the sales days as well', () => {
        const days = fullWeek().filter(d => d.sale_date !== '2026-08-13')
        const out = weekReadiness('2026-08-09', days, TENDERS, [])
        expect(out.ready).toBe(false)
        expect(out.missing).toEqual(['2026-08-13'])
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
    // Rows out of invoice_cost_by_category, which is what the report reads
    // now: a date, a category, an amount, and where the answer came from.
    const spend = [
        { cost_date: '2026-08-09', category: 'food', amount: 4013.85, came_from: 'lines' },
        { cost_date: '2026-08-09', category: 'packaging', amount: 1080.43, came_from: 'header' },
        { cost_date: '2026-08-09', category: 'other', amount: 500, came_from: 'header' },
    ]
    const labour = [{ labour_cost: 3965.42 }]
    const overheads = [{ amount: 865 }, { amount: 346 }]
    const delivery = [{ amount: 660.24 }, { amount: 383.99 }, { amount: 124.14 }]

    it('works the week out against net sales', () => {
        const f = reportFigures({ days, spend, labour, overheads, delivery })
        expect(f.net).toBeCloseTo(14180.03, 2)
        expect(f.foodPct).toBeCloseTo(28.31, 2)
        expect(f.labourPct).toBeCloseTo(27.96, 2)
        expect(f.packagingPct).toBeCloseTo(7.62, 2)
    })

    it('also carries the gross percentages, which is what the mail used to quote', () => {
        const f = reportFigures({ days, spend, labour, overheads, delivery })
        expect(f.foodPctGross).toBeCloseTo(25.91, 2)
        expect(f.labourPctGross).toBeCloseTo(25.60, 2)
    })

    it('leaves an invoice that is neither food nor packaging out of both', () => {
        const f = reportFigures({ days, spend, labour, overheads, delivery })
        expect(f.food).toBeCloseTo(4013.85, 2)
        expect(f.packaging).toBeCloseTo(1080.43, 2)
    })

    it('adds cleaning in with packaging', () => {
        const f = reportFigures({
            days, labour, overheads, delivery,
            spend: [...spend, { cost_date: '2026-08-09', category: 'cleaning', amount: 100, came_from: 'lines' }],
        })
        expect(f.packaging).toBeCloseTo(1180.43, 2)
    })

    it('adds the delivery lines up rather than taking a total', () => {
        const f = reportFigures({ days, spend, labour, overheads, delivery })
        expect(f.deliveryTotal).toBeCloseTo(1168.37, 2)
        expect(f.overhead).toBeCloseTo(2379.37, 2)
    })

    it('gives the total cost of sales the spreadsheet quotes', () => {
        const f = reportFigures({ days, spend, labour, overheads, delivery })
        expect(f.costOfSales).toBeCloseTo(9059.70, 2)
        expect(f.costOfSalesPct).toBeCloseTo(63.89, 2)
    })

    it('works down to net earnings', () => {
        const f = reportFigures({ days, spend, labour, overheads, delivery })
        expect(f.grossMargin).toBeCloseTo(9085.75, 2)
        expect(f.grossProfit).toBeCloseTo(5120.33, 2)
        expect(f.earnings).toBeCloseTo(2740.96, 2)
    })

    it('leaves closed days out of the totals', () => {
        const f = reportFigures({
            days: [...days, { sale_date: '2026-08-10', net_sales: 0, gross_sales: 0, is_closed: true }],
            spend, labour, overheads, delivery,
        })
        expect(f.tradingDays).toBe(1)
        expect(f.net).toBeCloseTo(14180.03, 2)
    })

    it('says nothing rather than dividing by nothing on a week with no sales', () => {
        const f = reportFigures({ days: [], spend: [], labour: [], overheads: [], delivery: [] })
        expect(f.net).toBe(0)
        expect(f.foodPct).toBe(null)
        expect(f.earningsPct).toBe(null)
    })
})

describe('figureGaps', () => {
    const week = {
        days: [
            { sale_date: '2026-08-09', net_sales: 2000, gross_sales: 2185, is_closed: false },
            { sale_date: '2026-08-10', net_sales: 2000, gross_sales: 2185, is_closed: false },
        ],
        spend: [
            { cost_date: '2026-08-09', category: 'food', amount: 1000, came_from: 'lines' },
            { cost_date: '2026-08-09', category: 'packaging', amount: 300, came_from: 'header' },
        ],
        labour: [{ labour_cost: 500 }, { labour_cost: 500 }],
    }

    it('has nothing to say about a week with everything entered', () => {
        expect(figureGaps(reportFigures(week))).toEqual([])
    })

    // The bug this was written for. A week with no hours entered reported a
    // profit of sixty six percent, which is arithmetic done on an empty week.
    it('says so when no hours have been entered at all', () => {
        const out = figureGaps(reportFigures({ ...week, labour: [] }))
        expect(out.some(g => g.includes('No hours have been entered'))).toBe(true)
    })

    it('says how far short the hours are when only some days were entered', () => {
        const out = figureGaps(reportFigures({ ...week, labour: [{ labour_cost: 500 }] }))
        expect(out.some(g => g.includes('1 of the 2 days'))).toBe(true)
    })

    it('does not count a day entered as nothing as a day entered', () => {
        const out = figureGaps(reportFigures({ ...week, labour: [{ labour_cost: 500 }, { labour_cost: 0 }] }))
        expect(out.some(g => g.includes('1 of the 2 days'))).toBe(true)
    })

    it('names each kind of invoice that is missing', () => {
        const out = figureGaps(reportFigures({ ...week, spend: [] }))
        expect(out.some(g => g.includes('food invoices'))).toBe(true)
        expect(out.some(g => g.includes('packaging or cleaning'))).toBe(true)
    })

    // A claim comes off a week and never puts anything into one, so a week with
    // nothing on it but money asked back is still a week with no invoices in
    // it. Counting the claim would have quietly turned the warning off.
    it('does not count a claim as an invoice', () => {
        const out = figureGaps(reportFigures({
            ...week,
            spend: [{ cost_date: '2026-08-09', category: 'food', amount: -40, came_from: 'claim' }],
        }))
        expect(out.some(g => g.includes('food invoices'))).toBe(true)
    })

    it('is quiet about a closed day, which was never going to have hours', () => {
        const out = figureGaps(reportFigures({
            ...week,
            days: [...week.days, { sale_date: '2026-08-11', net_sales: 0, gross_sales: 0, is_closed: true }],
        }))
        expect(out).toEqual([])
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

describe('startsOpen', () => {
    it('leaves every line open on the first report, where nothing carried', () => {
        expect(startsOpen({ amount: 0, carried_from: null })).toBe(true)
    })

    it('locks a line that carried from last week', () => {
        expect(startsOpen({ amount: 865, carried_from: 865 })).toBe(false)
    })

    it('leaves a line added this week open', () => {
        expect(startsOpen({ amount: 0, label: 'Alarm monitoring' })).toBe(true)
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

describe('publishCheck', () => {
    const clean = [{
        items: [
            { kind: 'review', label: 'Deliveroo', meta: { stars: 5 }, note: '' },
            { kind: 'refund', label: 'Uber Eats', amount: 4.5, note: 'Late' },
        ],
    }]
    const full = reportFigures({
        days: [{ sale_date: '2026-08-09', net_sales: 2000, gross_sales: 2185, is_closed: false }],
        spend: [
            { cost_date: '2026-08-09', category: 'food', amount: 500, came_from: 'lines' },
            { cost_date: '2026-08-09', category: 'packaging', amount: 100, came_from: 'header' },
        ],
        labour: [{ labour_cost: 500 }],
    })

    it('lets a finished week through', () => {
        const out = publishCheck(clean, full)
        expect(out.blockers).toEqual([])
        expect(out.warnings).toEqual([])
    })

    it('refuses a poor review with nothing said about it', () => {
        const out = publishCheck([{
            items: [{ kind: 'review', label: 'Deliveroo', meta: { stars: 1 }, note: '' }],
        }], full)
        expect(out.blockers).toHaveLength(1)
    })

    it('warns about a week with no hours rather than refusing it', () => {
        const out = publishCheck(clean, reportFigures({
            days: [{ sale_date: '2026-08-09', net_sales: 2000, gross_sales: 2185, is_closed: false }],
            spend: [
            { cost_date: '2026-08-09', category: 'food', amount: 500, came_from: 'lines' },
            { cost_date: '2026-08-09', category: 'packaging', amount: 100, came_from: 'header' },
        ],
            labour: [],
        }))
        expect(out.blockers).toEqual([])
        expect(out.warnings.length).toBeGreaterThan(0)
    })

    it('looks across every section, not just the first', () => {
        const out = publishCheck([
            { items: [{ kind: 'comment', note: 'fine' }] },
            { items: [{ kind: 'refund', label: 'Just Eat', amount: 2, note: '' }] },
        ], full)
        expect(out.blockers).toHaveLength(1)
    })

    it('says nothing about figures it was not given', () => {
        expect(publishCheck(clean).warnings).toEqual([])
    })
})

describe('freezing the figures', () => {
    it('stamps a version, so a stored set can be read years later', () => {
        const stored = figuresToStore({ net: 100 }, new Date('2026-08-17T09:00:00Z'))
        expect(stored.version).toBe(FIGURES_VERSION)
        expect(stored.frozen_at).toBe('2026-08-17T09:00:00.000Z')
        expect(stored.net).toBe(100)
    })

    it('does not touch what it was given', () => {
        const figures = { net: 100 }
        figuresToStore(figures)
        expect(figures.version).toBeUndefined()
    })
})

describe('isCorrection', () => {
    it('is the first time out when nothing has been sent', () => {
        expect(isCorrection({ send_count: 0 })).toBe(false)
        expect(isCorrection({})).toBe(false)
    })

    it('is a correction once it has gone out before', () => {
        expect(isCorrection({ send_count: 1 })).toBe(true)
    })
})

describe('blockedBy', () => {
    it('says sales while any day has no figures', () => {
        expect(blockedBy({ missing: ['2026-09-20'], unanswered: [{ person: {} }] })).toBe('sales')
    })

    // The week that showed it: every day typed in, seven people still to
    // answer for on the timesheet, and the badge saying the sales were not
    // finished.
    it('says timesheet once the sales are in and somebody is still unanswered', () => {
        expect(blockedBy({ missing: [], unanswered: [{ person: {} }] })).toBe('timesheet')
    })

    it('says nothing for a week that is ready', () => {
        expect(blockedBy({ missing: [], unanswered: [] })).toBeNull()
        expect(blockedBy(undefined)).toBeNull()
    })
})

// The platforms bill Monday to Sunday and our week runs Sunday to Saturday.
// Invented figures throughout; the week is 20 to 26 September 2026, the one
// that raised it.
describe("the delivery platforms' own week", () => {
    const WEEK = '2026-09-20'
    const ROO = { id: 'p1', key: 'Deliveroo', name: 'Deliveroo' }
    const EAT = { id: 'p2', key: 'Just Eat', name: 'Just Eat' }

    // Deliveroo takes 100 every day from Sunday 20 to Sunday 27, except the
    // two Sundays, which take 50 and 150.
    const DAYS = [
        { sale_date: '2026-09-20', platform_sales: { Deliveroo: 50 } },
        ...['21', '22', '23', '24', '25', '26'].map(d => ({
            sale_date: `2026-09-${d}`, platform_sales: { Deliveroo: 100, 'Just Eat': 10 },
        })),
        { sale_date: '2026-09-27', platform_sales: { Deliveroo: 150 } },
    ]

    it('runs the statement from the Monday to the Sunday after, out the Monday after that', () => {
        expect(statementWeek(WEEK)).toEqual({ from: '2026-09-21', to: '2026-09-27', out: '2026-09-28' })
    })

    it('says the days the way a person would', () => {
        expect(dayWords('2026-09-28')).toBe('Monday 28 September')
        expect(statementWords(WEEK)).toBe('Monday 21 to Sunday 27 September')
        expect(statementWords('2026-09-27')).toBe('Monday 28 September to Sunday 4 October')
    })

    it('adds up what a platform took between two dates', () => {
        expect(platformTaken(DAYS, 'Deliveroo', '2026-09-21', '2026-09-27')).toBe(750)
        expect(platformTaken(DAYS, 'Deliveroo', '2026-09-20', '2026-09-26')).toBe(650)
    })

    // 225 on 750 taken is 30%, and 30% of the 650 our week took is 195.
    it('costs our week at the share the statement kept', () => {
        const got = deliveryCost({ statement: 225, statementTaken: 750, weekTaken: 650 })
        expect(got.rate).toBeCloseTo(30, 6)
        expect(got.cost).toBe(195)
        expect(got.typed).toBe(true)
    })

    it('knows nothing typed is not nought', () => {
        expect(deliveryCost({ statement: null, statementTaken: 750, weekTaken: 650 }))
            .toEqual({ typed: false, rate: null, cost: 0 })
        expect(deliveryCost({ statement: 0, statementTaken: 750, weekTaken: 650 }))
            .toMatchObject({ typed: true, cost: 0 })
    })

    it('counts a statement as it stands when nothing was taken over its week', () => {
        expect(deliveryCost({ statement: 40, statementTaken: 0, weekTaken: 0 }))
            .toEqual({ typed: true, rate: null, cost: 40 })
    })

    it('gives every platform a row, typed or not', () => {
        const rows = deliveryRows({
            platforms: [ROO, EAT],
            items: [{ kind: 'delivery', key: 'p1', amount: 225 }, { kind: 'overhead', key: 'p2', amount: 999 }],
            days: DAYS,
            weekStart: WEEK,
        })
        expect(rows[0]).toMatchObject({ statement: 225, statementTaken: 750, weekTaken: 650, cost: 195, typed: true })
        expect(rows[1]).toMatchObject({ statement: null, statementTaken: 60, weekTaken: 60, cost: 0, typed: false })
    })

    // Renamed in settings after the figures went in. They are stored under the
    // key, so the takings are still found and the share is still worked out,
    // rather than the whole statement landing on our week.
    it('finds a renamed platform by its key', () => {
        const renamed = { ...ROO, name: 'Roo' }
        const [row] = deliveryRows({
            platforms: [renamed], items: [{ kind: 'delivery', key: 'p1', amount: 225 }], days: DAYS, weekStart: WEEK,
        })
        expect(row).toMatchObject({ statementTaken: 750, weekTaken: 650, cost: 195 })
        expect(statementSundayIn(DAYS, [renamed], WEEK)).toBe(true)
    })

    it("knows whether the statement's Sunday is in", () => {
        expect(statementSundayIn(DAYS, [ROO], WEEK)).toBe(true)
        expect(statementSundayIn(DAYS.slice(0, -1), [ROO], WEEK)).toBe(false)
        expect(statementSundayIn([{ sale_date: '2026-09-27', platform_sales: {} }], [ROO], WEEK)).toBe(false)
        expect(statementSundayIn([{ sale_date: '2026-09-27', is_closed: true }], [ROO], WEEK)).toBe(true)
    })

    describe('what stops it being sent', () => {
        const rows = deliveryRows({
            platforms: [ROO, EAT], items: [{ kind: 'delivery', key: 'p1', amount: 225 }], days: DAYS, weekStart: WEEK,
        })

        it('waits for the Monday the statements come out', () => {
            const said = deliveryBlockers({ weekStart: WEEK, today: '2026-09-27', rows, days: DAYS })
            expect(said[0]).toBe('The delivery platforms bill Monday to Sunday, so their statements for '
                + 'Monday 21 to Sunday 27 September come out on Monday 28 September. The report can be sent from then.')
        })

        it('asks for the Sunday the statements end on', () => {
            const said = deliveryBlockers({ weekStart: WEEK, today: '2026-09-28', rows, days: DAYS.slice(0, -1) })
            expect(said.some(s => s.startsWith('Sunday 27 September has no online platform sales yet.'))).toBe(true)
        })

        it('asks for each statement not typed, by name', () => {
            const said = deliveryBlockers({ weekStart: WEEK, today: '2026-09-28', rows, days: DAYS })
            expect(said).toEqual(["Type what Just Eat's statement for Monday 21 to Sunday 27 September came to."])
        })

        it('says nothing once it is Monday, the Sunday is in and every statement is typed', () => {
            const all = deliveryRows({
                platforms: [ROO, EAT],
                items: [{ kind: 'delivery', key: 'p1', amount: 225 }, { kind: 'delivery', key: 'p2', amount: 0 }],
                days: DAYS,
                weekStart: WEEK,
            })
            expect(deliveryBlockers({ weekStart: WEEK, today: '2026-09-28', rows: all, days: DAYS })).toEqual([])
        })

        it('does not ask about a platform that took nothing either week', () => {
            const quiet = deliveryRows({ platforms: [{ id: 'p3', name: 'Quiet' }], days: DAYS, weekStart: WEEK })
            const said = deliveryBlockers({ weekStart: WEEK, today: '2026-09-28', rows: quiet, days: DAYS })
            expect(said.some(s => s.includes('Quiet'))).toBe(false)
        })

        it('waits for nothing at a restaurant with no online platforms', () => {
            expect(deliveryBlockers({ weekStart: WEEK, today: '2026-09-27', rows: [], days: [] })).toEqual([])
        })

        it('stops the send alongside everything else', () => {
            const check = publishCheck([], null, ['Waiting for Monday.'])
            expect(check.blockers).toEqual(['Waiting for Monday.'])
        })
    })
})

// The report's charts, a week at a time. Manna was retired after the week of
// 6 September, and what it took that week is still part of that week.
describe('platformWeeks', () => {
    const platform = (id, key, bucket, extra = {}) => ({
        id, key, name: key, bucket, sort_order: 0, is_active: true, ...extra,
    })
    const ROO = platform('p1', 'Deliveroo', 'online_platform')
    const MANNA = platform('p2', 'Manna', 'online_platform', { is_active: false })
    const FEEDR = platform('p3', 'Feedr', 'catering')
    const DAYS = [
        { sale_date: '2026-09-07', platform_sales: { Deliveroo: 100, Manna: 40, Feedr: 25 } },
        { sale_date: '2026-09-14', platform_sales: { Deliveroo: 120 } },
    ]
    const WEEKS = ['2026-09-06', '2026-09-13']

    it('keeps a retired platform in the weeks it took money', () => {
        const weeks = platformWeeks({ platforms: [ROO, MANNA, FEEDR], days: DAYS, weeks: WEEKS })
        expect(weeks.get('2026-09-06')).toEqual({ p_p1: 100, p_p2: 40, p_p3: 25, onlineTotal: 140, corporateTotal: 25 })
        expect(weeks.get('2026-09-13')).toEqual({ p_p1: 120, p_p2: 0, p_p3: 0, onlineTotal: 120, corporateTotal: 0 })
    })

    it('leaves out a retired platform that took nothing in any of them', () => {
        const weeks = platformWeeks({ platforms: [ROO, platform('p4', 'Uber', 'online_platform', { is_active: false })], days: DAYS, weeks: WEEKS })
        expect(weeks.get('2026-09-06')).toEqual({ p_p1: 100, onlineTotal: 100, corporateTotal: 0 })
    })
})
