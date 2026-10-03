// Who can reach what.
//
// One list, used by both the sidebar and the routes. Keeping them apart is how
// you end up hiding a link while the page it points at still loads for anyone
// who types the URL.
//
// This is not what protects the data. Row level security does that, in the
// database, and it holds whatever the app does. This is about the app being
// honest: not offering a screen that will only refuse you.

export const ALL_ROLES = ['employee', 'store_manager', 'owner', 'super_admin']
export const MANAGERS = ['store_manager', 'owner', 'super_admin']
export const ADMIN_ONLY = ['super_admin']

// Restaurant configuration is Super Admin and Store Manager, per the spec.
// Owners see their restaurants but do not change how one is set up.
export const RESTAURANT_CONFIG = ['store_manager', 'super_admin']

// Who can see records that have been turned off: deactivated products, menu
// items no longer sold, suppliers nobody buys from any more.
//
// His rule, 13 September 2026, and it is wider than the screen it came from.
// Suppliers had a Show Inactive that everybody could use, with a comment saying
// a filter is not a change so it was harmless. It is not about harm: a record
// somebody turned off is not an employee's business. The rule is enforced by
// ShowInactiveButton rather than remembered by each page, so it holds on pages
// that do not exist yet.
export const SEES_INACTIVE = MANAGERS

export function can(user, allowed) {
    if (!user?.role) return false
    return allowed.includes(user.role)
}

// Where a role should land when it signs in.
//
// An employee lands on their own shifts. It used to be waste, on the grounds
// that it is the screen they use every shift, and the roster beats it: waste is
// something you open when you have something to log, and the roster is the
// question somebody opens the app to answer.
export function homeFor(user) {
    if (!user?.role) return '/login'
    return user.role === 'employee' ? '/my-shifts' : '/dashboard'
}

// Whether one person can turn another person's account on or off.
//
// Only a super admin, and the database says the same. The Users page has been
// the super admin's alone since 8 September, and the account rule in the
// database was narrowed to match it. An owner or a store manager switches
// somebody off on Team instead, by giving them a last day, and the login goes
// off the night after it.
//
// Without this the buttons show for everyone and simply do nothing when
// pressed, because the database refuses the change.
export function canManageUser(actor, target) {
    if (!actor?.role || !target?.role) return false

    // Nobody deactivates themselves.
    if (actor.id === target.id) return false

    return actor.role === 'super_admin'
}

// A role as a person reads it, for example Store manager.
//
// Seven screens wrote these out for themselves and did not agree on capitals:
// two said Store Manager and five said store manager. Empty for no role, or
// one this list does not know, rather than the raw database word.
//
// A Map rather than an object, so a word like toString finds nothing instead of
// something every object carries.
const ROLE_LABELS = new Map([
    ['employee', 'Employee'],
    ['store_manager', 'Store manager'],
    ['owner', 'Owner'],
    ['super_admin', 'Super admin'],
])

export function roleLabel(role) {
    return ROLE_LABELS.get(role) || ''
}
