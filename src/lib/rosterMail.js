import { supabase } from '@/lib/supabase'
import { isPartDay } from '@/lib/timeOff'
import { timeOffRecordBase64, recordName } from '@/lib/timeOffPdf'

// Setting the emails off.
//
// Nothing in here decides who gets an email or what it says. That is all in the
// edge function, which reads it off the database, because a browser is a place
// anybody can type into and an address list is not a thing to take on trust.
// This only says which request, and which thing happened to it.
//
// The one job it does do is make the PDF, because the browser already knows
// how: it makes the stock take report with the same library. Doing it here
// means one PDF engine in this project instead of two.
//
// **Nothing in here is ever awaited by anything that matters.** A request that
// saved is saved. If the mail is down, or somebody has no account, or the app
// password expired last Tuesday, the roster is still right and nobody is left
// staring at a spinner. It goes in the console and that is the end of it.
//
// The flip side of that, and it is worth knowing: **a wrong event name here
// fails silently.** Nothing on screen changes. rosterMail.test.js exists for
// that one reason.

// Which address the app is being used from, so the buttons in the email come
// back to the same place. The function only takes it when it is one it was told
// to expect, so a preview build works and nothing else can put an address of
// its own into an email that goes out under our name.
const origin = typeof window === 'undefined' ? '' : window.location.origin

async function post(body) {
    try {
        const { error } = await supabase.functions.invoke('roster-email', { body: { ...body, origin } })
        if (error) console.warn('The mail did not go out.', error)
    } catch (err) {
        console.warn('The mail did not go out.', err)
    }
}

// ------------------------------------------------------------- time off

// Somebody asked. The managers hear about it, or the owners when it was a
// manager doing the asking.
export function emailTheAsk(absenceId) {
    if (!absenceId) return
    post({ absenceId, event: 'asked' })
}

// Somebody answered. Whoever asked hears about it, with the record attached.
//
// Part of a day never gets one, which the function checks for itself too. It is
// checked here as well so a PDF nobody will send is never built.
export async function emailTheAnswer({ absence, employeeName, restaurant, answeredBy, cleared }) {
    if (!absence?.id || isPartDay(absence)) return

    let pdf = null
    try {
        pdf = await timeOffRecordBase64({ absence, employeeName, restaurant, answeredBy, cleared })
    } catch (err) {
        // The email is worth sending without it. The answer is the point and
        // the record is the receipt.
        console.warn('Could not build the time off record.', err)
    }

    post({
        absenceId: absence.id,
        event: 'answered',
        pdf,
        pdfName: recordName(absence, employeeName),
    })
}

// --------------------------------------------------------- swapping a shift

// Somebody asked somebody else to take a shift. The person asked hears about
// it, which is the whole point: agreeing to cover a Saturday is not something
// to find out about by happening to open the app.
export function emailTheShiftAsk(requestId) {
    if (!requestId) return
    post({ requestId, event: 'swap-asked' })
}

// They said yes or no. The one who asked hears either way, and a yes also goes
// to the managers, because a yes is not a change to the roster and somebody has
// to approve it.
export function emailTheShiftAnswer(requestId) {
    if (!requestId) return
    post({ requestId, event: 'swap-answered' })
}

// A manager decided. Both of them hear.
//
// **Send this after the roster has been written, never before.** Approving
// rewrites a week that has already gone out, and a mail saying a swap is on
// while the writes are still going is a mail that can turn out to be wrong.
export function emailTheShiftDecision(requestId) {
    if (!requestId) return
    post({ requestId, event: 'swap-decided' })
}
