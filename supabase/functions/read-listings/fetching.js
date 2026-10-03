// Fetching a page from an address somebody typed.
//
// A place's page address is typed into Settings by a manager, and this
// function fetches it from inside Supabase's own network with the service key
// sitting beside it. So an address pointing inward rather than out at the
// internet, 10.0.0.1 or 169.254.169.254, was a way to knock on doors that are
// not ours, and the status or the connection error came straight back to
// whoever pressed Read. A page that never finished held the whole Monday run,
// and a page with no end was read into memory until the function fell over.
// Found by the audit of 28 September.
//
// So before anything goes out, and again at every redirect, an address has to
// be:
//
//   http or https, and nothing else
//   a name rather than a bare IP address. A listings page has a name, and a
//   number is how an address inside a network is usually written
//   not a name that only means something on a private network: localhost, a
//   name with no dot in it, anything ending .local or .internal
//   and, when the platform can say what a name points at, not pointing at a
//   private, loopback or link-local address either
//
// Redirects are followed by hand for the same reason. A public page answering
// 302 with a private address would walk straight past a check that only looked
// at the first one.
//
// **What this cannot stop** is a name that points somewhere public when it is
// checked and somewhere private a moment later when it is fetched. Closing that
// needs the fetch pinned to the address that was checked, which Deno's fetch
// does not offer. What is left needs a manager's login and gets nothing back,
// since the browser is only told a page could not be read.
//
// It sits in the function's own folder because only that gets deployed with
// it, and it imports nothing, so the app's tests can reach it the same way they
// reach reading.js.

// Fifteen seconds for the whole of one page, redirects and all. A listings page
// that has not arrived in fifteen seconds is not arriving, and every second
// spent waiting is a second of the Monday run nothing else can use.
export const PAGE_WAIT_MS = 15000

// Two megabytes, and what comes after is cut off rather than refused. The
// biggest page read today is the county council's at about one, and the part
// worth anything is near the top of every page checked. readable() keeps forty
// thousand characters of it in the end anyway.
export const MOST_PAGE_BYTES = 2 * 1024 * 1024

// Room for http to https and a slash on the end, and not for a loop.
export const MOST_REDIRECTS = 3

// Names that only mean something on a private network. .internal is where the
// cloud providers keep their metadata service, and .arpa is the reverse
// lookup zones, which are never a page.
const PRIVATE_NAMES = /(^|\.)(localhost|local|localdomain|internal|arpa)$/

// What is wrong with an address, in words, or nothing when it may be read.
export function addressProblem(address) {
    let url
    try {
        url = new URL(String(address ?? '').trim())
    } catch {
        return 'is not a web address'
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'is not an http or https address'

    // A login inside the address is never a public listings page.
    if (url.username || url.password) return 'has a login in it'

    const host = url.hostname.toLowerCase().replace(/\.$/, '')

    // The address parser has already turned 2130706433, 0x7f.1 and every other
    // way of spelling a number into the ordinary dotted form, so one pattern
    // catches all of them. IPv6 always arrives in square brackets.
    if (host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return 'is an IP address rather than a name'

    if (!host.includes('.') || PRIVATE_NAMES.test(host)) return 'is not a public name'

    return ''
}

function ipv4(text) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
    if (!m) return null
    const parts = m.slice(1).map(Number)
    return parts.every(n => n <= 255) ? parts : null
}

// Eight numbers, one for each group of an IPv6 address, or null.
function ipv6(text) {
    let body = text.replace(/%.*$/, '')
    if (!body.includes(':')) return null

    // An IPv4 address on the end, as in ::ffff:10.0.0.1, is the last two groups
    // written another way.
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(body)
    if (dotted) {
        const four = ipv4(dotted[1])
        if (!four) return null
        body = body.slice(0, dotted.index)
            + `${(four[0] * 256 + four[1]).toString(16)}:${(four[2] * 256 + four[3]).toString(16)}`
    }

    const halves = body.split('::')
    if (halves.length > 2) return null
    const groups = half => (half ? half.split(':') : [])
    const left = groups(halves[0])
    const right = halves.length === 2 ? groups(halves[1]) : []
    const missing = 8 - left.length - right.length
    if (halves.length === 1 ? missing !== 0 : missing < 1) return null

    const all = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right]
    if (!all.every(g => /^[0-9a-f]{1,4}$/.test(g))) return null
    return all.map(g => parseInt(g, 16))
}

function privateFour([a, b, c]) {
    return a === 0                                  // this network
        || a === 10                                 // private
        || (a === 100 && b >= 64 && b <= 127)       // shared by a carrier
        || a === 127                                // the machine itself
        || (a === 169 && b === 254)                 // link-local, and the metadata service
        || (a === 172 && b >= 16 && b <= 31)        // private
        || (a === 192 && b === 0 && (c === 0 || c === 2))
        || (a === 192 && b === 168)                 // private
        || (a === 198 && (b === 18 || b === 19))    // for testing equipment
        || (a === 198 && b === 51 && c === 100)
        || (a === 203 && b === 0 && c === 113)
        || a >= 224                                 // multicast and reserved
}

// The last two groups of an IPv6 address, read as the IPv4 address they carry.
const tail = g => [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]

