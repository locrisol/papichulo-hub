// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
    readWeeklySales, salesFileFits, matchTillLines, planSalesImport, lineByDay,
} from '@/lib/salesImport'
import {
    exportOf, WEEK, TENDERS, DATES, blankWeek, PLACES,
} from '@/test/weeklySalesExport'

describe('reading the file', () => {
    const read = readWeeklySales(exportOf(WEEK))

    it('knows the shop and the week', () => {
        expect(read.restaurant).toBe('Papi Chulo Testville')
        expect(read.from).toBe('2026-09-06')
        expect(read.to).toBe('2026-09-12')
        expect(read.isSales).toBe(true)
    })

    it('puts Day1 on the first date and runs to the last', () => {
        expect(read.days.map(d => d.date)).toEqual(DATES)
    })

    it('reads gross and net per day', () => {
        expect(read.days[1].gross).toBe(810)
        expect(read.days[2].net).toBe(488.4)
    })

    // The tender's name is after its figures in the section, not before, and
    // the discount lines use the same day names. Reading the name from the
    // wrong place would call Monday's cash "Student 20%".
    it('names every tender line from its own section', () => {
        expect(read.lines).toEqual(['CASH', 'Credit Card', 'Kiosk', 'Ordu App', 'Feedr'])
        expect(read.days[2].lines).toEqual({ CASH: 20, 'Credit Card': 100, Kiosk: 400, 'Ordu App': 12.5, Feedr: 0 })
    })

    it('reads nothing out of the discounts', () => {
        expect(read.lines).not.toContain('Student 20%')
    })

    it('says which days a line has money on', () => {
        expect(lineByDay(read, 'Ordu App')).toEqual([{ date: '2026-09-08', amount: 12.5 }])
    })

    it('comes back empty for something that is not XML at all', () => {
        const nothing = readWeeklySales('not a report')
        expect(nothing.from).toBeNull()
        expect(nothing.days).toEqual([])
    })

    it('knows a timesheet export is not a sales report', () => {
        const timesheet = exportOf(WEEK).replace(/Sales_GrossSales/g, 'Something_Else')
        expect(readWeeklySales(timesheet).isSales).toBe(false)
    })
})

describe('whether the file fits the week', () => {
    const fits = (xml, weekStart = '2026-09-06', restaurantName = 'Testville') =>
        salesFileFits({ read: readWeeklySales(xml), restaurantName, weekStart })

    it('takes the right shop and the right week', () => {
        expect(fits(exportOf(WEEK))).toEqual({ ok: true })
    })

    it('refuses another restaurant, before anything about the week', () => {
        const other = exportOf({ ...WEEK, store: 'Papi Chulo Elsewhere', from: '13 September 2026', to: '19 September 2026' })
        expect(fits(other)).toMatchObject({ ok: false, why: 'restaurant', found: 'Papi Chulo Elsewhere' })
    })

    it('says which week a whole week for another week is', () => {
        const later = exportOf({ ...WEEK, from: '13 September 2026', to: '19 September 2026' })
        expect(fits(later)).toMatchObject({ ok: false, why: 'week', from: '2026-09-13', to: '2026-09-19' })
    })

    // The columns are counted from the first date, so a range starting on a
    // Wednesday would put Wednesday under Sunday.
    it('refuses a range that is not Sunday to Saturday', () => {
        const mid = exportOf({ ...WEEK, from: '09 September 2026', to: '15 September 2026' })
        expect(fits(mid)).toMatchObject({ ok: false, why: 'range' })
        const long = exportOf({ ...WEEK, to: '13 September 2026' })
        expect(fits(long)).toMatchObject({ ok: false, why: 'range' })
    })

    it('refuses a file that is not the sales report', () => {
        const timesheet = exportOf(WEEK).replace(/Sales_GrossSales/g, 'Something_Else')
        expect(fits(timesheet)).toMatchObject({ ok: false, why: 'not-sales' })
        expect(fits('<nope/>')).toMatchObject({ ok: false, why: 'unreadable' })
    })
})

