import { describe, it, expect } from 'vitest'
import { num, tendersToShow, tenderVariance, mergeTenderSales, keyedPlatforms, platformsToShow, mergePlatformSales, tenderValuesFromRecord, sameLabel, trackedCopy } from '@/lib/salesTenders'

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
        expect(tenderVariance(2444.32, values, NEW_TILL)).toBe(0)
    })

    // Saturday 15 August 2026. This one balances too, but adding those three
    // decimals in binary lands on minus two ten-thousandths of a cent, which
    // used to print as "-€0.00" next to six days of "€0.00".
    it('gives a real zero when the decimals do not add up cleanly', () => {
        const values = { cash: 0, card: 290.64, kiosk: 987.95, online_sales: 325.03 }
        const v = tenderVariance(1603.62, values, NEW_TILL)
        expect(v).toBe(0)
        expect(Object.is(v, -0)).toBe(false)
    })

    // Friday 14 August 2026, the one day that was actually out.
    it('reads a short till as a negative number', () => {
        const values = { cash: 55.60, card: 223.20, kiosk: 1002.55, online_sales: 511.76, feedr: 487.03 }
        expect(tenderVariance(2283.14, values, NEW_TILL)).toBe(-3)
    })

    it('reads an over till as a positive number', () => {
        expect(tenderVariance(100, { cash: 105 }, NEW_TILL)).toBe(5)
    })

    // Monday 10 August, the day that used every catering row.
    it('adds up all the catering rows separately', () => {
        const values = {
            cash: 56.85, card: 292.77, kiosk: 562.10, online_sales: 405.90,
            clockmeal: 56.40, lunch_team: 114.15, feedr: 480.98,
        }
        expect(tenderVariance(1969.15, values, NEW_TILL)).toBe(0)
    })

    it('leaves out a row that is not meant to count', () => {
        const rows = [
            t('cash', 'Cash', 0),
            t('subtotal', 'Subtotal', 1, { counts_toward_gross: false }),
        ]
        // The subtotal is on screen but must not be added in twice.
        expect(tenderVariance(100, { cash: 100, subtotal: 100 }, rows)).toBe(0)
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

    // Re-saving an old week must not wipe a row retired since, so anything not
    // on screen is left alone. The delivery platforms work the same way now.
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

// The delivery platforms. Their figures are stored under a key that never
// changes, the way the till rows are, so a platform can be renamed or retired
// without its past weeks losing anything. Found by the audit of 28 September.
describe('the delivery platforms', () => {
    const p = (key, name, sort_order, extra = {}) => ({
        id: key, key, name, bucket: 'online_platform', sort_order, is_active: true, ...extra,
    })
    const PLATFORMS = [
        p('Deliveroo', 'Deliveroo', 0),
        // Renamed in settings: the name moved on, the key did not.
        p('Just Eat', 'JustEat', 1),
        p('Manna', 'Manna', 2, { is_active: false }),
    ]

    // Before migration 026 there is no key column.
    describe('keyedPlatforms', () => {
        it('gives a platform with no key its name as the key', () => {
            const [old] = keyedPlatforms([{ id: 'p1', name: 'Deliveroo' }])
            expect(old.key).toBe('Deliveroo')
        })

        it('leaves a key that is there alone, whatever the name is now', () => {
            expect(keyedPlatforms(PLATFORMS).map(x => x.key)).toEqual(['Deliveroo', 'Just Eat', 'Manna'])
        })

        it('copes with nothing at all', () => {
            expect(keyedPlatforms(null)).toEqual([])
        })
    })

    describe('platformsToShow', () => {
        it('shows the active ones in the order they are set', () => {
            expect(platformsToShow(PLATFORMS, [{}]).map(x => x.name)).toEqual(['Deliveroo', 'JustEat'])
        })

        it('brings back a retired one any of the days has a figure for', () => {
            const shown = platformsToShow(PLATFORMS, [{ Deliveroo: 10 }, { Manna: 40 }])
            expect(shown.map(x => x.name)).toEqual(['Deliveroo', 'JustEat', 'Manna'])
        })

        it('finds a figure by the key, not the name it goes by now', () => {
            const renamedAway = [p('Manna', 'Manna Eats', 2, { is_active: false })]
            expect(platformsToShow(renamedAway, [{ Manna: 40 }])).toHaveLength(1)
            expect(platformsToShow(renamedAway, [{ 'Manna Eats': 40 }])).toHaveLength(0)
        })
    })

    describe('mergePlatformSales', () => {
        const shown = PLATFORMS.slice(0, 2)

        it('writes each figure under the key', () => {
            expect(mergePlatformSales({}, { Deliveroo: '120.5', 'Just Eat': '60' }, shown))
                .toEqual({ Deliveroo: 120.5, 'Just Eat': 60 })
        })

        // What used to be lost: Manna retired, then a March week corrected
        // and saved again.
        it('keeps a figure belonging to no row on screen', () => {
            const out = mergePlatformSales({ Deliveroo: 100, Manna: 40 }, { Deliveroo: '110' }, shown)
            expect(out).toEqual({ Deliveroo: 110, Manna: 40 })
        })

        // Unlike the till rows, a nought is dropped. A cleared box has to take
        // its old figure with it, or clearing a mistyped figure would keep it.
        it('takes a figure away when its box is cleared or set to nought', () => {
            expect(mergePlatformSales({ Deliveroo: 100, 'Just Eat': 60 }, { Deliveroo: '', 'Just Eat': '0' }, shown))
                .toEqual({})
        })
    })
})

describe('sameLabel', () => {
    it('matches a tracking row to the till row of the same name', () => {
        expect(sameLabel('Feedr', 'Feedr')).toBe(true)
        expect(sameLabel(' feedr ', 'Feedr')).toBe(true)
        expect(sameLabel('Lunch Team', 'Lunch team')).toBe(true)
    })

    it('does not match two different rows', () => {
        expect(sameLabel('Feedr', 'Clockmeal')).toBe(false)
        expect(sameLabel('Catering', 'Outside Catering')).toBe(false)
    })

    it('copes with nothing on either side', () => {
        expect(sameLabel(null, undefined)).toBe(true)
        expect(sameLabel('Feedr', null)).toBe(false)
    })
})

describe('trackedCopy', () => {
    it('fills an empty tracking row', () => {
        expect(trackedCopy({ typed: '745', previousTillValue: '', trackedValue: '' })).toBe('745')
    })

    // Correcting a typo in the till row should carry through, or you fix one
    // and leave the other wrong.
    it('keeps following while the tracking row still matches the till row', () => {
        expect(trackedCopy({ typed: '750', previousTillValue: '745', trackedValue: '745' })).toBe('750')
    })

    it('leaves a tracking row alone once something different is in it', () => {
        // Feedr rang up 745 on the till but only pays 700 after commission.
        // That 700 is the whole point of the tracking row and must survive.
        expect(trackedCopy({ typed: '750', previousTillValue: '745', trackedValue: '700' })).toBe(null)
    })

    it('copies a zero like any other figure', () => {
        expect(trackedCopy({ typed: '0', previousTillValue: '', trackedValue: '' })).toBe('0')
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
