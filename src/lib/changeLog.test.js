import { describe, it, expect } from 'vitest'
import {
    tableWords, fieldWords, valueWords, changedFields, deletedFields,
    whoWords, throughTheApp, summarise, actionWords, actionTone, byDay,
    aOrAn, dayOf,
} from './changeLog'

describe('tableWords', () => {
    it('uses the name the app calls it', () => {
        expect(tableWords('sales_records')).toBe('Daily sales')
        expect(tableWords('shift_requests')).toBe('Time off request')
        expect(tableWords('users')).toBe('Account')
    })

    it('tidies up anything it has not been told about', () => {
        // Which is what every table built after this was written will be, so
        // the fallback has to be usable rather than a placeholder.
        expect(tableWords('supplier_returns')).toBe('Supplier returns')
    })
})

describe('fieldWords', () => {
    it('reads a column as a label', () => {
        expect(fieldWords('net_sales')).toBe('Net sales')
        expect(fieldWords('is_active')).toBe('Is active')
    })

    it('drops a trailing id, which is the database talking', () => {
        expect(fieldWords('restaurant_id')).toBe('Restaurant')
        expect(fieldWords('supplier_id')).toBe('Supplier')
    })
})

describe('valueWords', () => {
    it('says nothing rather than showing a blank', () => {
        // The one that matters most on a figure. Nothing and zero are not the
        // same answer, and a blank cell reads as neither.
        expect(valueWords('net_sales', null)).toBe('nothing')
        expect(valueWords('notes', '')).toBe('nothing')
    })

    it('puts a euro sign on money and not on anything else', () => {
        expect(valueWords('net_sales', '2480.00')).toBe('€2,480.00')
        expect(valueWords('staff_food', '18.50')).toBe('€18.50')
        expect(valueWords('hourly_rate', 13.5)).toBe('€13.50')
        expect(valueWords('quantity', '12.00')).toBe('12.00')
        expect(valueWords('review_count', 41)).toBe('41')
    })

    it('does not read a percentage as money', () => {
        // food_cost_pct carries "cost" and vat_rate carries "rate", so the
        // plain money list gets both of these wrong.
        expect(valueWords('food_cost_pct', '31.40')).toBe('31.40')
        expect(valueWords('vat_rate', '13.50')).toBe('13.50')
    })

    it('reads dates and times as dates and times', () => {
        expect(valueWords('sale_date', '2026-09-08')).toBe('08/09/2026')
        expect(valueWords('completed_at', '2026-09-08T14:12:00Z')).toBe('08/09/2026, 14:12')
    })

    it('shortens a uuid, which tells nobody anything whole', () => {
        expect(valueWords('supplier_id', '8c1f2a44-1111-2222-3333-444455556666'))
            .toBe('…556666')
    })

    it('says yes and no rather than true and false', () => {
        expect(valueWords('is_active', true)).toBe('Yes')
        expect(valueWords('is_active', false)).toBe('No')
    })

    it('leaves a note from the trigger alone', () => {
        expect(valueWords('charts', '(48213 characters, not stored)'))
            .toBe('(48213 characters, not stored)')
    })
})

describe('changedFields', () => {
    const entry = {
        changes: {
            net_sales: { from: '2480.00', to: '2510.00' },
            updated_at: { from: 'a', to: 'b' },
        },
    }

    it('gives the fields as words on both sides', () => {
        expect(changedFields(entry)).toEqual([
            { field: 'net_sales', label: 'Net sales', was: '€2,480.00', became: '€2,510.00' },
        ])
    })

    it('leaves out the columns that move on every write', () => {
        // updated_at changes every time, so recording it would put a line in
        // every entry that says only that the entry exists.
        expect(changedFields(entry).map(f => f.field)).not.toContain('updated_at')
    })

    it('opens up a column that holds a set of values', () => {
        // Without this the whole entry reads "Platform sales: a set of values
        // to a set of values", which is the log keeping the numbers and then
        // refusing to say them.
        expect(changedFields({
            changes: {
                platform_sales: {
                    from: { deliveroo: 120, just_eat: 80 },
                    to: { deliveroo: 140, just_eat: 80 },
                },
            },
        })).toEqual([{
            field: 'platform_sales.deliveroo',
            label: 'Platform sales, Deliveroo',
            was: '€120.00',
            became: '€140.00',
        }])
    })

    it('names a key that appeared and one that went', () => {
        const out = changedFields({
            changes: {
                tender_amounts: { from: { cash: 100 }, to: { kiosk: 50 } },
            },
        })
        expect(out.map(f => [f.label, f.was, f.became])).toEqual([
            ['Tender amounts, Cash', '€100.00', 'nothing'],
            ['Tender amounts, Kiosk', 'nothing', '€50.00'],
        ])
    })

    it('goes back to a count when the whole set was replaced', () => {
        // Nine changed keys is a column being rewritten rather than edited, and
        // nine lines of it is not something anybody reads.
        const from = {}
        const to = {}
        for (let i = 0; i < 9; i++) { from[`k${i}`] = i; to[`k${i}`] = i + 1 }
        expect(changedFields({ changes: { platform_sales: { from, to } } }))
            .toEqual([{
                field: 'platform_sales',
                label: 'Platform sales',
                was: 'a set of values',
                became: 'a set of values',
            }])
    })

    it('leaves a list alone, which is not the same shape', () => {
        expect(changedFields({ changes: { sent_to: { from: null, to: ['a', 'b'] } } }))
            .toEqual([{ field: 'sent_to', label: 'Sent to', was: 'nothing', became: '2 items' }])
    })

    it('gives nothing for an insert, which carries no payload', () => {
        expect(changedFields({ action: 'insert' })).toEqual([])
        expect(changedFields(null)).toEqual([])
    })
})

