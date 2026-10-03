// The rules for giving somebody an account, kept apart from the request so the
// app's own tests can reach them, the same arrangement email.js has.
//
// **Only an active super admin.** This runs with the service key, which skips
// every row level rule, so the check the database would have made is made here.

export const ROLES = ['employee', 'store_manager', 'owner', 'super_admin']

// An address nobody can ever receive mail at: the reserved names that
// roster-email refuses too. An invite to one would be an account nobody can
// ever open.
const NEVER_DELIVERS_TLD = ['test', 'example', 'invalid', 'localhost']
const NEVER_DELIVERS_DOMAIN = ['example.com', 'example.net', 'example.org']

export function cleanEmail(email) {
    return String(email || '').trim().toLowerCase()
}

export function emailProblem(email) {
    const at = cleanEmail(email)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(at)) return 'Enter a full email address.'
    const domain = at.slice(at.lastIndexOf('@') + 1)
    const tld = domain.slice(domain.lastIndexOf('.') + 1)
    if (NEVER_DELIVERS_DOMAIN.includes(domain) || NEVER_DELIVERS_TLD.includes(tld)) {
        return 'That address can never receive email. Enter a real one.'
    }
    return ''
}

// Whether the caller may give accounts at all, from their users row.
export function callerProblem(me) {
    if (!me) return 'Not signed in'
    if (me.is_active !== true) return 'Your account is deactivated'
    if (me.role !== 'super_admin') return 'Only a super admin can add an account'
    return ''
}

// What is wrong with the request, or '' when it can go. `employee` is the
// person on the team to link it to, already read, or null.
export function inviteProblem({ fullName, email, role, restaurantId, employeeId }, employee = null) {
    if (!String(fullName || '').trim()) return 'Enter their name.'
    const wrong = emailProblem(email)
    if (wrong) return wrong
    if (!ROLES.includes(role)) return 'Pick a role.'
    if (role !== 'super_admin' && !restaurantId) return 'Pick a restaurant.'
    if (employeeId) {
        if (!employee) return 'That person is not on the team list.'
        if (employee.user_id) return 'That person already has an account.'
        if (restaurantId && employee.restaurant_id !== restaurantId) return 'That person works at another restaurant.'
    }
    return ''
}

// Where the emailed link opens: the site the invite was sent from, if it looks
// like a site. Supabase checks it against the Redirect URLs list as well.
export function linkSite(origin) {
    const site = String(origin || '').trim().replace(/\/+$/, '')
    return /^https?:\/\/[^\s/]+$/.test(site) ? site : ''
}
