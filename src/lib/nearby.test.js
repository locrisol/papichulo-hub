import { describe, it, expect } from 'vitest'
import {
    CITY_CAPACITY,
    WALKABLE_MINUTES,
    onRoster,
    notChecked,
    dismissed,
    watching,
    placeIds,
    byPlace,
    kindOf,
    lastDay,
    coversDate,
    nearbyRows,
    rowsOn,
    waiting,
    placeName,
    chipWords,
    elsewhere,
    walkWords,
    hostOf,
    sourceWords,
    placeTag,
    whenWords,
    agoWords,
    foundWords,
    readWords,
    distanceKm,
    walkMinutesFor,
    suggest,
    pastWalking,
    sourceKeyFor,
} from '@/lib/nearby'

const arena = { id: 'p1', name: '3Arena', short_name: '3Arena', ticketmaster_venue_id: 'KovZ9177WYV' }
const odeon = { id: 'p2', name: 'Odeon Point Square', short_name: 'Odeon', page_url: 'https://www.pointsquare.ie/movie' }
const aviva = { id: 'p3', name: 'Aviva Stadium', ticketmaster_venue_id: 'KovZ917A7d0', capacity: 51700 }
const park = { id: 'p4', name: "People's Park" }

const pairs = [
    { place: arena, relation: 'walk', walk_minutes: 2, is_active: true },
    { place: odeon, relation: 'walk', walk_minutes: 1, is_active: true },
    { place: aviva, relation: 'city', distance_km: 2.8, is_active: true },
    { place: park, relation: 'walk', walk_minutes: 10, is_active: false },
]

const gig = {
    id: 'e1', place_id: 'p1', name: 'Kings of Leon', event_date: '2026-11-19',
    event_time: '18:30:00', source: 'ticketmaster', review: 'trusted',
}
const film = {
    id: 'e2', place_id: 'p2', name: 'Wicked: For Good opens', event_date: '2026-11-19',
    event_time: '17:00:00', source: 'page', review: 'found',
    source_url: 'https://www.pointsquare.ie/movie', found_at: '2026-11-17T09:00:00+00:00',
}
const match = {
    id: 'e3', place_id: 'p3', name: 'Ireland v France', event_date: '2026-11-21',
    event_time: '17:00:00', source: 'ticketmaster', review: 'trusted',
}

describe('what counts as being watched', () => {
    it('leaves out a place that is switched off', () => {
        expect(placeIds(watching(pairs, {}))).toEqual(['p1', 'p2', 'p3'])
    })

    // A restaurant nowhere near a city gets nothing but noise out of the rule,
    // which is the whole reason it is a switch.
    it('drops the city ones when the restaurant has the rule off', () => {
        expect(placeIds(watching(pairs, { watch_city_events: false }))).toEqual(['p1', 'p2'])
    })

    it('keeps the city ones when nothing has been said either way', () => {
        expect(placeIds(watching(pairs, undefined))).toContain('p3')
    })

    it('ignores a pairing with no place on it', () => {
        expect(watching([{ relation: 'walk', walk_minutes: 4 }], {})).toEqual([])
    })

    it('maps places by id', () => {
        expect(byPlace(pairs).get('p2').walk_minutes).toBe(1)
    })
})

describe('what one listing is to us', () => {
    // Somebody sold a ticket for it, somebody read it off a page, or it is
    // across town. That is the whole rule.
    it('calls a ticketed one within walking distance an arena listing', () => {
        expect(kindOf(gig, pairs[0])).toBe('arena')
    })

    it('calls a reading off a page a nearby one', () => {
        expect(kindOf(film, pairs[1])).toBe('nearby')
    })

    // A match at the Aviva is sold through Ticketmaster exactly like a concert
    // at the Arena, and drawing them the same way would say the same thing
    // about both when one of them is two minutes away.
    it('lets across town beat the feed', () => {
        expect(kindOf(match, pairs[2])).toBe('city')
    })

    it('says nothing at all about a place we are not near', () => {
        expect(kindOf(gig, undefined)).toBe('')
    })
})

