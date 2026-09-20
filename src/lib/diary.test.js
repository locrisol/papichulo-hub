import { describe, it, expect } from 'vitest'
import {
    KINDS, kindLabel, kindChip, kindGoogleColour,
    scopeLabel, scopeFrom,
    lastDay, coversDate, isAllDay, runsMoreThanADay, timeLabel,
    sortEntries, onDate, datesBetween, entriesByDate, bandsForWeek,
    showsOnRoster, entryProblem,
    LAYERS, layerOf, calendarItems, itemsByDate,
    cleanLabels, labelsUsed, labelsOf, atRestaurant,
} from './diary'

const RESTAURANTS = [
    { id: 'pc', name: 'Point Campus' },
    { id: 'dl', name: 'Dun Laoghaire' },
]

const catering = {
    id: 'c1',
    kind: 'catering',
    title: 'Blanchardstown 40th',
    scope: 'sites',
    restaurant_ids: ['pc'],
    starts_on: '2026-10-16',
    ends_on: null,
    starts_at: '19:00:00',
    ends_at: '23:00:00',
    status: 'confirmed',
}

// 12 to 16 October, the shape of the real thing: 22 to 28 September, 15% off.
const promotion = {
    id: 'p1',
    kind: 'promotion',
    title: '15% off wraps',
    scope: 'sites',
    restaurant_ids: ['pc'],
    starts_on: '2026-10-12',
    ends_on: '2026-10-16',
    starts_at: null,
    ends_at: null,
    status: 'confirmed',
}

describe('the kinds', () => {
    it('has a label for every one of them', () => {
        for (const kind of KINDS) expect(kindLabel(kind)).toBeTruthy()
    })

    // A kind that arrived from the database and is not one we know about should
    // draw as something rather than crash a month grid.
    it('falls back rather than throwing on one it does not know', () => {
        expect(kindLabel('nonsense')).toBe('Other')
        expect(kindChip(undefined)).toBe(kindChip('other'))
    })

    // The eleven Google offers are fixed, so these are the nearest each kind
    // gets. What matters is that two kinds never land on the same one, or the
    // colour stops saying anything.
    it('gives every kind its own Google colour', () => {
        const used = KINDS.map(kindGoogleColour)
        expect(new Set(used).size).toBe(KINDS.length)
    })
})

describe('who it is for', () => {
    it('names the restaurant', () => {
        expect(scopeLabel(catering, RESTAURANTS)).toBe('Point Campus')
    })

    it('names both when it is for both', () => {
        const meeting = { scope: 'sites', restaurant_ids: ['pc', 'dl'] }
        expect(scopeLabel(meeting, RESTAURANTS)).toBe('Point Campus, Dun Laoghaire')
    })

    it('says All sites for the group', () => {
        expect(scopeLabel({ scope: 'all_sites' }, RESTAURANTS)).toBe('All sites')
    })

    it('says Just me for a private one', () => {
        expect(scopeLabel({ scope: 'private' }, RESTAURANTS)).toBe('Just me')
    })

    // A restaurant that was deleted leaves an id pointing at nothing. Saying
    // nothing at all would read as a missing label rather than a missing
    // restaurant.
    it('says something when the restaurant is gone', () => {
        expect(scopeLabel({ scope: 'sites', restaurant_ids: ['zzz'] }, RESTAURANTS))
            .toBe('No restaurant')
    })
})

describe('turning the form answer into the row', () => {
    it('keeps the ticked restaurants', () => {
        expect(scopeFrom({ mode: 'sites', restaurantIds: ['pc', 'dl'] }))
            .toEqual({ scope: 'sites', restaurant_ids: ['pc', 'dl'] })
    })

    // The check constraint insists the list is empty for anything but sites,
    // so this is where the two shapes are kept from disagreeing.
    it('empties the list when the answer overrides it', () => {
        expect(scopeFrom({ mode: 'all_sites', restaurantIds: ['pc'] }))
            .toEqual({ scope: 'all_sites', restaurant_ids: [] })
        expect(scopeFrom({ mode: 'private', restaurantIds: ['pc', 'dl'] }))
            .toEqual({ scope: 'private', restaurant_ids: [] })
    })

    it('does not let the same restaurant in twice', () => {
        expect(scopeFrom({ mode: 'sites', restaurantIds: ['pc', 'pc'] }).restaurant_ids)
            .toEqual(['pc'])
    })
})

