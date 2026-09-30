import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as reportMime from '../../supabase/functions/weekly-report-email/mime'
import * as rosterMime from '../../supabase/functions/roster-email/mime'
import { reportEmail } from '../../supabase/functions/weekly-report-email/email'
import { requestEmail } from '../../supabase/functions/roster-email/email'
import { priceWeek } from '@/lib/invoiceReport'

// What both mail functions hand denomailer, finished. It lives in each
// function's own folder because only that folder is deployed with it, so there
// are two copies, and the first thing checked is that they are the same.

const FOLDERS = ['weekly-report-email', 'roster-email']

const decoded = part => new TextDecoder().decode(
    Uint8Array.from(atob(part.content.replace(/\r\n/g, '')), c => c.charCodeAt(0)))

// Full stops everywhere a report has them: money, shares, line heights, the
// chart pictures and the link back to the Hub.
const report = reportEmail({
    report: { week_start: '2026-08-30', send_count: 1 },
    restaurant: { name: 'Point Campus' },
    sections: [
        { key: 'sales_costs', title: 'Sales and costs', sort_order: 0, items: [] },
        {
            key: 'profit_loss', title: 'Weekly profit and loss', sort_order: 1,
            items: [{ kind: 'overhead', key: 'rent', label: 'Rent', amount: 1500.45, sort_order: 0 }],
        },
    ],
    figures: {
        net: 14750.67, gross: 16450.12, food: 4720.5, foodPct: 32.04,
        labour: 4500.25, labourPct: 30.51, costOfSales: 9830.75, costOfSalesPct: 66.64,
        targets: { food: 30, labour: 30, packaging: 4 }, earnings: 1840.33, earningsPct: 12.47,
        platforms: [],
    },
    charts: { sales: 'https://x.test/sales.png', delivery: 'https://x.test/delivery.png' },
    publisher: 'Leandro',
    appUrl: 'https://papichulo-hub.vercel.app',
})

const ask = requestEmail({
    absence: {
        id: 'a1', kind: 'holiday', starts_on: '2026-10-12', ends_on: '2026-10-19',
        status: 'requested', created_at: '2026-09-30T10:00:00Z',
    },
    employeeName: 'María',
    restaurantName: 'Point Campus',
    clashes: [],
    appUrl: 'https://papichulo-hub.vercel.app',
    askerIsManager: false,
    now: '2026-09-30T10:00:00Z',
})

describe('the two copies', () => {
    it('are the same file', () => {
        const [a, b] = FOLDERS.map(f => readFileSync(`supabase/functions/${f}/mime.js`, 'utf8'))
        expect(b).toBe(a)
    })
})

describe.each([
    ['weekly-report-email', reportMime],
    ['roster-email', rosterMime],
])('the parts %s sends', (_, { mimeParts }) => {
    it('decode back to exactly what was built, euro signs and accents included', () => {
        const [text, html] = mimeParts(report)
        expect(report.html).toContain('€')
        expect(decoded(text)).toBe(report.text)
        expect(decoded(html)).toBe(report.html)
        expect(decoded(mimeParts(ask)[0])).toContain('María')
    })

    it('are base64, plain text first and the HTML last', () => {
        const parts = mimeParts(ask)
        expect(parts.map(p => p.mimeType)).toEqual([
            'text/plain; charset="utf-8"',
            'text/html; charset="utf-8"',
        ])
        expect(parts.map(p => p.transferEncoding)).toEqual(['base64', 'base64'])
    })

    it('leave the plain text out when there is none', () => {
        const parts = mimeParts({ text: '', html: '<p>Hi</p>' })
        expect(parts).toHaveLength(1)
        expect(parts[0].mimeType).toBe('text/html; charset="utf-8"')
    })

    it('come in lines of 76 at most, joined the way a mail joins them', () => {
        const lines = mimeParts(report)[1].content.split('\r\n')
        expect(lines.length).toBeGreaterThan(10)
        expect(lines.every(l => l.length <= 76 && !l.includes('\n'))).toBe(true)
    })

    // The whole reason for this file. A mail server takes the first full stop
    // off a line that starts with one, so no line may. Tried with the report
    // shifted by every amount, so it does not depend on where the cuts happen
    // to fall this week.
    it('never start a line with a full stop, wherever the cuts fall', () => {
        const dots = (report.html.match(/\./g) || []).length
        expect(dots).toBeGreaterThan(50)

        for (let shift = 0; shift < 76; shift++) {
            const html = 'x'.repeat(shift) + report.html
            for (const part of mimeParts({ text: '.'.repeat(shift + 1), html })) {
                const starting = part.content.split('\r\n').filter(l => l.startsWith('.'))
                expect(starting).toEqual([])
            }
        }
    })
})

