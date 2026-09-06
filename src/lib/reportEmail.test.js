import { describe, it, expect } from 'vitest'
import {
    reportEmail, money, negative, pct, weekWords, escapeHtml,
} from '../../supabase/functions/weekly-report-email/email'
import { changesSince } from '../../supabase/functions/weekly-report-email/changes'

const figures = {
    net: 14750, gross: 16450,
    food: 4720, foodPct: 32.0,
    packaging: 610, packagingPct: 4.14,
    labour: 4500, labourPct: 30.5,
    costOfSales: 9830, costOfSalesPct: 66.64,
    deliveryTotal: 1180, standing: 1900,
    earnings: 1840, earningsPct: 12.47,
    platforms: [
        { id: 'p1', name: 'Deliveroo', bucket: 'online_platform', taken: 3200 },
        { id: 'p2', name: 'Uber Eats', bucket: 'online_platform', taken: 2100 },
        { id: 'p3', name: 'Corporate Ltd', bucket: 'catering', taken: 900 },
    ],
    paperwork: {
        food: { total: 8, fine: 8, ok: true, missing: [], expired: [], expiring: [] },
        permits: {
            total: 8, fine: 6, ok: false, missing: [{ name: 'Joao Silva' }],
            expired: [], expiring: [{ name: 'Ana Rocha', on: '2026-10-14' }],
        },
    },
}

const sections = [
    { key: 'sales_costs', title: 'Sales and costs', sort_order: 0, items: [] },
    {
        key: 'profit_loss', title: 'Weekly profit and loss', sort_order: 1,
        items: [
            { kind: 'overhead', key: 'rent', label: 'Rent', amount: 1500, sort_order: 0 },
            { kind: 'overhead', key: 'insurance', label: 'Insurance', amount: 400, sort_order: 1 },
            { kind: 'delivery', key: 'p1', label: 'Deliveroo', amount: 800, sort_order: 0 },
            { kind: 'delivery', key: 'p2', label: 'Uber Eats', amount: 380, sort_order: 1 },
        ],
    },
    {
        key: 'online_sales', title: 'Online sales', sort_order: 2,
        items: [
            { kind: 'rating', key: 'p1', label: 'Deliveroo', amount: 4.6, carried_from: 4.4 },
            { kind: 'rating', key: 'p2', label: 'Uber Eats', amount: 4.8, carried_from: 4.8 },
            { kind: 'review', key: 'p1', label: 'Deliveroo', meta: { stars: 2, count: 1 }, note: 'Cold chips' },
            { kind: 'refund', key: 'p1', label: 'Deliveroo', amount: 12.5, note: 'Missing drink', meta: { claimed: true } },
        ],
    },
    { key: 'corporate_sales', title: 'Corporate sales', sort_order: 3, items: [] },
    { key: 'people_ops', title: 'People and operations', sort_order: 4, items: [] },
    { key: 'marketing', title: 'Marketing and sales development', sort_order: 5, items: [] },
    {
        key: 'support_actions', title: 'Support / actions needed', sort_order: 6,
        items: [
            { kind: 'action', label: 'Fryer thermostat', opened_on: '2026-08-09', sort_order: 0 },
            { kind: 'action', label: 'New menu boards', opened_on: '2026-08-30', sort_order: 1 },
            { kind: 'action', label: 'Done thing', opened_on: '2026-08-02', done_on: '2026-08-20' },
        ],
    },
]

const base = {
    report: { week_start: '2026-08-30', send_count: 1 },
    restaurant: { name: 'Point Campus' },
    sections,
    figures,
    charts: {
        sales: 'https://x.test/sales.png',
        delivery: 'https://x.test/delivery.png',
        earnings: 'https://x.test/earnings.png',
        online: 'https://x.test/online.png',
        corporate: 'https://x.test/corporate.png',
    },
    publisher: 'Leandro',
    appUrl: 'https://hub.test',
}

describe('money', () => {
    it('writes euro with two places and thousands', () => {
        expect(money(14750)).toBe('€14,750.00')
    })

    it('puts the sign before the euro, not after it', () => {
        expect(money(-12.5)).toBe('-€12.50')
    })

    it('treats nothing as nought rather than NaN', () => {
        expect(money(null)).toBe('€0.00')
        expect(money(undefined)).toBe('€0.00')
    })
})

