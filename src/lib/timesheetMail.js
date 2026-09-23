// Sending the week's hours.
//
// **Which pay period, and nothing else.** Every figure in that mail is read out of
// the database by the function, so a browser cannot post a set of hours and
// have them arrive under our name. A period is always a fortnight, and the
// function works out its fourteen days for itself. The one thing the screen may
// add is a
// sentence at the top, which is the manager's own words about the week and is
// escaped before it is drawn.
//
// It goes through the same function as the weekly report, because that is the
// one send in this project that has been putting real mail into real inboxes
// for weeks. See the comment on the branch in its index.ts.

import { supabase } from '@/lib/supabase'
import { functionError } from '@/lib/errors'

export async function sendTimesheet({ periodStart, restaurantId, comment = '', test = false }) {
    const { data, error } = await supabase.functions.invoke('weekly-report-email', {
        body: { kind: 'timesheet', periodStart, restaurantId, comment, test },
    })

    if (error) throw new Error(await functionError(error))
    return data || {}
}

// What to tell somebody afterwards.
//
// Three facts and all three are worth saying: how many got it, whether it was a
// rehearsal, and which addresses were dropped. The last one is why this exists:
// the function drops an address that cannot receive rather than letting one
// refusal take the whole send with it, and in silence that turns the list on
// screen into a lie about who has the week.
export function sentWords(result, { test = false } = {}) {
    const sent = result?.sent || 0
    const skipped = result?.skipped || []

    let words
    if (sent === 0) {
        words = 'Nobody is on the list, so nothing was sent.'
    } else if (test) {
        words = `Test sent to ${sent} ${sent === 1 ? 'address' : 'addresses'}. Nothing has been filed.`
    } else {
        words = `Sent to ${sent} ${sent === 1 ? 'address' : 'addresses'}.`
    }

    if (skipped.length > 0) {
        const many = skipped.length > 1
        words += ` ${many ? `${skipped.length} addresses were` : 'One address was'} skipped, because `
            + `${many ? 'they cannot' : 'it cannot'} receive mail: ${skipped.join(', ')}.`
    }

    return words
}