describe('when it is', () => {
    it('treats a missing end date as the same day', () => {
        expect(lastDay(catering)).toBe('2026-10-16')
        expect(runsMoreThanADay(catering)).toBe(false)
    })

    it('knows a promotion runs across days', () => {
        expect(lastDay(promotion)).toBe('2026-10-16')
        expect(runsMoreThanADay(promotion)).toBe(true)
    })

    // An end date equal to the start is one day, not two. Somebody filling the
    // form can easily put the same date in both.
    it('does not call the same date at both ends a run', () => {
        expect(runsMoreThanADay({ starts_on: '2026-10-12', ends_on: '2026-10-12' })).toBe(false)
    })

    it('covers every day from the first to the last', () => {
        expect(coversDate(promotion, '2026-10-11')).toBe(false)
        expect(coversDate(promotion, '2026-10-12')).toBe(true)
        expect(coversDate(promotion, '2026-10-14')).toBe(true)
        expect(coversDate(promotion, '2026-10-16')).toBe(true)
        expect(coversDate(promotion, '2026-10-17')).toBe(false)
    })

    it('calls an entry with no start time all day', () => {
        expect(isAllDay(promotion)).toBe(true)
        expect(isAllDay(catering)).toBe(false)
    })

    it('reads the time without the seconds', () => {
        expect(timeLabel(catering)).toBe('19:00 to 23:00')
        expect(timeLabel({ starts_at: '11:00:00' })).toBe('11:00')
        expect(timeLabel(promotion)).toBe('All day')
    })
})

describe('the order they read in', () => {
    // The opposite way round to deliveries, and on purpose. A delivery with no
    // time is one nobody could place in the day, so it goes last. An all day
    // entry is not missing its time, it runs across the whole day, so it sits
    // above everything happening inside it.
    it('puts an all day entry above the timed ones', () => {
        const order = sortEntries([catering, promotion]).map(e => e.id)
        expect(order).toEqual(['p1', 'c1'])
    })

    it('puts the earlier time first', () => {
        const noon = { ...catering, id: 'noon', starts_at: '12:00:00' }
        expect(sortEntries([catering, noon]).map(e => e.id)).toEqual(['noon', 'c1'])
    })

    it('falls back to the name so the order does not wobble', () => {
        const a = { title: 'Alpha', starts_at: '12:00:00' }
        const b = { title: 'Beta', starts_at: '12:00:00' }
        expect(sortEntries([b, a]).map(e => e.title)).toEqual(['Alpha', 'Beta'])
    })

    it('does not change the list it was given', () => {
        const list = [catering, promotion]
        sortEntries(list)
        expect(list[0].id).toBe('c1')
    })
})

describe('what is on a day', () => {
    it('takes the ones covering it, in order', () => {
        expect(onDate([catering, promotion], '2026-10-16').map(e => e.id)).toEqual(['p1', 'c1'])
    })

    it('takes only the promotion on a day the catering is not on', () => {
        expect(onDate([catering, promotion], '2026-10-13').map(e => e.id)).toEqual(['p1'])
    })

    it('is empty on a day with nothing', () => {
        expect(onDate([catering, promotion], '2026-11-01')).toEqual([])
    })
})

describe('spreading one entry over the days it covers', () => {
    it('gives every day between, both ends included', () => {
        expect(datesBetween('2026-10-12', '2026-10-14'))
            .toEqual(['2026-10-12', '2026-10-13', '2026-10-14'])
    })

    it('gives one day when there is no end', () => {
        expect(datesBetween('2026-10-12', null)).toEqual(['2026-10-12'])
    })

    // A backwards pair should not be able to run the loop to its guard.
    it('gives one day when the end is before the start', () => {
        expect(datesBetween('2026-10-12', '2026-10-01')).toEqual(['2026-10-12'])
    })

    it('gives nothing at all with no start', () => {
        expect(datesBetween(null, '2026-10-14')).toEqual([])
    })

    it('puts a promotion under every day it runs', () => {
        const map = entriesByDate([promotion, catering])
        expect(Object.keys(map).sort()).toEqual([
            '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
        ])
        expect(map['2026-10-16'].map(e => e.id)).toEqual(['p1', 'c1'])
        expect(map['2026-10-13'].map(e => e.id)).toEqual(['p1'])
    })
})

