import { useState, useRef, useEffect, useId } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/auth'
import { supabase, everyRow } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import BackToTop from '@/components/layout/BackToTop'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { ScrollProvider } from '@/context/ScrollContext'
import { can, MANAGERS, roleLabel } from '@/lib/access'
import { navItems, navTarget, activeNavPath } from '@/lib/nav'
import { noAllergensDeclared } from '@/lib/allergens'
import { everyReadArrived } from '@/lib/allergenSheet'
import { onAllergensChanged } from '@/lib/allergensChanged'
import { navBadge, menuDot } from '@/lib/controlStyles'
import { cannotAnswer } from '@/lib/timeOff'

// Whoever can open Products is whoever gets its count, read off the nav so the
// two cannot drift apart.
const PRODUCTS = navItems.find(n => n.path === '/catalogue/products')


// Heroicons outline paths, referenced by the `icon` key on each nav item.
const icons = {
    costs: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    sales: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    // Calendar icon, used for the roster
    weekly: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    invoice: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    waste: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    stk: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-5 8l2 2 4-4",
    cat: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    suppliers: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    forecast: "M13 10V3L4 14h7v7l9-11h-7z",
    alg: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    users: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    cog: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    restaurant: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    // Heroicons v2 from here down. Each item on the menu has a picture of its
    // own, so the eye can find one without reading: twenty items had shared
    // eight, and Delivery problems had the bin that Waste uses.
    truck: "M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12",
    clock: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    report: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
    table: "M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5",
    person: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
    undo: "M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3",
    download: "M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3",
    pie: "M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z",
    idcard: "M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z",
    book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
}

// Detail pages are not in navItems (they are reached from their list pages), so
// the header falls back to a prefix match to keep showing a sensible title.
const titleFallbacks = [
    { prefix: '/inventory/stock-takes', label: 'Stock Takes' },
    { prefix: '/catalogue/products', label: 'Products' },
    { prefix: '/catalogue/menu-items', label: 'Menu Items' },
    { prefix: '/sales', label: 'Sales' },
    { prefix: '/checklists', label: 'Checklists' },
    { prefix: '/reports', label: 'Reports' },
    { prefix: '/invoices', label: 'Invoices' },
]


