// Who the weekly report goes to.
//
// Two lists that behave differently, which is the whole reason this file
// exists rather than one text field somewhere.
//
// **The owners are worked out, not typed.** Everyone with an owner account at
// this restaurant gets the report, and nobody can take them off it. An address
// list that has to be maintained is an address list that is wrong by March,
// and the one thing worse than a report going to somebody who did not need it
// is a report not reaching the person who owns the place. Super admin is not on
// it: that is an account for running the software, not for reading the week.
//
// **The extras are typed and stay typed.** The accountant, another manager,
// somebody covering for a month. They live on the restaurant, not on the
// report, so they are the same list every week until somebody removes one.
//
// The addresses themselves are not in here. public.users has a name and a role
// and no email; the email is in auth.users, which the browser cannot read and
// should not. The function that sends the mail resolves the owners for itself,
// so what reaches it from a browser is never a list of who to mail.

// Case is not part of an address for the purpose of telling two apart.
// Somebody typing Ana@ and ana@ has typed one address twice, and sending twice
// is how a correction turns into a row about how many mails went out.
export function normalise(value) {
    return String(value ?? '').trim().toLowerCase()
}

// Deliberately loose. A real check is a mail server, and this only has to catch
// a name typed into the wrong box or a paste that took half a sentence with it.
// Anything shaped like an address is accepted, because Marta's accountant is on
// a domain nobody here has heard of and that is not a reason to refuse it.
export function looksLikeAddress(value) {
    const v = normalise(value)
    if (!v || /\s/.test(v)) return false
    return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v)
}

// Add one to the extras. Returns the new list and, when it refused, why.
//
// It refuses two things and neither of them is an error worth a red box: a
// second copy of an address already on the list, and something that is not an
// address. Both are somebody typing, and both are answered by saying so.
export function addExtra(list, value, ownerAddresses = []) {
    const address = normalise(value)
    const current = (list || []).map(normalise)

    if (!address) return { list: list || [], error: null }
    if (!looksLikeAddress(address)) {
        return { list: list || [], error: 'That does not look like an email address.' }
    }
    if (current.includes(address)) {
        return { list: list || [], error: 'That address is already on the list.' }
    }
    if ((ownerAddresses || []).map(normalise).includes(address)) {
        return { list: list || [], error: 'That is an owner, so they are already on it.' }
    }

    return { list: [...(list || []), address], error: null }
}

export function removeExtra(list, value) {
    const gone = normalise(value)
    return (list || []).filter(v => normalise(v) !== gone)
}

// The list that actually goes out: the owners first, then the extras, with
// nothing said twice.
//
// Owners first because that is the order the mail is read in and because an
// address that is both an owner and an extra should appear where it carries the
// most weight. Deduping is on the normalised form but the address kept is the
// one first seen, so a typed Ana.Murphy@ is sent as typed rather than flattened.
export function mergeForSend(ownerAddresses = [], extras = []) {
    const out = []
    const seen = new Set()
    for (const address of [...(ownerAddresses || []), ...(extras || [])]) {
        const key = normalise(address)
        if (!key || seen.has(key)) continue
        seen.add(key)
        out.push(String(address).trim())
    }
    return out
}

// What to say above the list.
//
// An empty list does not stop a report being published. The report is the point
// and the mail is how it travels; a week written up and frozen with nobody to
// send it to is still a week written up. It says so rather than failing.
// Whoever publishes it is always a recipient as well, which is why it is not
// counted here: it is not a choice anybody makes on this card, and it is a
// different person week to week.
//
// They are on it so they see the report arrive, since a week that was
// published but never sent looks the same from the Hub, and so that replying
// to all reaches them: every recipient is in To and Reply-To is the manager,
// so a reply-to-all puts them in To and copies everybody else.
export function recipientSummary({ owners = [], extras = [] }) {
    const count = owners.length + extras.length
    if (count === 0) {
        return 'Nobody is on this list, so it will only go to you.'
    }
    const parts = []
    if (owners.length) parts.push(`${owners.length} owner${owners.length === 1 ? '' : 's'}`)
    if (extras.length) parts.push(`${extras.length} added`)
    return `Goes to ${parts.join(' and ')}, and to you.`
}