describe('a band across a week', () => {
    // Monday to Sunday, the week the promotion sits inside.
    const week = [
        '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
        '2026-10-16', '2026-10-17', '2026-10-18',
    ]

    it('starts where it starts and covers what it covers', () => {
        const [band] = bandsForWeek([promotion], week)
        expect(band.start).toBe(0)
        expect(band.span).toBe(5)
        expect(band.runsIn).toBe(false)
        expect(band.runsOn).toBe(false)
    })

    // The one that went wrong first: a promotion that began before this week
    // has to draw from the left edge rather than fall off it.
    it('clamps one that began before the week', () => {
        const earlier = { ...promotion, starts_on: '2026-10-08', ends_on: '2026-10-14' }
        const [band] = bandsForWeek([earlier], week)
        expect(band.start).toBe(0)
        expect(band.span).toBe(3)
        expect(band.runsIn).toBe(true)
    })

    it('clamps one that carries on past the week', () => {
        const later = { ...promotion, starts_on: '2026-10-15', ends_on: '2026-10-25' }
        const [band] = bandsForWeek([later], week)
        expect(band.start).toBe(3)
        expect(band.span).toBe(4)
        expect(band.runsOn).toBe(true)
    })

    it('covers the whole week when it swallows it', () => {
        const long = { ...promotion, starts_on: '2026-09-01', ends_on: '2026-12-01' }
        const [band] = bandsForWeek([long], week)
        expect(band).toMatchObject({ start: 0, span: 7, runsIn: true, runsOn: true })
    })

    it('leaves out one that misses the week entirely', () => {
        const away = { ...promotion, starts_on: '2026-11-01', ends_on: '2026-11-08' }
        expect(bandsForWeek([away], week)).toEqual([])
    })

    // A band one column wide reads as a different kind of thing to the chip
    // beside it, for no reason. One day entries are chips in their own cell.
    it('leaves out anything that only runs one day', () => {
        expect(bandsForWeek([catering], week)).toEqual([])
    })

    it('puts the longest first, so the widest is read first', () => {
        const short = { ...promotion, id: 'short', starts_on: '2026-10-14', ends_on: '2026-10-15' }
        const order = bandsForWeek([short, promotion], week).map(b => b.entry.id)
        expect(order).toEqual(['p1', 'short'])
    })

    it('copes with no week at all', () => {
        expect(bandsForWeek([promotion], [])).toEqual([])
        expect(bandsForWeek([promotion], undefined)).toEqual([])
    })
})

describe('what reaches the roster', () => {
    it('lets a catering job through', () => {
        expect(showsOnRoster(catering)).toBe(true)
    })

    // The form says nobody else sees it. The roster is where the staff read the
    // week, so a private entry appearing there would break the only promise the
    // form makes.
    it('never lets a private one through', () => {
        expect(showsOnRoster({ ...catering, scope: 'private' })).toBe(false)
    })

    // Worth keeping, because a job that was cancelled is not the same as one
    // that never existed. It just does not need anybody on any more.
    it('drops a cancelled one', () => {
        expect(showsOnRoster({ ...catering, status: 'cancelled' })).toBe(false)
    })

    it('lets a meeting through, because guessing where it is would be worse', () => {
        expect(showsOnRoster({ ...catering, kind: 'meeting', location: 'Head office' })).toBe(true)
    })

    it('says no to nothing at all', () => {
        expect(showsOnRoster(null)).toBe(false)
    })
})

