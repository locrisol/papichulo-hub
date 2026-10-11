// What makes a password good enough to choose.
//
// Eight characters and nothing else (his, 11 October 2026): "Password should
// not be that restrictive, is just a simple website". The first staff to
// choose one could not: a list of obvious words here refused anything with
// PapiChulo in it, and Supabase refused a long random one on rules of its own.
// So there are no rules about capitals, numbers, symbols or words, here or in
// the dashboard.
//
// The rules are a list so the box can show each one and tick it as it is met
// while somebody types (his, the same day). A rule added later shows up there
// by itself. Supabase checks the length too once the dashboard says 8; this is
// the app saying so before the link is used, not the lock.

export const MIN_LENGTH = 8

export const PASSWORD_RULES = [
    { key: 'length', label: `At least ${MIN_LENGTH} characters`, met: typed => typed.length >= MIN_LENGTH },
]

// The reason a password will not do, or '' when it is fine.
export function passwordProblem(password) {
    const typed = String(password || '')
    if (!typed) return 'Enter a password.'
    const unmet = PASSWORD_RULES.find(rule => !rule.met(typed))
    return unmet ? `The password needs: ${unmet.label.toLowerCase()}.` : ''
}

// What the link in the address says: its token and whether it is an invite or a
// reset. Null when there is no link to use.
export function linkFrom(hash) {
    const params = new URLSearchParams(String(hash || '').replace(/^#/, ''))
    const token = params.get('token_hash')
    const type = params.get('type')
    if (!token || !['recovery', 'invite'].includes(type)) return null
    return { token, type }
}