export default function AppLayout({ children }) {
    const { user } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const { restaurants, activeRestaurant, switchRestaurant } = useRestaurant()

    // Anything on the roster waiting on an answer, counted on the menu so it is
    // visible from wherever you happen to be. Swaps and time off together,
    // because from where a manager is standing they are the same job.
    //
    // Counted rather than listed, and read again whenever the page changes, so
    // it goes back down as soon as it has been dealt with.
    //
    // Only what this person can answer. A store manager's own holiday or day
    // off is an owner's (see cannotAnswer), and counted it told them there was
    // something to do when the Roster had nothing for them to press.
    const [waitingCount, setWaitingCount] = useState(0)
    // Who they are on the team, asked once per account rather than on every
    // page change, since it does not change while they are signed in.
    const onTheTeam = useRef({ account: null, employee: null })
    const isManager = can(user, MANAGERS)

    useEffect(() => {
        let live = true
        async function count() {
            if (!activeRestaurant?.id || !isManager) {
                if (live) setWaitingCount(0)
                return
            }
            if (user.role === 'store_manager' && onTheTeam.current.account !== user.id) {
                const { data, error } = await supabase.rpc('get_my_employee_id')
                if (!error) onTheTeam.current = { account: user.id, employee: data || null }
            }
            const me = onTheTeam.current.account === user.id ? onTheTeam.current.employee : null
            // The requests themselves rather than a count of them, to ask each
            // one the same question the Roster asks. A handful at most.
            const [swaps, off] = await Promise.all([
                supabase.from('shift_requests')
                    .select('id', { count: 'exact', head: true })
                    .eq('restaurant_id', activeRestaurant.id)
                    .eq('status', 'accepted'),
                supabase.from('absences')
                    .select('employee_id, can_work_from, can_work_to')
                    .eq('restaurant_id', activeRestaurant.id)
                    .eq('status', 'requested'),
            ])
            const theirs = (off.data || []).filter(a => !cannotAnswer(a, me, user.role))
            if (live) setWaitingCount((swaps.count || 0) + theirs.length)
        }
        count()
        return () => { live = false }
    }, [activeRestaurant?.id, user?.id, user?.role, isManager, location.pathname])

    // Products with no allergens set, counted on Products in red. Until one is
    // answered, the customer sheet asks people to see staff about every dish
    // it is in. Forty three of them had built up by 1 October 2026 with
    // nothing anywhere saying so, and this is so that cannot happen again.
    //
    // Products are shared by both restaurants, so it does not wait on which
    // one is picked.
    const [noAllergens, setNoAllergens] = useState(0)
    // The same question the sidebar asks before it shows Products at all.
    const seesProducts = can(user, PRODUCTS.roles)

    // When it is worked out again. Not on every page change like the roster's
    // two quick counts: this is five whole tables, and a manager opening the
    // Roster on a phone should not be downloading the product list to do it.
    //
    // So on the first load, and whenever this changes, which is going into the
    // catalogue, moving around inside it, or coming out of it. That is where
    // products, recipes and dishes are changed. Between two pages outside it
    // nothing that counts here can have moved.
    const cataloguePage = location.pathname.startsWith('/catalogue/') ? location.pathname : null
    // And straight away when allergens are saved. Saving does not change the
    // page, so without this the count stayed one too high until it did.
    const [allergensSaved, setAllergensSaved] = useState(0)
    useEffect(() => onAllergensChanged(() => setAllergensSaved(n => n + 1)), [])

    useEffect(() => {
        let live = true
        async function count() {
            if (!seesProducts) {
                if (live) setNoAllergens(0)
                return
            }
            // Only the columns the rule reads. Whether a product has an
            // allergen row is all that matters, not what is in it.
            //
            // Every row, a page at a time, each in an order that cannot tie.
            // Read short, the answered products past the first thousand would
            // all count as missing, and a switched off one in a dish past the
            // first thousand lines would not count at all.
            const reads = await Promise.all([
                everyRow(() => supabase.from('products')
                    .select('id, section, is_mix, is_active, held_for').order('id')),
                everyRow(() => supabase.from('product_allergens').select('product_id').order('product_id')),
                everyRow(() => supabase.from('mix_recipes')
                    .select('id, mix_product_id, ingredient_product_id').order('id')),
                everyRow(() => supabase.from('menu_items').select('id, is_active').order('id')),
                everyRow(() => supabase.from('menu_item_components')
                    .select('id, menu_item_id, product_id').order('id')),
            ])
            // A failed read keeps the last number. A failed read of the
            // allergens would otherwise look like nobody having entered any,
            // and the count would jump to every food product there is.
            if (!live || !everyReadArrived(reads)) return
            const [products, allergens, recipeLines, menuItems, components] = reads.map(r => r.data)
            setNoAllergens(noAllergensDeclared({ products, allergens, recipeLines, menuItems, components }).length)
        }
        count()
        return () => { live = false }
    }, [seesProducts, cataloguePage, allergensSaved])

    // The count at the end of an item, if it has one, and the words a screen
    // reader says for it instead of a bare number.
    function countOn(path) {
        if (path === '/roster' && waitingCount > 0) {
            return {
                count: waitingCount,
                tone: 'waiting',
                words: `${waitingCount} ${waitingCount === 1 ? 'request' : 'requests'} waiting for an answer`,
            }
        }
        if (path === PRODUCTS.path && noAllergens > 0) {
            return {
                count: noAllergens,
                tone: 'urgent',
                words: `Allergens not set for ${noAllergens} ${noAllergens === 1 ? 'product' : 'products'}`,
            }
        }
        return null
    }

    // On a phone the sidebar is a drawer, so its counts are out of sight until
    // it is opened. A dot on the menu button says there is something in there:
    // red while any product has no allergens set, otherwise amber while the
    // roster has something waiting. A screen reader hears every count it
    // stands for, as the button's description, so its name stays the same.
    const behindMenu = [countOn(PRODUCTS.path), countOn('/roster')].filter(Boolean)
    const dot = behindMenu.length > 0
        ? { tone: behindMenu[0].tone, words: behindMenu.map(c => c.words).join('. ') }
        : null
    const dotWords = useId()

    const [sidebarOpen, setSidebarOpen] = useState(false)
    // Two, because which one scrolls depends on the screen. On a computer the
    // header stays put and main scrolls under it; on a phone the header goes up
    // with the page, so the column holding both is the one that moves.
    const mainRef = useRef(null)
    const shellRef = useRef(null)

    async function handleSignOut() {
        await supabase.auth.signOut()
        navigate('/login')
    }

    // Only what this role can use.
    //
    // There used to be a second test here, on a forecasting switch, for a
    // screen that predicted takings at one venue. Nothing is gated on it now:
    // the calendar is the same everywhere and what is on near a restaurant is
    // decided by which places it is near rather than by a flag.
    const visibleItems = navItems.filter(n => can(user, n.roles))
    const sections = [...new Set(visibleItems.map(n => n.section))]
    const activePath = activeNavPath(visibleItems, location.pathname)

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

                <nav className="flex-1 py-4 overflow-y-auto sidebar-scroll">
                    {sections.map(section => (
                        <div key={section} className="mb-2">
                            {/* green-500, because green-700 on the sidebar is 2.9
                            to 1 and a heading has to be readable. It is still
                            the quieter of the two: the items under it are
                            green-300 at 10.2, so the hierarchy the heading is
                            for survives. green-600 was the obvious step down
                            and misses at 4.4. */}
                        <p className="px-5 py-2 text-xs font-semibold text-green-500 uppercase tracking-widest">
                                {section}
                            </p>
                            {visibleItems.filter(n => n.section === section).map(item => {
                                const isActive = item.path === activePath
                                const counted = countOn(item.path)
                                return (
                                    <button
                                        key={item.path}
                                        aria-current={isActive ? 'page' : undefined}
                                        onClick={() => { navigate(navTarget(item)); setSidebarOpen(false) }}
                                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors border-r-4 ${isActive
                                            ? 'bg-sidebar-active text-white border-accent'
                                            : 'text-green-300 border-transparent hover:text-white hover:bg-sidebar-active'
                                            }`}
                                    >
                                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d={icons[item.icon]} />
                                        </svg>
                                        <span className="flex-1 text-left">{item.label}</span>
                                        {counted && (
                                            <span className={navBadge(counted.tone)}>
                                                <span aria-hidden="true">{counted.count}</span>
                                                <span className="sr-only">{counted.words}</span>
                                            </span>
                                        )}
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
                            <p className="text-xs text-green-400">{roleLabel(user?.role)}</p>
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
            {/* On a phone this column is the thing that scrolls, so the header
                goes up and out of the way with the page and stops costing a
                hundred and thirty pixels of a small screen. On anything wider
                the header stays put and the body scrolls under it, which is
                what a mouse expects. */}
            <div ref={shellRef} className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden min-w-0">
                {/* Two lines on a phone, one on anything wider.
                    Side by side, the title and the restaurant switcher were
                    fighting over about three hundred pixels: Cost Dashboard and
                    Menu Items broke onto two lines and the switcher was pushed
                    half off the right edge with the restaurant name cut in the
                    middle. Neither of them is optional, so they get a line
                    each. */}
                <header className="bg-white border-b border-border flex-shrink-0 px-4 md:px-7 py-3 md:py-0 md:h-16 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
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
                            aria-describedby={dot ? dotWords : undefined}
                            className="relative md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                        >
                            <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                            {dot && (
                                <span className={menuDot(dot.tone)}>
                                    <span id={dotWords} className="sr-only">{dot.words}</span>
                                </span>
                            )}
                        </button>
                        <h1 className="font-serif text-xl font-bold text-gray-900">{pageTitle}</h1>
                    </div>

                    {/* Restaurant switcher: only for roles that span locations.
                        Labelled and outlined in the accent colour on purpose. It
                        used to be a plain grey select with no label, which was
                        easy to miss, and being on the wrong restaurant means
                        every number on every page is the wrong one. */}
                    {(user?.role === 'super_admin' || user?.role === 'owner') && (
                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <span className="hidden sm:block text-xs font-bold uppercase tracking-widest text-muted">
                                Restaurant
                            </span>
                            {/* Full width on a phone. It is the control that
                                decides what every number on the page is about,
                                so it is worth the whole line rather than
                                whatever is left of one. */}
                            <div className="relative flex-1 md:flex-none">
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
                                    className="w-full appearance-none text-base pointer-fine:text-sm font-semibold border-2 border-accent/40 rounded-lg pl-9 pr-9 py-2 bg-white text-gray-900 cursor-pointer transition-colors hover:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
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
                <main
                    ref={mainRef}
                    // Room at the bottom on a phone so the last card clears the
                    // way back up rather than sitting under it.
                    //
                    // relative, so anything absolutely placed inside a page is
                    // placed inside this box. Without it, something with no
                    // positioned parent of its own (a label kept for screen
                    // readers, the report's reason box) was placed against the
                    // whole browser page instead, at the spot it has far down
                    // the report, and stretched the page to reach it: a second
                    // scrollbar beside this one, onto nothing but white. The
                    // outer box's overflow-hidden does not stop that, because
                    // it is not positioned either.
                    className="relative flex-1 md:overflow-y-auto p-4 pb-24 md:p-7 md:pb-7"
                >
                    {/* Which of the two is scrolling, handed down rather than
                        hunted for, so a page can remember where somebody was. */}
                    <ScrollProvider mainRef={mainRef} shellRef={shellRef}>
                        {/* How wide a page is allowed to get, for every page,
                            decided here rather than by each page remembering to
                            ask for it. It used to be a PageContainer component a
                            page wrapped itself in, and thirteen of the
                            twenty six pages never did, so the app had three
                            different widths depending on which one you were
                            looking at. A page cannot forget this one.

                            1600 because a table row stretched the whole way
                            across a big monitor puts long gaps between the
                            columns and makes your eye travel further to read a
                            single row. The seven day grids on the roster and
                            the weekly sales are the widest things in here and
                            both still fit inside it. */}
                        <div className="max-w-[1600px]">
                            {/* A page that breaks shows a message in its own
                                place, with the menu still there to leave by.
                                The address is handed over rather than used as
                                a key, so a move tries again without drawing
                                the page afresh when nothing went wrong. */}
                            <ErrorBoundary resetKey={location.pathname} inPage>
                                {children}
                            </ErrorBoundary>
                        </div>
                    </ScrollProvider>
                </main>
                <BackToTop scrollers={[mainRef, shellRef]} raised={location.pathname.startsWith('/calendar')} />
            </div>
        </div>
    )
}