describe('what is wrong with it before it is saved', () => {
    const good = {
        title: 'Trinity dept lunch',
        kind: 'catering',
        starts_on: '2026-10-08',
        starts_at: '12:00',
        mode: 'sites',
        restaurantIds: ['pc'],
    }

    it('says nothing when it is fine', () => {
        expect(entryProblem(good)).toBe('')
    })

    it('wants a name', () => {
        expect(entryProblem({ ...good, title: '   ' })).toBe('It needs a name.')
    })

    it('wants a date', () => {
        expect(entryProblem({ ...good, starts_on: '' })).toBe('It needs a date.')
    })

    it('wants a kind it knows', () => {
        expect(entryProblem({ ...good, kind: 'party' })).toContain('what kind')
    })

    it('refuses a run that finishes before it starts', () => {
        expect(entryProblem({ ...good, ends_on: '2026-10-01' })).toContain('finish before it starts')
    })

    it('refuses a finishing time with no starting time', () => {
        expect(entryProblem({ ...good, starts_at: '', ends_at: '15:00' }))
            .toContain('no starting time')
    })

    // The one that catches a real mistake: 19:00 to 09:00 on one day is either
    // a typo or a job running past midnight, and the second needs a date on it.
    it('refuses a finishing time before the starting one on the same day', () => {
        expect(entryProblem({ ...good, starts_at: '19:00', ends_at: '09:00' }))
            .toContain('past midnight')
    })

    it('allows it when a finishing date says it runs overnight', () => {
        expect(entryProblem({ ...good, starts_at: '19:00', ends_at: '02:00', ends_on: '2026-10-09' }))
            .toBe('')
    })

    it('wants to know which restaurant, when that is the answer given', () => {
        expect(entryProblem({ ...good, restaurantIds: [] })).toContain('which restaurant')
    })

    // All sites and Just me do not need one, which is the whole point of them
    // being separate answers rather than shortcuts for ticking everything.
    it('does not ask which restaurant for the group or for a private one', () => {
        expect(entryProblem({ ...good, mode: 'all_sites', restaurantIds: [] })).toBe('')
        expect(entryProblem({ ...good, mode: 'private', restaurantIds: [] })).toBe('')
    })

    it('does not throw on nothing at all', () => {
        expect(entryProblem(undefined)).toBe('It needs a name.')
    })
})

describe('one screen out of three sources', () => {
    // Already decided by lib/nearby: which place, how near, and whether
    // anybody has checked it. calendarItems only spreads it over its days.
    const arena = [{
        kind: 'arena',
        place: { id: 'p1', name: '3Arena' },
        checked: true,
        event: { id: 'a1', name: 'Fontaines D.C.', event_date: '2026-10-16', event_time: '18:30:00' },
    }]
    const dayNotes = [{
        note_date: '2026-10-16',
        extras: [{ name: 'Feedr', time: '12:00' }, { name: 'Somebody', time: '' }],
    }]

    const items = () => calendarItems({
        entries: [catering, promotion], nearby: arena, dayNotes,
    })

    it('turns a diary entry into an item on every day it covers', () => {
        const mine = items().filter(i => i.entry?.id === 'p1')
        expect(mine).toHaveLength(5)
        expect(mine[0].source).toBe('diary')
        expect(mine[0].allDay).toBe(true)
    })

    it('brings what is on next door in', () => {
        const one = items().find(i => i.source === 'nearby')
        expect(one).toMatchObject({
            title: 'Fontaines D.C.', date: '2026-10-16', time: '18:30', kind: 'arena',
        })
        expect(one.place.name).toBe('3Arena')
    })

    // A Christmas market over three weekends is one row, and drawing it on the
    // first day only would be a lie about it.
    it('spreads a run of days the way a diary entry is spread', () => {
        const market = calendarItems({
            nearby: [{
                kind: 'nearby',
                event: {
                    id: 'm1', name: 'Christmas market',
                    event_date: '2026-11-29', ends_on: '2026-12-02',
                },
            }],
        })
        expect(market.map(i => i.date))
            .toEqual(['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02'])
    })

    it('carries whether anybody has checked it', () => {
        const found = calendarItems({
            nearby: [{ kind: 'nearby', checked: false, event: { id: 'f1', name: 'Quiz', event_date: '2026-10-16' } }],
        })
        expect(found[0].checked).toBe(false)
    })

    // The whole reason this exists. A screen built to answer what is coming up
    // that leaves out half of what is coming up is a screen you cannot trust.
    it('reads the deliveries without moving them', () => {
        const feedr = items().find(i => i.title === 'Feedr')
        expect(feedr).toMatchObject({ source: 'delivery', date: '2026-10-16', time: '12:00' })
    })

    it('keeps a delivery nobody put a time on', () => {
        expect(items().find(i => i.title === 'Somebody')).toBeTruthy()
    })

    it('leaves out days outside the range it was asked for', () => {
        const short = calendarItems({
            entries: [promotion], from: '2026-10-14', to: '2026-10-15',
        })
        expect(short.map(i => i.date)).toEqual(['2026-10-14', '2026-10-15'])
    })

    it('copes with nothing at all', () => {
        expect(calendarItems({})).toEqual([])
    })
})

