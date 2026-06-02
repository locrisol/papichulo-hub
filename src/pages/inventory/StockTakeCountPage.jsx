import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { calculateMixCost, resolveUnitCost } from '../../lib/mixCost'

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
    const [preferredPrices, setPreferredPrices] = useState([])
    const [recipeLines, setRecipeLines] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [expandedProductId, setExpandedProductId] = useState(null)
    const [draftQty, setDraftQty] = useState('')
    const [draftLocation, setDraftLocation] = useState('')
    const [savingLine, setSavingLine] = useState(false)
    const [showUncountedOnly, setShowUncountedOnly] = useState(false)
    const [filterSnapshot, setFilterSnapshot] = useState(null)

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
        setPreferredPrices(pricesData || [])

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

    function getProductLines(productId) {
        return lines
            .filter(l => l.product_id === productId)
            .sort((a, b) => new Date(a.counted_at) - new Date(b.counted_at))
    }

    function toggleExpand(productId) {
        if (expandedProductId === productId) {
            setExpandedProductId(null)
        } else {
            setExpandedProductId(productId)
            setDraftQty('')
            setDraftLocation('')
        }
    }

    async function handleAddLine(product) {
        const qty = parseFloat(draftQty)
        if (isNaN(qty) || qty < 0) {
            return // ignore invalid; the input guards this but double-check
        }

        setSavingLine(true)

        const unitCost = resolveUnitCost(product, products, recipeLines, preferredPrices)
        const lineTotal = unitCost != null ? qty * unitCost : null

        const { data, error: insertErr } = await supabase
            .from('stock_take_lines')
            .insert({
                stock_take_id: id,
                product_id: product.id,
                section: product.section || null,
                quantity_counted: qty,
                unit_cost: unitCost,
                line_total: lineTotal,
                counted_by: user.id,
                location_note: draftLocation.trim() || null,
            })
            .select()
            .single()

        setSavingLine(false)

        if (insertErr) {
            setError(insertErr.message)
            return
        }

        // Optimistic: add the new line to local state, keep row open, clear inputs.
        setLines(prev => [...prev, data])
        setDraftQty('')
        setDraftLocation('')
    }

    async function handleDeleteLine(lineId) {
        const { error: delErr } = await supabase
            .from('stock_take_lines')
            .delete()
            .eq('id', lineId)

        if (delErr) {
            setError(delErr.message)
            return
        }
        setLines(prev => prev.filter(l => l.id !== lineId))
    }

    function toggleUncountedFilter() {
        if (showUncountedOnly) {
            // Turning off
            setShowUncountedOnly(false)
            setFilterSnapshot(null)
        } else {
            // Turning on: snapshot the currently-uncounted product IDs
            const uncounted = new Set(
                products.filter(p => !countedProductIds.has(p.id)).map(p => p.id)
            )
            setFilterSnapshot(uncounted)
            setShowUncountedOnly(true)
        }
    }

    // Round to at most 3 decimals and strip trailing zeros, to avoid
    // floating-point display artefacts like 11.799999999999999.
    function fmtQty(n) {
        return parseFloat(Number(n).toFixed(3)).toString()
    }

    const sections = useMemo(() => {
        // When the uncounted filter is on, show only products that were
        // uncounted at the moment the filter was switched on (sticky snapshot).
        const visibleProducts = showUncountedOnly && filterSnapshot
            ? products.filter(p => filterSnapshot.has(p.id))
            : products

        const grouped = {}
        for (const product of visibleProducts) {
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
    }, [products, showUncountedOnly, filterSnapshot])

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
                {!isClosed && (
                    <div className="pb-2 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleUncountedFilter}
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${showUncountedOnly
                                ? 'bg-accent text-white border-accent'
                                : 'bg-white text-gray-700 border-border hover:bg-gray-50'
                                }`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                            </svg>
                            {showUncountedOnly ? 'Showing uncounted' : 'Show uncounted only'}
                        </button>
                        {showUncountedOnly && filterSnapshot && (
                            <span className="text-xs text-muted">
                                {filterSnapshot.size} to count
                            </span>
                        )}
                    </div>
                )}
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
                                    const productLines = getProductLines(product.id)
                                    const lineCount = productLines.length
                                    const isCounted = lineCount > 0
                                    const isExpanded = expandedProductId === product.id

                                    return (
                                        <div
                                            key={product.id}
                                            className={`${i < items.length - 1 ? 'border-b border-border' : ''} ${isExpanded ? 'bg-white' : ''} ${!isCounted ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-transparent'}`}
                                        >
                                            {/* Row header — tap to expand */}
                                            <button
                                                type="button"
                                                onClick={() => !isClosed && toggleExpand(product.id)}
                                                className="w-full text-left px-4 py-3"
                                                style={{ minHeight: '56px' }}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-900">
                                                            {product.name}
                                                            <span className="text-xs text-muted ml-2">{product.unit}</span>
                                                        </p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 flex items-center gap-2">
                                                        <div>
                                                            {isCounted ? (
                                                                <>
                                                                    <p className="font-semibold text-gray-900">{fmtQty(total)} {product.unit}</p>
                                                                    {lineCount > 1 && (
                                                                        <p className="text-xs text-muted">{lineCount} entries</p>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <p className="text-sm font-medium text-amber-600">Not counted</p>
                                                            )}
                                                        </div>
                                                        {!isClosed && (
                                                            <svg
                                                                className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>

                                            {/* Expanded section */}
                                            {isExpanded && (
                                                <div className="px-4 pb-4 bg-white">
                                                    {/* Existing lines */}
                                                    {/* Existing lines */}
                                                    {productLines.length > 0 && (
                                                        <div className="space-y-2 mb-3">
                                                            {productLines.map(line => {
                                                                const canModify = isManager || line.counted_by === user.id
                                                                return (
                                                                    <div
                                                                        key={line.id}
                                                                        className="flex items-center justify-between gap-2 text-sm bg-white border border-border rounded-lg px-3 py-2.5 shadow-sm"
                                                                    >
                                                                        <div className="flex-1 min-w-0">
                                                                            <span className="font-semibold text-gray-900">
                                                                                {fmtQty(line.quantity_counted)} {product.unit}
                                                                            </span>
                                                                            {line.location_note && (
                                                                                <span className="text-muted"> · {line.location_note}</span>
                                                                            )}
                                                                        </div>
                                                                        {canModify && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteLine(line.id)}
                                                                                className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-2.5 py-1.5 rounded-md transition-colors"
                                                                            >
                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                                </svg>
                                                                                Delete
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}

                                                    {/* Add a count */}
                                                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                                                        <div className="flex-1">
                                                            <label className="block text-xs font-medium text-muted mb-1">
                                                                Quantity ({product.unit})
                                                            </label>
                                                            <input
                                                                type="text"
                                                                inputMode="decimal"
                                                                value={draftQty}
                                                                onChange={e => {
                                                                    // Allow only numbers and a single decimal point
                                                                    const v = e.target.value.replace(/[^0-9.]/g, '')
                                                                    setDraftQty(v)
                                                                }}
                                                                placeholder="0"
                                                                className="w-full px-3 py-2.5 border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <label className="block text-xs font-medium text-muted mb-1">
                                                                Location <span className="font-normal">(optional)</span>
                                                            </label>
                                                            <input
                                                                type="text"
                                                                value={draftLocation}
                                                                onChange={e => setDraftLocation(e.target.value)}
                                                                placeholder="e.g. back cold room"
                                                                className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddLine(product)}
                                                            disabled={savingLine || draftQty === '' || isNaN(parseFloat(draftQty))}
                                                            className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors flex-shrink-0"
                                                            style={{ minHeight: '44px' }}
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
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