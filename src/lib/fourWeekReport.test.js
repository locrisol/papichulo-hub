import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
    fourWeeksOf, monthlyWeeks, monthlyDates, fourWeekFigures, fourWeekBlockers, fourWeekWarnings, sentAgain,
    weeksToday, FOUR_WEEK_ANCHOR, FIRST_MONTHLY, MONEY_KEYS,
} from '@/lib/fourWeekReport'
import { weekNumber } from '@/lib/dates'

// The monthly report (his, 13 November 2026): four weekly reports, as they
// were sent, added up. Invented figures in the shape the weeks freeze them.

describe('which four weeks', () => {
    it('counts blocks of 28 days from Sunday 4 October 2026', () => {
        expect(fourWeeksOf('2026-10-04').start).toBe('2026-10-04')
        expect(fourWeeksOf('2026-10-31').start).toBe('2026-10-04')
        expect(fourWeeksOf('2026-11-01')).toEqual({
            start: '2026-11-01', end: '2026-11-28',
            weeks: ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22'], number: 1,
        })
        expect(fourWeeksOf('2026-11-28').start).toBe('2026-11-01')
        expect(fourWeeksOf('2026-11-29').start).toBe('2026-11-29')
    })

    it('has nothing before the first block', () => {
        expect(fourWeeksOf('2026-10-03')).toBeNull()
        expect(fourWeeksOf(null)).toBeNull()
    })

    // His "starting with week 44": weeks 40 to 43 are the block before it.
    it('puts week 44 at the start of a block and weeks 40 to 43 in the one before', () => {
        expect(weekNumber(FIRST_MONTHLY)).toBe(44)
        expect(fourWeeksOf(FIRST_MONTHLY).start).toBe(FIRST_MONTHLY)
        expect(fourWeeksOf('2026-10-25').weeks.map(weekNumber)).toEqual([40, 41, 42, 43])
    })

    // The database makes the draft by the same count, so the two must agree.
    it('counts the same way as make_four_week_reports and the check on the table', () => {
        const schema = readFileSync('supabase/schema.sql', 'utf8')
        const fn = schema.slice(schema.indexOf('create or replace function public.make_four_week_reports'))
        expect(fn).toContain(`date '${FOUR_WEEK_ANCHOR}' + ((w.week_start - date '${FOUR_WEEK_ANCHOR}') / 28) * 28`)
        expect(schema).toContain(`("week_start" - '${FOUR_WEEK_ANCHOR}'::"date") % 28`)
        expect(schema).toContain(`since date default date '${FIRST_MONTHLY}'`)
    })
})

describe('what it is called', () => {
    it('names the weeks and the dates', () => {
        expect(monthlyWeeks('2026-11-01')).toBe('Weeks 44 to 47')
        expect(monthlyDates('2026-11-01')).toMatch(/^1 Nov to 28 Nov 2026$/)
    })

    // weekNumber starts again each January, so the dates always go beside it.
    it('crosses a year end by date', () => {
        expect(monthlyWeeks('2026-12-27')).toBe('Weeks 52 to 3')
        expect(monthlyDates('2026-12-27')).toMatch(/^27 Dec 2026 to 23 Jan 2027$/)
        expect(fourWeeksOf('2027-01-23').start).toBe('2026-12-27')
    })

    // 2028 has a week 53: its first Sunday is 2 January.
    it('takes a week 53 in its stride', () => {
        const block = fourWeeksOf('2028-12-31')
        expect(block.start).toBe('2028-12-24')
        expect(block.weeks.map(weekNumber)).toEqual([52, 53, 1, 2])
        expect(monthlyWeeks(block.start)).toBe('Weeks 52 to 2')
    })
})

