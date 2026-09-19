import { describe, it, expect } from 'vitest'
import {
    escapeHtml, fmtDate, whenWords, dayCount, isPartDay,
    kindWords, kindTitle, hoursWords, noticeWords,
    requestEmail, answerEmail,
    swapHalves, halfWords, swapAskEmail, swapAnswerEmail, swapDeskEmail, swapDecisionEmail,
    deliverable, isJustTheGoodbye, replyToFor,
} from '../../supabase/functions/roster-email/email'

// The words in the emails. It lives in the function's own folder because only
// what is inside that folder gets deployed with it, and it is tested from here
// because this is where the test run looks, the same as ics.js.

const NOW = '2026-09-04T10:12:00Z'

const holiday = (extra = {}) => ({
    id: 'a1', kind: 'holiday',
    starts_on: '2026-10-12', ends_on: '2026-10-19',
    status: 'requested', created_at: NOW, ...extra,
})

const shift = (date, starts, ends) => ({ shift_date: date, starts_at: starts, ends_at: ends })

describe('the small words', () => {
    it('shuts anything typed by a person out of the HTML', () => {
        // A note is free text and it goes in an email. Somebody typing angle
        // brackets should get angle brackets, not a broken layout.
        expect(escapeHtml('<b>Ana</b> & "co"'))
            .toBe('&lt;b&gt;Ana&lt;/b&gt; &amp; &quot;co&quot;')
    })

    it('reads a date the way somebody says it', () => {
        expect(fmtDate('2026-10-12')).toBe('Mon 12 Oct 2026')
    })

    it('says one date once and two as a stretch', () => {
        expect(whenWords(holiday({ ends_on: '2026-10-12' }))).toBe('Mon 12 Oct 2026')
        expect(whenWords(holiday())).toBe('Mon 12 Oct 2026 to Mon 19 Oct 2026')
    })

    it('counts both ends of the stretch', () => {
        expect(dayCount(holiday())).toBe(8)
        expect(dayCount(holiday({ ends_on: '2026-10-12' }))).toBe(1)
    })

    it('knows part of a day from the whole of it', () => {
        expect(isPartDay(holiday())).toBe(false)
        expect(isPartDay(holiday({ can_work_to: '15:00' }))).toBe(true)
        expect(kindWords(holiday({ kind: 'day_off', can_work_to: '15:00' }))).toBe('part of a day off')
        expect(kindTitle(holiday({ kind: 'day_off' }))).toBe('Day off')
        expect(hoursWords(holiday({ can_work_from: '15:00' }))).toBe('Can work from 15:00')
        expect(hoursWords(holiday({ can_work_from: '12:00', can_work_to: '16:00' })))
            .toBe('Can work 12:00 to 16:00')
    })

    it('says how far ahead it was asked, as a fact and not a telling off', () => {
        expect(noticeWords(holiday(), NOW)).toBe('Asked 38 days ahead')
        expect(noticeWords(holiday({ starts_on: '2026-09-05' }), NOW)).toBe('Asked 1 day ahead')
        expect(noticeWords(holiday({ starts_on: '2026-09-04' }), NOW)).toBe('Asked for today')
    })
})