describe('the review gate', () => {
    it('lets a feed and a kept reading onto the roster', () => {
        expect(onRoster({ review: 'trusted' })).toBe(true)
        expect(onRoster({ review: 'kept' })).toBe(true)
    })

    it('keeps an unchecked reading off it', () => {
        expect(onRoster({ review: 'found' })).toBe(false)
        expect(notChecked({ review: 'found' })).toBe(true)
    })

    it('knows a dismissal', () => {
        expect(dismissed({ review: 'dismissed' })).toBe(true)
    })
})

describe('nearbyRows', () => {
    const events = [gig, film, match]

    it('carries the place and what it is to us', () => {
        const rows = nearbyRows(events, pairs, {})
        expect(rows.map(r => r.kind)).toEqual(['arena', 'nearby', 'city'])
        expect(rows[1].place.name).toBe('Odeon Point Square')
        expect(rows[0].time).toBe('18:30')
    })

    // Marked rather than held back. Hiding an unchecked reading from the
    // roster until somebody opens the Calendar recreates the exact problem
    // this was built for: a manager not hearing about the film across the road.
    it('shows an unchecked reading everywhere, marked', () => {
        expect(nearbyRows(events, pairs, {}).map(r => r.event.id))
            .toEqual(['e1', 'e2', 'e3'])
        expect(nearbyRows(events, pairs, {}).map(r => r.checked))
            .toEqual([true, false, true])
    })

    it('never shows a dismissed one anywhere', () => {
        const no = [{ ...film, review: 'dismissed' }]
        expect(nearbyRows(no, pairs, {})).toEqual([])
    })

    it('drops a listing at a place this restaurant is not near', () => {
        expect(nearbyRows([{ ...gig, place_id: 'nope' }], pairs, {})).toEqual([])
    })

    it('marks whether it has been checked', () => {
        const rows = nearbyRows(events, pairs, {})
        expect(rows.map(r => r.checked)).toEqual([true, false, true])
    })
})

describe('dates', () => {
    const market = { event_date: '2026-11-29', ends_on: '2026-12-14', name: 'Christmas market' }

    it('covers every day of a run', () => {
        expect(coversDate(market, '2026-11-29')).toBe(true)
        expect(coversDate(market, '2026-12-07')).toBe(true)
        expect(coversDate(market, '2026-12-14')).toBe(true)
        expect(coversDate(market, '2026-12-15')).toBe(false)
    })

    it('treats one with no end as one day', () => {
        expect(lastDay(gig)).toBe('2026-11-19')
        expect(coversDate(gig, '2026-11-20')).toBe(false)
    })

    it('picks the rows on a day', () => {
        const rows = nearbyRows([gig, film, match], pairs, {})
        expect(rowsOn(rows, '2026-11-19').map(r => r.event.id)).toEqual(['e1', 'e2'])
        expect(rowsOn(rows, '2026-11-21').map(r => r.event.id)).toEqual(['e3'])
    })
})

describe('waiting', () => {
    const rows = nearbyRows([gig, film, match], pairs, {})

    it('offers only what nobody has checked', () => {
        expect(waiting(rows, '2026-11-01').map(r => r.event.id)).toEqual(['e2'])
    })

    // A reading of something that has already happened is not a decision
    // anybody needs to make, and offering it is how a list stops being opened.
    it('drops one that is already over', () => {
        expect(waiting(rows, '2026-11-20')).toEqual([])
    })

    it('keeps one that is still running', () => {
        const market = nearbyRows(
            [{ ...film, id: 'e9', event_date: '2026-11-10', ends_on: '2026-11-30' }], pairs, {},
        )
        expect(waiting(market, '2026-11-20').map(r => r.event.id)).toEqual(['e9'])
    })
})