// Base64 is a third bigger than what it carries, and Gmail cuts a mail off at
// about 102KB with "[Message clipped]", which hides the bottom of the report.
// The heaviest real report so far, 13 September, was about 64,000 characters of
// HTML and 87,500 in base64. This week is built to weigh about the same, so a
// change that makes every row heavier shows up here before it does on a phone.
// If it ever fails, the fallback is quoted printable again with a full stop at
// the start of a line written as =2E.
describe('a heavy week', () => {
    const line = (code, name, date, perCase) => ({
        id: `${code}-${date}`, invoice_id: `i-${date}`, supplier_code: code, product_id: name,
        products: { id: name, name, unit: 'KG' }, price_id: null, raw_description: name.toUpperCase(),
        pack_size: '1X6 KG', units_per_case: 6, price_per_case: perCase, cases: 1, units: 0, line_no: 1,
        line_total: perCase, decision: 'matched',
        invoices: {
            id: `i-${date}`, invoice_number: `N${date}`, invoice_date: date,
            supplier_id: 's1', document_type: 'invoice', total_amount: perCase,
        },
    })
    const ten = Array.from({ length: 10 }, (_, i) => i)
    const lines = [
        ...ten.flatMap(i => [
            line(`M${i}`, `Moved product ${i}`, '2026-09-10', 11.75 + i),
            line(`M${i}`, `Moved product ${i}`, '2026-09-17', 8.6 + i),
        ]),
        ...Array.from({ length: 58 }, (_, i) => line(`N${i}`, `New product number ${i}`, '2026-09-16', 20 + i)),
    ]
    const prices = priceWeek({
        weekStart: '2026-09-13', weekEnd: '2026-09-19', lines, threshold: 5, today: '2026-09-25',
    })
    const rows = (kind, extra = () => ({})) => ten.map(i => ({
        kind, key: `${kind}${i}`, label: `${kind} line ${i}`, amount: 100 + i, sort_order: i, ...extra(i),
    }))
    const heavy = reportEmail({
        report: { week_start: '2026-09-13', send_count: 1 },
        restaurant: { name: 'Point Campus' },
        sections: [
            { key: 'sales_costs', title: 'Sales and costs', sort_order: 0, items: [] },
            { key: 'profit_loss', title: 'Weekly profit and loss', sort_order: 1, items: [...rows('overhead'), ...rows('delivery')] },
            { key: 'prices_suppliers', title: 'Prices and suppliers', sort_order: 2, items: [] },
            {
                key: 'online_sales', title: 'Online sales', sort_order: 3, items: [
                    ...rows('review', i => ({ key: 'p1', meta: { stars: 2, count: 1 }, note: `A review about the food, number ${i}` })),
                    ...rows('refund', i => ({ key: 'p1', note: `Missing item ${i}`, meta: { claimed: true } })),
                ],
            },
            { key: 'people_ops', title: 'People and operations', sort_order: 4, items: [] },
            { key: 'support_actions', title: 'Support / actions needed', sort_order: 5, items: rows('action', () => ({ opened_on: '2026-08-09' })) },
        ],
        figures: {
            net: 14750, gross: 16450, food: 4720, foodPct: 32, packaging: 610, packagingPct: 4.14,
            labour: 4500, labourPct: 30.5, costOfSales: 9830, costOfSalesPct: 66.64,
            targets: { food: 30, labour: 30, packaging: 4 }, deliveryTotal: 1180, standing: 1900,
            earnings: 1840, earningsPct: 12.47,
            platforms: [
                { id: 'p1', name: 'Deliveroo', bucket: 'online_platform', taken: 3200, colour: '#145C86', mark: '#1A6E9E' },
                { id: 'p2', name: 'Uber Eats', bucket: 'online_platform', taken: 2100, colour: '#1B6B43', mark: '#248C58' },
            ],
            prices,
        },
        charts: { sales: 'https://x.test/sales.png', delivery: 'https://x.test/delivery.png' },
        publisher: 'Leandro',
        appUrl: 'https://papichulo-hub.vercel.app',
    })

    // If this one fails the layout got lighter, which is good news: add rows
    // until the week weighs about 64,000 again, or the check below means less.
    it('is as heavy as the heaviest real report', () => {
        expect(heavy.html.length).toBeGreaterThan(60000)
    })

    it('stays under the size Gmail cuts off at, both parts together', () => {
        const [text, html] = reportMime.mimeParts(heavy)
        expect(text.content.length + html.content.length).toBeLessThan(100000)
    })
})