describe('somebody asked', () => {
    const base = {
        absence: holiday({ note: 'Sister is getting married.' }),
        employeeName: 'Ana Ferreira',
        restaurantName: 'Point Campus',
        appUrl: 'https://example.test',
        now: NOW,
    }

    it('says who and what in the subject, so a phone shows it without opening', () => {
        expect(requestEmail({ ...base, clashes: [] }).subject)
            .toBe('Ana Ferreira asked for time off, Point Campus')
    })

    it('marks a manager asking, because only an owner can answer that one', () => {
        const mail = requestEmail({ ...base, clashes: [], askerIsManager: true })
        expect(mail.subject).toContain('(manager)')
        expect(mail.html).toContain('only an owner can answer it')
    })

    it('puts the shifts they are already on into both copies', () => {
        const mail = requestEmail({
            ...base,
            clashes: [shift('2026-10-13', '08:30:00', '15:00:00'), shift('2026-10-15', '08:30:00', '23:00:00')],
        })
        expect(mail.html).toContain('is rostered on 2 of these days')
        expect(mail.html).toContain('08:30 to 15:00')
        expect(mail.text).toContain('is rostered on 2 of these days')
    })

    it('says nothing about the roster when they are not on it', () => {
        const mail = requestEmail({ ...base, clashes: [] })
        expect(mail.html).not.toContain('rostered on')
        expect(mail.text).not.toContain('rostered on')
    })

    it('carries their note through escaped', () => {
        const mail = requestEmail({
            ...base,
            absence: holiday({ note: 'Dentist <at> 3' }),
            clashes: [],
        })
        expect(mail.html).toContain('Dentist &lt;at&gt; 3')
    })

    it('leaves the buttons out when nobody said where the app lives', () => {
        const mail = requestEmail({ ...base, appUrl: '', clashes: [] })
        expect(mail.html).not.toContain('<a href')
    })
})

