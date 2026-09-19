// The diary: what is coming up that somebody had to be told about.
//
// Three different things land on a day and they are deliberately three tables.
// What is on at the Arena arrives from Ticketmaster and nobody types it. The
// deliveries a restaurant usually gets are ticked onto a day off a list. This
// is the third kind, the one with a customer or a person on the other end of
// it, which is why it is the only one carrying a contact and a state.
//
// No React in here, the same split the rest of lib uses.

import { addDays } from '@/lib/dates'
import { toMinutes, shortTime } from '@/lib/roster'

// -- What kind of thing it is ------------------------------------------

export const KINDS = ['catering', 'meeting', 'promotion', 'maintenance', 'other']

// Soft fills with a strong left edge, the same shape the Arena chips use. A
// cell can hold three of these at once and solid colours at that size turn a
// month into a patchwork you cannot read.
//
// The Google column is the event colour this kind is written with. Google has
// eleven and they are fixed, so these are the nearest each one gets. An event
// colour is not the same as a calendar colour: the calendar's is a setting on
// each person's own account and cannot be set for everybody, and the event's is
// on the event and everybody sees it.
const KIND = {
    catering: {
        label: 'Catering',
        chip: 'bg-accent-light text-accent-ink border-l-accent',
        tag: 'bg-accent-light text-accent-ink',
        dot: 'bg-accent',
        bar: '#BC552B',
        fill: '#F7EAE2',
        ink: '#9A4A26',
        edge: '#DDB49A',
        google: '6', // Tangerine, the nearest to the Hub's orange
    },
    meeting: {
        label: 'Meeting',
        chip: 'bg-green-50 text-green-900 border-l-green-700',
        tag: 'bg-green-50 text-green-900',
        dot: 'bg-green-700',
        bar: '#15803D',
        fill: '#F0FDF4',
        ink: '#14532D',
        edge: '#A7D5B8',
        google: '10', // Basil
    },
    promotion: {
        label: 'Promotion',
        chip: 'bg-amber-50 text-amber-900 border-l-amber-600',
        tag: 'bg-amber-50 text-amber-900',
        dot: 'bg-amber-600',
        bar: '#D97706',
        fill: '#FFFBEB',
        ink: '#78350F',
        edge: '#E8C089',
        google: '5', // Banana
    },
    maintenance: {
        label: 'Maintenance',
        chip: 'bg-slate-100 text-slate-800 border-l-slate-500',
        tag: 'bg-slate-100 text-slate-800',
        dot: 'bg-slate-500',
        bar: '#64748B',
        fill: '#F1F5F9',
        ink: '#1E293B',
        edge: '#C0C8D2',
        google: '8', // Graphite
    },
    other: {
        label: 'Other',
        chip: 'bg-stone-100 text-stone-800 border-l-stone-500',
        tag: 'bg-stone-100 text-stone-800',
        dot: 'bg-stone-500',
        bar: '#78716C',
        fill: '#F5F5F4',
        ink: '#292524',
        edge: '#CBC6C2',
        google: '7', // Peacock
    },

    // These two are not kinds anybody can choose. They are the other two
    // sources the calendar draws, and they are in here so one function answers
    // "what colour is this item" whatever it came from.
    //
    // Neither carries a Google colour, because neither is ever written there. An
    // Arena listing is context rather than a commitment, and a quarter of them
    // would bury everything that is actually ours.
    arena: {
        label: '3Arena',
        chip: 'bg-purple-50 text-purple-900 border-l-purple-700',
        tag: 'bg-purple-50 text-purple-900',
        dot: 'bg-purple-700',
        bar: '#7E22CE',
        fill: '#FAF5FF',
        ink: '#581C87',
        edge: '#C9A7E6',
        google: null,
    },
    delivery: {
        label: 'Corporate',
        chip: 'bg-white text-gray-700 border-l-gray-500',
        tag: 'bg-gray-100 text-gray-700',
        dot: 'bg-gray-500',
        bar: '#6B7280',
        fill: '#FFFFFF',
        ink: '#374151',
        edge: '#CBD5E1',
        google: null,
    },
}

const FALLBACK = KIND.other

export function kindLabel(kind) {
    return (KIND[kind] || FALLBACK).label
}

export function kindChip(kind) {
    return (KIND[kind] || FALLBACK).chip
}

export function kindTag(kind) {
    return (KIND[kind] || FALLBACK).tag
}