// Four weeks, the way weekly reports freeze them.
const platform = (id, name, bucket, over) => ({ id, name, bucket, mark: `#${id}`, colour: `#${id}0`, ...over })
const week = (weekStart, money, over = {}) => ({
    week_start: weekStart,
    status: 'published',
    send_count: 1,
    published_at: `${weekStart}T09:00:00Z`,
    figures: {
        version: 6,
        ...money,
        tradingDays: 7, labourDays: 7, foodEntries: 10, packagingEntries: 8,
        targets: { food: 30, labour: 30, packaging: 2.5, delivery: 30 },
        statement: { from: '', to: '' },
        ...over.figures,
    },
    sections: over.sections || [],
})
const money = (net, food, labour, extra = {}) => {
    const packaging = extra.packaging ?? 100
    const deliveryTotal = extra.deliveryTotal ?? 50
    const standing = extra.standing ?? 200
    const overhead = standing + deliveryTotal
    const costOfSales = food + packaging + labour
    const grossProfit = net - costOfSales
    return {
        net, gross: net * 1.1, food, packaging, labour, deliveryTotal, standing, overhead, costOfSales,
        grossMargin: net - food - packaging, grossProfit, earnings: grossProfit - overhead,
    }
}
const statementOf = s => {
    const d = new Date(`${s}T00:00:00Z`)
    const add = n => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
    return { from: add(1), to: add(7) }
}
const OCT = [
    week('2026-10-04', money(1000, 300, 280), { figures: { statement: statementOf('2026-10-04'), platforms: [
        platform('d', 'Deliveroo', 'online_platform', { taken: 100, statement: 30, statementTaken: 90, weekTaken: 100, cost: 33.33 }),
        platform('old', 'Retired', 'online_platform', { taken: 20, statement: 5, statementTaken: 20, weekTaken: 20, cost: 5 }),
        platform('c', 'Feedr', 'catering', { taken: 300 }),
    ] } }),
    week('2026-10-11', money(800, 400, 300), { figures: { statement: statementOf('2026-10-11'), platforms: [
        platform('d', 'Deliveroo', 'online_platform', { taken: 200, statement: 60, statementTaken: 200, weekTaken: 200, cost: 60 }),
        platform('c', 'Feedr', 'catering', { taken: 100 }),
    ] } }),
    week('2026-10-18', money(1200, 360, 400), { figures: { statement: statementOf('2026-10-18'), platforms: [
        platform('d', 'Deliveroo', 'online_platform', { taken: 150, statement: 45, statementTaken: 150, weekTaken: 150, cost: 45 }),
    ] } }),
    week('2026-10-25', money(1000.004, 250, 320), {
        figures: {
            statement: statementOf('2026-10-25'),
            targets: { food: 28, labour: 30, packaging: 2.5, delivery: 30 },
            platforms: [
                platform('d', 'Deliveroo Ltd', 'online_platform', { taken: 50, statement: 20, statementTaken: 50, weekTaken: 50, cost: 20 }),
            ],
        },
    }),
]

describe('adding the four weeks up', () => {
    const f = fourWeekFigures([...OCT].reverse())

    it('adds every money figure, each week to the cent first', () => {
        expect(f.net).toBe(4000)
        expect(f.food).toBe(1310)
        expect(f.labour).toBe(1300)
        expect(f.packaging).toBe(400)
        expect(f.standing).toBe(800)
        expect(f.deliveryTotal).toBe(200)
        expect(f.overhead).toBe(1000)
        for (const key of MONEY_KEYS) expect(typeof f[key]).toBe('number')
        expect(f.tradingDays).toBe(28)
        expect(f.foodEntries).toBe(40)
    })

    // An average of the four weeks' shares would be (30 + 50 + 30 + 25) / 4.
    it('works every share out from the totals, never as an average', () => {
        expect(f.foodPct).toBeCloseTo(32.75, 5)
        expect(f.foodPct).not.toBeCloseTo(33.75, 2)
        expect(f.labourPct).toBeCloseTo(32.5, 5)
        expect(f.earningsPct).toBeCloseTo((f.earnings / f.net) * 100, 8)
        expect(f.foodPctGross).toBeCloseTo((1310 / f.gross) * 100, 8)
    })

    it('keeps every platform the four weeks had, with the latest name, and its rate over the four', () => {
        const d = f.platforms.find(p => p.id === 'd')
        expect(d.name).toBe('Deliveroo Ltd')
        expect(d.taken).toBe(500)
        expect(d.cost).toBe(158.33)
        expect(d.rate).toBeCloseTo((158.33 / 500) * 100, 8)
        expect(d.statement).toBe(155)
        expect(f.platforms.find(p => p.id === 'old').taken).toBe(20)
        expect(f.platforms.find(p => p.id === 'c')).toMatchObject({ taken: 400, statement: null, rate: null })
    })

    it('takes the last week\'s targets, and says when they changed', () => {
        expect(f.targets.food).toBe(28)
        expect(f.fourWeeks.targetsChanged).toBe(true)
        const same = fourWeekFigures(OCT.slice(0, 3))
        expect(same.fourWeeks.targetsChanged).toBe(false)
    })

    it('runs the statements from week 1\'s Monday to week 4\'s Sunday', () => {
        expect(f.statement).toMatchObject({ from: '2026-10-05', to: '2026-11-01' })
        expect(f.statement.words).toBe('Monday 5 October to Sunday 1 November')
    })

    it('says what it was made from', () => {
        expect(f.fourWeeks.start).toBe('2026-10-04')
        expect(f.fourWeeks.weeks.map(w => w.week_start)).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
        expect(f.fourWeeks.weeks[0]).toMatchObject({ send_count: 1, version: 6 })
    })
})