describe('somebody answered', () => {
    const base = {
        employeeName: 'Ana Ferreira',
        restaurantName: 'Point Campus',
        answeredBy: 'Leandro Presti',
        appUrl: 'https://example.test',
    }

    it('says the answer and the dates in the subject', () => {
        expect(answerEmail({ ...base, absence: holiday({ status: 'approved' }), freedCount: 0 }).subject)
            .toBe('Your holiday was approved, Mon 12 Oct 2026 to Mon 19 Oct 2026')
        expect(answerEmail({ ...base, absence: holiday({ status: 'declined' }), freedCount: 0 }).subject)
            .toBe('Your holiday was not approved, Mon 12 Oct 2026 to Mon 19 Oct 2026')
    })

    it('says what came off the roster, and only when something did', () => {
        expect(answerEmail({ ...base, absence: holiday({ status: 'approved' }), freedCount: 3 }).text)
            .toContain('3 shifts have been taken off your roster')
        expect(answerEmail({ ...base, absence: holiday({ status: 'approved' }), freedCount: 1 }).text)
            .toContain('1 shift has been taken off your roster')
        expect(answerEmail({ ...base, absence: holiday({ status: 'approved' }), freedCount: 0 }).text)
            .not.toContain('taken off your roster')
    })

    it('never gives a reason', () => {
        // A reason belongs in a conversation. A sentence written by an app is
        // the wrong place to have one, and there is nowhere to type it anyway.
        const mail = answerEmail({ ...base, absence: holiday({ status: 'declined' }), freedCount: 0 })
        expect(mail.html).toContain('Have a word with your manager')
        expect(mail.text).not.toContain('because')
    })

    it('names the person who answered it', () => {
        expect(answerEmail({ ...base, absence: holiday({ status: 'approved' }), freedCount: 0 }).html)
            .toContain('Leandro Presti')
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

describe('replyToFor', () => {
    // The whole point: a reply reaches the restaurant, not the one account that
    // sends for everybody, and a new restaurant needs nothing but this field.
    it('sends replies to the restaurant', () => {
        expect(replyToFor('point@papichulo.ie')).toBe('point@papichulo.ie')
    })

    it('tidies what somebody typed into the form', () => {
        expect(replyToFor('  point@papichulo.ie  ')).toBe('point@papichulo.ie')
    })

    // The column is typed into a form. A Reply-To nobody can receive at is
    // worse than none: the client offers the reply and the person believes it
    // went somewhere.
    it('refuses something in the column that is not an address', () => {
        expect(replyToFor('Point Campus')).toBeUndefined()
        expect(replyToFor('point at papichulo dot ie')).toBeUndefined()
    })

    it('refuses an address that provably cannot receive', () => {
        expect(replyToFor('manager@papichulo.test')).toBeUndefined()
    })

    it('falls back to the secret when the restaurant has no address set', () => {
        expect(replyToFor(null, 'hub@papichulo.ie')).toBe('hub@papichulo.ie')
        expect(replyToFor('', 'hub@papichulo.ie')).toBe('hub@papichulo.ie')
    })

    // The restaurant wins. The secret exists to point every reply somewhere
    // else without a deploy, not to override a restaurant that has an address.
    it('prefers the restaurant over the secret', () => {
        expect(replyToFor('point@papichulo.ie', 'hub@papichulo.ie')).toBe('point@papichulo.ie')
    })

    it('falls through a bad restaurant address to the secret', () => {
        expect(replyToFor('not an address', 'hub@papichulo.ie')).toBe('hub@papichulo.ie')
    })

    // No Reply-To at all is a fine answer. The mail still goes.
    it('gives nothing when there is nothing worth giving', () => {
        expect(replyToFor(null, null)).toBeUndefined()
        expect(replyToFor(undefined, undefined)).toBeUndefined()
        expect(replyToFor('nonsense', 'also nonsense')).toBeUndefined()
    })
})

// ---------------------------------------------------------------- swapping

// Majo is on all day Saturday and wants rid of the evening. Georgiana is on
// Thursday lunchtime and Majo will take that instead. One give, one take, two
// different days, which is the shape people actually ask for.
const SAT = { id: 's1', employee_id: 'majo', shift_date: '2026-09-26', starts_at: '09:00:00', ends_at: '21:00:00' }
const THU = { id: 's2', employee_id: 'geo', shift_date: '2026-09-24', starts_at: '12:00:00', ends_at: '18:00:00' }

const NAMES = { majo: 'Majo', geo: 'Georgiana' }
const nameOf = id => NAMES[id] || 'Somebody'

const ask = (extra = {}) => ({
    id: 'r1',
    from_employee_id: 'majo',
    to_employee_id: 'geo',
    give_shift_id: 's1', give_from: '17:30', give_to: '21:00',
    take_shift_id: 's2', take_from: null, take_to: null,
    message: null,
    status: 'asked',
    ...extra,
})

const cover = (extra = {}) => ask({
    give_shift_id: 's1', give_from: null, give_to: null,
    take_shift_id: null, take_from: null, take_to: null,
    ...extra,
})

describe('the two halves of a request', () => {
    it('says who gives, who takes, and whether it is all of it', () => {
        const [give, take] = swapHalves(ask(), [SAT, THU])

        expect(give).toMatchObject({
            date: '2026-09-26', from: '17:30', to: '21:00',
            whole: false, giverId: 'majo', takerId: 'geo',
        })
        expect(take).toMatchObject({
            date: '2026-09-24', from: '12:00', to: '18:00',
            whole: true, giverId: 'geo', takerId: 'majo',
        })
    })

    // The database hands back 09:00:00 and a time field hands back 09:00, and
    // those are the same moment. Compared as strings it is a partial shift that
    // happens to cover the whole thing.
    it('does not read seconds as a different time', () => {
        const [half] = swapHalves(cover({ give_from: '09:00', give_to: '21:00' }), [SAT])
        expect(half.whole).toBe(true)
    })

    // The one that matters. Approving a swap rewrites the roster, and a shift
    // handed over whole keeps its row and changes hands, so the row's owner
    // becomes the person who took it. Read from there, the mail would say
    // Georgiana takes Saturday from Georgiana.
    it('still names the giver after the roster has been rewritten', () => {
        const handedOver = { ...SAT, employee_id: 'geo' }
        const [half] = swapHalves(cover({ status: 'approved' }), [handedOver])

        expect(half.giverId).toBe('majo')
        expect(half.takerId).toBe('geo')
    })

    it('leaves out a shift that is no longer there', () => {
        expect(swapHalves(ask(), [THU])).toHaveLength(1)
    })
})

describe('one half, read out', () => {
    it('says you when it is you', () => {
        const [give] = swapHalves(ask(), [SAT, THU])
        expect(halfWords(give, nameOf, 'geo'))
            .toBe("You take Sat 26 Sept 2026, 17:30 to 21:00, part of Majo's shift")
    })

    it('says you the other way round too', () => {
        const [, take] = swapHalves(ask(), [SAT, THU])
        expect(halfWords(take, nameOf, 'geo'))
            .toBe('Majo takes Thu 24 Sept 2026, 12:00 to 18:00, from you')
    })

    // The mail a manager gets, and the one that goes to the two of them
    // together. Nobody in it is "you".
    it('names both when nobody is reading it', () => {
        const [give] = swapHalves(ask(), [SAT, THU])
        expect(halfWords(give, nameOf))
            .toBe("Georgiana takes Sat 26 Sept 2026, 17:30 to 21:00, part of Majo's shift")
    })

    // Part of a shift is said as part of a shift. Two times alone do not tell
    // you the other person is still in for the rest of the day.
    it('says the whole thing plainly when it is the whole thing', () => {
        const [half] = swapHalves(cover(), [SAT])
        expect(halfWords(half, nameOf, 'geo'))
            .toBe('You take Sat 26 Sept 2026, 09:00 to 21:00, from Majo')
    })
})

describe('the mail to the person being asked', () => {
    const words = () => ({
        request: ask(), halves: swapHalves(ask(), [SAT, THU]), nameOf,
        restaurantName: 'Point Campus', appUrl: 'https://hub.ie',
    })

    it('calls a swap a swap', () => {
        expect(swapAskEmail(words()).subject)
            .toBe('Majo wants to swap a shift with you, Point Campus')
    })

    // Nothing offered back is a favour, not a trade, and calling it a swap
    // would be the app being cheerful about somebody giving up a Saturday.
    it('calls a straight cover what it is', () => {
        const request = cover()
        expect(swapAskEmail({ ...words(), request, halves: swapHalves(request, [SAT]) }).subject)
            .toBe('Majo asked you to take a shift, Point Campus')
    })

    it('splits it into what you take and what you give', () => {
        const mail = swapAskEmail(words())
        expect(mail.html).toContain('YOU TAKE')
        expect(mail.html).toContain('YOU GIVE')
    })

    it('has nothing to give when it is a cover', () => {
        const request = cover()
        const mail = swapAskEmail({ ...words(), request, halves: swapHalves(request, [SAT]) })
        expect(mail.html).not.toContain('YOU GIVE')
    })

    // The thing people get wrong about this screen, said in every mail that
    // comes off it.
    it('says a yes is not the end of it', () => {
        expect(swapAskEmail(words()).text).toContain('A manager still has to approve it')
    })

    it('shuts anything they typed out of the HTML', () => {
        const request = ask({ message: '<b>please</b> & thanks' })
        const mail = swapAskEmail({ ...words(), request })
        expect(mail.html).toContain('&lt;b&gt;please&lt;/b&gt; &amp; thanks')
        expect(mail.html).not.toContain('<b>please</b>')
    })
})

describe('the mail back to whoever asked', () => {
    const words = (status) => {
        const request = ask({ status })
        return {
            request, halves: swapHalves(request, [SAT, THU]), nameOf,
            restaurantName: 'Point Campus', appUrl: 'https://hub.ie',
        }
    }

    it('says yes plainly', () => {
        expect(swapAnswerEmail(words('accepted')).subject)
            .toBe('Georgiana said yes to your shift swap')
    })

    it('says no plainly', () => {
        expect(swapAnswerEmail(words('declined')).subject)
            .toBe('Georgiana said no to your shift swap')
    })

    // A yes is the step people think is the last one.
    it('says a yes is now with a manager', () => {
        expect(swapAnswerEmail(words('accepted')).text)
            .toContain('It is with a manager now')
    })

    // A no that leaves somebody wondering whether their shifts changed is a no
    // that gets read twice.
    it('says a no changed nothing', () => {
        expect(swapAnswerEmail(words('declined')).text)
            .toContain('Your shifts have not changed')
    })
})

describe('the mail to the managers', () => {
    const words = () => {
        const request = ask({ status: 'accepted', message: 'English class' })
        return {
            request, halves: swapHalves(request, [SAT, THU]), nameOf,
            restaurantName: 'Point Campus', appUrl: 'https://hub.ie',
        }
    }

    it('names both of them in the subject', () => {
        expect(swapDeskEmail(words()).subject)
            .toBe('Majo and Georgiana agreed a shift swap, Point Campus')
    })

    it('points at the roster rather than at My shifts', () => {
        const mail = swapDeskEmail(words())
        expect(mail.html).toContain('https://hub.ie/roster')
        expect(mail.html).not.toContain('https://hub.ie/my-shifts')
    })

    it('carries what they said to each other', () => {
        expect(swapDeskEmail(words()).text).toContain('English class')
    })
})

describe('the mail after a manager decided', () => {
    const words = (status) => {
        const request = ask({ status })
        return {
            request, halves: swapHalves(request, [SAT, THU]), nameOf,
            restaurantName: 'Point Campus', answeredBy: 'Leandro', appUrl: 'https://hub.ie',
        }
    }

    // The earlier of the two days, so a subject line in a list of mail says
    // which swap it is.
    it('puts the day in the subject', () => {
        expect(swapDecisionEmail(words('approved')).subject)
            .toBe('Shift swap approved, Thu 24 Sept 2026')
        expect(swapDecisionEmail(words('refused')).subject)
            .toBe('Shift swap not approved, Thu 24 Sept 2026')
    })

    it('says the roster has already moved', () => {
        expect(swapDecisionEmail(words('approved')).text)
            .toContain('The roster has already been changed')
    })

    it('says nothing moved when it was refused', () => {
        expect(swapDecisionEmail(words('refused')).text)
            .toContain('Nothing on the roster has changed')
    })

    it('names the manager who answered', () => {
        expect(swapDecisionEmail(words('approved')).text).toContain('Answered by: Leandro')
    })

    // It goes to both of them at once, so neither of them is "you".
    it('names both rather than talking to one of them', () => {
        const text = swapDecisionEmail(words('approved')).text
        expect(text).toContain("Georgiana takes")
        expect(text).toContain("part of Majo's shift")
        expect(text).not.toContain('You take')
    })
})

// denomailer 1.6.0 turns a trailing space before a newline into =20 in the
// message somebody reads, and the line inside it meant to fix that throws its
// own result away. Nothing outside the library can undo it, so the only defence
// is never writing one. It is far too easy to leave one in a template literal.
describe('no line ends in a space', () => {
    const every = [
        ['a time off request', requestEmail({
            absence: holiday(), employeeName: 'Majo', restaurantName: 'Point Campus',
            clashes: [shift('2026-10-12', '09:00', '17:00')], appUrl: 'https://hub.ie', now: NOW,
        })],
        ['a time off answer', answerEmail({
            absence: holiday({ status: 'approved' }), employeeName: 'Majo',
            restaurantName: 'Point Campus', answeredBy: 'Leandro', freedCount: 2, appUrl: 'https://hub.ie',
        })],
        ['a swap ask', swapAskEmail({
            request: ask(), halves: swapHalves(ask(), [SAT, THU]), nameOf,
            restaurantName: 'Point Campus', appUrl: 'https://hub.ie',
        })],
        ['a swap answer', swapAnswerEmail({
            request: ask({ status: 'accepted' }), halves: swapHalves(ask(), [SAT, THU]), nameOf,
            restaurantName: 'Point Campus', appUrl: 'https://hub.ie',
        })],
        ["a manager's copy", swapDeskEmail({
            request: ask({ status: 'accepted' }), halves: swapHalves(ask(), [SAT, THU]), nameOf,
            restaurantName: 'Point Campus', appUrl: 'https://hub.ie',
        })],
        ['a decision', swapDecisionEmail({
            request: ask({ status: 'approved' }), halves: swapHalves(ask(), [SAT, THU]), nameOf,
            restaurantName: 'Point Campus', answeredBy: 'Leandro', appUrl: 'https://hub.ie',
        })],
    ]

    for (const [what, mail] of every) {
        it(`holds for ${what}`, () => {
            const bad = mail.html.split('\n')
                .map((line, i) => [i + 1, line])
                .filter(([, line]) => line !== line.replace(/[ \t]+$/, ''))
            expect(bad).toEqual([])
        })
    }
})