describe('the words on a chip', () => {
    const rows = nearbyRows([gig, film], pairs, {})

    it('puts the name first and the place after it', () => {
        expect(chipWords(rows[0])).toBe('Kings of Leon, 3Arena')
    })

    it('uses the short name where a cell is narrow', () => {
        expect(chipWords(rows[1], { short: true })).toBe('Wicked: For Good opens, Odeon')
        expect(chipWords(rows[1])).toBe('Wicked: For Good opens, Odeon Point Square')
    })

    // "Dun Laoghaire Summer Festival, Dun Laoghaire Rathdown County Council"
    // says one thing twice.
    it('leaves the place off when the name already carries it', () => {
        const row = { event: { name: 'Pavilion Theatre open day' }, place: { name: 'Pavilion Theatre' } }
        expect(chipWords(row)).toBe('Pavilion Theatre open day')
    })

    it('falls back to the name when there is no short one', () => {
        expect(placeName(park, { short: true })).toBe("People's Park")
    })
})

// Found by running the reader for real on 20 September. The county council's
// own listings page carries the LexIcon five minutes away and a library in
// Dundrum ten kilometres away in the same list, and both arrived under one
// walking time that was right for one of them.
describe('a listing that is somewhere else entirely', () => {
    const council = {
        id: 'p9', name: 'Dun Laoghaire Rathdown County Council', short_name: 'dlr Council',
        page_url: 'https://www.dlrcoco.ie/dlr-events',
    }
    const pairing = { place: council, relation: 'walk', walk_minutes: 5, is_active: true }
    const rowFor = venue => nearbyRows(
        [{
            id: 'x1', place_id: 'p9', name: 'Arts & Crafts Evening', event_date: '2026-10-15',
            source: 'page', review: 'found', venue,
        }],
        [pairing],
        {},
    )[0]

    it('says where the page said, not where the page belongs', () => {
        expect(elsewhere(rowFor('Dundrum Library'))).toBe('Dundrum Library')
        expect(chipWords(rowFor('Dundrum Library'), { short: true }))
            .toBe('Arts & Crafts Evening, Dundrum Library')
    })

    // The walking time belongs to the place. Saying the council's five minutes
    // against a thing in Dundrum is not a rounding error, it is wrong.
    it('drops the walking time when it is not the place we measured', () => {
        expect(foundWords(rowFor('Dundrum Library'), '2026-10-01'))
            .toBe('Thu 15 Oct · Dundrum Library · read from dlrcoco.ie')
    })

    it('keeps the place and the walk when the listing is at the place', () => {
        expect(elsewhere(rowFor('dlr LexIcon'))).toBe('dlr LexIcon')
        expect(foundWords(rowFor(null), '2026-10-01'))
            .toBe('Thu 15 Oct · Dun Laoghaire Rathdown County Council, 5 min · read from dlrcoco.ie')
    })

    // A feed calls it "The Convention Centre Dublin" and our own row calls it
    // "Convention Centre Dublin". One place, not two.
    it('treats a longer or shorter way of saying the same place as the same', () => {
        const ccd = { id: 'p8', name: 'Convention Centre Dublin' }
        const row = { place: ccd, event: { venue: 'The Convention Centre Dublin' } }
        expect(elsewhere(row)).toBe('')
    })

    it('says nothing when the page named no venue', () => {
        expect(elsewhere({ place: council, event: {} })).toBe('')
        expect(elsewhere(null)).toBe('')
    })
})

describe('walkWords', () => {
    it('says minute for one and minutes for the rest', () => {
        expect(walkWords(1)).toBe('1 minute')
        expect(walkWords(12)).toBe('12 minutes')
    })

    it('has a short form for a crowded line', () => {
        expect(walkWords(1, { short: true })).toBe('1 min')
    })

    it('says nothing when nobody has said', () => {
        expect(walkWords(null)).toBe('')
        expect(walkWords(0)).toBe('')
    })
})