export function kindDot(kind) {
    return (KIND[kind] || FALLBACK).dot
}

// The same colours as real values, for the two things that cannot read a class
// name: the picture and the PDF. One source for what a catering job looks like,
// so the sheet pinned to the wall and the screen beside it agree.
//
// edge is the outline, and it is there because the fill alone is not enough.
// A pale yellow strip on a white sheet gives no answer to the one question the
// band exists to answer, which is when the thing stops. Every other card on
// these sheets is a fill with a line round it, and the bands were the only
// thing without one.
export function kindColours(kind) {
    const one = KIND[kind] || FALLBACK
    return { bar: one.bar, fill: one.fill, ink: one.ink, edge: one.edge }
}

export function kindGoogleColour(kind) {
    return (KIND[kind] || FALLBACK).google
}

// -- Who it is for -----------------------------------------------------
//
// The scope decides three things at once: who can see it, which Google
// calendar it is written to, and which rosters it appears on. That is why it is
// one field on the form rather than three.
//
// all_sites is not a shortcut for ticking every restaurant. It means the group,
// and it goes to the group's own calendar, so it stays a different answer even
// on the day there is only one restaurant left ticked.

export function scopeLabel(entry, restaurants) {
    if (entry?.scope === 'all_sites') return 'All sites'
    if (entry?.scope === 'private') return 'Just me'

    const ids = entry?.restaurant_ids || []
    const names = ids
        .map(id => (restaurants || []).find(r => r.id === id)?.name)
        .filter(Boolean)

    if (!names.length) return 'No restaurant'
    return names.join(', ')
}

// What the form's answer becomes in the database.
//
// The form offers a list of restaurants to tick and two answers that override
// them, so this is the one place that turns those two shapes into the one the
// table wants. Anything but sites carries an empty list, which the check
// constraint also insists on: two ways to say the same thing is how they come
// to disagree.
export function scopeFrom({ mode, restaurantIds }) {
    if (mode === 'all_sites' || mode === 'private') {
        return { scope: mode, restaurant_ids: [] }
    }
    return { scope: 'sites', restaurant_ids: [...new Set(restaurantIds || [])] }
}

// -- What it is for ----------------------------------------------------
//
// Short words saying who an entry is aimed at: Students, Corporate, Staff. He
// was going to type them into the name, as "[Students] 15% off wraps", and the
// reason not to is that he wants to ask something of them later. A name cannot
// be asked a question, and three spellings of Students arrive within a year.
//
// There is no list behind them and no settings screen. What is offered next
// time is whatever has been used before, so a new restaurant needs nobody to
// set anything up, which is the same rule the calendar id follows.

// Tidied on the way in, because these are compared and grouped.
//
// Trimmed, empties dropped, and the same word never twice. Case is kept as it
// was typed and ignored when comparing, so Students and students are one label
// and the one somebody typed first is the one that shows.
export function cleanLabels(list) {
    const seen = new Set()
    const out = []
    for (const raw of list || []) {
        const label = String(raw ?? '').trim()
        if (!label) continue
        const key = label.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(label)
    }
    return out
}

// Everything that has been used before, for the form to offer.
//
// Read off the entries themselves rather than a list somebody maintains, so it
// is right by construction and there is nothing to keep in step. In the order
// they read, which is alphabetical, because a list of chips somebody scans
// should not reshuffle itself every time an entry is added.
export function labelsUsed(entries) {
    return cleanLabels((entries || []).flatMap(e => e?.labels || []))
        .sort((a, b) => a.localeCompare(b))
}

export function labelsOf(entry) {
    return cleanLabels(entry?.labels)
}

// -- When it is ---------------------------------------------------------

// The last day it covers. Null ends_on means it is a one day thing, which is
// most of them.
export function lastDay(entry) {
    return entry?.ends_on || entry?.starts_on || null
}

export function coversDate(entry, date) {
    if (!entry?.starts_on || !date) return false
    return date >= entry.starts_on && date <= lastDay(entry)
}

// No start time means all day. That is how a promotion is entered, and it is
// the same rule the roster already follows for deliveries: something happening
// some time on Tuesday is still worth having, and refusing it only means
// somebody invents a time to get it in.
export function isAllDay(entry) {
    return !entry?.starts_at
}

export function runsMoreThanADay(entry) {
    return Boolean(entry?.ends_on) && entry.ends_on > entry.starts_on
}

