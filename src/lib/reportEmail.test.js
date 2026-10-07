import { describe, it, expect } from 'vitest'
import {
    reportEmail, money, negative, pct, withShare, weekWords, weekNumber, slashDate,
    escapeHtml, tidy, stars, starColour, costTone, senderFor, heldNotice, WIDTH, SIDE,
    renewalWords, escapeLines, page, headline, overheadsToShow, backByReason,
    deliverable, isJustTheGoodbye, replyToFor, switchedOff, whatToSend, correctionSend,
    paidWords, againstWords, figureGaps as mailGaps, openActions, platformsIn, richHtml, richWords, saidRefunds,
} from '../../supabase/functions/weekly-report-email/email'
import { readFileSync } from 'node:fs'
import { MAIL_WIDTH } from '@/lib/reportChartImage'
import { changesSince } from '../../supabase/functions/weekly-report-email/changes'
import { priceWeek, backByReason as webBackByReason } from '@/lib/invoiceReport'
import { figureGaps } from '@/lib/weeklyReport'
import { richPlain } from '@/lib/richText'
import { weekCleaning } from '@/lib/checklists'

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

    it('puts the share first and the money on the line under it', () => {
        // Stacked, the column is only as wide as the money. The share is on
        // top since 4 October, his order: it is what a cost is judged by.
        expect(mail.html).toContain('32.00%</span><br /><span')
        expect(mail.html).toContain('€4,720.00</span>')
    })

    // His of 4 October: one line, the platforms' total against what the
    // online platforms took. 1,180 of 5,300 is 22.26%.
    it('gives third party delivery as one line, against online sales', () => {
        expect(mail.html).toContain('Third party delivery costs')
        expect(mail.html).toContain('22.26%')
        expect(mail.html).toContain('of €5,300.00 online sales')
        expect(mail.html).not.toContain('of what it took')
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

    // Claimed before the four states, so read as waiting: nobody said what
    // came of it.
    it('writes a refund as a negative, with what came of the claim', () => {
        expect(mail.html).toContain('−€12.50')
        expect(mail.html).toContain('Claimed, waiting')
        expect(mail.html).not.toContain('Claimed back')
        expect(mail.text).toContain('Missing drink (claimed, waiting)')
    })

    // His of 7 October: a claim from an earlier week stays on the report
    // until it is answered, with this week's answer.
    it('lists claims from earlier weeks under their platform, with the answer given this week', () => {
        const withClaims = sections.map(s => (s.key === 'online_sales'
            ? {
                ...s,
                items: [
                    ...s.items,
                    { kind: 'refund_claim', key: 'p1', label: 'Deliveroo', amount: 22.4, note: 'Arrived cold', opened_on: '2026-08-16', meta: { answer: 'back' } },
                    { kind: 'refund_claim', key: 'p1', label: 'Deliveroo', amount: 4.95, note: 'Missing chips', opened_on: '2026-08-23', meta: { answer: 'refused' } },
                ],
            }
            : s))
        const out = reportEmail({ ...base, sections: withClaims })
        expect(out.html).toContain('Claims from earlier weeks')
        expect(out.html).toContain('Claimed in the week of 16 Aug')
        expect(out.html).toContain('+€22.40')
        expect(out.html).toContain('Paid back')
        expect(out.html).toContain('Refused')
        expect(out.text).toContain('€4.95 Missing chips, week of 23 Aug (refused)')
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

    it('leads each kind of paperwork with how many are in date', () => {
        expect(mail.html).toContain('8 of 8 in date')
        expect(mail.html).toContain('6 of 8 in date')
    })

    it('puts the names under a heading rather than in a sentence', () => {
        expect(mail.html).toContain('Nothing on file:')
        expect(mail.html).toContain('Expires soon:')
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
        expect(mail.text).toContain('Net earnings: 12.47% (€1,840.00)')
        expect(mail.text).toContain('Fryer thermostat')
        expect(mail.text).toContain('    - Joao Silva')
    })
})

describe('reportEmail, as a test send', () => {
    const mail = reportEmail({ ...base, isTest: true })

    it('marks the subject so it cannot be mistaken for the real one', () => {
        expect(mail.subject).toContain('[Test]')
    })

    it('says who it went to', () => {
        expect(mail.html).toContain('It went to everyone on the report list except the owners')
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
    const sent = { ...base.report, send_count: 2, sent_to: ['owner@papichulo.ie'] }
    const mail = reportEmail({ ...base, report: sent, changes })

    it('says so in the subject', () => {
        expect(mail.subject).toContain('Corrected:')
    })

    it('says what changed rather than making everybody read it again', () => {
        expect(mail.html).toContain('What changed')
        expect(mail.html).toContain('€5,100.00 to €4,720.00')
        expect(mail.html).toContain('34.58% to 32.00%')
    })

    it('still says it is a correction when nothing measurable moved', () => {
        const quiet = reportEmail({ ...base, report: sent, changes: [] })
        expect(quiet.html).toContain('have not changed from the report you already have')
    })

    // Before 1 October the count went up on every publish, mail or no mail. A
    // report whose first two sends both failed has a count of two and nobody
    // who ever got it, and sending it from Published, not sent would have told
    // the owners it replaced a report they never had.
    it('is not a correction when no earlier send reached anybody', () => {
        const never = reportEmail({ ...base, report: { ...sent, sent_to: null }, changes })
        expect(never.subject).not.toContain('Corrected')
        expect(never.html).not.toContain('replaces the report sent earlier')
        expect(reportEmail({ ...base, report: { ...sent, sent_to: [] } }).subject).not.toContain('Corrected')
    })
})

// The function and the browser have to agree on this, or the manager is asked
// to send a correction and the owners get a first mail, or the other way round.
describe('correctionSend', () => {
    it('needs a second send and an earlier one that reached somebody', () => {
        expect(correctionSend({ send_count: 2, sent_to: ['owner@papichulo.ie'] })).toBe(true)
        expect(correctionSend({ send_count: 1, sent_to: ['owner@papichulo.ie'] })).toBe(false)
        expect(correctionSend({ send_count: 3, sent_to: null })).toBe(false)
        expect(correctionSend({ send_count: 2, sent_to: [] })).toBe(false)
    })

    it('is never a test', () => {
        expect(correctionSend({ send_count: 2, sent_to: ['owner@papichulo.ie'] }, true)).toBe(false)
    })

    it('is what the function asks, off a report read with who it went to', () => {
        const source = readFileSync('supabase/functions/weekly-report-email/index.ts', 'utf8')
        const read = source.slice(source.indexOf(".from('weekly_reports')"), source.indexOf("eq('id', reportId)"))
        expect(read).toContain('sent_to')
        expect(source).toMatch(/correctionSend\(report, test\)/)
        expect(source).not.toMatch(/send_count \|\| 0\) > 1/)
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
        expect(mail.html).toContain(`background:#182F24;padding:14px ${SIDE}px`)
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
    it('puts the share first and the money under it', () => {
        expect(withShare(284, 1.54)).toMatch(/^1\.54%<br \/>/)
        expect(withShare(284, 1.54)).toContain('>€284.00</span>')
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
        expect(mail.html).toContain(`<span style="color:${costTone(32, 30)};">32.00%</span>`)
    })

    it('goes red once it is more than two points over', () => {
        const mail = reportEmail({
            ...base, figures: { ...figures, foodPct: 34.5 },
        })
        expect(mail.html).toContain(`<span style="color:${costTone(34.5, 30)};">34.50%</span>`)
        expect(costTone(34.5, 30)).not.toBe(costTone(32, 30))
    })

    // His wording of 4 October, in place of the paragraph on the colours.
    it('says which targets the week was judged against, in one line', () => {
        expect(reportEmail(base).html).toContain('Current targets: food 30%, labour 30%, packaging 4%.')
        expect(reportEmail(base).html).not.toContain('Every percentage is of net sales')
    })

    it('leaves the shares uncoloured when no target was ever set', () => {
        const mail = reportEmail({ ...base, figures: { ...figures, targets: {} } })
        expect(mail.html).toContain('32.00%<br />')
        expect(mail.html).not.toContain('Current targets')
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
        // The standard gutter rather than the number it happens to be. Written
        // as 20 it went on passing after the gutter moved to 16, against a
        // width nobody had chosen.
        expect(mail.html).toContain(`padding:14px ${SIDE}px 0`)
        expect(mail.html).toContain('border-left:5px solid')
    })

    it('puts the count in the header beside the name', () => {
        expect(mail.html).toContain('>Food safety certificates<')
        expect(mail.html).toContain('>8 of 8 in date<')
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
        expect(clean.html).toContain('>8 of 8 in date<')
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
        // And the platforms' own table is measured against its own money too,
        // because the share sits under the name rather than beside the figure.
        expect(widestIn(bodies[1]).length).toBeLessThan(12)
        expect(bodies[1]).toContain('online sales')
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

// The message runs to the edge of the screen on a phone.
//
// It used to sit in a rounded card inside a ten point gutter, and the gutter was
// then paid twice more: twenty four on the body cell and twenty again on every
// row of figures. Fifty five points each side, a quarter of a phone, before a
// figure was drawn. Only the phone changes: the maximum width still holds it to
// a column on anything bigger.
describe('the message runs to the edge', () => {
    const mail = reportEmail(base)

    it('has no gutter outside it', () => {
        expect(mail.html).toContain(`background:${'#F7F5F0'};padding:0;`)
    })

    it('has no corners or border to cut it off from the screen', () => {
        expect(mail.html).not.toContain('border-radius:14px')
        expect(mail.html).toContain(`max-width:${WIDTH}px;background:#ffffff;overflow:hidden;`)
    })

    // The one that stops the old bug coming back: the body cell and the rows
    // inside it were both insetting the same content.
    it('pays the gutter once, on the rows', () => {
        expect(mail.html).toContain('<tr><td style="padding:18px 0 26px;">')
        expect(mail.html).toContain(`<td style="padding:0 ${SIDE}px;">`)
    })

    it('still holds itself to a column on a computer', () => {
        expect(mail.html).toContain(`max-width:${WIDTH}px`)
    })
})

// It used to run wider than the figures under it, taking the gutter back inside
// the bar so the title did not move. That was right while the message had a
// gutter of its own. It has none now, so the bar runs the whole width and the
// title lines up with every label under it.
describe('a section heading', () => {
    const mail = reportEmail(base)
    const chip = n => `padding:4px 0;">${n}</td>`

    it('runs the full width of the message', () => {
        expect(mail.html).toContain('<tr><td style="padding:36px 0 14px;">')
        expect(mail.html).toContain(`background:${'#182F24'};padding:14px ${SIDE}px`)
    })

    // A band says where a section starts and says nothing at all once you have
    // scrolled past it, which on a phone is most of the time.
    it('says which of the seven it is', () => {
        for (const n of [1, 2, 3, 4, 5, 6, 7]) {
            expect(mail.html, `section ${n}`).toContain(chip(n))
        }
    })

    it('numbers them in the order they are read', () => {
        const at = n => mail.html.indexOf(chip(n))
        for (const n of [2, 3, 4, 5, 6, 7]) {
            expect(at(n), `${n} after ${n - 1}`).toBeGreaterThan(at(n - 1))
        }
    })

    // The reason the number is handed in rather than counted inside heading().
    // A counter kept in the module is right on the first mail and wrong on the
    // fortieth the same isolate renders, which is the shape of bug that only
    // ever shows up where nobody is looking.
    it('starts again at one on the next mail', () => {
        const second = reportEmail(base)
        expect(second.html).toContain(chip(1))
        expect(second.html).not.toContain(chip(8))
    })

    // The number is threaded from reportEmail through the section function to
    // heading(), which is three places it could be dropped, and dropping it
    // draws a box with the word undefined in it rather than failing.
    it('never draws the box with nothing in it', () => {
        const one = reportEmail({
            ...base,
            sections: [{ key: 'marketing', title: 'Marketing', sort_order: 0, items: [] }],
        })
        expect(one.html).toContain('>Marketing<')
        expect(one.html).toContain(chip(1))
        expect(one.html).not.toContain('padding:4px 0;">undefined</td>')
    })
})

describe('senderFor', () => {
    const FROM = 'Papi Chulo Point Campus <point@papichulo.ie>'

    it('puts the restaurant name in front of the one address', () => {
        // One Workspace account sends for both restaurants. Google rewrites the
        // ADDRESS on a mail whose sender is not the account that
        // authenticated, but it leaves the display name alone, so the name is
        // how one mailbox says which restaurant a mail is about.
        expect(senderFor(FROM, 'Dun Laoghaire'))
            .toBe('Papi Chulo Dun Laoghaire <point@papichulo.ie>')
    })

    it('does not care how MAIL_FROM was written', () => {
        expect(senderFor('point@papichulo.ie', 'Dun Laoghaire'))
            .toBe('Papi Chulo Dun Laoghaire <point@papichulo.ie>')
        expect(senderFor('Anything At All <point@papichulo.ie>', 'Point Campus'))
            .toBe('Papi Chulo Point Campus <point@papichulo.ie>')
    })

    it('does not say the brand twice', () => {
        expect(senderFor(FROM, 'Papi Chulo Point Campus'))
            .toBe('Papi Chulo Point Campus <point@papichulo.ie>')
    })

    it('keeps MAIL_FROM as it is when there is no restaurant in hand', () => {
        expect(senderFor(FROM, '')).toBe(FROM)
        expect(senderFor(FROM, null)).toBe(FROM)
    })

    it('keeps an accent in the name, because the send encodes it properly now', () => {
        // It used to fall back to MAIL_FROM, because denomailer's own encoding
        // of a name like this was broken. headersFor in mime.js does it right.
        expect(senderFor(FROM, 'D\u00fan Laoghaire'))
            .toBe('Papi Chulo D\u00fan Laoghaire <point@papichulo.ie>')
    })

    it('turns a line break in the name into a space', () => {
        // A line break in a header starts a header of its own.
        expect(senderFor(FROM, 'Dun\r\nBcc: x@y.com'))
            .toBe('"Papi Chulo Dun Bcc: x@y.com" <point@papichulo.ie>')
        expect(senderFor(FROM, '\r\n')).toBe(FROM)
    })

    it('quotes a name a header parser would read as punctuation', () => {
        expect(senderFor(FROM, 'Smith, Jones and Co'))
            .toBe('"Papi Chulo Smith, Jones and Co" <point@papichulo.ie>')
    })

    it('gives nothing back for nothing, rather than a broken header', () => {
        expect(senderFor('', 'Point Campus')).toBe('')
    })
})

describe('senderFor, with a restaurant that has an address of its own', () => {
    const FROM = 'Papi Chulo Point Campus <point@papichulo.ie>'

    it('sends from the restaurant own address', () => {
        expect(senderFor(FROM, 'Dun Laoghaire', 'dunlaoghaire@papichulo.ie'))
            .toBe('Papi Chulo Dun Laoghaire <dunlaoghaire@papichulo.ie>')
    })

    it('falls back to MAIL_FROM when the restaurant has none', () => {
        // A restaurant whose address was never set up still sends. It arrives
        // from the other one, which is the same thing Google would do to it
        // anyway if the address were not a verified sender.
        expect(senderFor(FROM, 'Dun Laoghaire', null))
            .toBe('Papi Chulo Dun Laoghaire <point@papichulo.ie>')
        expect(senderFor(FROM, 'Dun Laoghaire', '   '))
            .toBe('Papi Chulo Dun Laoghaire <point@papichulo.ie>')
    })

    it('ignores something in the column that is not an address', () => {
        // Better the wrong restaurant name on a working address than a header
        // no mail server will accept.
        expect(senderFor(FROM, 'Dun Laoghaire', 'not-an-address')).toBe(FROM)
    })

    it('still uses the address when there is no restaurant name', () => {
        expect(senderFor(FROM, '', 'dunlaoghaire@papichulo.ie'))
            .toBe('dunlaoghaire@papichulo.ie')
    })
})

describe('heldNotice', () => {
    const mail = {
        subject: 'Weekly Summary Report Week 34',
        html: '<!doctype html><html><body style="x"><p>Hi</p></body></html>',
        text: 'Hi',
    }

    it('marks the subject so it cannot be mistaken for the real one', () => {
        expect(heldNotice(mail, ['ana@p.ie']).subject).toBe('[Held] Weekly Summary Report Week 34')
    })

    it('names who it was for, so nobody has to guess', () => {
        const held = heldNotice(mail, ['ana@p.ie', 'accounts@x.ie'])
        expect(held.html).toContain('ana@p.ie, accounts@x.ie')
        expect(held.text).toContain('It was for ana@p.ie, accounts@x.ie.')
    })

    it('puts the band at the very top of the body', () => {
        // A held mail that looks like a real one is how a held mail gets
        // forwarded to the person it names.
        const held = heldNotice(mail, ['ana@p.ie'])
        expect(held.html).toContain('<body style="x"><table')
        expect(held.html).toContain('did not go to anyone else')
        expect(held.text.startsWith('HELD.')).toBe(true)
    })

    it('says nobody rather than nothing when there was no list', () => {
        expect(heldNotice(mail, []).html).toContain('It was for nobody')
        expect(heldNotice(mail).html).toContain('It was for nobody')
    })

    it('keeps the mail otherwise as it was', () => {
        expect(heldNotice(mail, ['a@b.ie']).html).toContain('<p>Hi</p>')
    })
})

describe('the figure column is only as wide as the money', () => {
    const mail = reportEmail(base)

    it('never puts a share on the same line as its figure', () => {
        // This is what stops "Net sales" and "Cost of sales" breaking in two.
        expect(mail.html).not.toMatch(/€[\d,.]+&nbsp;\(/)
    })

    it('keeps the target colour on the share where there is one', () => {
        expect(mail.html).toContain(`<span style="color:${costTone(32, 30)};">32.00%</span>`)
    })
})

// Switching somebody off only sets users.is_active. Their password still signs
// them in, and this function reads users with the service key, which row level
// security does not stop, so it has to ask for itself.
describe('a login that is switched off', () => {
    it('is refused, whatever its role', () => {
        expect(switchedOff({ role: 'store_manager', is_active: false })).toBe(true)
        expect(switchedOff({ role: 'super_admin', is_active: false })).toBe(true)
    })

    it('lets an active one through', () => {
        expect(switchedOff({ role: 'store_manager', is_active: true })).toBe(false)
    })

    it('refuses when it cannot tell, rather than letting it through', () => {
        expect(switchedOff({ role: 'store_manager' })).toBe(true)
        expect(switchedOff(null)).toBe(true)
    })

    it('is asked off a row that carries is_active, before either mail is built', () => {
        const source = readFileSync('supabase/functions/weekly-report-email/index.ts', 'utf8')
        expect(source).toMatch(/\.from\('users'\)\.select\('[^']*\bis_active\b[^']*'\)\s*\.eq\('id', caller\.id\)/)
        const asked = source.indexOf('switchedOff(account)')
        expect(asked).toBeGreaterThan(-1)
        expect(asked).toBeLessThan(source.indexOf("if (kind === 'timesheet')"))
    })
})

// The browser's figures are for a test and only for a test. A real send of a
// draft would have mailed the owners figures that were frozen nowhere, so
// nobody could ever look up what they were sent.
describe('what a send is built from', () => {
    const posted = { figures: { net: 1 }, charts: { sales: 'https://x/s.png' } }
    const frozen = { status: 'published', figures: { net: 14750 }, charts: { sales: 'https://x/frozen.png' } }
    const draft = { status: 'draft', figures: null, charts: null }

    it('reads a published report off what was frozen, whatever the browser sent', () => {
        expect(whatToSend(frozen, { ...posted })).toEqual({ figures: frozen.figures, charts: frozen.charts })
        expect(whatToSend(frozen, { ...posted, test: true })).toEqual({ figures: frozen.figures, charts: frozen.charts })
    })

    it('takes the browser\'s figures for a test of a draft', () => {
        expect(whatToSend(draft, { ...posted, test: true })).toEqual({ figures: posted.figures, charts: posted.charts })
    })

    it('refuses a real send of a report that has not been published', () => {
        expect(whatToSend(draft, { ...posted })).toEqual({ refused: expect.stringMatching(/not been published/) })
        expect(whatToSend(draft, {})).toHaveProperty('refused')
    })

    it('is asked before anything is worked out for the mail', () => {
        const source = readFileSync('supabase/functions/weekly-report-email/index.ts', 'utf8')
        const asked = source.indexOf('whatToSend(report')
        expect(asked).toBeGreaterThan(-1)
        expect(asked).toBeLessThan(source.indexOf('changesSince('))
        expect(source).not.toMatch(/\(posted \|\| \{\}\)/)
    })
})

describe('deliverable', () => {
    // The one that started it: a real store manager on the live database whose
    // address can never receive, so every request to that restaurant tried it.
    it('refuses a reserved TLD', () => {
        expect(deliverable('test.manager@papichulo.test')).toBe(false)
        expect(deliverable('someone@thing.example')).toBe(false)
        expect(deliverable('someone@thing.invalid')).toBe(false)
        expect(deliverable('root@localhost')).toBe(false)
    })

    it('refuses the example.com family, which is reserved the same way', () => {
        expect(deliverable('a@example.com')).toBe(false)
        expect(deliverable('a@example.net')).toBe(false)
        expect(deliverable('a@example.org')).toBe(false)
    })

    // It is not address validation. Anything that is not provably undeliverable
    // gets tried, because guessing at mailboxes is how real people stop getting
    // their mail.
    it('lets everything else through, including the odd looking', () => {
        expect(deliverable('point+maria@papichulo.ie')).toBe(true)
        expect(deliverable('leandroclpresti+dltest1@gmail.com')).toBe(true)
        expect(deliverable('a@sub.domain.co.uk')).toBe(true)
        expect(deliverable('  spaced@papichulo.ie  ')).toBe(true)
    })

    it('refuses anything that is not an address at all', () => {
        expect(deliverable('')).toBe(false)
        expect(deliverable(null)).toBe(false)
        expect(deliverable(undefined)).toBe(false)
        expect(deliverable('no-at-sign')).toBe(false)
        expect(deliverable('@nothing.ie')).toBe(false)
        expect(deliverable('nothing@')).toBe(false)
    })

    // example.com is reserved; examples.com is somebody's domain.
    it('does not catch a domain that merely looks like one', () => {
        expect(deliverable('a@examples.com')).toBe(true)
        expect(deliverable('a@testing.ie')).toBe(true)
        expect(deliverable('a@mytest.com')).toBe(true)
    })
})

describe('isJustTheGoodbye', () => {
    // It says the connection ended untidily. It does NOT say whether the
    // message was taken: on 13 September that was assumed and the assumption
    // lost a real mail while telling somebody it had sent. So this is used to
    // word a failure clearly, never to call a failure a success.
    it('knows the one Gmail actually produces', () => {
        expect(isJustTheGoodbye(new Error(
            'peer closed connection without sending TLS close_notify: '
            + 'https://docs.rs/rustls/latest/rustls/manual/_03_howto/index.html'
            + '#unexpected-eof'))).toBe(true)
    })

    it('knows it however it is spelt', () => {
        expect(isJustTheGoodbye(new Error('UnexpectedEof'))).toBe(true)
        expect(isJustTheGoodbye(new Error('unexpected eof while reading'))).toBe(true)
        expect(isJustTheGoodbye('close_notify missing')).toBe(true)
    })

    it('refuses anything that is a different failure', () => {
        expect(isJustTheGoodbye(new Error('535 Username and Password not accepted'))).toBe(false)
        expect(isJustTheGoodbye(new Error('550 mailbox unavailable'))).toBe(false)
        expect(isJustTheGoodbye(new Error('connection refused'))).toBe(false)
        expect(isJustTheGoodbye(new Error('timed out'))).toBe(false)
    })

    it('refuses nothing at all', () => {
        expect(isJustTheGoodbye(null)).toBe(false)
        expect(isJustTheGoodbye(undefined)).toBe(false)
        expect(isJustTheGoodbye(new Error(''))).toBe(false)
    })
})

describe('replyToFor, on a report', () => {
    // The normal case, and the one that must not change: every recipient is in
    // To and Reply-To is the manager who wrote the week up, so reply to all
    // puts the author in To and copies everybody who read it.
    it('lets the author through untouched', () => {
        expect(replyToFor('leandro@papichulo.ie')).toBe('leandro@papichulo.ie')
    })

    // test.manager@papichulo.test is a real store manager at Point Campus and
    // can publish. Without this an owner presses reply and it bounces, and
    // nobody hears about it.
    it('drops an author whose address can never receive', () => {
        expect(replyToFor('test.manager@papichulo.test')).toBeUndefined()
    })

    // No Reply-To is not a failure: the reply goes to the From address, which
    // is a mailbox somebody reads.
    it('gives nothing rather than something broken', () => {
        expect(replyToFor(null)).toBeUndefined()
        expect(replyToFor('')).toBeUndefined()
        expect(replyToFor('not an address')).toBeUndefined()
    })

    it('falls back to the secret when there is no author address', () => {
        expect(replyToFor(null, 'hub@papichulo.ie')).toBe('hub@papichulo.ie')
    })

    it('prefers the author over the secret', () => {
        expect(replyToFor('leandro@papichulo.ie', 'hub@papichulo.ie')).toBe('leandro@papichulo.ie')
    })

    it('falls through a bad author address to the secret', () => {
        expect(replyToFor('someone@papichulo.test', 'hub@papichulo.ie')).toBe('hub@papichulo.ie')
    })
})

// A chart is the shape of a thing and the figures under it are that shape
// written out. Reading the numbers first and being shown the picture afterwards
// is the wrong way round: by then you have done the work it was going to save.
describe('where the charts sit', () => {
    const mail = reportEmail(base)
    const at = t => {
        const i = mail.html.indexOf(t)
        expect(i, `not found: ${t}`).toBeGreaterThan(-1)
        return i
    }

    it('opens sales and costs with its picture', () => {
        expect(at('x.test/sales.png')).toBeLessThan(at('>Net sales<'))
    })

    // Net earnings is what is left after the platforms, so the picture of what
    // they cost belongs on the near side of that box.
    it('puts what the platforms cost before what is left after them', () => {
        expect(at('x.test/delivery.png')).toBeLessThan(at('>Net earnings<'))
    })

    it('and the earnings picture after it', () => {
        expect(at('x.test/earnings.png')).toBeGreaterThan(at('>Net earnings<'))
    })

    it('opens online sales with its picture', () => {
        expect(at('x.test/online.png')).toBeLessThan(at('Overall rating'))
    })

    it('opens corporate sales with its picture', () => {
        expect(at('x.test/corporate.png')).toBeLessThan(at('>Corporate Ltd<'))
    })
})

// The difference between the two things a date in the past can mean: somebody
// waiting on the post, and somebody who cannot legally be on next week's
// roster. An owner reading four names has no way to tell them apart.
describe('whether a renewal was applied for', () => {
    it('says so, with the date', () => {
        expect(renewalWords({ name: 'Majo', on: '2026-09-13', applied: '2026-08-12' }))
            .toContain('Applied to renew on 12 Aug 2026')
    })

    it('says plainly when nobody has', () => {
        expect(renewalWords({ name: 'Majo', on: '2026-09-13', applied: null }))
            .toContain('No renewal applied for')
    })

    // The one that earns nothing and the one somebody has to act on today.
    // Left as two dates in a list it is a subtraction nobody does at speed.
    it('says when it was applied for too late', () => {
        expect(renewalWords({ name: 'Majo', on: '2026-09-13', applied: '2026-09-20' }))
            .toContain('after it expired')
    })

    it('does not say it was late when it was not', () => {
        expect(renewalWords({ name: 'Majo', on: '2026-09-13', applied: '2026-09-13' }))
            .not.toContain('after it expired')
    })

    // A food safety certificate is not renewed, it is sat again. undefined is
    // "this kind has no renewals" and null is "it does and nobody applied", and
    // the two must not read the same.
    it('says nothing at all for paperwork that has no renewal', () => {
        expect(renewalWords({ name: 'Majo', on: '2026-09-13' })).toBe('')
        expect(renewalWords(null)).toBe('')
    })
})

describe('the people section, with renewals', () => {
    const mail = reportEmail({
        ...base,
        figures: {
            ...figures,
            paperwork: {
                ...figures.paperwork,
                permits: {
                    total: 4, fine: 1, ok: false, missing: [],
                    expired: [
                        { name: 'Iliana', on: '2026-08-23', applied: '2026-08-01' },
                        { name: 'Majo', on: '2026-09-13', applied: null },
                    ],
                    expiring: [{ name: 'Camila', on: '2026-10-18', applied: '2026-09-30' }],
                },
            },
        },
    })

    it('puts the answer under each name that needs one', () => {
        expect(mail.html).toContain('Applied to renew on 1 Aug 2026')
        expect(mail.html).toContain('No renewal applied for')
        expect(mail.html).toContain('Applied to renew on 30 Sept 2026')
    })

    // The food safety card sits in the same section and must stay quiet about
    // something it does not have.
    it('leaves the certificates alone', () => {
        const people = mail.html.slice(
            mail.html.indexOf('Food safety certificates'),
            mail.html.indexOf('Right to work'))
        expect(people).not.toContain('Renewal')
    })
})

// His ask of 29 September: a line in the paperwork while a new allergen sheet
// is due, frozen with the report in the words the Allergens page uses.
describe('the allergen sheet', () => {
    const words = 'Last printed 12 June. The allergen information has changed since then. Print a new sheet.'
    const due = reportEmail({
        ...base,
        figures: { ...figures, paperwork: { ...figures.paperwork, allergenSheet: { reason: 'changed', words } } },
    })

    it('says a new one is due, under People and operations', () => {
        expect(due.html).toContain('Allergen sheet')
        expect(due.html).toContain(words)
        expect(due.html.indexOf(words)).toBeGreaterThan(due.html.indexOf('People and operations'))
        expect(due.html.indexOf(words)).toBeLessThan(due.html.indexOf('Marketing and sales development'))
    })

    it('says it in the plain copy too', () => {
        expect(due.text).toContain('  Allergen sheet')
        expect(due.text).toContain(`  ${words}`)
    })

    // Not due, or a report frozen before this existed.
    it('says nothing while it is not due', () => {
        const mail = reportEmail(base)
        expect(mail.html).not.toContain('Allergen sheet')
        expect(mail.text).not.toContain('Allergen sheet')
    })

    it('keeps everything that cannot wrap narrow enough for a phone', () => {
        const lines = [...due.html.matchAll(/<td[^>]*white-space:nowrap[^>]*>([\s\S]*?)<\/td>/g)]
            .flatMap(m => m[1].split(/<br\s*\/?>/))
            .map(l => l.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z0-9#]+;/gi, 'x').trim())
        expect(lines).toContain('Print a new one')
        expect(lines.filter(l => l.length > 16)).toEqual([])
    })
})

// The price section is worked out in the app and frozen onto the report, and
// the mail only lays it out. So the test freezes a real one the way publishing
// does and hands it over, which is what holds the two halves to one shape.
describe('prices and suppliers', () => {
    const line = (code, name, date, perCase, over = {}) => ({
        id: `${code}-${date}`, invoice_id: `i-${date}`, supplier_code: code, product_id: name,
        products: { id: name, name, unit: 'KG' }, price_id: null, raw_description: name.toUpperCase(),
        pack_size: '1X6 KG', units_per_case: 6, price_per_case: perCase, cases: 1, units: 0, line_no: 1,
        line_total: perCase, decision: 'matched',
        invoices: { id: `i-${date}`, invoice_number: `N${date}`, invoice_date: date, supplier_id: 's1', document_type: 'invoice', total_amount: perCase },
        ...over,
    })
    const prices = priceWeek({
        weekStart: '2026-09-13',
        weekEnd: '2026-09-19',
        lines: [line('T', 'Tomatoes', '2026-09-10', 11.75), line('T', 'Tomatoes', '2026-09-17', 8.6)],
        credits: [{
            id: 'c1', invoice_number: 'C45627172', invoice_date: '2026-09-15', total_amount: -9.27,
            credit_of_invoice_id: null, credit_reason: 'quality', invoice_lines: [{ raw_description: 'RED ONIONS' }],
        }],
        claims: [{ id: 'k1', what: 'Bowls charged 49.73', kind: 'price', amount: 24.75, credited_amount: 0, status: 'open', raised_on: '2026-09-24' }],
        documents: [
            { document_type: 'invoice', total_amount: 8.6, suppliers: { name: 'Sysco Ireland' }, invoice_lines: [{ count: 1 }] },
            { document_type: 'invoice', total_amount: 98.5, suppliers: { name: 'BWG Foodservice' }, invoice_lines: [{ count: 0 }] },
        ],
        threshold: 5,
        today: '2026-09-25',
    })
    const withPrices = [
        sections[0], sections[1],
        { key: 'prices_suppliers', title: 'Prices and suppliers', sort_order: 2, items: [] },
        ...sections.slice(2).map(s => ({ ...s, sort_order: s.sort_order + 1 })),
    ]
    const mail = reportEmail({ ...base, sections: withPrices, figures: { ...figures, prices } })

    it('comes third, after the profit and loss', () => {
        expect(mail.html.indexOf('Prices and suppliers')).toBeGreaterThan(mail.html.indexOf('Weekly profit and loss'))
        expect(mail.html.indexOf('Prices and suppliers')).toBeLessThan(mail.html.indexOf('Online sales'))
    })

    // His of 4 October: the cards and nothing above them. The four figures
    // and the sentences said again what the cards say.
    it('goes straight to the cards', () => {
        expect(mail.html).toContain('Same product, new price')
        expect(mail.html).toContain('-€3.15')
        expect(mail.html).not.toContain('Recipes out of line')
        expect(mail.html).not.toContain('>Cheaper on the same code:</strong>')
    })

    it('lists each price that moved with what it was worth', () => {
        expect(mail.html).toContain('€11.75 &rarr; <strong style="color:#1F7A4C;">€8.60</strong> a case')
        expect(mail.html).toContain('-26.8%')
    })

    // His design of 4 October: what was not checked, supplier by supplier.
    it('lists what was not checked, with why', () => {
        expect(mail.html).toContain('Not checked')
        expect(mail.html).toContain('BWG Foodservice')
        expect(mail.html).toContain('not read line by line yet')
        expect(mail.text).toContain('  Not checked: €98.50')
        expect(mail.text).toContain('    BWG Foodservice: €98.50, not read line by line yet')
    })

    // Layout D, his pick of 4 October: two boxes a product.
    it('sets what was bought beside what the brand recommends, and what waits on a review', () => {
        const brand = reportEmail({
            ...base, sections: withPrices, figures: {
                ...figures,
                prices: {
                    ...prices,
                    notRecommended: [{
                        name: 'Flour Tortilla (Burritos)', unit: 'each', cases: 3, money: 99.09, others: 0,
                        bought: { name: 'Plain wraps 12"', per: 0.3303 },
                        recommended: { name: 'Santa Maria wrap 12"', per: 0.303 },
                    }],
                    waiting: [{ name: 'Corn Tortilla 6 inch', cases: 1, loose: 0, money: 41.8, sent: '2026-09-18' }],
                    totals: { ...prices.totals, notRecommended: 1, waiting: 41.8 },
                },
            },
        })
        expect(brand.html).toContain('Not as the brand recommends')
        expect(brand.html).toContain('BOUGHT')
        expect(brand.html).toContain('Plain wraps 12&quot;')
        expect(brand.html).toContain('RECOMMENDED')
        expect(brand.html).toContain('€0.30 each')
        expect(brand.html.indexOf('Not as the brand recommends')).toBeLessThan(brand.html.indexOf('Same product, new price'))
        expect(brand.text).toContain('      Bought: Plain wraps 12", €0.33 each')
        expect(brand.text).toContain('      Recommended: Santa Maria wrap 12", €0.30 each')
        expect(brand.text).toContain('    Corn Tortilla 6 inch: 1 case, €41.80, sent 18 Sept')
    })

    it('leaves the card out when everything bought was what the brand recommends, and on a report frozen before', () => {
        expect(mail.html).not.toContain('Not as the brand recommends')
        const old = reportEmail({ ...base, sections: withPrices, figures: { ...figures, prices: { ...prices, notRecommended: undefined, notChecked: undefined } } })
        expect(old.html).not.toContain('Not as the brand recommends')
        expect(old.html).not.toContain('Not checked')
    })

    it('leaves which suppliers it was read from to the report in the Hub', () => {
        expect(mail.html).not.toContain('Read from:')
        expect(mail.text).not.toContain('Read from:')
    })

    it('leaves the line out of a report frozen before it existed', () => {
        const old = reportEmail({ ...base, sections: withPrices, figures: { ...figures, prices: { ...prices, readFrom: undefined } } })
        expect(old.html).not.toContain('Read from:')
    })

    // So the total beside it can be checked by multiplying, the same line
    // the page shows.
    it('says how many came at the new price and what each one came to', () => {
        expect(prices.moves[0].split).toBe('1 case, €3.15 less each')
        expect(mail.html).toContain('1 case, €3.15 less each')
        expect(mail.text).toContain('-€3.15 (1 case, €3.15 less each)')
    })

    it('says why things came back and what is still owed', () => {
        expect(mail.html).toContain('Bad quality')
        expect(mail.html).toContain('Still waiting for a credit')
        expect(mail.html).toContain('Bowls charged 49.73')
    })

    it('carries it in the plain copy too', () => {
        expect(mail.text).toContain('PRICES AND SUPPLIERS')
        expect(mail.text).toContain('Tomatoes: €11.75 to €8.60 a case, -26.8%, -€3.15')
        expect(mail.text.split('\n').every(l => l === l.replace(/\s+$/, ''))).toBe(true)
    })

    // His decision of 1 October: a claim on a delivery whose report had gone
    // out comes off the first week still open, and says which delivery it is
    // from. Absent on anything frozen before it existed.
    it('says when a claim taken off this week is from an earlier delivery', () => {
        const later = priceWeek({
            weekStart: '2026-09-13', weekEnd: '2026-09-19',
            claims: [{
                id: 'k2', what: 'COKE ZERO 24X330ML', kind: 'short', amount: 22.34, credited_amount: 0,
                status: 'open', raised_on: '2026-09-11', counted_week: '2026-09-13', invoice_id: 'i0',
            }],
            invoices: [{ id: 'i0', invoice_date: '2026-09-11' }],
        })
        const moved = reportEmail({ ...base, sections: withPrices, figures: { ...figures, prices: later } })
        expect(moved.html).toContain('From an earlier week')
        expect(moved.html).toContain('from the delivery in the week of 6 Sept')
        expect(moved.text).toContain('  From an earlier week')
        expect(moved.text).toContain('    COKE ZERO 24X330ML: €22.34, Short, from the delivery in the week of 6 Sept')

        const old = reportEmail({ ...base, sections: withPrices, figures: { ...figures, prices: { ...prices, earlier: undefined } } })
        expect(old.html).not.toContain('From an earlier week')
    })

    it('says so when a report went out without the prices read', () => {
        const none = reportEmail({ ...base, sections: withPrices, figures: { ...figures, prices: null } })
        expect(none.html).toContain('Prices were not read for this week.')
        expect(none.text).toContain('Prices were not read for this week.')
    })

    it('numbers the sections on in order', () => {
        expect(mail.html).toMatch(/>3<\/td><td style="padding-left:12px;[^"]*">Prices and suppliers</)
    })
})

// A cell that cannot wrap is as wide as its longest line whatever the screen.
// "4.2 out of 5 (no change)" on one line held the whole mail wider than a
// phone, and the Gmail app answers a mail wider than the screen by shrinking
// every box in it to its own words: on 27 September titles ran into their
// money and minus signs came off their figures, all down the mail. Money, a
// share, a rating, a count and a move all fit in sixteen characters.
describe('nothing in the mail is too wide for a phone', () => {
    const cannotWrap = html => [...html.matchAll(/<td[^>]*white-space:nowrap[^>]*>([\s\S]*?)<\/td>/g)]
        .flatMap(m => m[1].split(/<br\s*\/?>/))
        .map(l => l.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z0-9#]+;/gi, 'x').trim())

    it('puts a rating that moved over two lines', () => {
        const mail = reportEmail(base)
        expect(mail.html).toMatch(/4\.6&nbsp;out&nbsp;of&nbsp;5<br \/><span[^>]*>\(up from 4\.4\)/)
        expect(mail.html).toMatch(/4\.8&nbsp;out&nbsp;of&nbsp;5<br \/><span[^>]*>\(no change\)/)
    })

    it('has no line that cannot wrap longer than sixteen characters', () => {
        const lines = cannotWrap(reportEmail(base).html)
        // Found something before saying anything about what was found.
        expect(lines.length).toBeGreaterThan(10)
        expect(lines).toContain('4.6 out of 5')
        expect(lines.filter(l => l.length > 16)).toEqual([])
    })
})

// Since 27 September the figure typed is the platform's Monday to Sunday
// statement, and the week is charged the share it kept applied to what it
// took in our week. The mail has to print that cost, not the statement.
describe('delivery costed from the Monday to Sunday statement', () => {
    const costed = {
        ...figures,
        version: 2,
        deliveryTotal: 1111.11,
        statement: { from: '2026-08-31', to: '2026-09-06', words: 'Monday 31 August to Sunday 6 September' },
        platforms: [
            { ...figures.platforms[0], statement: 800, statementTaken: 3300, weekTaken: 3200, rate: 24.2424, cost: 775.76 },
            { ...figures.platforms[1], statement: 380, statementTaken: 2200, weekTaken: 2100, rate: 17.2727, cost: 362.73 },
            figures.platforms[2],
        ],
    }
    const mail = reportEmail({ ...base, figures: costed })

    // The total is what each platform cost this week, added up: 1,111.11 of
    // the 5,300 the online platforms took is 20.96%.
    it('prints the total for the week, not the statements', () => {
        expect(mail.html).toContain('€1,111.11')
        expect(mail.html).toContain('20.96%')
        expect(mail.html).not.toContain('€775.76')
    })

    // His of 4 October, in place of the sentence on why the weeks differ, and
    // of 7 October: inside the delivery box, so it is not read as covering
    // the overheads too.
    it('says which days it was calculated over, inside the delivery line', () => {
        const days = 'Statements Mon 31 Aug to Sun 6 Sept'
        expect(mail.html).toContain(days)
        expect(mail.html.indexOf(days)).toBeGreaterThan(mail.html.indexOf('Third party delivery costs'))
        expect(mail.html.indexOf(days)).toBeLessThan(mail.html.indexOf('Net earnings is net sales minus'))
        expect(mail.html).not.toContain('Calculated ')
        expect(mail.text).toContain(days)
    })

    it('puts the same figure in the plain text', () => {
        expect(mail.text).toContain('Third party delivery costs: 20.96% (€1,111.11) of €5,300.00 online sales')
    })

    it('says nothing about a statement on a report frozen before them', () => {
        const old = reportEmail(base)
        expect(old.html).toContain('€1,180.00')
        expect(old.html).not.toContain('Statements ')
    })
})

// The checklists section, built from what the app freezes with the report:
// weekCleaning's output, words and all, since the mail cannot work any of it
// out. Invented lists.
describe('the cleaning section', () => {
    const at = (day, time = '10:00') => new Date(`${day}T${time}:00`).toISOString()
    const week = '2026-09-20'
    const lists = [
        { id: 'L1', name: 'Weekly Deep Clean', repeats: 'weeks', every_weeks: 1, starts_on: '2026-08-01', is_active: true, sort_order: 1 },
        { id: 'L2', name: 'Toilet Checklist', repeats: 'weeks', every_weeks: 1, starts_on: '2026-08-01', is_active: true, sort_order: 2 },
    ]
    const categories = [
        { id: 'c1', checklist_id: 'L1', name: 'Kitchen', sort_order: 1, is_active: true },
        { id: 'c2', checklist_id: 'L2', name: 'Toilets', sort_order: 1, is_active: true },
    ]
    const tasks = [
        { id: 't1', checklist_id: 'L1', category_id: 'c1', parent_id: null, name: 'Small toaster area', sort_order: 1, is_active: true },
        { id: 't2', checklist_id: 'L1', category_id: 'c1', parent_id: 't1', name: 'Clean under the toaster', sort_order: 1, is_active: true },
        { id: 't3', checklist_id: 'L1', category_id: 'c1', parent_id: 't1', name: 'Clean toaster sides', sort_order: 2, is_active: true },
        { id: 't4', checklist_id: 'L2', category_id: 'c2', parent_id: null, name: 'Mop the floor', sort_order: 1, is_active: true, needs_photo: true },
    ]
    const rounds = [
        { id: 'r1', checklist_id: 'L1', started_at: at('2026-09-21'), ended_at: null },
        { id: 'r2', checklist_id: 'L2', started_at: at('2026-09-22'), ended_at: at('2026-09-22', '11:00'), ended_by: null },
    ]
    const ticks = [
        { round_id: 'r1', task_id: 't2', done_at: at('2026-09-21'), done_by_name: 'Aoife', photos: [] },
        { round_id: 'r2', task_id: 't4', done_at: at('2026-09-22', '11:00'), done_by_name: 'Aoife', photos: ['rest/rounds/r2/a.jpg', 'rest/rounds/r2/b.jpg'] },
    ]
    const cleaning = weekCleaning({ lists, categories, tasks, rounds, ticks, weekStart: week })
    const withCleaning = {
        ...base,
        sections: [...sections, { key: 'cleaning', title: 'Cleaning', sort_order: 7, items: [] }],
        figures: { ...figures, cleaning },
    }

    it('says what each list came to, and what was left with when it was last done', () => {
        const { html } = reportEmail(withCleaning)
        expect(html).toContain('Weekly Deep Clean')
        expect(html).toContain('Not finished: 1 of 2 done, 1 left.')
        expect(html).toContain('Small toaster area: Clean toaster sides')
        expect(html).toContain('never done')
        expect(html).toContain('Toilet Checklist')
        expect(html).toMatch(/Done on Tuesday/)
    })

    it('says how many photos there were and where they are, and shows none of them', () => {
        const { html } = reportEmail(withCleaning)
        expect(html).toContain('2 photos taken this week, on the Hub.')
        expect(html).not.toContain('rest/rounds/r2/a.jpg')
    })

    it('says which day most was done', () => {
        const { html } = reportEmail(withCleaning)
        expect(html).toContain('2 things ticked this week.')
        expect(html).toContain('the least on')
    })

    it('says the same in the plain part', () => {
        const { text } = reportEmail(withCleaning)
        expect(text).toContain('CLEANING')
        expect(text).toContain('  Weekly Deep Clean (Every week)')
        expect(text).toContain('    Not finished: 1 of 2 done, 1 left.')
        expect(text).toContain('      - Small toaster area: Clean toaster sides, never done')
        expect(text).toContain('    2 photos taken this week, on the Hub.')
    })

    it('says so when there was nothing to report', () => {
        const none = { ...withCleaning, figures: { ...figures, cleaning: { lists: [], byDay: [0, 0, 0, 0, 0, 0, 0], busiest: '' } } }
        expect(reportEmail(none).html).toContain('No checklists were due this week.')
    })

    // A thing left two rounds running says so, in red.
    it('says what was missed twice running', () => {
        const ended = weekCleaning({
            lists: [lists[0]], categories, tasks, weekStart: week,
            rounds: [
                { id: 'e0', checklist_id: 'L1', started_at: at('2026-09-13'), ended_at: at('2026-09-14'), ended_by: 'u9', ended_by_name: 'Ciara' },
                { id: 'e1', checklist_id: 'L1', started_at: at('2026-09-21'), ended_at: at('2026-09-24'), ended_by: 'u9', ended_by_name: 'Ciara' },
            ],
            ticks: [
                { round_id: 'e0', task_id: 't2', done_at: at('2026-09-13'), done_by_name: 'Aoife', photos: [] },
                { round_id: 'e1', task_id: 't2', done_at: at('2026-09-21'), done_by_name: 'Aoife', photos: [] },
            ],
        })
        const mail = reportEmail({ ...withCleaning, figures: { ...figures, cleaning: ended } })
        expect(mail.html).toContain('by Ciara with 1 not done.')
        expect(mail.html).not.toContain('Why:')
        expect(mail.html).toContain('not done the time before either')
        expect(mail.text).toContain('      - Small toaster area: Clean toaster sides, never done, not done the time before either')
    })

    it('is the last section, numbered after the rest', () => {
        const { html } = reportEmail(withCleaning)
        expect(html.lastIndexOf('>8</td>')).toBeGreaterThan(html.indexOf('Support / actions needed'))
        expect(html.indexOf('Cleaning')).toBeGreaterThan(html.indexOf('Support / actions needed'))
    })
})

describe('money, at nothing at all', () => {
    // A balanced figure can come out of the sums at minus a fraction of a cent.
    // The same rule as fmtMoney in the app.
    it('prints no minus sign on something that rounds to nought', () => {
        expect(money(-0.0001)).toBe('€0.00')
        expect(money(-0.004)).toBe('€0.00')
        expect(money(-0.01)).toBe('-€0.01')
    })
})

describe('escapeLines', () => {
    it('keeps a typed line break, trimmed at the end', () => {
        expect(escapeLines('a \nb')).toBe('a<br />b')
        expect(escapeLines('a\r\nb')).toBe('a<br />b')
    })

    it('still escapes what is typed', () => {
        expect(escapeLines('<b>\n&')).toBe('&lt;b&gt;<br />&amp;')
        expect(escapeLines(null)).toBe('')
    })

    it('carries a comment over its lines in the mail', () => {
        const typed = reportEmail({
            ...base,
            sections: sections.map(s => (s.key === 'marketing'
                ? { ...s, items: [{ kind: 'comment', note: 'First line \nSecond line', sort_order: 0 }] }
                : s)),
        })
        expect(typed.html).toContain('First line<br />Second line')
        expect(typed.text).toContain('  First line\n  Second line')
    })

    // The plain copy printed these line by line and the HTML ran them into one.
    it('carries a platform remark and a review over their lines', () => {
        const typed = reportEmail({
            ...base,
            sections: sections.map(s => (s.key === 'online_sales'
                ? {
                    ...s,
                    items: [
                        ...s.items.filter(i => i.kind !== 'review'),
                        { kind: 'review', key: 'p1', label: 'Deliveroo', meta: { stars: 2, count: 1 }, note: 'Cold chips\nLate too' },
                        { kind: 'comment', key: 'p2', note: 'Tablet was offline\nBack on Monday' },
                    ],
                }
                : s)),
        })
        expect(typed.html).toContain('Cold chips<br />Late too')
        expect(typed.html).toContain('Tablet was offline<br />Back on Monday')
    })
})

// Classic Outlook drops an eight digit colour and rgba(), and the header text,
// the section numbers and the band edges went with it.
describe('every colour is solid', () => {
    const styles = html => [...html.matchAll(/style="([^"]*)"/g)].map(m => m[1])

    it('has no see through colour anywhere in the mail', () => {
        const sent = { ...base.report, send_count: 2, sent_to: ['owner@papichulo.ie'] }
        for (const mail of [
            reportEmail(base),
            reportEmail({ ...base, isTest: true }),
            reportEmail({ ...base, report: sent }),
        ]) {
            const found = styles(mail.html)
            expect(found.length).toBeGreaterThan(50)
            expect(found.filter(s => /#[0-9a-f]{8}\b|rgba?\(|hsla?\(/i.test(s))).toEqual([])
        }
    })

    it('gives the band a border of its own colour', () => {
        expect(reportEmail({ ...base, isTest: true }).html).toContain('border:1px solid #F3D9A6;')
    })
})

describe('the page the mail sits in', () => {
    const mail = reportEmail(base)

    it('says what it is to a phone', () => {
        expect(mail.html).toContain('<html lang="en">')
        expect(mail.html).toContain('<meta charset="utf-8" />')
        expect(mail.html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1" />')
        expect(mail.html).toContain('<meta name="x-apple-disable-message-reformatting" />')
        expect(mail.html).toContain('<meta name="format-detection" content="telephone=no,date=no,address=no,email=no" />')
        expect(mail.html).toContain('<meta name="color-scheme" content="light dark" />')
        expect(mail.html).toContain(`<title>${mail.subject}</title>`)
    })

    // The line an inbox shows under the subject. Without it the inbox shows
    // the first words of the mail, which repeat the subject.
    it('opens with the week in one line, hidden from the mail itself', () => {
        expect(mail.html).toMatch(/<body[^>]*><div style="display:none;[^"]*">Net sales €14,750\.00, net earnings €1,840\.00 \(12\.47%\)(&#847;&zwnj;&nbsp;)+<\/div>/)
    })

    // An inbox fills the rest of the line with the text that comes next, which
    // was the mail's own heading. The filler takes that room instead.
    it('fills the rest of the preview line with nothing to read', () => {
        const hidden = mail.html.match(/<div style="display:none;[^"]*">(.*?)<\/div>/)[1]
        expect(hidden.startsWith('Net sales')).toBe(true)
        expect(hidden.endsWith('&#847;&zwnj;&nbsp;'.repeat(80))).toBe(true)
    })

    it('says a correction is one before the figures', () => {
        expect(headline(figures, true)).toBe('Corrected. Net sales €14,750.00, net earnings €1,840.00 (12.47%)')
        expect(headline({ net: 100, earnings: -5 })).toBe('Net sales €100.00, net earnings -€5.00')
        const sent = { ...base.report, send_count: 2, sent_to: ['owner@papichulo.ie'] }
        expect(reportEmail({ ...base, report: sent }).html).toContain('>Corrected. Net sales €14,750.00')
    })

    it('leaves the preheader out when there is none', () => {
        expect(page('<p>x</p>', { subject: 'S' })).not.toContain('display:none')
        expect(page('<p>x</p>', { subject: 'S' })).toContain('<p>x</p></body></html>')
    })

    it('still lets a held mail put its band first in the body', () => {
        const held = heldNotice(mail, ['ana@p.ie'])
        expect(held.html).toMatch(/<body style="margin:0;padding:0;background:#F7F5F0;"><table[^>]*background:#7C2D12;/)
    })
})

describe('the link to the Hub', () => {
    it('opens this report rather than the list', () => {
        const mail = reportEmail({ ...base, report: { ...base.report, id: 'r-42' } })
        expect(mail.html).toContain('href="https://hub.test/reports/r-42"')
        expect(mail.text).toContain('Open it in the Hub: https://hub.test/reports/r-42')
    })

    it('falls back to the list when the report has no id', () => {
        const mail = reportEmail(base)
        expect(mail.html).toContain('href="https://hub.test/reports"')
        expect(mail.text).toContain('Open it in the Hub: https://hub.test/reports\n')
    })

    // Classic Outlook reads neither the auto margin nor the background.
    it('is centred and coloured by attribute as well as by style', () => {
        const { html } = reportEmail(base)
        expect(html).toMatch(/<table role="presentation" align="center"[^>]*><tr><td align="center" bgcolor="#2C6FCF"/)
    })
})

// A pasted link is one word that cannot break, and it held the mail wider than
// a phone the same way a nowrap figure does.
describe('long typed text', () => {
    const url = 'https://example.test/' + 'a'.repeat(99)

    it('sits in a cell that may break it', () => {
        expect(url.length).toBe(120)
        const mail = reportEmail({
            ...base,
            sections: sections.map(s => (s.key === 'marketing'
                ? { ...s, items: [{ kind: 'comment', note: url, sort_order: 0 }] }
                : s)),
        })
        const cell = mail.html.match(new RegExp(`<td style="([^"]*)">${url}</td>`))
        expect(cell).not.toBeNull()
        expect(cell[1]).toContain('word-break:break-word;')
        expect(cell[1]).toContain('overflow-wrap:anywhere;')
    })

    it('never lets a figure break', () => {
        const { html } = reportEmail(base)
        const cells = [...html.matchAll(/<td[^>]*style="([^"]*white-space:nowrap[^"]*)"/g)].map(m => m[1])
        expect(cells.length).toBeGreaterThan(10)
        expect(cells.filter(c => c.includes('word-break'))).toEqual([])
    })
})

describe('the plain copy says what the HTML says', () => {
    const mail = reportEmail({
        ...base,
        figures: {
            ...figures,
            paperwork: {
                ...figures.paperwork,
                permits: {
                    ...figures.paperwork.permits,
                    expiring: [{ name: 'Ana Rocha', on: '2026-10-14', applied: null }],
                },
            },
        },
        sections: sections.map(s => {
            if (s.key === 'support_actions') {
                return { ...s, items: [...s.items, { kind: 'action', label: 'Hood filters', opened_on: '2026-08-23', sort_order: 2 }] }
            }
            if (s.key === 'marketing') {
                return { ...s, items: [{ kind: 'comment', label: 'Flyers', note: 'Out on Friday', sort_order: 0 }] }
            }
            if (s.key === 'online_sales') {
                return { ...s, items: [...s.items, { kind: 'comment', key: 'p2', note: 'Tablet was offline Sunday' }] }
            }
            return s
        }),
    })

    it('gives every rated platform its rating, moved or not', () => {
        expect(mail.text).toContain('    Overall rating: 4.6 out of 5 (up from 4.4)')
        expect(mail.text).toContain('    Overall rating: 4.8 out of 5 (no change)')
        // A corporate account has none, the same as in the HTML.
        expect(mail.text).toContain('  Corporate Ltd: €900.00\n')
        expect(mail.text).not.toMatch(/Corporate Ltd: €900\.00\n {4}Overall rating/)
    })

    it('counts each review', () => {
        expect(mail.text).toContain('      2 star x 1: Cold chips')
    })

    it('carries the date and the renewal under a name', () => {
        expect(mail.text).toContain('    - Ana Rocha (14 Oct 2026)\n      No renewal applied for')
        expect(mail.text).toContain('    - Joao Silva\n')
    })

    it('says one week, not one weeks', () => {
        expect(mail.text).toContain('  Hood filters (open 1 week)')
        expect(mail.text).toContain('  Fryer thermostat (open 3 weeks)')
    })

    it('keeps a comment label and a platform remark', () => {
        expect(mail.text).toContain('  Flyers. Out on Friday')
        expect(mail.text).toContain('    Tablet was offline Sunday')
    })
})

// Gmail cuts a mail off past 102KB and hides the rest behind a link. The mail
// goes as base64, a third bigger on the wire, so 75,000 characters of HTML is
// where it starts to get close. This week came to about 72,000 on 3 October,
// so there is not much room: a mail with nothing in its lists is already
// 34,000, and each checklist with a warning adds about 2,000.
// Each list is in the order the Hub hands it over: moves and switches biggest
// effect first, recipes furthest out first.
describe('a heavy week', () => {
    const many = (n, make) => Array.from({ length: n }, (_, i) => make(i))
    const prices = {
        moves: many(40, i => ({
            name: `Product number ${i}`, was: 10 + i, now: 11 + i, per: 'a case', on: '2026-09-02',
            invoice: `INV${1000 + i}`, change: 5.5, effect: 40 - i, up: true, split: `${40 - i} cases, €1.00 more each`,
        })),
        doubtful: [],
        switches: many(15, i => ({
            name: `Switched thing ${i}`, bought: `Other brand ${i}`, on: '2026-09-03',
            per: 2.5, unit: 'a kg', usualPer: 2.2, change: 13.6, effect: (15 - i) * 3,
        })),
        recipes: many(25, i => ({
            name: `Recipe product ${i}`, state: 'behind', unit: 'a kg', recipe: 3, paid: 3.4,
            // The furthest out was not bought this week, so it moved nothing.
            paidOn: '2026-09-04', gap: 40 - i, effect: i === 0 ? 0 : 30 - i,
        })),
        back: [], owed: [], reasons: [], words: ['Dearer on the same code: a long headline about the week.'],
        totals: { moves: 820, switches: 315, recipes: 25, back: 0 },
        threshold: 5, checkedOn: '2026-09-05',
    }
    const longNote = 'A long comment about the week, the kind somebody writes on a Sunday night. '.repeat(6)
    const cleaning = {
        lists: many(8, i => ({
            name: `Checklist ${i}`, repeats: 'Every week',
            lines: [{
                words: 'Ended with 4 not done.', warn: true,
                left: many(4, j => ({ label: `Area ${j}: a task with a name`, lastDoneWords: 'last done 12 Sept', again: j % 2 === 0 })),
            }],
            photos: ['a', 'b'],
        })),
        byDay: [1, 2, 3, 4, 5, 6, 7], busiest: 'Most were done on Saturday.',
    }
    // A long comment in four of the sections, the ones people write most in.
    const written = ['sales_costs', 'profit_loss', 'marketing']
    const heavySections = [
        ...sections.map(s => (written.includes(s.key)
            ? { ...s, items: [...s.items, { kind: 'comment', note: longNote, sort_order: 9 }] }
            : s)),
        { key: 'prices_suppliers', title: 'Prices and suppliers', sort_order: 2, items: [{ kind: 'comment', note: longNote }] },
        { key: 'cleaning', title: 'Cleaning', sort_order: 8, items: [] },
    ]
    const mail = reportEmail({ ...base, sections: heavySections, figures: { ...figures, prices, cleaning } })
    const more = text => [...text.matchAll(/and (\d+) more, on the Hub/g)].map(m => Number(m[1]))

    it('stays well under the size Gmail cuts off at', () => {
        // Found the heavy parts before saying anything about the size.
        expect(mail.html).toContain('Checklist 7')
        expect(mail.html).toContain('Product number 0<')
        expect(mail.html).toContain(longNote.trim())
        expect(mail.html.length).toBeGreaterThan(30000)
        expect(mail.html.length).toBeLessThan(75000)
    })

    it('shows the top of each list and says how many more', () => {
        // The first of each list, in its own order, and none past the cap.
        expect(mail.html).toContain('Product number 7<')
        expect(mail.html).not.toContain('Product number 8<')
        expect(mail.html).toContain('Switched thing 3<')
        expect(mail.html).not.toContain('Switched thing 4<')
        expect(mail.html).toContain('Recipe product 3<')
        expect(mail.html).not.toContain('Recipe product 4<')
        // 32 moves, 11 switches and 21 recipes left for the Hub.
        expect(more(mail.html)).toEqual([32, 11, 21])
        expect(more(mail.text)).toEqual([32, 11, 21])
        expect(mail.text).toContain('Product number 7:')
        expect(mail.text).not.toContain('Product number 8:')
    })

    it('keeps a recipe that moved nothing this week', () => {
        // Furthest out of all, but not bought this week, so its effect is 0.
        expect(mail.html).toContain('Recipe product 0<')
        expect(mail.text).toContain('Recipe product 0:')
    })

    it('says nothing about more when everything fits', () => {
        const light = reportEmail({
            ...base, sections: heavySections,
            figures: { ...figures, prices: { ...prices, moves: prices.moves.slice(0, 5), switches: [], recipes: prices.recipes.slice(0, 3) } },
        })
        expect(light.html).toContain('Product number 0<')
        expect(more(light.html)).toEqual([])
        expect(more(light.text)).toEqual([])
    })

    it('keeps the recipes in the order the Hub gives them', () => {
        const recipe = (name, state, gap, effect) => ({
            name, state, gap, effect, unit: 'a kg', recipe: 3, paid: 3.4, paidOn: '2026-09-04', why: 'units',
        })
        const light = reportEmail({
            ...base, sections: heavySections,
            figures: {
                ...figures,
                prices: {
                    ...prices, moves: [], switches: [],
                    recipes: [recipe('Wide gap', 'behind', 40, 0), recipe('Narrow gap', 'behind', 20, 12), recipe('No compare', 'cannot', null, 0)],
                },
            },
        })
        const at = name => light.html.indexOf(`${name}<`)
        expect(at('Wide gap')).toBeGreaterThan(-1)
        expect(at('Wide gap')).toBeLessThan(at('Narrow gap'))
        expect(at('Narrow gap')).toBeLessThan(at('No compare'))
        expect(light.text.indexOf('Wide gap:')).toBeGreaterThan(-1)
        expect(light.text.indexOf('Wide gap:')).toBeLessThan(light.text.indexOf('Narrow gap:'))
        expect(light.text.indexOf('Narrow gap:')).toBeLessThan(light.text.indexOf('No compare:'))
        expect(more(light.html)).toEqual([])
    })
})

// His of 4 October: every overhead the first time a report goes out, then only
// what changed and what it was. The total always.
describe('the fixed overheads in the mail', () => {
    const rent = { kind: 'overhead', key: 'rent', label: 'Rent', amount: 1500, sort_order: 0 }
    const insurance = { kind: 'overhead', key: 'insurance', label: 'Insurance', amount: 400, sort_order: 1 }
    const withOverheads = items => sections.map(s => (s.key === 'profit_loss'
        ? { ...s, items: [...items, ...s.items.filter(i => i.kind !== 'overhead')] }
        : s))

    it('shows every line the first time, when nothing was carried', () => {
        expect(overheadsToShow([rent, insurance])).toEqual({ first: true, lines: [rent, insurance] })
    })

    it('shows only the line that moved, or one new this week, after that', () => {
        const moved = { ...rent, amount: 1600, carried_from: 1500 }
        const same = { ...insurance, carried_from: 400 }
        const added = { kind: 'overhead', key: 'bins', label: 'Bins', amount: 60, sort_order: 2 }
        expect(overheadsToShow([moved, same, added]).lines).toEqual([moved, added])
    })

    it('says what a changed line was, and keeps the total', () => {
        const mail = reportEmail({
            ...base,
            sections: withOverheads([{ ...rent, amount: 1600, carried_from: 1500 }, { ...insurance, carried_from: 400 }]),
        })
        expect(mail.html).toContain('was €1,500.00')
        expect(mail.html).not.toContain('Insurance')
        expect(mail.html).toContain('Fixed overheads')
        expect(mail.text).toContain('Rent: €1,600.00, was €1,500.00')
    })

    it('says there was no change rather than showing nothing', () => {
        const mail = reportEmail({
            ...base,
            sections: withOverheads([{ ...rent, carried_from: 1500 }, { ...insurance, carried_from: 400 }]),
        })
        expect(mail.html).toContain('No change from last week')
        expect(mail.html).not.toContain('Rent')
    })
})

// His of 4 October: each reason with its total on top, and the lines under it
// without the reason said again.
describe('what came back, by reason', () => {
    const prices = {
        moves: [], doubtful: [], switches: [], recipes: [], owed: [], earlier: [], newCodes: [],
        totals: { back: 118.41 }, threshold: 5, checkedOn: '2026-09-06',
        reasons: [
            { kind: 'mistake', label: 'Ordered by mistake', colour: '#B45309', money: 97.42 },
            { kind: 'short', label: 'Short', colour: '#1D4ED8', money: 20.99 },
        ],
        back: [
            { what: 'Burrito Bowl (750ml)', number: 'C101', date: '2026-09-02', money: 60, parts: [{ kind: 'mistake', label: 'Ordered by mistake', money: 60 }] },
            { what: 'Limes, Coriander', number: 'C102', date: '2026-09-03', money: 58.41, parts: [
                { kind: 'mistake', label: 'Ordered by mistake', money: 37.42 },
                { kind: 'short', label: 'Short', money: 20.99 },
            ] },
        ],
    }

    it('puts each credit note under each reason it covers, with that part of it', () => {
        const groups = backByReason(prices)
        expect(groups.map(g => [g.reason.label, g.rows.map(r => [r.what, r.money])])).toEqual([
            ['Ordered by mistake', [['Burrito Bowl (750ml)', 60], ['Limes, Coriander', 37.42]]],
            ['Short', [['Limes, Coriander', 20.99]]],
        ])
    })

    // The page has its own copy, since the mail cannot import the app's.
    it('groups exactly as the report in the Hub does', () => {
        const shape = groups => groups.map(g => [g.reason.kind, g.rows.map(r => [r.what, r.money])])
        expect(shape(backByReason(prices))).toEqual(shape(webBackByReason(prices.reasons, prices.back)))
    })

    it('says each reason once, with its total', () => {
        const withPrices = [...sections, { key: 'prices_suppliers', title: 'Prices and suppliers', sort_order: 9, items: [] }]
        const mail = reportEmail({ ...base, sections: withPrices, figures: { ...figures, prices } })
        expect(mail.html.match(/Ordered by mistake/g)).toHaveLength(1)
        expect(mail.html).toContain('<strong>€97.42</strong>')
        expect(mail.text).toContain('    Ordered by mistake: €97.42')
        expect(mail.text).toContain('      Limes, Coriander: €37.42')
    })
})

// What the comparison of the page against the mail found, 7 October.
describe('the mail says what the page says', () => {
    it('gives an averaged price as an average, not as paid on the last day', () => {
        expect(paidWords({ paid: 2.524, paidOn: '2026-09-30', averaged: { deliveries: 3, since: '2026-09-15' } }))
            .toBe('paid €2.52 on average over the last 3 deliveries')
        expect(paidWords({ paid: 3.008, paidOn: '2026-09-30' })).toBe('paid €3.01 on 30 Sept')
    })

    it('says a version bought instead is set against recipes when it is', () => {
        expect(againstWords({ usualFrom: 'recipes' })).toBe('in recipes')
        expect(againstWords({ usualFrom: 'delivery' })).toBe('usually')
    })
})

// Kept equal: the mail cannot import the app.
describe('figures that are not finished', () => {
    it('are said in the mail in the same words as on the page', () => {
        for (const f of [
            { tradingDays: 7, labourDays: 0, foodEntries: 0, packagingEntries: 0 },
            { tradingDays: 7, labourDays: 4, foodEntries: 3, packagingEntries: 1 },
            { tradingDays: 7, labourDays: 7, foodEntries: 3, packagingEntries: 1 },
        ]) expect(mailGaps(f)).toEqual(figureGaps(f))
    })
})

describe('the actions in the mail', () => {
    it('are longest open first, like the page, and leave out what was ticked', () => {
        const section = { items: [
            { kind: 'action', label: 'New', opened_on: '2026-09-27', sort_order: 1 },
            { kind: 'action', label: 'Old', opened_on: '2026-08-09', sort_order: 2 },
            { kind: 'action', label: 'Done', opened_on: '2026-08-02', done_on: '2026-09-29', sort_order: 3 },
        ] }
        expect(openActions(section, '2026-09-27').map(a => a.label)).toEqual(['Old', 'New'])
    })
})

describe('corporate accounts in the mail', () => {
    it('are biggest first, like the page; online platforms keep their order', () => {
        const f = { platforms: [
            { name: 'Lunch Team', bucket: 'catering', taken: 300 },
            { name: 'Feedr', bucket: 'catering', taken: 900 },
            { name: 'Deliveroo', bucket: 'online_platform', taken: 100 },
            { name: 'Just Eat', bucket: 'online_platform', taken: 500 },
        ] }
        expect(platformsIn(f, 'catering').map(p => p.name)).toEqual(['Feedr', 'Lunch Team'])
        expect(platformsIn(f, 'online_platform').map(p => p.name)).toEqual(['Deliveroo', 'Just Eat'])
    })
})

// Kept equal: the mail reads the marks with its own copy of the reader.
describe('formatted comments in the mail', () => {
    const samples = [
        'Fan <b>still noisy</b>, <span data-c="red">engineer Thursday</span><br>2 &lt; 3',
        '<span data-s="big"><b>Big</b></span> and <span data-c="green">green</span>',
        '<a href="x">link</a> <script>no</script> <span data-c="purple">x</span>',
        '',
    ]

    it('says the same words as the app', () => {
        for (const s of samples) expect(richWords(s)).toBe(richPlain(s))
    })

    it('draws the marks with the look they stand for and nothing else as HTML', () => {
        expect(richHtml(samples[0])).toBe('Fan <strong>still noisy</strong>, <span style="color:#B91C1C;">engineer Thursday</span><br />2 &lt; 3')
        expect(richHtml(samples[2])).not.toMatch(/<a |<script/)
    })
})

describe('no refunds in the mail', () => {
    // Before version 4 the week could go out without anybody looking.
    it('is said only on a report that had to say it', () => {
        expect(saidRefunds({ version: 4 })).toBe(true)
        expect(saidRefunds({ version: 3 })).toBe(false)
    })
})
