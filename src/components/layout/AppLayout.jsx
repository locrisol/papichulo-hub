import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { can, ALL_ROLES, MANAGERS, RESTAURANT_CONFIG } from '../../lib/access'

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
const navItems = [
    { path: '/dashboard', label: 'Cost Dashboard', icon: 'costs', section: 'Overview', roles: MANAGERS },

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
    { path: '/forecast', label: 'Events', icon: 'forecast', section: 'Analytics', roles: ALL_ROLES, needsForecasting: true },

    { path: '/roster', label: 'Roster', icon: 'weekly', section: 'People', roles: MANAGERS },
    { path: '/team', label: 'Team', icon: 'users', section: 'People', roles: MANAGERS },


    { path: '/settings/users', label: 'Users', icon: 'users', section: 'Settings', roles: MANAGERS },
    { path: '/settings/restaurant', label: 'Restaurant', icon: 'restaurant', section: 'Settings', roles: RESTAURANT_CONFIG },
]

// Heroicons outline paths, referenced by the `icon` key on each nav item.
const icons = {
    costs: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    sales: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    // Calendar icon, used for the weekly sales summary
    weekly: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    invoice: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    waste: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    stock: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    stk: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l2 2 4-4",
    cat: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    suppliers: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    forecast: "M13 10V3L4 14h7v7l9-11h-7z",
    alg: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    users: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    restaurant: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    menu: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
}

// Detail pages are not in navItems (they are reached from their list pages), so
// the header falls back to a prefix match to keep showing a sensible title.
const titleFallbacks = [
    { prefix: '/inventory/stock-takes', label: 'Stock Takes' },
    { prefix: '/catalogue/products', label: 'Products' },
    { prefix: '/catalogue/menu-items', label: 'Menu Items' },
    { prefix: '/sales', label: 'Sales' },
]

export default function AppLayout({ children }) {
    const { user } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const { restaurants, activeRestaurant, switchRestaurant } = useRestaurant()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    async function handleSignOut() {
        await supabase.auth.signOut()
        navigate('/login')
    }

    // Only what this role can use, and only where the feature is turned on for
    // this restaurant.
    const visibleItems = navItems.filter(n =>
        can(user, n.roles) &&
        (!n.needsForecasting || activeRestaurant?.forecasting_enabled)
    )
    const sections = [...new Set(visibleItems.map(n => n.section))]

    // Page title: exact nav match first, then a prefix fallback for detail pages.
    const pageTitle =
        navItems.find(n => n.path === location.pathname)?.label
        || titleFallbacks.find(f => location.pathname.startsWith(f.prefix))?.label
        || 'Papi Chulo Hub'

    return (
        <div className="flex h-screen bg-app-bg overflow-hidden">

            {/* Mobile overlay: closes the sidebar when tapped.

                The sidebar is z-40 and this is z-30 so that everything a page
                puts on itself can sit below both. The stock take screen has a
                bar that stays put while the list scrolls, and it used to be on
                the same level as the sidebar. When two things are on the same
                level the one further down the page wins, and the page always
                comes after the sidebar, so opening the menu left the stock take
                bar sitting on top of it, unblurred. Page furniture belongs at
                z-20 or below. */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar: fixed and slide-in on mobile, static on desktop */}
            <aside className={`
                fixed inset-y-0 left-0 z-40 w-56 bg-sidebar flex flex-col flex-shrink-0
                transform transition-transform duration-200
                md:static md:translate-x-0
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="px-5 py-7 border-b border-sidebar-active">
                    <p className="font-serif text-xl font-bold text-white tracking-tight">Papi Chulo Hub</p>
                    <p className="text-xs text-green-400 mt-1 tracking-widest uppercase">
                        {activeRestaurant?.name || 'Loading...'}
                    </p>
                </div>

                <nav className="flex-1 py-4 overflow-y-auto">
                    {sections.map(section => (
                        <div key={section} className="mb-2">
                            <p className="px-5 py-2 text-xs font-semibold text-green-700 uppercase tracking-widest">
                                {section}
                            </p>
                            {visibleItems.filter(n => n.section === section).map(item => {
                                const isActive = location.pathname === item.path
                                return (
                                    <button
                                        key={item.path}
                                        onClick={() => { navigate(item.path + (item.search || '')); setSidebarOpen(false) }}
                                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors border-r-4 ${isActive
                                            ? 'bg-sidebar-active text-white border-accent'
                                            : 'text-green-300 border-transparent hover:text-white hover:bg-sidebar-active'
                                            }`}
                                    >
                                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d={icons[item.icon]} />
                                        </svg>
                                        {item.label}
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </nav>

                {/* Signed-in user and sign out */}
                <div className="px-5 py-4 border-t border-sidebar-active">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {user?.full_name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user?.full_name || 'User'}</p>
                            <p className="text-xs text-green-400 capitalize">{user?.role?.replace('_', ' ') || ''}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="w-full text-left text-xs text-green-500 hover:text-white transition-colors py-1"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main area */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-7 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {/* Hamburger: mobile only */}
                        {/* Three lines and nothing else in it, so to
                            anything that cannot see the drawing this button had
                            no name at all. It is the only way into the menu on
                            a phone, which makes it the worst one to leave
                            unnamed. */}
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label={sidebarOpen ? 'Close the menu' : 'Open the menu'}
                            aria-expanded={sidebarOpen}
                            className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                        >
                            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <h1 className="font-serif text-xl font-bold text-gray-900">{pageTitle}</h1>
                    </div>

                    {/* Restaurant switcher: only for roles that span locations.
                        Labelled and outlined in the accent colour on purpose. It
                        used to be a plain grey select with no label, which was
                        easy to miss, and being on the wrong restaurant means
                        every number on every page is the wrong one. */}
                    {(user?.role === 'super_admin' || user?.role === 'owner') && (
                        <div className="flex items-center gap-2">
                            <span className="hidden sm:block text-xs font-bold uppercase tracking-widest text-muted">
                                Restaurant
                            </span>
                            <div className="relative">
                                {/* The native arrow goes with appearance-none, so
                                    both icons are drawn here instead. */}
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent pointer-events-none"
                                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                >
                                    <path d={icons.restaurant} />
                                </svg>
                                <select
                                    value={activeRestaurant?.id || ''}
                                    onChange={e => switchRestaurant(restaurants.find(r => r.id === e.target.value))}
                                    aria-label="Active restaurant"
                                    className="appearance-none text-sm font-semibold border-2 border-accent/40 rounded-lg pl-9 pr-9 py-2 bg-white text-gray-900 cursor-pointer transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                                >
                                    {restaurants.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                    ))}
                                </select>
                                <svg
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent pointer-events-none"
                                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                >
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </div>
                        </div>
                    )}
                </header>
                <main className="flex-1 overflow-y-auto p-4 md:p-7">
                    {children}
                </main>
            </div>
        </div>
    )
}