export function timeLabel(entry) {
    if (isAllDay(entry)) return 'All day'
    const from = shortTime(entry.starts_at)
    return entry.ends_at ? `${from} to ${shortTime(entry.ends_at)}` : from
}

// -- Putting them in order ---------------------------------------------

// In the order they happen, and anything all day first.
//
// First rather than last, which is the opposite of the way deliveries sort. A
// delivery with no time is one nobody could place in the day's order, so it
// goes to the end. An all day entry is not missing its time, it genuinely runs
// across the whole day, so it belongs above everything that happens inside it.
export function sortEntries(list) {
    return [...(list || [])].sort((a, b) => {
        const aAll = isAllDay(a)
        const bAll = isAllDay(b)
        if (aAll !== bAll) return aAll ? -1 : 1
        if (!aAll) {
            const gap = toMinutes(shortTime(a.starts_at)) - toMinutes(shortTime(b.starts_at))
            if (gap) return gap
        }
        return String(a?.title || '').localeCompare(String(b?.title || ''))
    })
}

export function onDate(entries, date) {
    return sortEntries((entries || []).filter(e => coversDate(e, date)))
}

// Every day between two dates, both ends included. Used to spread one entry
// across the cells it covers.
export function datesBetween(from, to) {
    if (!from) return []
    const out = []
    let at = from
    const end = to && to > from ? to : from
    // A guard rather than a while true. A bad pair of dates should give a short
    // wrong answer rather than lock the page up.
    for (let i = 0; i < 400 && at <= end; i += 1) {
        out.push(at)
        at = addDays(at, 1)
    }
    return out
}

// The map every view reads: a date to what is on it.
//
// A promotion running five days appears under all five, because a month cell
// asking "what is on this day" wants the true answer. Drawing it as one band
// rather than five chips is the view's business, and bandsForWeek is what does
// that.
export function entriesByDate(entries) {
    const out = {}
    for (const entry of entries || []) {
        for (const date of datesBetween(entry.starts_on, entry.ends_on)) {
            if (!out[date]) out[date] = []
            out[date].push(entry)
        }
    }
    for (const date of Object.keys(out)) out[date] = sortEntries(out[date])
    return out
}

// -- Bands across a week ------------------------------------------------

// Where a multi day entry starts in a week and how many columns it covers.
//
// Clamped at both ends, because a promotion that began last Thursday and ends
// next Tuesday still has to draw inside this week without running off either
// side. An entry that misses the week entirely is not returned at all.
//
// One day entries are left out on purpose. They are chips in their own cell,
// and a band one column wide reads as a different kind of thing than the chip
// beside it for no reason.
export function bandsForWeek(entries, weekDates) {
    if (!weekDates?.length) return []

    const first = weekDates[0]
    const last = weekDates[weekDates.length - 1]
    const out = []

    for (const entry of entries || []) {
        if (!runsMoreThanADay(entry)) continue

        const from = entry.starts_on
        const to = lastDay(entry)
        if (to < first || from > last) continue

        const start = from <= first ? 0 : weekDates.indexOf(from)
        const end = to >= last ? weekDates.length - 1 : weekDates.indexOf(to)
        if (start < 0 || end < 0) continue

        out.push({
            entry,
            start,
            span: end - start + 1,
            runsIn: from < first,
            runsOn: to > last,
        })
    }

    // Longest first, so the one that says the most about the week is the one
    // read first when several stack up.
    return out.sort((a, b) => b.span - a.span || a.start - b.start)
}

// -- The roster ---------------------------------------------------------

// Does this belong above the shifts?
//
// Private never does, because nobody else can see it at all, and putting it
// where the staff read the week would break the one promise the form makes.
//
// Cancelled never does either. The entry is still worth keeping, since knowing
// a job was cancelled is not the same as it never existing, but it no longer
// needs anybody on and the roster is only about who is needed.
//
// Everything else does, and that is a deliberate step back from the plan. The
// plan said a meeting somewhere else stays off the roster, and there is no
// honest way to know that: `location` is free text and an empty one means
// nobody typed anything, not that the meeting is here. Guessing from it would
// be wrong quietly, which is the worst way to be wrong. A meeting on the Also
// on row costs a chip and tells a manager they are off the floor, so the cost
// of showing it is smaller than the cost of inferring.
export function showsOnRoster(entry) {
    if (!entry || entry.scope === 'private') return false
    return entry.status !== 'cancelled'
}

// -- What is wrong with it before it is saved --------------------------

