import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'

const navItems = [
    { path: '/dashboard', label: 'Cost Dashboard', icon: 'costs', section: 'Overview' },
    { path: '/sales', label: 'Sales Recording', icon: 'sales', section: 'Operations' },
    { path: '/invoices', label: 'Invoices', icon: 'invoice', section: 'Operations' },
    { path: '/waste', label: 'Waste Tracking', icon: 'waste', section: 'Operations' },
    { path: '/stocktake', label: 'Stock Take', icon: 'stock', section: 'Inventory' },
    { path: '/catalogue', label: 'Products', icon: 'cat', section: 'Inventory' },
    { path:'/catalogue/products', label:'Products', icon:'cat', section:'Catalogue' },
    { path:'/catalogue/menu-items', label:'Menu Items', icon:'menu', section:'Catalogue' },
    { path: '/catalogue/suppliers', label:'Suppliers', icon:'suppliers', section:'Catalogue' },
    { path: '/allergens', label: 'Allergens', icon: 'alg', section: 'Inventory' },
    { path: '/forecast', label: 'Forecasting', icon: 'forecast', section: 'Analytics' },
    { path: '/settings/users', label: 'Users', icon: 'users', section: 'Settings' },
    { path: '/settings/restaurant', label: 'Restaurant', icon: 'restaurant', section: 'Settings' },
]

// Heroicons
const icons = {
    costs: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    sales: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    invoice: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    waste: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    stock: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    cat: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    suppliers: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    alg: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    forecast: "M13 10V3L4 14h7v7l9-11h-7z",
    users: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    restaurant: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    menu: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
}

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

    const sections = [...new Set(navItems.map(n => n.section))]

    return (
        <div className="flex h-screen bg-app-bg overflow-hidden">

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — fixed on mobile, static on desktop */}
            <aside className={`
        fixed inset-y-0 left-0 z-30 w-56 bg-sidebar flex flex-col flex-shrink-0
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
                            {navItems.filter(n => n.section === section).map(item => {
                                const isActive = location.pathname === item.path
                                return (
                                    <button
                                        key={item.path}
                                        onClick={() => { navigate(item.path); setSidebarOpen(false) }}
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
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        </button>
                        <h1 className="font-serif text-xl font-bold text-gray-900">
                            {navItems.find(n => n.path === location.pathname)?.label || 'Dashboard'}
                        </h1>
                    </div>
                    {(user?.role === 'super_admin' || user?.role === 'owner') && (
                        <select
                            value={activeRestaurant?.id || ''}
                            onChange={e => switchRestaurant(restaurants.find(r => r.id === e.target.value))}
                            className="text-sm border border-border rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                            {restaurants.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>
                    )}
                </header>
                <main className="flex-1 overflow-y-auto p-4 md:p-7">
                    {children}
                </main>
            </div>
        </div>
    )
}