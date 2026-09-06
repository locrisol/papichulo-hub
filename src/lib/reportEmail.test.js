import { describe, it, expect } from 'vitest'
import {
    reportEmail, money, negative, pct, withShare, weekWords, weekNumber, slashDate,
    escapeHtml, tidy, stars, starColour, costTone, WIDTH,
} from '../../supabase/functions/weekly-report-email/email'
import { MAIL_WIDTH } from './reportChartImage'
import { changesSince } from '../../supabase/functions/weekly-report-email/changes'

const figures = {
    net: 14750, gross: 16450,
    food: 4720, foodPct: 32.0,
    packaging: 610, packagingPct: 4.14,
    labour: 4500, labourPct: 30.5,
    costOfSales: 9830, costOfSalesPct: 66.64,
    targets: { food: 30, labour: 30, packaging: 4 },
    deliveryTotal: 1180, standing: 1900,
    earnings: 1840, earningsPct: 12.47,
    platforms: [
        { id: 'p1', name: 'Deliveroo', bucket: 'online_platform', taken: 3200, colour: '#145C86', mark: '#1A6E9E' },
        { id: 'p2', name: 'Uber Eats', bucket: 'online_platform', taken: 2100, colour: '#1B6B43', mark: '#248C58' },
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
    it('gives two places, because one cannot tell 2.10 from 2.14', () => {
        expect(pct(32.04)).toBe('32.04%')
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

    it('gives the week number and both dates in the subject', () => {
        expect(mail.subject).toBe('Weekly Summary Report Week 35 (30/08/2026 to 05/09/2026)')
    })

    it('leaves the restaurant out of the subject, since the sender name carries it', () => {
        expect(mail.subject).not.toContain('Point Campus')
        expect(mail.html).toContain('Point Campus')
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

    it('puts the share in brackets after the money, on the same line', () => {
        // The share is wrapped in its own span now, because it carries the
        // target colour and the money does not.
        expect(mail.html).toContain('€4,720.00&nbsp;<span')
        expect(mail.html).toContain('(32.00%)</span>')
    })

    it('shows a platform cost against that platform own takings', () => {
        // Deliveroo cost 800 of the 3200 it took, which is 25%, not 5.4% of
        // total sales. The share against the whole week would look small on
        // every platform and say nothing about any of them.
        expect(mail.html).toContain('25.00%&nbsp;of its own sales')
    })

    it('never prints a total for the three delivery platforms that was typed', () => {
        // It is the lines added up, and it comes from the figures.
        expect(mail.html).toContain('Third party delivery costs')
        expect(mail.html).toContain('€1,180.00')
    })

    it('shows a rating for every platform, moved or not', () => {
        // It used to appear only when it moved, which left two platforms out
        // of three with no rating at all, and nobody can tell "held at 4.8"
        // from "nobody entered it" by being shown neither.
        expect(mail.html).toContain('4.6&nbsp;out&nbsp;of&nbsp;5')
        expect(mail.html).toContain('4.8&nbsp;out&nbsp;of&nbsp;5')
    })

    it('still calls out the one that moved, and says the other held', () => {
        expect(mail.html).toContain('(up from 4.4)')
        expect(mail.html).toContain('(no change)')
    })

    it('says so when a platform has no rating on file', () => {
        const mail2 = reportEmail({
            ...base,
            sections: sections.map(s => (s.key === 'online_sales'
                ? { ...s, items: s.items.filter(i => i.kind !== 'rating') }
                : s)),
        })
        expect(mail2.html).toContain('not recorded')
    })

    it('counts every review, including a single one', () => {
        // The page shows "x 1" and the mail was hiding it, which read as
        // information missing rather than as a count of one.
        expect(mail.html).toContain('&times;&nbsp;1')
    })

    it('writes a refund as a negative, with whether it was claimed', () => {
        expect(mail.html).toContain('−€12.50')
        expect(mail.html).toContain('Claimed back')
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

    it('leads each kind of paperwork with how many are fine', () => {
        expect(mail.html).toContain('8 of 8 fine')
        expect(mail.html).toContain('6 of 8 fine')
    })

    it('puts the names under a heading rather than in a sentence', () => {
        expect(mail.html).toContain('Nothing on file:')
        expect(mail.html).toContain('Runs out soon:')
    })

    it('never uses an em dash', () => {
        // They read as somebody else's writing, and they wrap badly on a phone.
        expect(mail.html).not.toContain('—')
        expect(mail.text).not.toContain('—')
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
        expect(mail.text).toContain('Point Campus weekly summary report')
        expect(mail.text).toContain('Week 35 (30/08/2026 to 05/09/2026)')
        expect(mail.text).toContain('Net sales: €14,750.00')
        expect(mail.text).toContain('Net earnings: €1,840.00 (12.47%)')
        expect(mail.text).toContain('Fryer thermostat')
        expect(mail.text).toContain('    - Joao Silva')
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
        expect(mail.html).toContain('34.58% to 32.00%')
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

// The bugs the first real send showed up, each with the reason it happened, so
// nobody reintroduces one by tidying the template.
describe('what the first send got wrong', () => {
    const mail = reportEmail(base)

    it('never leaves a space at the end of a line', () => {
        // denomailer encodes a trailing space as "=20" BEFORE the pass that
        // escapes "=", so its own equals sign is escaped again and the reader
        // gets the literal text =20. It was on nearly every row of the first
        // mail that went out.
        expect(mail.html).not.toMatch(/ \r?\n/)
        expect(mail.text).not.toMatch(/ \r?\n/)
    })

    it('sends the HTML as a single line, which is what guarantees that', () => {
        expect(mail.html).not.toContain('\n')
    })

    it('has no run of whitespace anywhere in the HTML', () => {
        expect(mail.html).not.toMatch(/\s\s/)
    })

    it('lets the figure column be exactly as wide as the figure', () => {
        // A fixed 42% made "Gas and electric" wrap onto two lines on a phone to
        // leave room for a figure that needed a third of what it was given.
        expect(mail.html).toContain('width="1%"')
        expect(mail.html).not.toContain('width="42%"')
    })

    it('wears each platform own colour', () => {
        expect(mail.html).toContain('#145C86')
        expect(mail.html).toContain('#1B6B43')
    })

    it('names the reviews and the refunds under each platform', () => {
        expect(mail.html).toContain('>New reviews<')
        expect(mail.html).toContain('>Refunds<')
    })

    it('gives each platform its own block, edged in its own colour', () => {
        // Three platforms running together down one table meant a review told
        // you nothing about which of them it belonged to.
        expect(mail.html).toContain('border-left:5px solid #1A6E9E')
        expect(mail.html).toContain('border-left:5px solid #248C58')
    })

    it('gives the Hub a real button rather than a line of blue text', () => {
        expect(mail.html).toContain('Open this report in the Hub')
        expect(mail.html).toContain(`background:${'#2C6FCF'};border-radius:10px`)
    })

    it('draws the section headings as a filled bar', () => {
        expect(mail.html).toContain('background:#182F24;border-radius:8px')
    })
})

describe('tidy', () => {
    it('takes the whitespace out from between tags', () => {
        expect(tidy('<td>\n    <p>Hi</p>\n</td>')).toBe('<td><p>Hi</p></td>')
    })

    it('keeps a single space between words', () => {
        expect(tidy('<p>Net  sales\n  this week</p>')).toBe('<p>Net sales this week</p>')
    })

    it('leaves nothing that could become an =20', () => {
        expect(tidy('<td>Food \n</td>')).not.toMatch(/ \n/)
    })
})

describe('stars', () => {
    it('draws five of them, filled up to the score', () => {
        expect(stars(4)).toBe('★★★★☆')
        expect(stars(0)).toBe('☆☆☆☆☆')
    })

    it('cannot go past five or below nought', () => {
        expect(stars(9)).toBe('★★★★★')
        expect(stars(-3)).toBe('☆☆☆☆☆')
    })
})

describe('starColour', () => {
    it('is green for the ones worth being pleased about', () => {
        expect(starColour(5)).toBe(starColour(4))
    })

    it('gives three its own colour, and two or one another', () => {
        expect(starColour(3)).not.toBe(starColour(4))
        expect(starColour(2)).not.toBe(starColour(3))
        expect(starColour(1)).toBe(starColour(2))
    })
})

describe('withShare', () => {
    it('puts the share in brackets, on the same line', () => {
        // A non breaking space, so the share never wraps away from its figure.
        expect(withShare(284, 1.54)).toBe('€284.00&nbsp;(1.54%)')
    })

    it('gives the money alone when there is no share to give', () => {
        expect(withShare(284, null)).toBe('€284.00')
    })
})

describe('weekNumber', () => {
    it('counts from the year first Sunday, the way the Hub does', () => {
        // 2026 opens on a Thursday, so its first Sunday is 4 January and that
        // is week one. The charts label that week 4 Jan.
        expect(weekNumber('2026-01-04')).toBe(1)
        expect(weekNumber('2026-08-23')).toBe(34)
        expect(weekNumber('2026-08-30')).toBe(35)
    })

    it('gives a week that started before the first Sunday to the year before', () => {
        expect(weekNumber('2026-12-27')).toBe(52)
        expect(weekNumber('2027-01-03')).toBe(1)
    })
})

describe('slashDate', () => {
    it('pads to two figures, so a column of them lines up', () => {
        expect(slashDate('2026-09-05')).toBe('05/09/2026')
    })
})

describe('the chart width', () => {
    it('matches the mail, so a chart is never scaled to fit', () => {
        // Written in both files rather than imported, because importing it
        // would pull the whole mail template into the browser bundle.
        expect(MAIL_WIDTH).toBe(WIDTH)
    })
})

describe('costTone', () => {
    // The same steps as statusFor on the report page and the cost dashboard. A
    // figure that is amber on the screen and plain in the mail is a figure
    // nobody trusts in either place.
    it('is green at or under target', () => {
        expect(costTone(30, 30)).toBe(costTone(28, 30))
        expect(costTone(30, 30)).not.toBeNull()
    })

    it('is amber within two points over, and red past that', () => {
        expect(costTone(31.9, 30)).not.toBe(costTone(30, 30))
        expect(costTone(32.1, 30)).not.toBe(costTone(31.9, 30))
    })

    it('gives nothing when no target was set, rather than judging it', () => {
        expect(costTone(34, null)).toBeNull()
        expect(costTone(34, 0)).toBeNull()
        expect(costTone(null, 30)).toBeNull()
    })
})

describe('the cost colours in the mail', () => {
    it('colours the share by the target the week was judged against', () => {
        // Food is 32.00% against a 30% target: two points over, so amber.
        // Labour is 30.50%, also amber. Packaging is 4.14% against 4%, amber.
        const mail = reportEmail(base)
        expect(mail.html).toContain(`<span style="color:${costTone(32, 30)};">(32.00%)</span>`)
    })

    it('goes red once it is more than two points over', () => {
        const mail = reportEmail({
            ...base, figures: { ...figures, foodPct: 34.5 },
        })
        expect(mail.html).toContain(`<span style="color:${costTone(34.5, 30)};">(34.50%)</span>`)
        expect(costTone(34.5, 30)).not.toBe(costTone(32, 30))
    })

    it('says which targets the week was judged against', () => {
        expect(reportEmail(base).html).toContain('food 30%, labour 30%, packaging 4%')
    })

    it('leaves the shares uncoloured when no target was ever set', () => {
        const mail = reportEmail({ ...base, figures: { ...figures, targets: {} } })
        expect(mail.html).toContain('(32.00%)')
        expect(mail.html).not.toContain('judged against')
    })
})

describe('the rows that matter more than the others', () => {
    const mail = reportEmail(base)

    it('sets net sales, cost of sales and the totals apart from the ordinary rows', () => {
        // A column of thirteen overheads needs a visible bottom, not a
        // fourteenth line that happens to be bold.
        expect(mail.html).toContain(`border-top:2px solid ${'#182F24'}`)
    })

    it('gives net earnings a box of its own rather than a heavier row', () => {
        expect(mail.html).toContain('>Net earnings<')
        expect(mail.html).toContain('of net sales</div>')
    })

    it('shows a loss in red', () => {
        const bad = reportEmail({
            ...base, figures: { ...figures, earnings: -400, earningsPct: -2.71 },
        })
        expect(bad.html).toContain('border:2px solid #B91C1C')
    })
})

describe('the width, which is a ceiling and not a size', () => {
    const mail = reportEmail(base)

    it('never puts the width in an attribute', () => {
        // width="760" tells a phone to lay the whole message out at 760 and
        // scale it down, and Gmail then inflates the type back up inside
        // columns worked out at 760. That is what put "Gas and electric" on
        // two lines, and why widening the desktop broke the phone.
        expect(mail.html).not.toContain(`width="${WIDTH}"`)
        expect(mail.html).not.toMatch(/width="\d{3,}"/)
    })

    it('sets it as a maximum in the style instead', () => {
        expect(mail.html).toContain(`max-width:${WIDTH}px`)
    })

    it('tells a chart to fill its column rather than to be a number of points wide', () => {
        const withCharts = reportEmail({ ...base, charts: { sales: 'https://x.test/a.png' } })
        expect(withCharts.html).toContain('width="100%"')
    })
})

describe('corporate accounts', () => {
    const sectionsWithCorporate = [
        ...sections,
        {
            key: 'corporate_sales', title: 'Corporate sales', sort_order: 3,
            items: [],
        },
    ].filter((s, i, all) => all.findIndex(x => x.key === s.key) === i)

    const mail = reportEmail({ ...base, sections: sectionsWithCorporate })

    it('gives a corporate account no rating and no reviews', () => {
        // Clockmeal has no star rating and nobody leaves it a review. Printing
        // "overall rating: not recorded" against four of them says something is
        // missing when there is nothing to miss.
        const corporate = mail.html.slice(mail.html.indexOf('Corporate sales'))
        expect(corporate).toContain('Corporate Ltd')
        expect(corporate).not.toContain('Overall rating')
        expect(corporate).not.toContain('New reviews')
    })

    it('still gives it a block, a colour and what it took', () => {
        const corporate = mail.html.slice(mail.html.indexOf('Corporate sales'))
        expect(corporate).toContain('€900.00')
    })

    it('keeps the rating and the reviews on the online platforms', () => {
        const online = mail.html.slice(
            mail.html.indexOf('Online sales'), mail.html.indexOf('Corporate sales'))
        expect(online).toContain('Overall rating')
        expect(online).toContain('New reviews')
    })
})

describe('people and operations', () => {
    const mail = reportEmail(base)

    it('is a card rather than text against the edge of the message', () => {
        expect(mail.html).toContain(`padding:14px ${20}px 0`)
        expect(mail.html).toContain('border-left:5px solid')
    })

    it('puts the count in the header beside the name', () => {
        expect(mail.html).toContain('>Food safety certificates<')
        expect(mail.html).toContain('>8 of 8 fine<')
    })

    it('edges the card by how bad it is', () => {
        // Green when everything is in date, red once something has expired.
        const bad = reportEmail({
            ...base,
            figures: {
                ...figures,
                paperwork: {
                    ...figures.paperwork,
                    food: {
                        total: 8, fine: 7, ok: false, missing: [], expiring: [],
                        expired: [{ name: 'Iliana', on: '2026-07-01' }],
                    },
                },
            },
        })
        expect(bad.html).toContain('border-left:5px solid #B91C1C')
    })

    it('draws no empty body when there is nothing to list', () => {
        const clean = reportEmail({
            ...base,
            figures: {
                ...figures,
                paperwork: {
                    food: { total: 8, fine: 8, ok: true, missing: [], expired: [], expiring: [] },
                    permits: { total: 8, fine: 8, ok: true, missing: [], expired: [], expiring: [] },
                },
            },
        })
        expect(clean.html).toContain('>8 of 8 fine<')
        expect(clean.html).not.toContain('Nothing on file:')
    })
})

describe('the row layout', () => {
    const mail = reportEmail(base)

    it('gives the label column the width, which is what stops it wrapping', () => {
        // width="1%" and nowrap on the figure is only half the instruction. A
        // table shares the width left over between its columns in proportion to
        // what is in them; it does not hand the lot to the other column just
        // because this one asked to be small. So the label got a share of the
        // slack instead of all of it, and "Gas and electric" broke in two with
        // an inch of nothing sitting beside it.
        expect(mail.html).toContain('<td width="100%" style="padding:')
        expect(mail.html).toContain('<td width="1%" align="right"')
    })

    it('tells the card to fill the message', () => {
        // Taking the width attribute off a table does not leave it filling its
        // parent, it leaves it shrinking to its own contents.
        expect(mail.html).toContain('<table role="presentation" width="100%"')
        expect(mail.html).toContain(`max-width:${WIDTH}px`)
    })
})

describe('the headings inside a card', () => {
    const mail = reportEmail(base)

    it('are a band across the card, not a line of small grey text', () => {
        expect(mail.html).toContain('background:#EDE7DC')
        expect(mail.html).toContain('>New reviews<')
        expect(mail.html).toContain('>Refunds<')
    })

    it('spans the card, so the rows inside carry their own padding instead', () => {
        expect(mail.html).toContain('padding:9px 14px')
        expect(mail.html).not.toContain('padding:2px 14px 12px')
    })
})

// The two things that took five attempts. Both are pinned here because both
// regressed every time something near them was tidied up.
describe('the profit and loss section is two tables, not one', () => {
    const OVERHEADS = [
        'Gas and electric', 'Rates / service charge', 'IT fee / software support',
        'Repairs and maintenance', 'Health and safety / training / uniforms',
        'Marketing / sponsorship',
    ]
    const mail = reportEmail({
        ...base,
        sections: [{
            key: 'profit_loss', title: 'Weekly profit and loss', sort_order: 0,
            items: [
                ...OVERHEADS.map((label, i) => ({ kind: 'overhead', label, amount: 100 + i, sort_order: i })),
                { kind: 'delivery', key: 'p1', label: 'Deliveroo', amount: 800, sort_order: 0 },
            ],
        }],
    })

    const bodies = mail.html
        .split('border-collapse:collapse;">').slice(1)
        .map(t => t.split('</table>')[0])
    const widestIn = body => [...body.matchAll(/white-space:nowrap;">([^<]*)</g)]
        .map(m => m[1].replace(/&nbsp;/g, ' '))
        .sort((a, b) => b.length - a.length)[0] || ''

    it('gives the delivery platforms a table of their own', () => {
        expect(bodies.length).toBe(2)
    })

    it('keeps the delivery share out of the overheads column', () => {
        // A table gives every row the same columns, and a column is as wide as
        // the widest thing anywhere in it. The share beside a platform cannot
        // break, so in one table it was setting the figure column for every
        // overhead above it, and each of those labels got whatever was left of
        // a phone screen. The labels were being squeezed by a string three rows
        // below them, which is why four attempts at the labels themselves all
        // failed.
        expect(widestIn(bodies[0]).length).toBeLessThan(12)
        expect(widestIn(bodies[1])).toContain('of its own sales')
    })

    it('keeps the money in one column across both tables', () => {
        // They read as one list because both fill the same padded cell and
        // every figure is right aligned in both.
        for (const body of bodies) {
            expect(body).toContain('<td width="1%" align="right"')
        }
    })

    it('draws one table when there are no delivery platforms', () => {
        const quiet = reportEmail({
            ...base,
            sections: [{
                key: 'profit_loss', title: 'Weekly profit and loss', sort_order: 0,
                items: [{ kind: 'overhead', label: 'Rent', amount: 900 }],
            }],
        })
        expect(quiet.html.split('border-collapse:collapse;">').length - 1).toBe(1)
    })
})

describe('a section heading is wider than what is under it', () => {
    const mail = reportEmail(base)

    it('does not pay the gutter the rows below it pay', () => {
        expect(mail.html).toContain('<tr><td style="padding:28px 0 12px;">')
        expect(mail.html).toContain('<td style="padding:0 20px;">')
    })

    it('takes that gutter back inside the bar, so the title does not move', () => {
        // Without this the heading text lands twenty points left of every label
        // and the bar reads as belonging to nothing.
        expect(mail.html).toContain('border-radius:8px;padding:12px 35px;')
    })

    it('keeps its corners, so the overhang reads as meant', () => {
        expect(mail.html).toContain('border-radius:8px')
    })
})