describe('which switch turns an item off', () => {
    // Three of them rather than one, because what somebody switches off is a
    // kind of noise rather than a source: watching the Arena and not wanting
    // the city ones is an ordinary thing to want, and both arrive the same way.
    it('sends a nearby listing to its own kind and the deliveries to theirs', () => {
        expect(layerOf({ source: 'nearby', kind: 'arena' })).toBe('arena')
        expect(layerOf({ source: 'nearby', kind: 'nearby' })).toBe('nearby')
        expect(layerOf({ source: 'nearby', kind: 'city' })).toBe('city')
        expect(layerOf({ source: 'delivery' })).toBe('delivery')
    })

    it('sends a diary entry to its kind', () => {
        expect(layerOf({ source: 'diary', kind: 'catering', scope: 'sites' })).toBe('catering')
    })

    // Hiding what is only yours should be one press and should not also hide
    // the catering, so private answers to its own layer rather than its kind.
    it('sends a private one to the private layer whatever kind it is', () => {
        expect(layerOf({ source: 'diary', kind: 'catering', scope: 'private' })).toBe('private')
    })

    it('has a layer for every kind and then some', () => {
        for (const kind of KINDS) expect(LAYERS).toContain(kind)
        expect(LAYERS).toContain('arena')
        expect(LAYERS).toContain('nearby')
        expect(LAYERS).toContain('city')
        expect(LAYERS).toContain('delivery')
        expect(LAYERS).toContain('private')
    })
})

describe('what a day holds, in order', () => {
    const day = '2026-10-16'
    const built = () => calendarItems({
        entries: [catering, promotion],
        nearby: [{
            kind: 'arena',
            event: { id: 'a1', name: 'Fontaines D.C.', event_date: day, event_time: '18:30:00' },
        }],
        dayNotes: [{ note_date: day, extras: [{ name: 'Feedr', time: '12:00' }, { name: 'Late one', time: '' }] }],
    })

    it('puts the all day one first and then the times in order', () => {
        const titles = itemsByDate(built())[day].map(i => i.title)
        expect(titles).toEqual(['15% off wraps', 'Fontaines D.C.', 'Blanchardstown 40th', 'Feedr', 'Late one'])
    })

    // Feedr at noon is earlier than the catering at seven and still comes
    // after it. The corporate orders are the standing arrangement, so putting
    // them above a catering job buries the thing that makes the day different.
    it('puts the corporate orders last, whatever time they are at', () => {
        const order = itemsByDate(built())[day]
        const corporate = order.findIndex(i => i.title === 'Feedr')
        const catering = order.findIndex(i => i.title === 'Blanchardstown 40th')
        expect(corporate).toBeGreaterThan(catering)
    })

    // A delivery with no time is the one thing that cannot be placed in the
    // day's order, which is why it goes last rather than first.
    it('puts something with no time at all at the end', () => {
        expect(itemsByDate(built())[day].at(-1).title).toBe('Late one')
    })

    it('leaves out a layer that is switched off', () => {
        const titles = itemsByDate(built(), ['catering', 'promotion'])[day].map(i => i.title)
        expect(titles).toEqual(['15% off wraps', 'Blanchardstown 40th'])
    })

    it('shows everything when it is not told which layers', () => {
        expect(itemsByDate(built())[day]).toHaveLength(5)
    })
})