describe('which row each line goes under', () => {
    const lines = ['CASH', 'Credit Card', 'Kiosk', 'Online Platforms', 'Ordu App', 'Feedr', 'Clockmeal']

    it('matches a line named exactly like a row, whatever the capitals', () => {
        const m = matchTillLines({ lines: ['KIOSK', 'Feedr'], tenders: TENDERS })
        expect(m.map(x => [x.key, x.how])).toEqual([['kiosk', 'label'], ['feedr', 'label']])
    })

    it('matches a name somebody answered once', () => {
        const m = matchTillLines({
            lines: ['Credit Card'], tenders: TENDERS,
            remembered: [{ name: 'Credit Card', tender_key: 'card' }],
        })
        expect(m[0]).toMatchObject({ key: 'card', how: 'remembered' })
    })

    // His example: Ordu App rung up by mistake at a restaurant that stopped
    // using it. The retired row has the same name and must not take it.
    it('asks about a line that only matches a retired row', () => {
        const m = matchTillLines({ lines, tenders: TENDERS })
        const ordu = m.find(x => x.name === 'Ordu App')
        expect(ordu).toMatchObject({ key: null, retired: true, guess: null })
    })

    it('asks about a line the restaurant has no row for at all', () => {
        const m = matchTillLines({ lines, tenders: TENDERS })
        expect(m.find(x => x.name === 'Clockmeal')).toMatchObject({ key: null, retired: false, guess: null })
    })

    it('asks again when the remembered row has been retired since', () => {
        const m = matchTillLines({
            lines: ['Ordu'], tenders: TENDERS,
            remembered: [{ name: 'Ordu', tender_key: 'ordu_app' }],
        })
        expect(m[0].key).toBeNull()
    })

    it('guesses a row sharing a word, as a starting answer only', () => {
        const m = matchTillLines({ lines, tenders: TENDERS })
        expect(m.find(x => x.name === 'CASH')).toMatchObject({ key: null, guess: 'cash' })
        expect(m.find(x => x.name === 'Credit Card')).toMatchObject({ key: null, guess: 'card' })
    })

    it('does not guess from a word like "sales"', () => {
        const m = matchTillLines({ lines: ['Gift Sales'], tenders: TENDERS })
        expect(m[0].guess).toBeNull()
    })

    it('does not guess a row another line already has by name', () => {
        const m = matchTillLines({ lines: ['Kiosk', 'Kiosk Two'], tenders: TENDERS })
        expect(m[1].guess).toBeNull()
    })
})