function privateSix(g) {
    const zero = (from, to) => g.slice(from, to).every(n => n === 0)
    if (zero(0, 8)) return true                                        // ::
    if (zero(0, 7) && g[7] === 1) return true                          // ::1
    if (zero(0, 5) && g[5] === 0xffff) return privateFour(tail(g))     // ::ffff:a.b.c.d
    if (zero(0, 6)) return privateFour(tail(g))                        // ::a.b.c.d
    if (g[0] === 0x64 && g[1] === 0xff9b && zero(2, 6)) return privateFour(tail(g))
    if (g[0] === 0x2002) return privateFour([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255])
    return (g[0] & 0xfe00) === 0xfc00                                  // unique local
        || (g[0] & 0xffc0) === 0xfe80                                  // link-local
        || (g[0] & 0xffc0) === 0xfec0                                  // the old site-local
        || (g[0] & 0xff00) === 0xff00                                  // multicast
        || (g[0] === 0x2001 && g[1] === 0x0db8)                        // documentation
        || (g[0] === 0x0100 && zero(1, 4))                             // discard
}

// Whether an address a name points at is on a private network rather than the
// public internet. Something that is not an address at all counts as private,
// because refusing is the safe answer to a question nobody can read.
export function privateAddress(address) {
    const text = String(address ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '')
    const four = ipv4(text)
    if (four) return privateFour(four)
    const six = ipv6(text)
    return six ? privateSix(six) : true
}

// A promise that gives up when the time is up, whether or not the thing it is
// waiting on listens. A real fetch does listen to its signal, but this is the
// one place that makes the limit a promise rather than a hope.
//
// Named TimeoutError, the name a fetch's own signal uses, so readPages can tell
// a site that has stopped answering from one that answered no.
function inTime(promise, signal, wait) {
    const late = () => Object.assign(new Error(`took longer than ${wait / 1000} seconds`), { name: 'TimeoutError' })
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(late()); return }
        const stop = () => reject(late())
        signal.addEventListener('abort', stop, { once: true })
        Promise.resolve(promise).then(
            value => { signal.removeEventListener('abort', stop); resolve(value) },
            err => { signal.removeEventListener('abort', stop); reject(signal.aborted ? late() : err) },
        )
    })
}

// The body as text, up to the cap, then the rest is left unread.
async function textOf(page, { signal, wait, most }) {
    if (!page.body) return ''

    const reader = page.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let bytes = 0

    try {
        for (;;) {
            const { done, value } = await inTime(reader.read(), signal, wait)
            if (done) break
            const room = most - bytes
            if (value.byteLength > room) {
                text += decoder.decode(value.subarray(0, room), { stream: true })
                break
            }
            bytes += value.byteLength
            text += decoder.decode(value, { stream: true })
        }
    } finally {
        reader.cancel().catch(() => {})
    }

    return text + decoder.decode()
}

// One page, read the careful way.
//
// get is fetch, passed in so the tests can hand it a pretend one. resolve says
// which addresses a name points at, and gives back nothing when the platform
// cannot say; the checks on the address itself still stand then.
export async function readPage(address, {
    get = fetch,
    resolve = null,
    headers = {},
    wait = PAGE_WAIT_MS,
    most = MOST_PAGE_BYTES,
} = {}) {
    const signal = AbortSignal.timeout(wait)
    let at = String(address ?? '').trim()

    for (let hop = 0; hop <= MOST_REDIRECTS; hop += 1) {
        const problem = addressProblem(at)
        if (problem) throw new Error(`${at} ${problem}`)

        if (resolve) {
            const host = new URL(at).hostname
            const points = await inTime(resolve(host), signal, wait)
            if ((points || []).some(privateAddress)) throw new Error(`${host} points at a private address`)
        }

        const page = await inTime(get(at, { headers, redirect: 'manual', signal }), signal, wait)

        if (page.status >= 300 && page.status < 400) {
            const next = page.headers.get('location')
            page.body?.cancel().catch(() => {})
            if (!next) throw new Error(`${at} answered ${page.status} with nowhere to go`)
            at = new URL(next, at).toString()
            continue
        }

        if (!page.ok) {
            page.body?.cancel().catch(() => {})
            throw new Error(`${at} answered ${page.status}`)
        }

        return await textOf(page, { signal, wait, most })
    }

    throw new Error(`${address} redirected more than ${MOST_REDIRECTS} times`)
}

// Every page of one place, one after another.
//
// read is readPage with the place's headers, passed in so the tests can hand
// it a pretend one. A page that answers no is passed over and the next one
// tried, because one page of four refusing is not a failure.
//
// **A page that ran out of time ends the place.** The council is read five
// pages deep, and a site that has stopped answering costs the whole wait on
// every one of them: over a minute, in a run the platform stops at two and a
// half, so the places read after it were the ones that paid. What was read
// before it is kept, and the pages not tried are named so the log says so.
export async function readPages(addresses, read) {
    const texts = []
    const missed = []

    for (const [i, address] of addresses.entries()) {
        try {
            texts.push(await read(address))
        } catch (err) {
            missed.push(`${address}: ${err?.message}`)
            if (err?.name === 'TimeoutError') {
                for (const rest of addresses.slice(i + 1)) missed.push(`${rest}: not tried, the site had stopped answering`)
                break
            }
        }
    }

    return { texts, missed }
}