describe('what an entry is for', () => {
    it('trims and drops the empty ones', () => {
        expect(cleanLabels([' Students ', '', '   ', 'Corporate'])).toEqual(['Students', 'Corporate'])
    })

    // Students and students are one label. The one somebody typed first is the
    // one that shows, so the form does not quietly restyle what they wrote.
    it('never carries the same word twice, whatever the case', () => {
        expect(cleanLabels(['Students', 'students', 'STUDENTS'])).toEqual(['Students'])
    })

    it('keeps the order they were given in', () => {
        expect(cleanLabels(['Corporate', 'Students'])).toEqual(['Corporate', 'Students'])
    })

    it('copes with nothing at all', () => {
        expect(cleanLabels(null)).toEqual([])
        expect(cleanLabels([null, undefined, 3])).toEqual(['3'])
    })

    // Read off the entries rather than a list somebody maintains, so there is
    // nothing to keep in step and no settings screen to forget.
    it('offers back whatever has been used before, once each', () => {
        const entries = [
            { labels: ['Students', 'Lunch'] },
            { labels: ['students'] },
            { labels: [] },
            {},
        ]
        expect(labelsUsed(entries)).toEqual(['Lunch', 'Students'])
    })

    // A list of chips somebody scans should not reshuffle itself every time an
    // entry is added.
    it('puts them in an order that does not move', () => {
        expect(labelsUsed([{ labels: ['Zoe'] }, { labels: ['Alpha'] }])).toEqual(['Alpha', 'Zoe'])
    })

    it('reads them off one entry too', () => {
        expect(labelsOf({ labels: [' Students ', 'Students'] })).toEqual(['Students'])
        expect(labelsOf({})).toEqual([])
        expect(labelsOf(null)).toEqual([])
    })
})

// The one the database cannot answer.
//
// The policy says whether you may read an entry. Which restaurant you are
// looking at is the switcher, which is the app's own idea, so a super admin who
// may read every site's entries was shown Point Campus catering on the Dun
// Laoghaire roster. Nothing leaked and it was still wrong.
describe('whether an entry belongs to the restaurant you are looking at', () => {
    it('keeps one marked for that restaurant', () => {
        expect(atRestaurant(catering, 'pc')).toBe(true)
    })

    it('drops one marked for the other', () => {
        expect(atRestaurant(catering, 'dl')).toBe(false)
    })

    // The reason a restaurant_id clause on the query would have been the wrong
    // fix. A group wide promotion carries no restaurant at all.
    it('keeps a group wide one everywhere', () => {
        const everywhere = { ...promotion, scope: 'all_sites', restaurant_ids: [] }
        expect(atRestaurant(everywhere, 'pc')).toBe(true)
        expect(atRestaurant(everywhere, 'dl')).toBe(true)
    })

    // It carries no restaurant, the policy already limits it to whoever wrote
    // it, and a note to yourself does not stop being yours because you switched
    // shop.
    it('keeps a private one wherever you are', () => {
        const mine = { ...catering, scope: 'private', restaurant_ids: [] }
        expect(atRestaurant(mine, 'dl')).toBe(true)
    })

    it('keeps one marked for both', () => {
        expect(atRestaurant({ ...catering, restaurant_ids: ['pc', 'dl'] }, 'dl')).toBe(true)
    })

    // A sites entry with an empty list is refused by a CHECK on the table, so
    // this is about not throwing rather than about a row anybody will see.
    it('drops a site entry naming nowhere, and copes with nothing at all', () => {
        expect(atRestaurant({ ...catering, restaurant_ids: [] }, 'pc')).toBe(false)
        expect(atRestaurant({ ...catering, restaurant_ids: null }, 'pc')).toBe(false)
        expect(atRestaurant(null, 'pc')).toBe(false)
    })
})