describe('where the listings come from', () => {
    it('reads a host the way somebody would say it', () => {
        expect(hostOf('https://www.pointsquare.ie/movie')).toBe('pointsquare.ie')
        expect(hostOf('http://dlrcoco.ie/dlr-events?page=2')).toBe('dlrcoco.ie')
        expect(hostOf(null)).toBe('')
    })

    it('says which of the two, or both', () => {
        expect(sourceWords(arena)).toBe('Ticketmaster, six months ahead')
        expect(sourceWords(odeon)).toBe('pointsquare.ie, read weekly')
        expect(sourceWords({ ...arena, page_url: 'https://theccd.ie/whats-on' }))
            .toBe('Ticketmaster and theccd.ie')
    })

    // The most common answer, and the honest one. A harbour and a park both
    // hold things and neither publishes anything we can read.
    it('says nothing is set up when nothing is', () => {
        expect(sourceWords(park)).toBe('nothing set up')
    })
})

describe('placeTag', () => {
    it('only a feed earns automatic', () => {
        expect(placeTag(arena, pairs[0]).text).toBe('Automatic')
    })

    it('anything read off a page waits for a person', () => {
        expect(placeTag(odeon, pairs[1]).text).toBe('Needs checking')
        expect(placeTag({ ...arena, page_url: 'https://theccd.ie' }, pairs[0]).text)
            .toBe('Needs checking')
    })

    it('says off before it says anything else', () => {
        expect(placeTag(arena, { is_active: false }).text).toBe('Off')
    })

    it('says so when there is nothing behind it', () => {
        expect(placeTag(park, { ...pairs[3], is_active: true }).text).toBe('Nothing set up')
    })
})

describe('when it is, in words', () => {
    it('gives the day and the time', () => {
        expect(whenWords(gig)).toBe('Thu 19 Nov, 18:30')
    })

    it('gives both ends of a run', () => {
        expect(whenWords({ event_date: '2026-11-29', ends_on: '2026-12-14' }))
            .toBe('Sun 29 Nov to Mon 14 Dec')
    })

    it('leaves the time off when there is none', () => {
        expect(whenWords({ event_date: '2026-11-19' })).toBe('Thu 19 Nov')
    })
})

describe('how long ago', () => {
    it('names today and yesterday and dates the rest', () => {
        expect(agoWords('2026-11-19T09:00:00', '2026-11-19')).toBe('today')
        expect(agoWords('2026-11-18T09:00:00', '2026-11-19')).toBe('yesterday')
        expect(agoWords('2026-11-08T09:00:00', '2026-11-19')).toBe('on 8 Nov')
    })

    it('says nothing when there is no stamp', () => {
        expect(agoWords(null, '2026-11-19')).toBe('')
    })
})

describe('the line under a finding', () => {
    // When it is, where it is and how far, then where the reading came from and
    // when. The last part is the difference between a fact and a reading.
    it('says all three', () => {
        const row = nearbyRows([film], pairs, {})[0]
        expect(foundWords(row, '2026-11-18'))
            .toBe('Thu 19 Nov, 17:00 · Odeon Point Square, 1 min · read from pointsquare.ie yesterday')
    })

    it('falls back to the place page when the row carries no address', () => {
        const row = nearbyRows([{ ...film, source_url: null }], pairs, {})[0]
        expect(foundWords(row, '2026-11-18')).toContain('read from pointsquare.ie')
    })
})

describe('when a page was last read', () => {
    // A page that changes its layout goes quiet rather than going wrong, and a
    // run of zeroes is the only way anybody would notice.
    it('says the count, and says nothing found out loud', () => {
        expect(readWords({ ...odeon, last_read_at: '2026-11-18T06:00:00', last_read_count: 4 }, '2026-11-19'))
            .toBe('read yesterday, 4 found')
        expect(readWords({ ...odeon, last_read_at: '2026-11-18T06:00:00', last_read_count: 0 }, '2026-11-19'))
            .toBe('read yesterday, nothing found')
    })

    it('says never read before it has been', () => {
        expect(readWords(odeon, '2026-11-19')).toBe('never read')
    })

    it('says nothing about a place with no page', () => {
        expect(readWords(arena, '2026-11-19')).toBe('')
    })
})