// The parts only help if the send uses them. denomailer quoted printables
// whatever arrives as content or html, so neither key may reach client.send.
describe.each(FOLDERS)('%s sends through Gmail', folder => {
    const source = readFileSync(`supabase/functions/${folder}/index.ts`, 'utf8')
    const sendCall = source.slice(source.indexOf('await client.send({'))
    const block = sendCall.slice(0, sendCall.indexOf('} finally {'))

    it('hands over the finished parts', () => {
        expect(block).toContain('mimeContent: mimeParts(mail)')
    })

    it('never hands over the text or the HTML to be encoded', () => {
        expect(block).not.toMatch(/content: mail\.text/)
        expect(block).not.toMatch(/html: mail\.html/)
    })
})

// ---------------------------------------------------------------- the header

// What a mail app shows for a header: folds undone, each encoded word read
// back, and the space between two encoded words dropped (RFC 2047, 6.2).
const shown = value => String(value)
    .replace(/\r\n /g, ' ')
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=/g, (_, b) => new TextDecoder().decode(
        Uint8Array.from(atob(b), c => c.charCodeAt(0))))

describe.each([
    ['weekly-report-email', reportMime],
    ['roster-email', rosterMime],
])('the header %s writes', (_, { oneLine, encodedWords, displayName, headersFor, base64Pdf }) => {
    const LONG = 'María Arredondo Escalante wants to swap a shift with you, Dún Laoghaire'

    it('leaves a plain subject exactly as it is', () => {
        expect(encodedWords('Majo asked for time off, Point Campus'))
            .toBe('Majo asked for time off, Point Campus')
    })

    // denomailer's own encoding left the spaces raw inside the encoded word,
    // which RFC 2047 does not allow, and cut a long one with no space at the
    // start of the next line, which ends the header early.
    it('encodes an accent so it reads back exactly, however long', () => {
        const subject = encodedWords(LONG)
        expect(subject).toMatch(/^=\?UTF-8\?B\?/)
        expect(shown(subject)).toBe(LONG)
    })

    it('keeps every line of an encoded subject inside 76, folded with a space', () => {
        const lines = `Subject:  ${encodedWords(LONG)}`.split('\r\n')
        expect(lines.length).toBeGreaterThan(1)
        expect(lines.every(l => l.length <= 76)).toBe(true)
        expect(lines.slice(1).every(l => l.startsWith(' '))).toBe(true)
    })

    // A header ends at a line break, so one inside a name would start a header
    // of its own: a Reply-To pointing anywhere, or worse.
    it('turns a line break in a name into a space', () => {
        expect(oneLine('Majo\r\nBcc: someone@else.com')).toBe('Majo Bcc: someone@else.com')
        expect(oneLine('Majo\n\n\tRuiz')).toBe('Majo Ruiz')
        expect(encodedWords('María\r\nReply-To: x@y.com')).not.toMatch(/\r\n(?! )/)
        expect(shown(encodedWords('María\r\nReply-To: x@y.com'))).toBe('María Reply-To: x@y.com')
    })

    it('encodes an accented sender name and folds before the address', () => {
        const name = displayName('Papi Chulo Dún Laoghaire <hub@papichulo.ie>')
        expect(shown(name).trim()).toBe('Papi Chulo Dún Laoghaire')
        expect(`From:  ${name} <hub@papichulo.ie>`.split('\r\n').every(l => l.length <= 76)).toBe(true)
    })

    it('keeps a plain sender name, quoted when it needs to be', () => {
        expect(displayName('Papi Chulo Point Campus <hub@papichulo.ie>')).toBe('Papi Chulo Point Campus')
        expect(displayName('"Papi Chulo Smith, Jones" <hub@papichulo.ie>')).toBe('"Papi Chulo Smith, Jones"')
        expect(displayName('hub@papichulo.ie')).toBe('')
        expect(displayName('Papi\r\nChulo <hub@papichulo.ie>')).toBe('Papi Chulo')
    })

    // What denomailer has already worked out, the way it hands it to a
    // preprocessor, with its own broken encoding in it.
    const resolved = () => ({
        to: [{ mail: 'ana@papichulo.ie', name: '' }, { mail: 'accounts@firm.ie', name: '' }],
        cc: [],
        bcc: [],
        from: { mail: 'hub@papichulo.ie', name: '=?utf-8?Q?Papi Chulo D=c3=ban?=' },
        subject: '=?utf-8?Q?Mar=c3=ada asked for time off?=',
        headers: {},
    })
    const mail = {
        subject: 'María asked for time off, Point Campus',
        from: 'Papi Chulo Dún Laoghaire <hub@papichulo.ie>',
    }

    it('puts its own subject and sender name over the library\'s', () => {
        const done = headersFor(mail)(resolved())
        expect(shown(done.subject)).toBe(mail.subject)
        expect(shown(done.from.name).trim()).toBe('Papi Chulo Dún Laoghaire')
        expect(done.from.mail).toBe('hub@papichulo.ie')
    })

    // denomailer joins To with a semicolon. Every recipient still gets it, as
    // the envelope's own list, and the To line people see is written with
    // commas, which is what Reply All reads.
    it('writes To with commas and still delivers to everybody', () => {
        const done = headersFor(mail)(resolved())
        expect(done.headers.To).toBe('ana@papichulo.ie, accounts@firm.ie')
        expect(done.to).toEqual([])
        expect(done.bcc.map(m => m.mail)).toEqual(['ana@papichulo.ie', 'accounts@firm.ie'])
    })

    it('drops an address the library would refuse, rather than half sending', () => {
        const odd = resolved()
        odd.to.push({ mail: 'not an address', name: '' })
        const done = headersFor(mail)(odd)
        expect(done.headers.To).toBe('ana@papichulo.ie, accounts@firm.ie')
        expect(done.bcc).toHaveLength(2)
    })

    // A PDF arrives from the browser as base64 and denomailer writes it into
    // the mail as it is, a line at a time. Anything else in there, a line
    // break and a full stop above all, would be written straight into the
    // conversation with the mail server.
    it('takes a PDF only as plain base64 of a PDF', () => {
        const pdf = btoa('%PDF-1.4 a record')
        expect(base64Pdf(pdf)).toBe(pdf)
        expect(base64Pdf(`${pdf}\r\n.\r\nMAIL FROM:<x@y.com>`)).toBeNull()
        expect(base64Pdf(btoa('<html>not a pdf</html>'))).toBeNull()
        expect(base64Pdf('')).toBeNull()
        expect(base64Pdf(null)).toBeNull()
    })
})

describe.each(FOLDERS)('%s hands its header to the library', folder => {
    const source = readFileSync(`supabase/functions/${folder}/index.ts`, 'utf8')

    it('puts the header right before anything is written', () => {
        expect(source).toContain('preprocessors: [headersFor(mail)]')
    })
})