describe('negative', () => {
    it('writes a refund as money going the other way', () => {
        expect(negative(12.5)).toBe('−€12.50')
    })

    it('does not double the sign on something already negative', () => {
        expect(negative(-12.5)).toBe('−€12.50')
    })
})

describe('pct', () => {
    it('gives one place', () => {
        expect(pct(32.04)).toBe('32.0%')
    })

    it('gives nothing at all for nothing, rather than 0%', () => {
        // A share that could not be worked out is not a share of nought.
        expect(pct(null)).toBe('')
    })
})

describe('weekWords', () => {
    it('reads as somebody would say it, with the year', () => {
        expect(weekWords('2026-08-30')).toBe('30 Aug 2026 to 5 Sept 2026')
    })

    it('carries across the end of a year', () => {
        expect(weekWords('2026-12-27')).toBe('27 Dec 2026 to 2 Jan 2027')
    })
})

describe('escapeHtml', () => {
    it('makes a comment safe to put in a mail', () => {
        expect(escapeHtml('<b>Ana & "Joe"</b>'))
            .toBe('&lt;b&gt;Ana &amp; &quot;Joe&quot;&lt;/b&gt;')
    })
})

describe('reportEmail', () => {
    const mail = reportEmail(base)

    it('names the restaurant and the week in the subject', () => {
        expect(mail.subject).toBe('Point Campus weekly report, 30 Aug 2026 to 5 Sept 2026')
    })

    it('does not call a first send a correction', () => {
        // The function reads the report after publishing bumped the count, so
        // a first send arrives here as one.
        expect(mail.subject).not.toContain('Corrected')
        expect(mail.html).not.toContain('replaces the report sent earlier')
    })

    it('leads with net sales and carries gross underneath', () => {
        expect(mail.html).toContain('Net sales')
        expect(mail.html).toContain('€14,750.00')
        expect(mail.html).toContain('€16,450.00')
    })

    it('quotes every cost against net sales', () => {
        expect(mail.html).toContain('32.0%')
        expect(mail.html).toContain('30.5%')
    })

    it('shows a platform cost against that platform own takings', () => {
        // Deliveroo cost 800 of the 3200 it took, which is 25%, not 5.4% of
        // total sales. The share against the whole week would look small on
        // every platform and say nothing about any of them.
        expect(mail.html).toContain('25.0% of its own sales')
    })

    it('never prints a total for the three delivery platforms that was typed', () => {
        // It is the lines added up, and it comes from the figures.
        expect(mail.html).toContain('Third party delivery costs')
        expect(mail.html).toContain('€1,180.00')
    })

    it('mentions a rating that moved and stays quiet about one that held', () => {
        expect(mail.html).toContain('up from 4.40')
        expect(mail.html).not.toContain('4.80')
    })

    it('writes a refund as a negative, with whether it was claimed', () => {
        expect(mail.html).toContain('−€12.50')
        expect(mail.html).toContain('claimed back')
    })

    it('says how long an action has been open', () => {
        expect(mail.html).toContain('open 3 weeks')
        expect(mail.html).toContain('new this week')
    })

    it('leaves out an action that was ticked off', () => {
        expect(mail.html).not.toContain('Done thing')
    })

    it('names the people whose paperwork needs doing', () => {
        expect(mail.html).toContain('Joao Silva')
        expect(mail.html).toContain('Ana Rocha')
    })

    it('says all in date rather than naming nobody', () => {
        expect(mail.html).toContain('all 8 in date')
    })

    it('puts all five charts in', () => {
        for (const url of Object.values(base.charts)) {
            expect(mail.html).toContain(url)
        }
    })

    it('says who wrote it up, because replies go to them', () => {
        expect(mail.html).toContain('Leandro')
    })

    it('gives the same report in plain text', () => {
        expect(mail.text).toContain('Point Campus weekly report')
        expect(mail.text).toContain('Net sales: €14,750.00')
        expect(mail.text).toContain('Net earnings: €1,840.00 (12.5%)')
        expect(mail.text).toContain('Fryer thermostat')
    })
})

