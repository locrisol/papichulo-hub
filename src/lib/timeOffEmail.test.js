import { describe, it, expect } from 'vitest'
import {
    escapeHtml, fmtDate, whenWords, dayCount, isPartDay,
    kindWords, kindTitle, hoursWords, noticeWords,
    requestEmail, answerEmail,
    deliverable, isJustTheGoodbye,
} from '../../supabase/functions/time-off-email/email'

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