describe('the lines under the figures', () => {
    const pl = items => [{ key: 'profit_loss', items }]
    const online = items => [{ key: 'online_sales', items }]
    const weeks = [
        week('2026-11-01', money(1, 0, 0), { sections: [
            ...pl([
                { kind: 'overhead', key: 'rent', label: 'Rent', amount: 100, sort_order: 0 },
                { kind: 'overhead', key: 'old', label: 'Old lease', amount: 10.004, sort_order: 1 },
            ]),
            ...online([
                { kind: 'rating', key: 'd', amount: 4.5, carried_from: 4.4 },
                { kind: 'review', key: 'd', meta: { stars: 2, count: 1 }, note: 'Cold' },
                { kind: 'refund', key: 'd', amount: 12.5 },
            ]),
        ], figures: { platforms: [platform('d', 'Deliveroo', 'online_platform', { taken: 1 })] } }),
        week('2026-11-08', money(1, 0, 0), { sections: [
            ...pl([{ kind: 'overhead', key: 'rent', label: 'Rent', amount: 100, sort_order: 0 }]),
            ...online([{ kind: 'review', key: 'd', meta: { stars: 5, count: 3 } }]),
        ] }),
        week('2026-11-15', money(1, 0, 0)),
        week('2026-11-22', money(1, 0, 0), { sections: [
            ...pl([
                { kind: 'overhead', key: 'gas', label: 'Gas and electric', amount: 50, sort_order: 0 },
                { kind: 'overhead', key: 'rent', label: 'Rent and service', amount: 100, sort_order: 1 },
            ]),
            ...online([
                { kind: 'rating', key: 'd', amount: 4.7, carried_from: 4.6 },
                { kind: 'refund', key: 'd', amount: 7.25 },
            ]),
        ] }),
    ]
    const f = fourWeekFigures(weeks)

    it('adds each overhead by its line, in the last week\'s order, an older line after', () => {
        expect(f.fourWeeks.overheads).toEqual([
            { key: 'gas', label: 'Gas and electric', amount: 50 },
            { key: 'rent', label: 'Rent and service', amount: 300 },
            { key: 'old', label: 'Old lease', amount: 10 },
        ])
    })

    it('gives each platform its rating from the start to the end, its reviews by stars and its refunds', () => {
        expect(f.fourWeeks.online).toEqual([{
            id: 'd',
            rating: { from: 4.4, to: 4.7 },
            reviews: { count: 4, stars: { 2: 1, 5: 3 } },
            refunds: { count: 2, money: 19.75 },
        }])
    })
})

describe('what holds it back', () => {
    it('is nothing when all four weeks are sent with their figures', () => {
        expect(fourWeekBlockers(OCT, '2026-10-04')).toEqual([])
    })

    it('names the weeks with no report sent', () => {
        expect(fourWeekBlockers(OCT.slice(0, 2), '2026-10-04')).toEqual(['Weeks 42 and 43 have no report sent yet.'])
        expect(fourWeekBlockers(OCT.slice(0, 3), '2026-10-04')).toEqual(['Week 43 has no report sent yet.'])
    })

    it('waits for a week reopened to be sent again', () => {
        const reopened = OCT.map((w, i) => (i === 1 ? { ...w, status: 'draft' } : w))
        expect(fourWeekBlockers(reopened, '2026-10-04')).toEqual(['Week 41 is reopened. Send it again before this report can go out.'])
    })

    // A missing figure is never read as nought.
    it('refuses a week sent without a figure it needs', () => {
        const short = OCT.map((w, i) => (i === 2 ? { ...w, figures: { ...w.figures, labour: undefined } } : w))
        expect(fourWeekBlockers(short, '2026-10-04')).toEqual(['Week 42 was sent without the figures this report adds up.'])
    })
})

describe('what it warns about', () => {
    it('names the week for each of its own gaps', () => {
        const noHours = OCT.map((w, i) => (i === 0 ? { ...w, figures: { ...w.figures, labourDays: 0 } } : w))
        expect(fourWeekWarnings(noHours)[0]).toMatch(/^Week 40: No hours have been entered/)
    })

    // His week 41: packaging typed in after it went.
    it('says when a week today is not what it was sent with', () => {
        const today = { '2026-10-11': { net: 800, food: 400, packaging: 214.27, labour: 300 } }
        expect(fourWeekWarnings(OCT, today)).toEqual([
            'Week 41: packaging and cleaning is €114.27 more today than when it was sent. Reopen week 41 and send it again to include it.',
        ])
    })

    it('says nothing when today agrees to the cent', () => {
        const today = { '2026-10-11': { net: 800.001, food: 400, packaging: 100, labour: 300 } }
        expect(fourWeekWarnings(OCT, today)).toEqual([])
    })
})

describe('a week sent again afterwards', () => {
    it('is found by its send count', () => {
        const made = fourWeekFigures(OCT).fourWeeks.weeks
        const now = OCT.map((w, i) => (i === 3 ? { ...w, send_count: 2 } : w))
        expect(sentAgain(made, now)).toEqual(['2026-10-25'])
        expect(sentAgain(made, OCT)).toEqual([])
    })
})

describe('the four weeks as they stand today', () => {
    it('splits the rows into the block\'s weeks', () => {
        const out = weeksToday({
            start: '2026-10-04',
            days: [
                { sale_date: '2026-10-04', net_sales: 100, gross_sales: 110 },
                { sale_date: '2026-10-12', net_sales: 50, gross_sales: 55 },
            ],
            spend: [{ cost_date: '2026-10-30', category: 'packaging', amount: 20 }],
            labour: [{ entry_date: '2026-10-05', labour_cost: 40 }],
        })
        expect(Object.keys(out)).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
        expect(out['2026-10-04']).toMatchObject({ net: 100, labour: 40 })
        expect(out['2026-10-11'].net).toBe(50)
        expect(out['2026-10-25'].packaging).toBe(20)
    })
})