describe('reportEmail, as a test send', () => {
    const mail = reportEmail({ ...base, isTest: true })

    it('marks the subject so it cannot be mistaken for the real one', () => {
        expect(mail.subject).toContain('[Test]')
    })

    it('says nobody else got it', () => {
        expect(mail.html).toContain('Nobody else has been sent it')
        expect(mail.text).toContain('THIS IS A TEST')
    })

    it('is never a correction, whatever the count says', () => {
        const again = reportEmail({
            ...base, isTest: true, report: { ...base.report, send_count: 4 },
        })
        expect(again.html).not.toContain('replaces the report sent earlier')
    })
})

describe('reportEmail, as a correction', () => {
    const changes = changesSince(
        { ...figures, food: 5100, foodPct: 34.58 },
        figures,
    )
    const mail = reportEmail({
        ...base, report: { ...base.report, send_count: 2 }, changes,
    })

    it('says so in the subject', () => {
        expect(mail.subject).toContain('Corrected:')
    })

    it('says what changed rather than making everybody read it again', () => {
        expect(mail.html).toContain('What changed')
        expect(mail.html).toContain('€5,100.00 to €4,720.00')
        expect(mail.html).toContain('34.6% to 32.0%')
    })

    it('still says it is a correction when nothing measurable moved', () => {
        const quiet = reportEmail({
            ...base, report: { ...base.report, send_count: 2 }, changes: [],
        })
        expect(quiet.html).toContain('the same as the ones you already have')
    })
})

describe('reportEmail, with a section of their own', () => {
    it('prints what was written in it', () => {
        const mail = reportEmail({
            ...base,
            sections: [...sections, {
                key: 'priorities', title: 'Priorities', sort_order: 7,
                items: [{ kind: 'comment', note: 'Get the second fryer serviced.' }],
            }],
        })
        expect(mail.html).toContain('Priorities')
        expect(mail.html).toContain('Get the second fryer serviced.')
    })

    it('says nothing was written rather than leaving a blank heading', () => {
        const mail = reportEmail({
            ...base,
            sections: [{ key: 'priorities', title: 'Priorities', sort_order: 0, items: [] }],
            figures: { ...figures },
        })
        expect(mail.html).toContain('Nothing written this week.')
    })
})

describe('changesSince', () => {
    const sent = {
        net: 14750, food: 4720, foodPct: 32.0,
        packaging: 610, packagingPct: 4.14,
        labour: 4500, labourPct: 30.5,
        deliveryTotal: 1180, standing: 1900,
        earnings: 1840, earningsPct: 12.47,
    }

    it('finds nothing when nothing moved', () => {
        expect(changesSince(sent, { ...sent })).toEqual([])
    })

    it('names the line, what it was and what it is', () => {
        const moved = changesSince(sent, { ...sent, food: 4400, foodPct: 29.83 })
        expect(moved).toHaveLength(1)
        expect(moved[0]).toMatchObject({
            key: 'food', label: 'Food', was: 4720, now: 4400, up: false,
            wasPct: 32.0, nowPct: 29.83,
        })
    })

    it('leaves the percentage out when only the money moved', () => {
        // A food invoice for ninety euro arrived late on a week whose sales
        // went up with it. The share did not move, so the share is not the
        // story and saying it moved would be the wrong one.
        const moved = changesSince(sent, { ...sent, food: 4810, foodPct: 32.02 })
        expect(moved[0].wasPct).toBeUndefined()
        expect(moved[0].nowPct).toBeUndefined()
    })

    it('ignores a change smaller than a cent', () => {
        expect(changesSince(sent, { ...sent, net: 14750.002 })).toEqual([])
    })

    it('reports every line that moved, in the order the report reads', () => {
        const moved = changesSince(sent, { ...sent, net: 15000, labour: 4300, earnings: 2390 })
        expect(moved.map(m => m.key)).toEqual(['net', 'labour', 'earnings'])
    })

    it('says which way it went', () => {
        const [up] = changesSince(sent, { ...sent, earnings: 2390 })
        expect(up.up).toBe(true)
    })

    it('gives nothing when there is no first send to compare against', () => {
        expect(changesSince(null, sent)).toEqual([])
        expect(changesSince(sent, null)).toEqual([])
    })
})
