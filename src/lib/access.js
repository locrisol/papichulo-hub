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
// This follows the same rule the database uses: you can only act on someone
// below your own level, and only at your own restaurant. Super Admin is the
// exception and can act on anyone.
//
// Without this the buttons show for everyone and simply do nothing when
// pressed, because the database refuses the change.
export function canManageUser(actor, target) {
    if (!actor?.role || !target?.role) return false

    // Nobody deactivates themselves.
    if (actor.id === target.id) return false

    if (actor.role === 'super_admin') return true

    // Everyone else is limited to their own restaurant.
    if (actor.restaurant_id !== target.restaurant_id) return false

    if (actor.role === 'owner') {
        return target.role === 'store_manager' || target.role === 'employee'
    }
    if (actor.role === 'store_manager') {
        return target.role === 'employee'
    }
    return false
}