import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useConfirm } from '../../context/ConfirmContext'
import { resolveUnitCost } from '../../lib/mixCost'
import { fmtMoney, fmtQty } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import { matches } from '../../lib/search'
import { countName } from '../../lib/products'
import { countedLine } from '../../lib/countedAt'
import { orderFormats } from '../../lib/countUnits'
import { card } from '../../lib/controlStyles'
import SearchBox from '../../components/SearchBox'
import { sectionColour, sectionRank } from '../../lib/sections'

// One row is one product in one place, and a product can be kept in more than
// one. Tacos live in the freezer and there are two boxes in the cold room
// defrosting, so they appear under both headings and are counted separately
// under each. Nearly everything appears once.
const placeKey = (productId, section) => `${productId}|${section}`

function placesOf(product) {
    const main = product.section || 'Other'
    const extra = (product.also_in || []).filter(place => place && place !== main)
    return [main, ...extra]
}

// Products filed under every heading they belong to, in the order the store is
// walked. A heading with nothing under it is dropped rather than left as an
// empty bar, which matters once the list can be searched.
function group(list) {
    const grouped = {}
    for (const product of list) {
        for (const section of placesOf(product)) {
            if (!grouped[section]) grouped[section] = []
            grouped[section].push(product)
        }
    }
    return Object.entries(grouped)
        .map(([section, items]) => ({
            section,
            items: items.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => sectionRank(a.section) - sectionRank(b.section))
}

// One loose entry is its own total, so "4.27 KG = 4.27 KG" says the same number
// twice. The equals sign is there to show the arithmetic when somebody counted
// in packs, and with a single loose entry there is no arithmetic to show.
function justLoose(parts) {
    return parts.length === 1 && parts[0].isLoose
}

export default function StockTakeCountPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const confirm = useConfirm()

    const [session, setSession] = useState(null)
    const [products, setProducts] = useState([])
    const [lines, setLines] = useState([])
    const [preferredPrices, setPreferredPrices] = useState([])
    const [recipeLines, setRecipeLines] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    // Which row is open, and a row is a product in a place rather than a
    // product, so opening the freezer one does not open the cold room one.
    const [expandedKey, setExpandedKey] = useState(null)
    // draftCounts: { [formatId or 'loose']: stringValue }
    const [draftCounts, setDraftCounts] = useState({})
    const [draftLocation, setDraftLocation] = useState('')
    const [savingLine, setSavingLine] = useState(false)
    const [search, setSearch] = useState('')
    const [showUncountedOnly, setShowUncountedOnly] = useState(false)
    const [filterSnapshot, setFilterSnapshot] = useState(null)
    const [formatsByProductId, setFormatsByProductId] = useState({})
    // Who wrote each line, for the stamp under it. Names only, and only
    // the people who actually counted something on this session.
    const [counters, setCounters] = useState({})
    // The none that was just recorded, so it can be taken back without a
    // dialog. One at a time: two undos on screen at once would be a list of
    // things to think about rather than one thing to fix.
    const [justNoned, setJustNoned] = useState(null)

    const isManager = user && ['super_admin', 'owner', 'store_manager'].includes(user.role)

    useEffect(() => {
        fetchEverything()
    }, [id])

    // The undo is offered for ten seconds, which is long enough to notice the
    // wrong row and short enough that it is gone before the next shelf.
    useEffect(() => {
        if (!justNoned) return
        const timer = setTimeout(() => setJustNoned(null), 10000)
        return () => clearTimeout(timer)
    }, [justNoned])

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
            .order('name')

        if (productsErr) {
            setError(friendlyError(productsErr))
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

        // Fetch pack formats for the preferred prices, build a per-product lookup.
        const preferredPriceIds = (pricesData || []).map(p => p.id)
        let countUnitsData = []
        if (preferredPriceIds.length > 0) {
            const { data: cuData } = await supabase
                .from('price_count_units')
                .select('*')
                .in('price_id', preferredPriceIds)
                .eq('is_active', true)
                .order('sort_order', { ascending: true })
            countUnitsData = cuData || []
        }

        // Map: product_id -> { formats: [...], allowLoose: bool }
        const priceByProduct = {}
        for (const p of (pricesData || [])) priceByProduct[p.product_id] = p
        const formatsMap = {}
        for (const product_id in priceByProduct) {
            const price = priceByProduct[product_id]
            formatsMap[product_id] = {
                formats: orderFormats(countUnitsData.filter(cu => cu.price_id === price.id)),
                allowLoose: price.allow_loose_count ?? true,
            }
        }
        setFormatsByProductId(formatsMap)

        const { data: recipesData } = await supabase
            .from('mix_recipes')
            .select('*')
        setRecipeLines(recipesData || [])

        // The names behind counted_by. Its own query rather than a join,
        // because a count has to keep working for somebody who cannot read the
        // users table, and then the line simply says the time and no name.
        const who = [...new Set((linesData || []).map(l => l.counted_by).filter(Boolean))]
        if (who.length > 0) {
            const { data: people } = await supabase
                .from('users')
                .select('id, full_name')
                .in('id', who)
            setCounters(Object.fromEntries((people || []).map(p => [p.id, p.full_name])))
        }

        setLoading(false)
    }

    // Every line carries the place it was counted in, so asking by place never
    // counts the same box twice however many headings a product appears under.
    function linesIn(productId, section) {
        return lines.filter(l => l.product_id === productId && (l.section || 'Other') === section)
    }

    function getProductTotal(productId, section) {
        return linesIn(productId, section)
            .reduce((sum, l) => sum + Number(l.quantity_counted || 0), 0)
    }

    function getProductValue(productId, section) {
        return linesIn(productId, section)
            .reduce((s, l) => s + Number(l.line_total || 0), 0)
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

    function getProductLines(productId, section) {
        return linesIn(productId, section)
            .sort((a, b) => new Date(a.counted_at) - new Date(b.counted_at))
    }

    // Anything typed and not added, before it is thrown away.
    //
    // Opening another product cleared the box, and so did closing the one you
    // were in, so a number counted off a shelf could disappear because a thumb
    // landed on the wrong row. It only asks when there is a real quantity in
    // there, so it is never in the way of somebody just looking around.
    //
    // Add it is the main button because it is what you meant nine times out of
    // ten. Both answers carry on to wherever you were going: the question is
    // what to do with the number, not whether to move.
    async function keepOrDropDraft() {
        if (!expandedKey) return
        const [productId, section] = expandedKey.split('|')
        const product = products.find(p => p.id === productId)
        if (!product) return

        const { total, hasAny } = computeDraft(product)
        if (!hasAny || total <= 0) return

        const ok = await confirm({
            title: `Add the ${fmtQty(total)} ${product.unit} first?`,
            message: `You typed a quantity for ${countName(product)} and have not added it. Leaving now loses it.`,
            confirmLabel: 'Add it',
            cancelLabel: 'Discard it',
        })
        if (ok) await handleAddLine(product, section)
    }

    async function toggleExpand(key) {
        await keepOrDropDraft()

        if (expandedKey === key) {
            setExpandedKey(null)
        } else {
            setExpandedKey(key)
        }
        setDraftCounts({})
        setDraftLocation('')
    }

    async function handleAddLine(product, section) {
        const { total, breakdown, hasAny } = computeDraft(product)
        if (!hasAny || total < 0) return

        setSavingLine(true)

        const unitCost = resolveUnitCost(product, products, recipeLines, preferredPrices)
        const lineTotal = unitCost != null ? total * unitCost : null

        const { data, error: insertErr } = await supabase
            .from('stock_take_lines')
            .insert({
                stock_take_id: id,
                product_id: product.id,
                // The heading it was counted under. For nearly everything
                // that is the product's own section; for one kept in two
                // places it is the one the counter was standing in front of,
                // which is the whole point of the extra places.
                section: section || product.section || null,
                quantity_counted: total,
                unit_cost: unitCost,
                line_total: lineTotal,
                counted_by: user.id,
                location_note: draftLocation.trim() || null,
                unit_breakdown: Object.keys(breakdown).length > 0 ? breakdown : null,
            })
            .select()
            .single()

        setSavingLine(false)
        if (insertErr) { setError(friendlyError(insertErr)); return }

        setLines(prev => [...prev, data])
        if (user?.id && !counters[user.id]) {
            setCounters(prev => ({ ...prev, [user.id]: user.full_name || 'you' }))
        }
        setDraftCounts({})
        setDraftLocation('')
    }

    // Asked first, like every other delete in the app.
    //
    // This was the one that had nothing in front of it, and it is the one done
    // on a phone, in a fridge, with cold hands and a box under one arm. It
    // names the number being removed and what the product drops to, so the
    // question can be answered without opening anything else.
    // Nothing on the shelf, said in one tap.
    //
    // It writes an ordinary line of zero, which is not the same as leaving the
    // product uncounted: no line means nobody looked, a zero means somebody
    // looked and there was none, and those two lead to different orders. The
    // review screen has always drawn that distinction and there has never been
    // a way to record the second half of it.
    //
    // No confirmation. A dialog in a fridge with cold hands is two taps and a
    // sentence to read on every empty shelf, and what people do with a dialog
    // they meet forty times is stop reading it. The undo underneath forgives
    // the accident instead of trying to prevent it.
    async function handleNone(product, section) {
        setSavingLine(true)
        const unitCost = resolveUnitCost(product, products, recipeLines, preferredPrices)

        const { data, error: noneErr } = await supabase
            .from('stock_take_lines')
            .insert({
                stock_take_id: id,
                product_id: product.id,
                section: section || product.section || null,
                quantity_counted: 0,
                unit_cost: unitCost,
                line_total: 0,
                counted_by: user.id,
            })
            .select()
            .single()

        setSavingLine(false)
        if (noneErr) { setError(friendlyError(noneErr)); return }

        setLines(prev => [...prev, data])
        setJustNoned({ key: placeKey(product.id, section), lineId: data.id })
        if (user?.id && !counters[user.id]) {
            setCounters(prev => ({ ...prev, [user.id]: user.full_name || 'you' }))
        }
    }

    // Straight back out, no question asked. Asking here would undo the point of
    // not asking in the first place.
    async function undoNone(lineId) {
        setJustNoned(null)
        const { error: undoErr } = await supabase
            .from('stock_take_lines')
            .delete()
            .eq('id', lineId)

        if (undoErr) { setError(friendlyError(undoErr)); return }
        setLines(prev => prev.filter(l => l.id !== lineId))
    }

    async function handleDeleteLine(line, product, section) {
        const rest = getProductTotal(product.id, section) - Number(line.quantity_counted || 0)
        const ok = await confirm({
            title: `Delete this count of ${fmtQty(line.quantity_counted)} ${product.unit}?`,
            message: `${product.name} drops to ${fmtQty(rest)} ${product.unit} in ${section}.`,
            confirmLabel: 'Delete it',
            cancelLabel: 'Keep it',
            tone: 'danger',
        })
        if (!ok) return

        const { error: delErr } = await supabase
            .from('stock_take_lines')
            .delete()
            .eq('id', line.id)

        if (delErr) {
            setError(friendlyError(delErr))
            return
        }
        setLines(prev => prev.filter(l => l.id !== line.id))
    }

    function toggleUncountedFilter() {
        if (showUncountedOnly) {
            // Turning off
            setShowUncountedOnly(false)
            setFilterSnapshot(null)
        } else {
            // Turning on: snapshot what was uncounted at that moment, by place,
            // so a row does not vanish from under you as you count it.
            const uncounted = new Set(allPlaces.filter(key => !countedPlaces.has(key)))
            setFilterSnapshot(uncounted)
            setShowUncountedOnly(true)
        }
    }

    // Return the breakdown as an array of { key, text, factor } parts, sorted
    // by factor descending (biggest format left), with loose always last.
    function breakdownParts(line, product) {
        const b = line.unit_breakdown
        if (!b || typeof b !== 'object') return null
        const parts = []
        for (const [label, info] of Object.entries(b)) {
            const qty = info?.qty
            if (qty == null) continue
            const factor = Number(info.factor ?? 1)
            if (label === 'loose') {
                parts.push({ key: 'loose', text: `${fmtQty(qty)} ${product.unit}`, factor, isLoose: true })
            } else {
                parts.push({ key: label, text: `${fmtQty(qty)} ${label}`, factor, isLoose: false })
            }
        }
        if (parts.length === 0) return null

        parts.sort((a, b) => {
            // Loose always goes last
            if (a.isLoose && !b.isLoose) return 1
            if (!a.isLoose && b.isLoose) return -1
            // Otherwise biggest factor first
            return b.factor - a.factor
        })

        return parts
    }

    // Given a product's format config and the draft inputs, compute the base-unit
    // total and the breakdown to store. Returns { total, breakdown, hasAny }.
    function computeDraft(product) {
        const config = formatsByProductId[product.id] || { formats: [], allowLoose: true }
        let total = 0
        const breakdown = {}
        let hasAny = false

        for (const fmt of config.formats) {
            const raw = draftCounts[fmt.id]
            const qty = parseFloat(raw)
            if (!isNaN(qty) && qty > 0) {
                total += qty * Number(fmt.factor)
                breakdown[fmt.label] = { qty, factor: Number(fmt.factor) }
                hasAny = true
            }
        }

        // Loose (base unit). Offered if allowLoose, or if there are no formats at all.
        const looseAllowed = config.allowLoose || config.formats.length === 0
        if (looseAllowed) {
            const looseRaw = draftCounts['loose']
            const looseQty = parseFloat(looseRaw)
            if (!isNaN(looseQty) && looseQty > 0) {
                total += looseQty
                breakdown['loose'] = { qty: looseQty, factor: 1 }
                hasAny = true
            }
        }

        return { total, breakdown, hasAny }
    }

    // Two things narrow the list. The uncounted filter takes a snapshot when
    // it goes on, so a product does not vanish from under you the moment you
    // count it. The search is live and does the opposite job: you are holding a
    // box and you want that one product, not the hundred either side of it.
    const sections = useMemo(() => {
        const term = search.trim()
        return group(products)
            .map(({ section, items }) => ({
                section,
                items: items.filter(p =>
                    // The whole name as it reads on the count, so searching
                    // pita finds the Pita Pit bags and searching carrier
                    // finds them too.
                    matches(countName(p), term)
                    && (!showUncountedOnly || !filterSnapshot
                        || filterSnapshot.has(placeKey(p.id, section)))),
            }))
            .filter(entry => entry.items.length > 0)
    }, [products, search, showUncountedOnly, filterSnapshot])

    // The value card at the top is about the whole count and not about what is
    // on screen. Searching for one product should not make it look as though
    // the freezer is worth nothing.
    const allSections = useMemo(() => group(products), [products])

    const countedPlaces = useMemo(
        () => new Set(lines.map(l => placeKey(l.product_id, l.section || 'Other'))),
        [lines],
    )

    const allPlaces = products.flatMap(p => placesOf(p).map(section => placeKey(p.id, section)))

    // Products, not places.
    //
    // A second place is a might be there rather than an always is, so counting
    // the product once finishes it and the bar can reach the end. Counting
    // places meant a count could never be finished without walking to a shelf
    // that may well be empty, which is the opposite of what the second place is
    // for.
    //
    // The section headings still count their own shelf, because 3 of 12 in the
    // freezer is the useful number while you are standing in the freezer, and a
    // product waiting there is a prompt rather than an obligation. What was
    // counted in one place and not the other is said on the review.
    const countedProducts = useMemo(() => new Set(lines.map(l => l.product_id)), [lines])

    const progress = {
        counted: products.filter(p => countedProducts.has(p.id)).length,
        total: products.length,
    }

    const totalValue = useMemo(() => {
        return lines.reduce((sum, l) => sum + Number(l.line_total || 0), 0)
    }, [lines])

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
                    className="mt-4 text-sm font-semibold text-accent-ink"
                >
                    ← Back to stock takes
                </button>
            </div>
        )
    }

    const isClosed = session.status !== 'in_progress'

    // No fixed height on a phone.
    //
    // This page used to be exactly one screen tall with its own scroller
    // inside, which meant the app header could never scroll away and the list
    // was left with about half the screen. On a phone it is an ordinary tall
    // page now, its own bar sticks to the top as you go, and the header lifts
    // off with everything else. On a laptop it is still one screen with the
    // list scrolling inside it.
    return (
        <div className="-mx-4 md:-mx-7 -my-4 md:-my-7 flex flex-col md:h-[calc(100vh-4rem)]">
            {/* Fixed top bar (non-scrolling flex child).

                z-20 keeps it above the section headings below, which are z-10,
                while staying under the sidebar and its overlay. See the note in
                AppLayout: this bar used to be level with the sidebar and so it
                sat on top of the open menu instead of being blurred behind it. */}
            <div className="flex-shrink-0 sticky top-0 md:static z-20 bg-white border-b border-border shadow-sm px-4 md:px-7">
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
                            {isManager && (
                                <span className="text-gray-700 font-semibold"> · {fmtMoney(totalValue)} counted</span>
                            )}
                        </p>
                    </div>
                    {isManager && !isClosed && (
                        <button
                            type="button"
                            onClick={() => navigate(`/inventory/stock-takes/${id}/review`)}
                            className="text-sm font-semibold text-accent-ink flex-shrink-0"
                        >
                            Review
                        </button>
                    )}
                </div>
                {!isClosed && (
                    <div className="pb-2 flex flex-col sm:flex-row sm:items-center gap-2">
                        {/* Its own line on a phone and beside the filter on
                            anything wider. You are holding a box in one hand
                            and the phone in the other, so it is a full width
                            target rather than something tucked in a corner. */}
                        <SearchBox
                            value={search}
                            onChange={setSearch}
                            placeholder="Find a product"
                            className="flex-1 min-w-0"
                        />
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
                            <span className="text-xs text-muted whitespace-nowrap">
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
            <div className="flex-1 md:overflow-y-auto px-4 md:px-7 pb-20">
                {isManager && totalValue > 0 && (
                    <div className="pt-4">
                        <div className={`${card} p-4`}>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted">Value counted</p>
                                <p className="text-lg font-bold text-gray-900">{fmtMoney(totalValue)}</p>
                            </div>
                            <div className="space-y-1.5">
                                {allSections.map(({ section, items }) => {
                                    const sectionValue = items.reduce((s, p) => s + getProductValue(p.id, section), 0)
                                    if (sectionValue === 0) return null
                                    const colour = sectionColour(section)
                                    return (
                                        <div key={section} className="flex items-center justify-between text-sm">
                                            <span className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${colour.bar}`}></span>
                                                <span className="text-gray-700">{section}</span>
                                            </span>
                                            <span className="font-medium text-gray-900">{fmtMoney(sectionValue)}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {isClosed && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
                        This stock take is closed. Counts are read-only.
                    </div>
                )}

                {sections.length === 0 && (
                    <p className="text-sm text-muted pt-6">
                        {search.trim()
                            ? `Nothing matching "${search.trim()}".`
                            : 'Nothing to count.'}
                    </p>
                )}

                {sections.map(({ section, items }) => {
                    const sectionCounted = items.filter(p => countedPlaces.has(placeKey(p.id, section))).length
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
                                <span className="flex items-center gap-2">
                                    {isManager && (() => {
                                        const sectionValue = items.reduce((s, p) => s + getProductValue(p.id, section), 0)
                                        return sectionValue > 0 ? (
                                            <span className="text-xs font-semibold text-white bg-white/20 px-2 py-0.5 rounded-full">
                                                {fmtMoney(sectionValue)}
                                            </span>
                                        ) : null
                                    })()}
                                    <span className="text-xs font-semibold text-white bg-white/20 px-2 py-0.5 rounded-full">
                                        {sectionCounted}/{items.length}
                                    </span>
                                </span>
                            </div>
                            <div className={`${colour.bg} border ${colour.border} rounded-xl overflow-hidden`}>
                                {items.map((product, i) => {
                                    const key = placeKey(product.id, section)
                                    const total = getProductTotal(product.id, section)
                                    const productLines = getProductLines(product.id, section)
                                    const lineCount = productLines.length
                                    const isCounted = lineCount > 0
                                    const isExpanded = expandedKey === key
                                    // The other places this one turns up, said
                                    // on the row so nobody counts the freezer
                                    // boxes twice thinking they were missed.
                                    const elsewhere = placesOf(product).filter(place => place !== section)

                                    // Nothing counted here and nothing typed, so the
                                    // whole of this row is the offer to say there is
                                    // none. Counted rows do not need it.
                                    const canSayNone = !isClosed && !isCounted
                                    const noned = isCounted
                                        && lineCount === 1
                                        && Number(productLines[0].quantity_counted) === 0
                                    const undoable = justNoned?.key === key ? justNoned.lineId : null

                                    return (
                                        <div
                                            key={key}
                                            className={`${i < items.length - 1 ? 'border-b border-border' : ''} ${isExpanded ? 'bg-white' : ''} ${!isCounted ? 'border-l-4 border-l-amber-400' : 'border-l-4 border-l-transparent'}`}
                                        >
                                            {/* Row header, tap to expand.
                                                A row rather than one big button now, because
                                                None has to be its own control and a button
                                                inside a button is not a thing. */}
                                            <div className="flex items-stretch" style={{ minHeight: '56px' }}>
                                            <button
                                                type="button"
                                                onClick={() => !isClosed && toggleExpand(key)}
                                                className="flex-1 min-w-0 text-left px-4 py-3"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-900">
                                                            {countName(product)}
                                                            <span className="text-xs text-muted ml-2">{product.unit}</span>
                                                        </p>
                                                        {elsewhere.length > 0 && (
                                                            <p className="text-xs text-muted mt-0.5">
                                                                also in {elsewhere.join(', ')}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="text-right flex-shrink-0 flex items-center gap-2">
                                                        <div>
                                                            {isCounted ? (
                                                                <>
                                                                    <p className="font-semibold text-gray-900">{fmtQty(total)} {product.unit}</p>
                                                                    {noned ? (
                                                                        <p className="text-xs text-muted">None in stock</p>
                                                                    ) : isManager ? (
                                                                        <p className="text-xs text-muted">
                                                                            {fmtMoney(getProductValue(product.id, section))}
                                                                            {lineCount > 1 ? ` · ${lineCount} entries` : ''}
                                                                        </p>
                                                                    ) : (
                                                                        lineCount > 1 && (
                                                                            <p className="text-xs text-muted">{lineCount} entries</p>
                                                                        )
                                                                    )}
                                                                </>
                                                            ) : (
                                                                // Nothing here when None is on the row.
                                                                // The amber edge already says it has not
                                                                // been counted, and saying it twice is
                                                                // what pushed the words off the card.
                                                                !canSayNone && (
                                                                    <p className="text-sm font-medium text-amber-600">Not counted</p>
                                                                )
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

                                            {canSayNone && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleNone(product, section)}
                                                    disabled={savingLine}
                                                    className="flex-shrink-0 self-center mr-3 px-3 py-2 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                                                >
                                                    None
                                                </button>
                                            )}

                                            {undoable && (
                                                <button
                                                    type="button"
                                                    onClick={() => undoNone(undoable)}
                                                    className="flex-shrink-0 self-center mr-3 px-3 py-2 rounded-lg bg-accent text-white text-xs font-bold shadow-sm hover:brightness-95"
                                                >
                                                    Undo
                                                </button>
                                            )}
                                            </div>

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
                                                                            {(() => {
                                                                                const parts = breakdownParts(line, product)
                                                                                if (parts) {
                                                                                    return (
                                                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                                                            {parts.map(part => (
                                                                                                <span
                                                                                                    key={part.key}
                                                                                                    className="inline-block bg-gray-100 border border-border rounded-md px-2 py-0.5 text-xs font-medium text-gray-700"
                                                                                                >
                                                                                                    {part.text}
                                                                                                </span>
                                                                                            ))}
                                                                                            {!justLoose(parts) && (
                                                                                                <span className="text-xs text-muted">
                                                                                                    = {fmtQty(line.quantity_counted)} {product.unit}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    )
                                                                                }
                                                                                return (
                                                                                    <span className="font-semibold text-gray-900">
                                                                                        {fmtQty(line.quantity_counted)} {product.unit}
                                                                                    </span>
                                                                                )
                                                                            })()}
                                                                            {line.location_note && (
                                                                                <span className="text-xs text-muted block mt-1"> · {line.location_note}</span>
                                                                            )}
                                                                            {/* When, and who. A count can run over
                                                                                two days and be counted by two people,
                                                                                and both of those are the first thing
                                                                                asked when a number looks wrong. */}
                                                                            <span className="text-[0.6875rem] text-muted block mt-1">
                                                                                {countedLine(line.counted_at, counters[line.counted_by])}
                                                                            </span>
                                                                        </div>
                                                                        {canModify && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteLine(line, product, section)}
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

                                                    {/* Add a count: per-format fields, plus optional loose */}
                                                    {(() => {
                                                        const config = formatsByProductId[product.id] || { formats: [], allowLoose: true }
                                                        const looseAllowed = config.allowLoose || config.formats.length === 0
                                                        const { total, hasAny } = computeDraft(product)
                                                        return (
                                                            <div className="space-y-2">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {config.formats.map(fmt => (
                                                                        <div key={fmt.id} className="flex-1 min-w-[120px]">
                                                                            <label className="block text-xs font-medium text-muted mb-1">
                                                                                {fmt.label} <span className="font-normal">({fmtQty(fmt.factor)} {product.unit})</span>
                                                                            </label>
                                                                            <input
                                                                                type="text"
                                                                                inputMode="decimal"
                                                                                value={draftCounts[fmt.id] || ''}
                                                                                onChange={e => setDraftCounts(prev => ({ ...prev, [fmt.id]: e.target.value.replace(/[^0-9.]/g, '') }))}
                                                                                placeholder="0"
                                                                                className="w-full px-3 py-2.5 border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                    {looseAllowed && (
                                                                        <div className="flex-1 min-w-[120px]">
                                                                            <label className="block text-xs font-medium text-muted mb-1">
                                                                                {config.formats.length > 0 ? 'Loose' : 'Quantity'} <span className="font-normal">({product.unit})</span>
                                                                            </label>
                                                                            <input
                                                                                type="text"
                                                                                inputMode="decimal"
                                                                                value={draftCounts['loose'] || ''}
                                                                                onChange={e => setDraftCounts(prev => ({ ...prev, loose: e.target.value.replace(/[^0-9.]/g, '') }))}
                                                                                placeholder="0"
                                                                                className="w-full px-3 py-2.5 border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
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
                                                                        onClick={() => handleAddLine(product, section)}
                                                                        disabled={savingLine || !hasAny}
                                                                        className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors"
                                                                        style={{ minHeight: '44px' }}
                                                                    >
                                                                        Add
                                                                    </button>
                                                                </div>

                                                                {hasAny && (
                                                                    <p className="text-sm text-muted">
                                                                        = <span className="font-semibold text-gray-900">{fmtQty(total)} {product.unit}</span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )
                                                    })()}
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