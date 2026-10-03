// What makes a password good enough to choose.
//
// Length does the work. Rules about capitals and symbols produce "Password1!",
// so there are none: the advice on screen is three or four random words, which
// are long, easy to remember and hard to guess.
//
// Supabase checks the length itself once the dashboard says 12. Its check for
// leaked passwords is on the Pro plan only, so the few obvious ones below are
// refused here instead. This is the app being helpful, not the lock: somebody
// calling the API directly gets past it, and only gets a worse password.

export const MIN_LENGTH = 12

const OBVIOUS = ['password', 'papichulo', 'qwerty', '123456']

// The reason a password will not do, or '' when it is fine. `email` is the
// account's, so the part before the @ is refused too.
export function passwordProblem(password, email = '') {
    const typed = String(password || '')
    if (!typed) return 'Enter a password.'
    if (typed.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`

    const plain = typed.toLowerCase().replace(/\s+/g, '')
    if (OBVIOUS.some(word => plain.includes(word))) return 'That password is too easy to guess. Choose another.'

    const name = String(email || '').split('@')[0].toLowerCase()
    if (name.length >= 4 && plain.includes(name)) return 'Do not use your email in your password.'

    if (/^(.)\1*$/.test(typed)) return 'That password is too easy to guess. Choose another.'
    return ''
}

// What the box says under it, the same everywhere a password is chosen.
export const PASSWORD_HINT = `At least ${MIN_LENGTH} characters. Three or four random words are easy to remember and hard to guess.`

// What the link in the address says: its token and whether it is an invite or a
// reset. Null when there is no link to use.
export function linkFrom(hash) {
    const params = new URLSearchParams(String(hash || '').replace(/^#/, ''))
    const token = params.get('token_hash')
    const type = params.get('type')
    if (!token || !['recovery', 'invite'].includes(type)) return null
    return { token, type }
}
