// Asking for the Arena listings to be brought up to date.
//
// **The fetching itself is not here any more, and that is the point.** The
// Discovery API key used to be read from `import.meta.env.VITE_TICKETMASTER_KEY`
// a few lines below this one, which means Vite wrote it into the bundle served
// to everybody: anybody who opened devtools could read it and spend the 5,000 a
// day it allows. There was no fixing that in a browser, because a key a browser
// can use is a key a browser can show you.
//
// So it is a secret on the `arena-events` function now. What is left here is the
// asking, and deciding whether it is worth asking at all.
//
// The function is told which restaurant, never which venue. It checks the caller
// is allowed near that restaurant and reads the venue off its own row, so
// nobody can point our quota somewhere of their choosing.

// How long to leave it before fetching again. The spec asks for at least once a
// day. Twelve hours means a normal day gets two goes at it without every page
// load waiting on a network call to show a calendar that has not changed.
const SYNC_EVERY_HOURS = 12
const SYNC_KEY = 'eventsLastSync'

// Bring the table up to date, and say what that added.
//
// Nothing ever deletes. An event that has dropped out of Ticketmaster because
// it has happened is exactly the one worth keeping: the API forgets, so our
// table has to be the memory.
export async function syncEvents(supabase, restaurantId) {
    if (!restaurantId) throw new Error('No restaurant to sync for')

    const { data, error } = await supabase.functions.invoke('arena-events', {
        body: { restaurantId },
    })

    // Both halves. invoke() reports a transport failure in `error` and the
    // function's own refusal in the body, and a caller that only reads one of
    // them tells somebody it worked when it did not.
    if (error) throw new Error(error.message || 'Could not reach the Arena listings')
    if (data?.error) throw new Error(data.error)

    return { added: data?.added || 0, total: data?.total || 0 }
}

// Whether it is worth fetching. Kept per browser, which is fine: the point is
// to avoid pointless calls, and with the free tier allowing 5,000 a day even a
// busy team is nowhere near it.
export function syncIsDue() {
    try {
        const last = localStorage.getItem(SYNC_KEY)
        if (!last) return true
        const hours = (Date.now() - Number(last)) / 1000 / 60 / 60
        return hours >= SYNC_EVERY_HOURS
    } catch {
        // No storage, so just fetch. Better a wasted call than no events.
        return true
    }
}

export function markSynced() {
    try {
        localStorage.setItem(SYNC_KEY, String(Date.now()))
    } catch {
        // Not being able to remember is harmless, it only means we fetch again.
    }
}