describe('finding the next restaurant its places', () => {
    // The Convention Centre from Papi Chulo Point Campus. Measured off the
    // two published points rather than guessed, and it is about a kilometre.
    it('measures a straight line in kilometres', () => {
        const from = { latitude: 53.3478, longitude: -6.2285 }
        const to = { latitude: 53.3478, longitude: -6.2285 }
        expect(distanceKm(from, to)).toBe(0)
        expect(distanceKm(from, { latitude: 53.3478, longitude: -6.2585 })).toBeCloseTo(2, 0)
    })

    // Number(null) is 0, so a place with no latitude used to be measured
    // against a point off the coast of Africa.
    it('says nothing when a point is missing', () => {
        expect(distanceKm({ latitude: 53.3 }, { latitude: 53.4, longitude: -6.2 })).toBe(null)
        expect(distanceKm({ latitude: 53.3, longitude: null }, { latitude: 53.4, longitude: -6.2 })).toBe(null)
    })

    // Five kilometres an hour is the number every planner uses, so a kilometre
    // is twelve minutes. Rounded up, because nobody arrives early on account
    // of rounding.
    it('turns a distance into minutes on foot', () => {
        expect(walkMinutesFor(1)).toBe(12)
        expect(walkMinutesFor(0.1)).toBe(2)
        expect(walkMinutesFor(0)).toBe(1)
    })

    // Number(null) is 0, so a walk nobody has measured used to come back as one
    // minute, which reads as next door.
    it('says nothing rather than one minute when nobody has measured', () => {
        expect(walkMinutesFor(null)).toBe(null)
        expect(walkMinutesFor('')).toBe(null)
        expect(walkMinutesFor(undefined)).toBe(null)
    })

    it('offers a walk when it is one', () => {
        expect(suggest(1, null)).toEqual({ relation: 'walk', walkMinutes: 12 })
    })

    it('offers the city rule to something big and close enough', () => {
        expect(suggest(2.8, CITY_CAPACITY)).toEqual({ relation: 'city', walkMinutes: null })
    })

    it('offers nothing for something big and far away', () => {
        expect(suggest(9, 82300)).toBe(null)
    })

    it('offers nothing for something small and past walking', () => {
        expect(suggest(4, 900)).toBe(null)
        expect(walkMinutesFor(4)).toBeGreaterThan(WALKABLE_MINUTES)
    })

    it('says why it is not being offered', () => {
        expect(pastWalking(1, null)).toBe('')
        expect(pastWalking(4, 900)).toBe('48 minutes, past walking')
        expect(pastWalking(9, 82300)).toBe('108 minutes, big enough for the city rule')
    })
})

describe('sourceKeyFor', () => {
    // Only a feed hands out an id. Without a key of its own, every weekly read
    // would make a second copy and a dismissal would be forgotten by Monday.
    it('is the same for the same reading twice', () => {
        expect(sourceKeyFor('2026-11-19', 'Wicked: For Good opens'))
            .toBe(sourceKeyFor('2026-11-19', 'Wicked:  For Good  opens '))
    })

    it('flattens accents and punctuation', () => {
        expect(sourceKeyFor('2026-07-04', 'Dún Laoghaire Coastival'))
            .toBe('2026-07-04-dun-laoghaire-coastival')
    })

    it('is different on a different day', () => {
        expect(sourceKeyFor('2026-11-19', 'Quiz night'))
            .not.toBe(sourceKeyFor('2026-11-26', 'Quiz night'))
    })

    it('gives nothing back for a nameless row', () => {
        expect(sourceKeyFor('2026-11-19', '  ')).toBe('')
    })
})
