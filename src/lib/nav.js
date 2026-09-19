import { can, ALL_ROLES, MANAGERS, RESTAURANT_CONFIG, ADMIN_ONLY, homeFor } from '@/lib/access'

// Every page the Hub offers, and where a person lands on it.
//
// It used to sit inside AppLayout, which was fine while the sidebar was the
// only thing that needed it. It is not any more: somebody choosing which page
// to open on has to be offered the same list, filtered the same way, and two
// copies of a menu is how a setting comes to offer a page that no longer
// exists.

// Sidebar navigation.
//
// Items are grouped by `section`, and the sections render in the order they
// first appear in this array, so moving an item can move a whole heading.
//
// This is only half of who can reach what. It decides what a role is offered.
// App.jsx decides what happens if somebody types the address anyway, and both
// read the same lists out of lib/access.js so they cannot disagree.
//
// Anything not built yet is left out entirely rather than added and disabled. A
// link that goes nowhere is worse than no link.
export const navItems = [
    { path: '/dashboard', label: 'Cost Dashboard', icon: 'costs', section: 'Overview', roles: MANAGERS },
    { path: '/reports', label: 'Reports', icon: 'weekly', section: 'Overview', roles: MANAGERS },

    // Sales module. Daily Sales is the per-day entry form; Weekly Sales is the
    // Sunday to Saturday grid where a whole week can be entered in one pass.
    // `search` is appended when navigating: Daily Sales asks for the day view
    // explicitly, otherwise the day form redirects wide screens to the grid and
    // the link would appear to do nothing.
    { path: '/sales', search: '?view=day', label: 'Daily Sales', icon: 'sales', section: 'Operations', roles: MANAGERS },
    { path: '/sales/weekly', label: 'Weekly Sales', icon: 'weekly', section: 'Operations', roles: MANAGERS },
    { path: '/costs/labour', label: 'Labour', icon: 'costs', section: 'Operations', roles: MANAGERS },
    { path: '/invoices', label: 'Invoices', icon: 'invoice', section: 'Operations', roles: MANAGERS },
    { path: '/waste', label: 'Waste', icon: 'waste', section: 'Operations', roles: ALL_ROLES },
    { path: '/waste/summary', label: 'Waste summary', icon: 'waste', section: 'Operations', roles: MANAGERS },

    // { path: '/catalogue', label: 'Products', icon: 'cat', section: 'Inventory' },
    { path: '/catalogue/products', label: 'Products', icon: 'cat', section: 'Catalogue', roles: MANAGERS },
    { path: '/catalogue/menu-items', label: 'Menu Items', icon: 'menu', section: 'Catalogue', roles: MANAGERS },
    // Employees can see suppliers on purpose: if a delivery is wrong they need
    // the rep's number. Nothing here is commercially sensitive.
    { path: '/catalogue/suppliers', label: 'Suppliers', icon: 'suppliers', section: 'Catalogue', roles: ALL_ROLES },

    { path: '/inventory/stock-takes', label: 'Stock Takes', icon: 'stk', section: 'Inventory', roles: ALL_ROLES },
    { path: '/inventory/public-allergens', label: 'Public Allergens', icon: 'alg', section: 'Inventory', roles: MANAGERS },

    // Everyone sees this. Nothing on it is sensitive, and the people working a
    // concert night are the ones who most need to know it is happening.
    //
    // No longer gated on forecasting. It used to be the Arena and nothing else,
    // so a restaurant with no venue had nothing to look at; now the Arena is one
    // layer on it and the rest of it is the same everywhere.
    { path: '/calendar', label: 'Calendar', icon: 'forecast', section: 'Analytics', roles: ALL_ROLES },

    { path: '/my-shifts', label: 'My shifts', icon: 'weekly', section: 'People', roles: ALL_ROLES },
    { path: '/roster', label: 'Roster', icon: 'weekly', section: 'People', roles: MANAGERS },
    { path: '/team', label: 'Team', icon: 'users', section: 'People', roles: MANAGERS },


    // Accounts and the sign in record. Everything a manager needs to do with a
    // person lives under Team; this page is only about who can get in, so it is
    // Super Admin's. Team keeps working either way, it reads the users table
    // itself and the policy decides what comes back.
    { path: '/settings/users', label: 'Users', icon: 'users', section: 'Settings', roles: ADMIN_ONLY },

    // What the database recorded, which is a different question from who got
    // in and belongs beside it rather than inside it.
    { path: '/settings/changes', label: 'Changes', icon: 'weekly', section: 'Settings', roles: ADMIN_ONLY },
    { path: '/settings/restaurant', label: 'Restaurant', icon: 'restaurant', section: 'Settings', roles: RESTAURANT_CONFIG },

    // Yours, not the restaurant's. An owner sees nothing else under Settings,
    // which is why this one is here rather than folded into Restaurant.
    { path: '/settings/preferences', label: 'Preferences', icon: 'cog', section: 'Settings', roles: MANAGERS },
]

// What this person could be offered as a landing page.
//
// The nav itself, filtered by what they are allowed to open, because offering
// somebody a page their role refuses is offering to send them to the refused
// screen every morning with no way to tell why.
//
// Anything gated on a restaurant setting is left out. Whether it is on is a
// property of the restaurant and this is a property of the account, and a
// person who works at both would have chosen at one of them.
export function landingChoices(user) {
    if (!can(user, MANAGERS)) return []
    return navItems.filter(n => can(user, n.roles) && !n.needsForecasting)
}

// Where to send somebody who has just signed in.
//
// Checked again here rather than trusted, and that is the whole reason this is
// a function and not a column read. A role can be lowered after the choice was
// made, and a store manager demoted on Friday should land where an employee
// lands on Monday, not on a screen that refuses them.
export function landingFor(user) {
    const chosen = user?.landing_page
    if (chosen && landingChoices(user).some(n => n.path === chosen)) return chosen
    return homeFor(user)
}

// What a page is called, for a sentence that would otherwise print a URL at
// somebody. Falls back to the path, because a sentence with a gap in it is
// worse than one with a slash in it.
export function pageLabel(path) {
    return navItems.find(n => n.path === path)?.label || path
}

// The address to navigate to, which is not always the path.
//
// Daily Sales asks for the day view explicitly: without it the day form sends a
// wide screen to the weekly grid and the link looks like it did nothing.
export function navTarget(item) {
    return item ? `${item.path}${item.search || ''}` : ''
}