describe('what reading it in does to the week', () => {
    const read = readWeeklySales(exportOf(WEEK))
    const plan = (over = {}) => planSalesImport({
        read, places: PLACES, days: blankWeek(), shownTenders: TENDERS, trackingPlatforms: [], ...over,
    })

    it('fills an empty week', () => {
        const p = plan()
        expect(p.filled).toEqual(DATES.slice(1))
        expect(p.days['2026-09-07']).toMatchObject({
            gross: '810', net: '740',
            tenderValues: { cash: '10', card: '100', kiosk: '500', online_sales: '0', feedr: '200' },
        })
    })

    it('adds a line put under another row to that row', () => {
        expect(plan().days['2026-09-08'].tenderValues.kiosk).toBe('412.5')
    })

    it('writes a zero for a row the file has no line for', () => {
        expect(plan().days['2026-09-09'].tenderValues.online_sales).toBe('0')
    })

    it('leaves a retired row alone', () => {
        expect(plan().days['2026-09-08'].tenderValues).not.toHaveProperty('ordu_app')
    })

    it('leaves a day with nothing on the till empty, not full of noughts', () => {
        const p = plan()
        expect(p.nothing).toEqual(['2026-09-06'])
        expect(p.days).not.toHaveProperty('2026-09-06')
    })

    it('says nothing about a closed day the till agrees was closed', () => {
        const week = blankWeek()
        week['2026-09-06'].isClosed = true
        const p = plan({ days: week })
        expect(p.nothing).toEqual([])
        expect(p.days).not.toHaveProperty('2026-09-06')
    })

    it('opens a day marked closed that the till took money on', () => {
        const week = blankWeek()
        week['2026-09-07'] = { ...week['2026-09-07'], isClosed: true, gross: '0', net: '0' }
        const p = plan({ days: week })
        expect(p.opened).toEqual([{ date: '2026-09-07', gross: 810 }])
        expect(p.days['2026-09-07'].isClosed).toBe(false)
    })

    it('keeps figures that are here when the till has nothing', () => {
        const week = blankWeek()
        week['2026-09-06'].gross = '99'
        const p = plan({ days: week })
        expect(p.kept).toEqual(['2026-09-06'])
        expect(p.days).not.toHaveProperty('2026-09-06')
    })

    it('lists every typed figure it would change, and nothing it would fill', () => {
        const week = blankWeek()
        week['2026-09-08'] = {
            ...week['2026-09-08'],
            gross: '532.5', net: '488.40',
            tenderValues: { cash: '20', card: '110', kiosk: '' },
        }
        const p = plan({ days: week })
        expect(p.changed).toEqual([{
            date: '2026-09-08',
            diffs: [{ label: 'Card', was: 110, now: 100 }],
            follows: [],
            handMade: false,
            keep: false,
        }])
    })

    // His answer of 30 September: reading a week in again must not quietly
    // undo a correction made by hand. The import is by hand and nothing
    // connects the Hub to the till, so a day can be put right here after the
    // till's report was read. A day that still comes to the till's gross and
    // net, and still adds up, with money moved between rows, is what that
    // looks like, so it is kept unless he says otherwise.
    describe('a day corrected by hand since', () => {
        // Tuesday as the till has it is Cash 20, Card 100 and Kiosk 412.5.
        // Here, 12.50 of the kiosk money was moved to cash.
        function corrected(over = {}) {
            const week = blankWeek()
            week['2026-09-08'] = {
                ...week['2026-09-08'],
                gross: '532.50', net: '488.40',
                tenderValues: { cash: '32.5', card: '100', kiosk: '400', online_sales: '0', feedr: '0' },
                ...over,
            }
            return week
        }

        it('is kept, with the tick box ticked, when it still comes to the till\'s gross and net', () => {
            const p = plan({ days: corrected() })
            expect(p.changed).toEqual([expect.objectContaining({ date: '2026-09-08', handMade: true, keep: true })])
            expect(p.days).not.toHaveProperty('2026-09-08')
        })

        it('is filled in once the tick is taken off', () => {
            const p = plan({ days: corrected(), keep: { '2026-09-08': false } })
            expect(p.changed[0].keep).toBe(false)
            expect(p.days['2026-09-08'].tenderValues).toMatchObject({ cash: '20', kiosk: '412.5' })
        })

        it('is not ticked when the gross is not the till\'s', () => {
            const p = plan({ days: corrected({ gross: '540' }) })
            expect(p.changed[0]).toMatchObject({ handMade: false, keep: false })
            expect(p.days).toHaveProperty('2026-09-08')
        })

        it('is not ticked when its rows do not add up to its gross', () => {
            const p = plan({
                days: corrected({ tenderValues: { cash: '30', card: '100', kiosk: '400', online_sales: '0', feedr: '0' } }),
            })
            expect(p.changed[0]).toMatchObject({ handMade: false, keep: false })
        })

        it('is kept when he ticks it, whatever it adds up to', () => {
            const p = plan({ days: corrected({ gross: '540' }), keep: { '2026-09-08': true } })
            expect(p.days).not.toHaveProperty('2026-09-08')
            expect(p.outBy).toEqual([])
        })
    })

    it('knows a day that already matches', () => {
        const week = blankWeek()
        week['2026-09-07'] = {
            ...week['2026-09-07'], gross: '810.00', net: '740',
            tenderValues: { cash: '10', card: '100', kiosk: '500', online_sales: '0', feedr: '200' },
        }
        const p = plan({ days: week })
        expect(p.same).toEqual(['2026-09-07'])
        expect(p.days).not.toHaveProperty('2026-09-07')
    })

    it('does not touch a day that has not finished', () => {
        const p = plan({ today: '2026-09-11' })
        expect(p.notOver).toEqual(['2026-09-11', '2026-09-12'])
        expect(p.days).not.toHaveProperty('2026-09-11')
        expect(p.days).toHaveProperty('2026-09-10')
    })

    it('keeps staff food and the online split as they were', () => {
        const week = blankWeek()
        week['2026-09-07'].staffFood = '12'
        week['2026-09-07'].platformValues = { Deliveroo: '40' }
        const p = plan({ days: week })
        expect(p.days['2026-09-07'].staffFood).toBe('12')
        expect(p.days['2026-09-07'].platformValues.Deliveroo).toBe('40')
    })

    describe('a line left out', () => {
        const out = plan({ places: { ...PLACES, 'Ordu App': 'out' } })

        it('is named with its money and its days', () => {
            expect(out.leftOut).toEqual([{ name: 'Ordu App', total: 12.5, dates: ['2026-09-08'] }])
        })

        it('leaves that day short by exactly that much', () => {
            expect(out.outBy).toEqual([{ date: '2026-09-08', amount: -12.5 }])
        })
    })

    it('has every day adding up when every line is placed', () => {
        expect(plan().outBy).toEqual([])
    })

    describe('the Corporate rows', () => {
        const feedr = [{ key: 'Feedr', name: 'Feedr', bucket: 'catering' }]

        it('follow their till row the way typing does', () => {
            const p = plan({ trackingPlatforms: feedr })
            expect(p.days['2026-09-07'].platformValues.Feedr).toBe('200')
        })

        it('stop following once somebody typed something different', () => {
            const week = blankWeek()
            week['2026-09-07'].tenderValues = { feedr: '200' }
            week['2026-09-07'].platformValues = { Feedr: '180' }
            const p = plan({ days: week, trackingPlatforms: feedr })
            expect(p.days['2026-09-07'].platformValues.Feedr).toBe('180')
        })

        // A Corporate row still following its till row goes back to the
        // till's figure with it, and the screen has to say so, because that
        // may be a figure somebody meant.
        it('say when one would go back to the till\'s figure', () => {
            const week = blankWeek()
            week['2026-09-07'] = {
                ...week['2026-09-07'],
                gross: '800', net: '740',
                tenderValues: { cash: '10', card: '100', kiosk: '500', online_sales: '0', feedr: '190' },
                platformValues: { Feedr: '190' },
            }
            const p = plan({ days: week, trackingPlatforms: feedr })
            expect(p.changed[0].follows).toEqual([{ label: 'Feedr', was: 190, now: 200 }])
            expect(p.days['2026-09-07'].platformValues.Feedr).toBe('200')
        })

        it('say nothing about one somebody gave its own figure', () => {
            const week = blankWeek()
            week['2026-09-07'] = {
                ...week['2026-09-07'],
                gross: '800', net: '740',
                tenderValues: { cash: '10', card: '100', kiosk: '500', online_sales: '0', feedr: '190' },
                platformValues: { Feedr: '180' },
            }
            const p = plan({ days: week, trackingPlatforms: feedr })
            expect(p.changed[0].follows).toEqual([])
        })

        // Matched to the till row by the name it goes by now, and written
        // under the key its figures have always been kept under.
        it('fill a renamed row under its key', () => {
            const renamed = [{ key: 'Feedr Lunches', name: 'Feedr', bucket: 'catering' }]
            const p = plan({ trackingPlatforms: renamed })
            expect(p.days['2026-09-07'].platformValues).toEqual({ 'Feedr Lunches': '200' })
        })
    })
})