describe('deletedFields', () => {
    it('shows what was in the row, without the plumbing', () => {
        const out = deletedFields({
            deleted_row: {
                id: 'x', invoice_number: 'SYS-99412', total_amount: '1284.55',
                notes: null, created_at: '2026-09-02T08:00:00Z',
            },
        })
        expect(out.map(f => f.field)).toEqual(['invoice_number', 'total_amount'])
        expect(out[1].value).toBe('€1,284.55')
    })
})

describe('whoWords', () => {
    it('gives the person when there was one', () => {
        expect(whoWords({ email: 'leandro@papichulo.ie', via: 'authenticated' }))
            .toBe('leandro@papichulo.ie')
    })

    it('does not leave a blank when there was nobody', () => {
        // A blank reads as missing data. This is not missing, it is the record
        // saying the change did not come through the app, which is the entry
        // most worth looking at twice.
        expect(whoWords({ email: null, via: 'database' })).toBe('Not through the app')
        expect(whoWords({ email: null, via: 'service_role' })).toBe('The Hub itself')
    })

    it('tells the screen which of the two it is', () => {
        expect(throughTheApp({ email: 'a@b.ie' })).toBe(true)
        expect(throughTheApp({ email: null })).toBe(false)
    })
})

describe('summarise', () => {
    it('names the one field when only one moved', () => {
        expect(summarise({
            action: 'update', table_name: 'users',
            changes: { role: { from: 'employee', to: 'store_manager' } },
        })).toBe('Role on account: employee to store_manager')
    })

    it('counts them when several moved', () => {
        expect(summarise({
            action: 'update', table_name: 'sales_records',
            changes: { net_sales: { from: 1, to: 2 }, cash_sales: { from: 3, to: 4 } },
        })).toBe('Changed 2 things on daily sales')
    })

    it('gets a and an right', () => {
        expect(summarise({ action: 'delete', table_name: 'invoices' }))
            .toBe('Deleted an invoice')
        expect(summarise({ action: 'insert', table_name: 'roster_shifts' }))
            .toBe('Added a shift')
    })

    it('says how much went on a truncate', () => {
        expect(summarise({
            action: 'truncate', table_name: 'waste_logs', changes: { rows_removed: 412 },
        })).toBe('Emptied waste, 412 rows')
    })
})

describe('aOrAn', () => {
    it('picks by the first letter', () => {
        expect(aOrAn('invoice')).toBe('an invoice')
        expect(aOrAn('shift')).toBe('a shift')
        expect(aOrAn('account')).toBe('an account')
    })
})

describe('actionWords and actionTone', () => {
    it('marks the two worth seeing across the page', () => {
        expect(actionTone('delete')).toBe('bad')
        expect(actionTone('truncate')).toBe('bad')
        expect(actionTone('insert')).toBe('new')
        expect(actionTone('update')).toBe('plain')
    })

    it('says what happened in one word', () => {
        expect(actionWords('truncate')).toBe('Emptied')
        expect(actionWords('nonsense')).toBe('Changed')
    })
})

describe('dayOf and byDay', () => {
    it('files a change under the day the reader had, not the database', () => {
        // A change at half past midnight belongs to that morning. Slicing the
        // stored timestamp files it under the day before, which is the kind of
        // thing that makes somebody stop trusting the whole record.
        const local = new Date(2026, 8, 8, 0, 30)
        expect(dayOf(local.toISOString())).toBe('2026-09-08')
    })

    it('gives nothing for a timestamp it cannot read', () => {
        expect(dayOf('not a date')).toBe('')
    })

    it('groups newest day first', () => {
        const days = byDay([
            { changed_at: new Date(2026, 8, 6, 10).toISOString() },
            { changed_at: new Date(2026, 8, 8, 10).toISOString() },
            { changed_at: new Date(2026, 8, 8, 12).toISOString() },
        ])
        expect(days.map(d => d[0])).toEqual(['2026-09-08', '2026-09-06'])
        expect(days[0][1]).toHaveLength(2)
    })

    it('skips a row with no time on it rather than inventing a day', () => {
        expect(byDay([{ changed_at: null }])).toEqual([])
        expect(byDay()).toEqual([])
    })
})
