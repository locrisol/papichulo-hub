import { describe, it, expect } from 'vitest'
import { num, tendersToShow, tenderVariance, mergeTenderSales, tenderValuesFromRecord } from './salesTenders'

// The five rows the till printed before August 2026, and the ones it prints now.
const t = (key, label, sort_order, extra = {}) => ({
    key, label, sort_order, is_active: true, counts_toward_gross: true, ...extra,
})

const OLD_TILL = [
    t('cash', 'Cash Sales', 0),
    t('card', 'Card', 1),
    t('kiosk', 'Kiosk', 2),
    t('online_sales', 'Online Sales', 3),
    t('outside_catering', 'Outside Catering', 4),
]

// What it looks like after the change: Outside Catering retired, Online Sales
// relabelled but keeping its key, and four new rows.
const NEW_TILL = [
    t('cash', 'Cash Sales', 0),
    t('card', 'Card', 1),
    t('kiosk', 'Kiosk', 2),
    t('online_sales', 'Online Platforms', 3),
    t('ordu_app', 'Ordu App', 4),
    t('clockmeal', 'Clockmeal', 5),
    t('lunch_team', 'Lunch Team', 6),
    t('feedr', 'Feedr', 7),
    t('catering', 'Catering', 8),
    t('outside_catering', 'Outside Catering', 9, { is_active: false }),
]

describe('num', () => {
    it('treats an empty box as nothing', () => {
        expect(num('')).toBe(0)
        expect(num(null)).toBe(0)
        expect(num(undefined)).toBe(0)
    })

    it('reads what was typed', () => {
        expect(num('109.04')).toBe(109.04)
        expect(num(1464.47)).toBe(1464.47)
    })

    it('does not break on nonsense', () => {
        expect(num('abc')).toBe(0)
    })
})

describe('tendersToShow', () => {
    it('shows the active rows in the order they are set', () => {
        const rows = tendersToShow(NEW_TILL, [{}])
        expect(rows.map(r => r.label)).toEqual([
            'Cash Sales', 'Card', 'Kiosk', 'Online Platforms',
            'Ordu App', 'Clockmeal', 'Lunch Team', 'Feedr', 'Catering',
        ])
    })

    it('leaves a retired row out when no day has a figure for it', () => {
        const rows = tendersToShow(NEW_TILL, [{ cash: 100 }, { cash: 50 }])
        expect(rows.map(r => r.key)).not.toContain('outside_catering')
    })

    // This is the whole point of the design. A week from March has to keep
    // drawing the till as it was, and nothing anywhere stores when it changed.
    it('brings a retired row back for a week that has figures for it', () => {
        const march = [{ cash: 100, outside_catering: 245.50 }, { cash: 80 }]
        const rows = tendersToShow(NEW_TILL, march)
        expect(rows.map(r => r.key)).toContain('outside_catering')
    })

    it('brings it back for a zero as well as a figure', () => {
        // A stored zero means the row was on the till and took nothing. That is
        // different from the row not existing, and it has to show either way.
        const rows = tendersToShow(NEW_TILL, [{ outside_catering: 0 }])
        expect(rows.map(r => r.key)).toContain('outside_catering')
    })

    // The week grid is one set of rows across seven columns, so a row that only
    // appeared on the Wednesday still has to exist for the whole week.
    it('looks across every day, not one at a time', () => {
        const week = [{}, {}, {}, { outside_catering: 745 }, {}, {}, {}]
        const rows = tendersToShow(NEW_TILL, week)
        expect(rows.map(r => r.key)).toContain('outside_catering')
    })

    it('copes with no tenders and no days', () => {
        expect(tendersToShow([], [])).toEqual([])
        expect(tendersToShow(null, null)).toEqual([])
    })
})

describe('tenderVariance', () => {
    // Sunday 9 August 2026, straight off the weekly spreadsheet.
    it('comes out at nothing when the day balances', () => {
        const values = { cash: 109.04, card: 466.20, kiosk: 1464.47, online_sales: 404.61 }
        expect(tenderVariance(2444.32, values, NEW_TILL)).toBeCloseTo(0, 2)
    })

    // Friday 14 August 2026, the one day that was actually out.
    it('reads a short day as a positive number, the way the spreadsheet does', () => {
        const values = { cash: 55.60, card: 223.20, kiosk: 1002.55, online_sales: 511.76, feedr: 487.03 }
        expect(tenderVariance(2283.14, values, NEW_TILL)).toBeCloseTo(3.00, 2)
    })

    it('reads an over day as a negative number', () => {
        expect(tenderVariance(100, { cash: 105 }, NEW_TILL)).toBeCloseTo(-5, 2)
    })

    // Monday 10 August, the day that used every catering row.
    it('adds up all the catering rows separately', () => {
        const values = {
            cash: 56.85, card: 292.77, kiosk: 562.10, online_sales: 405.90,
            clockmeal: 56.40, lunch_team: 114.15, feedr: 480.98,
        }
        expect(tenderVariance(1969.15, values, NEW_TILL)).toBeCloseTo(0, 2)
    })

    it('leaves out a row that is not meant to count', () => {
        const rows = [
            t('cash', 'Cash', 0),
            t('subtotal', 'Subtotal', 1, { counts_toward_gross: false }),
        ]
        // The subtotal is on screen but must not be added in twice.
        expect(tenderVariance(100, { cash: 100, subtotal: 100 }, rows)).toBeCloseTo(0, 2)
    })
})

describe('mergeTenderSales', () => {
    it('writes what was typed', () => {
        const out = mergeTenderSales({}, { cash: '109.04', card: '466.20' }, OLD_TILL)
        expect(out.cash).toBe(109.04)
        expect(out.card).toBe(466.20)
    })

    it('writes zeros rather than skipping them', () => {
        const out = mergeTenderSales({}, { cash: '' }, [t('cash', 'Cash', 0)])
        expect(out.cash).toBe(0)
    })

    // sales_platforms rebuilds its field from the active list, so re-saving an
    // old week silently wipes any platform retired since. Money that reconciles
    // cannot work that way, so anything not on screen is left alone.
    it('keeps a figure belonging to no row on screen', () => {
        const stored = { cash: 100, some_old_row: 42.50 }
        const out = mergeTenderSales(stored, { cash: '120' }, [t('cash', 'Cash', 0)])
        expect(out.cash).toBe(120)
        expect(out.some_old_row).toBe(42.50)
    })

    it('still updates a retired row that is on screen', () => {
        const stored = { outside_catering: 245.50 }
        const shown = [t('outside_catering', 'Outside Catering', 0, { is_active: false })]
        const out = mergeTenderSales(stored, { outside_catering: '300' }, shown)
        expect(out.outside_catering).toBe(300)
    })
})

describe('tenderValuesFromRecord', () => {
    it('hands the inputs strings', () => {
        expect(tenderValuesFromRecord({ cash: 109.04 })).toEqual({ cash: '109.04' })
    })

    it('keeps a stored zero as a zero, not an empty box', () => {
        // The difference matters: a zero was typed, an empty box was not.
        expect(tenderValuesFromRecord({ ordu_app: 0 })).toEqual({ ordu_app: '0' })
    })

    it('copes with nothing stored', () => {
        expect(tenderValuesFromRecord(null)).toEqual({})
    })
})