export function entryProblem(form) {
    if (!String(form?.title || '').trim()) return 'It needs a name.'
    if (!KINDS.includes(form?.kind)) return 'Say what kind of thing it is.'
    if (!form?.starts_on) return 'It needs a date.'

    if (form.ends_on && form.ends_on < form.starts_on) {
        return 'It cannot finish before it starts.'
    }
    if (form.ends_at && !form.starts_at) {
        return 'It has a finishing time but no starting time.'
    }
    if (form.starts_at && form.ends_at && !form.ends_on
        && toMinutes(shortTime(form.ends_at)) <= toMinutes(shortTime(form.starts_at))) {
        return 'It finishes before it starts. Put a finishing date on it if it runs past midnight.'
    }
    if (form.mode === 'sites' && !(form.restaurantIds || []).length) {
        return 'Say which restaurant it is for.'
    }
    return ''
}

// -- One screen out of three sources -----------------------------------
//
// The calendar draws diary entries, what is on at the Arena, and the
// deliveries ticked onto a day, and none of the three is shaped like the other
// two. Rather than teach each view about all three, they are turned into one
// item here and the views only ever draw items.
//
// Deliveries are in it because leaving them out would make a screen built to
// answer "what have I got coming up" miss half of what is coming up. They stay
// in day_notes.extras where they have always been: this reads them, it does not
// move them.

export const LAYERS = [
    'catering', 'meeting', 'promotion', 'maintenance', 'other',
    'arena', 'delivery', 'private',
]

// Which switch turns this item off.
//
// A private entry answers to its own layer rather than to its kind, so hiding
// what is only yours is one press and does not also hide the catering.
export function layerOf(item) {
    if (item?.source === 'arena') return 'arena'
    if (item?.source === 'delivery') return 'delivery'
    return item?.scope === 'private' ? 'private' : (item?.kind || 'other')
}

export function calendarItems({ entries, arena, dayNotes, from, to }) {
    const items = []

    for (const entry of entries || []) {
        for (const date of datesBetween(entry.starts_on, entry.ends_on)) {
            if (from && date < from) continue
            if (to && date > to) continue
            items.push({
                key: `diary-${entry.id}-${date}`,
                source: 'diary',
                kind: entry.kind,
                scope: entry.scope,
                title: entry.title,
                date,
                time: entry.starts_at ? shortTime(entry.starts_at) : '',
                allDay: isAllDay(entry),
                entry,
            })
        }
    }

    for (const event of arena || []) {
        items.push({
            key: `arena-${event.id}`,
            source: 'arena',
            kind: 'arena',
            title: event.name,
            date: event.event_date,
            time: event.event_time ? shortTime(event.event_time) : '',
            allDay: !event.event_time,
            entry: event,
        })
    }

    for (const note of dayNotes || []) {
        for (const extra of note?.extras || []) {
            if (!extra?.name) continue
            items.push({
                key: `delivery-${note.note_date}-${extra.name}`,
                source: 'delivery',
                kind: 'delivery',
                title: extra.name,
                date: note.note_date,
                time: extra.time ? shortTime(extra.time) : '',
                allDay: false,
                entry: note,
            })
        }
    }

    return items
}

// The items a day holds, in the order they read.
//
// All day first, then by time, then by name. An item with no time that is not
// all day is a delivery nobody put a time on, and those go last for the same
// reason they do on the roster: it is the one thing that cannot be placed in
// the day's order.
export function itemsByDate(items, layers) {
    const on = layers ? new Set(layers) : null
    const out = {}

    for (const item of items || []) {
        if (on && !on.has(layerOf(item))) continue
        if (!out[item.date]) out[item.date] = []
        out[item.date].push(item)
    }

    // All day first, because it runs across everything inside it. Then what is
    // one off about the day. Then the corporate orders, last, because they are
    // the standing arrangement: Feedr every Tuesday is not what you look at
    // this day for, and putting it above a catering job buries the thing that
    // actually makes the day different.
    const rank = item => (item.allDay ? 0 : (item.source === 'delivery' ? 2 : 1))

    for (const date of Object.keys(out)) {
        out[date].sort((a, b) => {
            const group = rank(a) - rank(b)
            if (group) return group
            if (!a.time !== !b.time) return a.time ? -1 : 1
            if (a.time && b.time) {
                const gap = toMinutes(a.time) - toMinutes(b.time)
                if (gap) return gap
            }
            return String(a.title || '').localeCompare(String(b.title || ''))
        })
    }

    return out
}
