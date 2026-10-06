// The prices as they stood at the end of a week.
//
// A report still being written was read against today's prices, so accepting
// the invoices of 27 September to 3 October changed what the report for the
// week before said about its own recipes (his, 5 October). Every week is to
// stay as things were during it. The price events are that history: every
// change to what a product costs, and why, and they are only ever added to.
//
// Nothing here reads or writes the database.

import { num, round2, round4 } from '@/lib/format'
import { stampDay } from '@/lib/dates'

const per4 = n => (n == null ? null : round4(num(n)))
const lineDay = event => event?.invoice_lines?.invoices?.invoice_date || null

// Only these say which price recipes cost from: a first price, a price typed
// over the one in use, and a change of supplier. An invoice can move any price.
const CHOICES = new Set(['created', 'by_hand', 'preferred_moved'])

// The day a change belongs to.
//
// **A decision on an invoice line belongs to that invoice's day**, however late
// it was made: accepting on Monday what was charged on Thursday says what
// Thursday cost. Everything else counts from the day it was done, because
// nothing was paid at it before then. A change of supplier made while deciding
// a line is part of that decision: the two are written at the same moment and
// only the price carries the line.
export function eventDay(event, events = []) {
    if (lineDay(event)) return lineDay(event)
    if (event?.reason === 'preferred_moved' && event.at) {
        const twin = (events || []).find(e => (
            e !== event && e.product_id === event.product_id && e.at === event.at && lineDay(e)
        ))
        if (twin) return lineDay(twin)
    }
    return event?.at ? stampDay(event.at) || null : null
}

// Every price row as it stood at the end of `day`: what each one cost and which
// one recipes cost from.
//
// **Replayed in the order the changes were made**, keeping only those that
// belong to the day or before. Each change wrote its price over the one before
// it, whatever invoice it was for, so the invoice of 1 October accepted before
// the one of 28 September still moved the price first.
//
// **A row's price** is today's unless something changed it after the day.
// Then it is the price of the last change kept, or with none kept what the
// first change made moved it from, or the price it already had when that was
// only a choice of supplier.
//
// **Which row recipes cost from** only moves on a choice. A product chosen
// again after the day goes back to the last choice kept. With none, the row
// the first later choice moved away from, known by what it cost just before.
// A product whose first price came after the day had none. Failing all of
// that, today's, rather than a guess.
export function pricesAsAt(prices, events, day) {
    const rows = (prices || []).map(p => ({ ...p }))
    if (!day || !events?.length) return rows

    // A change of supplier after the price it came with, when the two were
    // written at the same moment.
    const dated = events
        .filter(e => e.price_id)
        .map(e => ({ ...e, on: eventDay(e, events) }))
        .filter(e => e.on)
        .sort((a, b) => String(a.at).localeCompare(String(b.at))
            || (a.reason === 'preferred_moved') - (b.reason === 'preferred_moved'))

    const byRow = new Map()
    const byProduct = new Map()
    for (const e of dated) {
        if (!byRow.has(e.price_id)) byRow.set(e.price_id, [])
        byRow.get(e.price_id).push(e)
        if (!byProduct.has(e.product_id)) byProduct.set(e.product_id, [])
        byProduct.get(e.product_id).push(e)
    }

    // What a row cost after the changes `keep` lets through.
    const priceOf = (row, keep) => {
        const list = byRow.get(row.id) || []
        if (!list.length) return row.price_per_unit
        const kept = list.filter(keep)
        if (kept.length) return kept[kept.length - 1].price_per_unit
        const first = list[0]
        return (first.reason === 'invoice' || first.reason === 'by_hand') && first.previous_per_unit != null
            ? first.previous_per_unit
            : first.price_per_unit
    }

    // Found before any price is rolled back: the old row's price is the one
    // it had just before the change, which can be after the day.
    const chosenOf = new Map()
    for (const [productId, list] of byProduct) {
        const choices = list.filter(e => CHOICES.has(e.reason))
        const later = choices.filter(e => e.on > day)
        const firstEver = list[0].reason === 'created' && list[0].on > day
        if (!later.some(e => e.reason === 'preferred_moved') && !firstEver) continue

        const mine = rows.filter(r => r.product_id === productId)
        const last = choices.filter(e => e.on <= day).pop()
        if (last && mine.some(r => r.id === last.price_id)) chosenOf.set(productId, last.price_id)
        else if (firstEver) chosenOf.set(productId, null)
        else {
            const move = later.find(e => e.reason === 'preferred_moved')
            const was = mine.filter(r => (
                r.id !== move.price_id
                && per4(priceOf(r, e => String(e.at) < String(move.at))) === per4(move.previous_per_unit)
            ))
            if (was.length === 1) chosenOf.set(productId, was[0].id)
        }
    }

    for (const row of rows) {
        if (!byRow.get(row.id)?.some(e => e.on > day)) continue
        const then = priceOf(row, e => e.on <= day)
        if (then == null || per4(then) === per4(row.price_per_unit)) continue
        const units = num(row.units_per_case)
        row.price_per_unit = per4(then)
        if (units > 0) row.price_per_case = round2(num(then) * units)
    }

    for (const [productId, chosen] of chosenOf) {
        for (const r of rows) if (r.product_id === productId) r.is_preferred = r.id === chosen
    }

    return rows
}
