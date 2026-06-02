import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { calculateMixCost } from '../../lib/mixCost'

// Section display order. Products whose section isn't in this list sort last.
const SECTION_ORDER = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

// Section colour theming.
const SECTION_COLOURS = {
    'Freezer': { text: 'text-blue-700', bar: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', solid: 'bg-blue-600', ring: 'ring-blue-600' },
    'Cold Room': { text: 'text-green-700', bar: 'bg-green-500', bg: 'bg-green-50', border: 'border-green-200', solid: 'bg-green-600', ring: 'ring-green-600' },
    'Dry': { text: 'text-amber-700', bar: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', solid: 'bg-amber-600', ring: 'ring-amber-600' },
    'Packaging': { text: 'text-red-700', bar: 'bg-red-500', bg: 'bg-red-50', border: 'border-red-200', solid: 'bg-red-600', ring: 'ring-red-600' },
    'Cleaning': { text: 'text-purple-700', bar: 'bg-purple-500', bg: 'bg-purple-50', border: 'border-purple-200', solid: 'bg-purple-600', ring: 'ring-purple-600' },
    'Other': { text: 'text-gray-700', bar: 'bg-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', solid: 'bg-gray-600', ring: 'ring-gray-600' },
}

function sectionColour(section) {
    return SECTION_COLOURS[section] || SECTION_COLOURS['Other']
}

function sectionRank(section) {
    const i = SECTION_ORDER.indexOf(section)
    return i === -1 ? SECTION_ORDER.length : i
}

export default function StockTakeCountPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()

    const [session, setSession] = useState(null)
    const [products, setProducts] = useState([])
    const [lines, setLines] = useState([])
    const [preferredPrices, setPreferredPrices] = useState({})
    const [recipeLines, setRecipeLines] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const isManager = user && ['super_admin', 'owner', 'store_manager'].includes(user.role)

    useEffect(() => {
        fetchEverything()
    }, [id])

    async function fetchEverything() {
        setLoading(true)
        setError('')

        const { data: sessionData, error: sessionErr } = await supabase
            .from('stock_takes')
            .select('*')
            .eq('id', id)
            .single()

        if (sessionErr || !sessionData) {
            setError('Stock take session not found.')
            setLoading(false)
            return
        }
        setSession(sessionData)

        const { data: productsData, error: productsErr } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)

        if (productsErr) {
            setError(productsErr.message)
            setLoading(false)
            return
        }
        setProducts(productsData || [])

        const { data: linesData } = await supabase
            .from('stock_take_lines')
            .select('*')
            .eq('stock_take_id', id)
        setLines(linesData || [])

        const { data: pricesData } = await supabase
            .from('product_supplier_prices')
            .select('*')
            .eq('is_preferred', true)
        const priceMap = {}
        for (const p of pricesData || []) {
            priceMap[p.product_id] = p
        }
        setPreferredPrices(priceMap)

        const { data: recipesData } = await supabase
            .from('mix_recipes')
            .select('*')
        setRecipeLines(recipesData || [])

        setLoading(false)
    }

    function getProductTotal(productId) {
        return lines
            .filter(l => l.product_id === productId)
            .reduce((sum, l) => sum + Number(l.quantity_counted || 0), 0)
    }

    function getProductLineCount(productId) {
        return lines.filter(l => l.product_id === productId).length
    }

    function sessionTitle() {
        // If the user gave a custom note, use it as-is.
        if (session.notes && session.notes.trim()) return session.notes.trim()

        // Otherwise build "Monthly Stock Take (June 2026)" from type + start date.
        const typeWord = session.type
            ? session.type.charAt(0).toUpperCase() + session.type.slice(1)
            : 'Stock'
        const monthYear = new Date(session.started_at).toLocaleDateString('en-IE', {
            month: 'long',
            year: 'numeric',
        })
        return `${typeWord} Stock Take (${monthYear})`
    }

    const sections = useMemo(() => {
        const grouped = {}
        for (const product of products) {
            const section = product.section || 'Other'
            if (!grouped[section]) grouped[section] = []
            grouped[section].push(product)
        }
        return Object.entries(grouped)
            .map(([section, items]) => ({
                section,
                items: items.sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => sectionRank(a.section) - sectionRank(b.section))
    }, [products])

    const countedProductIds = useMemo(() => {
        return new Set(lines.map(l => l.product_id))
    }, [lines])

    const progress = {
        counted: products.filter(p => countedProductIds.has(p.id)).length,
        total: products.length,
    }

    if (loading) {
        return (
            <div className="p-6">
                <p className="text-sm text-gray-500">Loading stock take...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                    {error}
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/inventory/stock-takes')}
                    className="mt-4 text-sm font-semibold text-accent"
                >
                    ← Back to stock takes
                </button>
            </div>
        )
    }

    const isClosed = session.status !== 'in_progress'

    return (
        <div
            className="-mx-4 md:-mx-7 -my-4 md:-my-7 flex flex-col"
            style={{ height: 'calc(100vh - 4rem)' }}
        >
            {/* Fixed top bar (non-scrolling flex child) */}
            <div className="flex-shrink-0 z-30 bg-white border-b border-border shadow-sm px-4 md:px-7">
                <div className="py-3 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/inventory/stock-takes')}
                        className="text-gray-500 hover:text-gray-700 flex-shrink-0"
                        aria-label="Back"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="font-semibold text-gray-900 truncate">
                            {sessionTitle()}
                        </h1>
                        <p className="text-xs text-muted">
                            {progress.counted}/{progress.total} products counted
                        </p>
                    </div>
                    {isManager && !isClosed && (
                        <button
                            type="button"
                            onClick={() => navigate(`/inventory/stock-takes/${id}/review`)}
                            className="text-sm font-semibold text-accent flex-shrink-0"
                        >
                            Review
                        </button>
                    )}
                </div>
                <div className="w-full bg-gray-200 h-1">
                    <div
                        className="bg-accent h-full transition-all"
                        style={{ width: progress.total > 0 ? `${(progress.counted / progress.total) * 100}%` : '0%' }}
                    />
                </div>
            </div>

            {/* Scrolling body */}
            <div className="flex-1 overflow-y-auto px-4 md:px-7 pb-20">
                {isClosed && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
                        This stock take is closed. Counts are read-only.
                    </div>
                )}

                {sections.map(({ section, items }) => {
                    const sectionCounted = items.filter(p => countedProductIds.has(p.id)).length
                    const colour = sectionColour(section)
                    return (
                        <div key={section} className="pt-4">
                            <div className={`sticky top-0 z-10 ${colour.solid} rounded-lg px-3 py-2.5 mb-2 flex items-center justify-between shadow-md`}>
                                <div className="flex items-center gap-2">
                                    <svg className="w-4 h-4 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                    <h2 className="font-serif text-base font-bold text-white">{section}</h2>
                                </div>
                                <span className="text-xs font-semibold text-white bg-white/20 px-2 py-0.5 rounded-full">
                                    {sectionCounted}/{items.length}
                                </span>
                            </div>
                            <div className={`${colour.bg} border ${colour.border} rounded-xl overflow-hidden`}>
                                {items.map((product, i) => {
                                    const total = getProductTotal(product.id)
                                    const lineCount = getProductLineCount(product.id)
                                    const isCounted = lineCount > 0
                                    return (
                                        <div
                                            key={product.id}
                                            className={`px-4 py-3 ${i < items.length - 1 ? 'border-b border-border' : ''}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900">
                                                        {product.name}
                                                        <span className="text-xs text-muted ml-2">{product.unit}</span>
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    {isCounted ? (
                                                        <>
                                                            <p className="font-semibold text-gray-900">{total} {product.unit}</p>
                                                            {lineCount > 1 && (
                                                                <p className="text-xs text-muted">{lineCount} entries</p>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <p className="text-sm text-gray-400">Not counted</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}