import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'
import { useNavigate } from 'react-router-dom'
import { fmtMoney, fmtQty } from '../../lib/format'
import { todayISO, shortDate, addDays } from '../../lib/dates'
import { calculateWasteValue } from '../../lib/wasteValue'
import { REASONS, reasonLabel } from '../../lib/wasteReasons'
import { secondaryButton, card, dateField, jumpButton } from '../../lib/controlStyles'
import DateStepper from '../../components/DateStepper'
import { friendlyError } from '../../lib/errors'
import { matches } from '../../lib/search'
import { heldFor } from '../../lib/products'
import { useConfirm } from '../../context/ConfirmContext'
import { numberField } from '../../lib/numberInput'

// Waste log. One day at a time, built for a phone, because waste gets logged on
// the floor as it happens by whoever dropped the thing. That is the opposite of
// labour, which is a weekly grid done on a laptop with the roster.
//
// You build up a list first and save it in one go, because waste rarely comes
// one item at a time: a tray goes over and that is three things at once.
//
// Nothing is written to the database until you review the list. Employees can
// add entries but not edit or delete them, so a mistyped quantity would sit
// there until a manager fixed it. Seeing the list with the money on it catches
// 5 kg when you meant 0.5 kg while it still costs nothing to fix.
//
// Employees can see everything logged today at their restaurant, so two people
// do not log the same dropped tray twice. They cannot see any other day.

export default function WasteLogPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const confirm = useConfirm()

    const isManager = ['super_admin', 'owner', 'store_manager'].includes(user?.role)
    const navigate = useNavigate()

    const [logDate, setLogDate] = useState(todayISO())
    const [products, setProducts] = useState([])
    const [recipeLines, setRecipeLines] = useState([])
    const [prices, setPrices] = useState([])
    const [entries, setEntries] = useState([])

    // Two separate loading flags on purpose. `loading` is the catalogue, which
    // is all the page needs before it can show anything, so it blanks the page.
    // `loadingEntries` is just the one day's list, so it only dims that panel.
    const [loading, setLoading] = useState(true)
    const [loadingEntries, setLoadingEntries] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [refresh, setRefresh] = useState(0)

    // The form for one item
    const [search, setSearch] = useState('')
    const [productId, setProductId] = useState('')
    const [quantity, setQuantity] = useState('')
    const [reason, setReason] = useState('spoilage')

    // Items added but not yet saved. Nothing here has touched the database.
    const [basket, setBasket] = useState([])
    const [reviewing, setReviewing] = useState(false)

    const restaurantId = activeRestaurant?.id

    // The catalogue. Products, recipes and prices belong to the restaurant, not
    // to the day you are looking at, so this only runs when the restaurant
    // changes. It used to reload on every date change, which threw the whole
    // page away and rebuilt it just to step back one day.
    useEffect(() => {
        if (!restaurantId) return

        async function loadCatalogue() {
            setLoading(true)
            setError('')

            const { data: prods, error: pErr } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .order('name')

            if (pErr) { setError(friendlyError(pErr)); setLoading(false); return }
            setProducts(prods || [])

            // Needed to cost a MIX, which has no supplier price of its own.
            const { data: recipes, error: rErr } = await supabase
                .from('mix_recipes')
                .select('*')

            if (rErr) { setError(friendlyError(rErr)); setLoading(false); return }
            setRecipeLines(recipes || [])

            const { data: priceRows, error: prErr } = await supabase
                .from('product_supplier_prices')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .eq('is_preferred', true)

            if (prErr) { setError(friendlyError(prErr)); setLoading(false); return }
            setPrices(priceRows || [])

            setLoading(false)
        }

        loadCatalogue()
    }, [restaurantId])

    // The one day's entries. This is the only thing that has to change when you
    // move to another day, and it never blanks the page: the list stays on
    // screen and dims while the new one arrives.
    useEffect(() => {
        if (!restaurantId) return

        let cancelled = false

        async function loadEntries() {
            setLoadingEntries(true)

            const { data: logs, error: wErr } = await supabase
                .from('waste_logs')
                .select('*, products(name, unit)')
                .eq('restaurant_id', restaurantId)
                .eq('log_date', logDate)
                .order('created_at', { ascending: true })

            // Clicking the arrow quickly starts several of these. Without this
            // guard a slow earlier request could land last and show the wrong
            // day's entries.
            if (cancelled) return

            if (wErr) setError(friendlyError(wErr))
            else setEntries(logs || [])

            setLoadingEntries(false)
        }

        loadEntries()

        return () => { cancelled = true }
    }, [restaurantId, logDate, refresh])

    const selectedProduct = products.find(p => p.id === productId) || null

    // Worked out live as you type, so the money is on screen before you add it.
    const costing = calculateWasteValue(selectedProduct, quantity, products, recipeLines, prices)

    const filtered = search.trim()
        ? products.filter(p => !heldFor(p) && matches(p.name, search)).slice(0, 8)
        : []

    function pickProduct(p) {
        setProductId(p.id)
        setSearch(p.name)
    }

    function addToBasket(e) {
        e.preventDefault()
        setError(''); setSuccess('')

        if (!selectedProduct) { setError('Pick a product'); return }
        const qty = parseFloat(quantity)
        if (isNaN(qty) || qty <= 0) { setError('The quantity has to be above zero'); return }

        setBasket(prev => [...prev, {
            // Only used as a React key while the item is unsaved.
            key: `${Date.now()}-${prev.length}`,
            product: selectedProduct,
            quantity: qty,
            reason,
            unitCost: costing.unitCost,
            value: costing.value,
            hasCost: costing.hasCost,
        }])

        // Clear the product but keep the reason: a spill is usually several
        // things thrown out for the same reason.
        setProductId('')
        setSearch('')
        setQuantity('')
    }

    function removeFromBasket(key) {
        setBasket(prev => prev.filter(i => i.key !== key))
    }

    const basketTotal = basket.reduce((sum, i) => sum + (i.value || 0), 0)
    const basketMissingPrices = basket.filter(i => !i.hasCost).length

    async function confirmSave() {
        setSaving(true)
        setError('')

        // unit_cost and waste_value are stored as they are today, so a later
        // price change does not rewrite what the waste was worth on the day.
        const rows = basket.map(i => ({
            restaurant_id: restaurantId,
            product_id: i.product.id,
            log_date: logDate,
            quantity_wasted: i.quantity,
            unit_cost: i.unitCost,
            waste_value: i.value,
            reason: i.reason,
            logged_by: user.id,
        }))

        const { error: e1 } = await supabase.from('waste_logs').insert(rows)

        setSaving(false)
        if (e1) { setError(friendlyError(e1)); return }

        const count = rows.length
        setBasket([])
        setReviewing(false)
        setSuccess(`Logged ${count} ${count === 1 ? 'item' : 'items'}.`)
        setRefresh(n => n + 1)
    }

    async function handleDelete(entry) {
        const ok = await confirm({
            title: 'Delete this waste entry?',
            details: [
                { label: 'Product', value: entry.products?.name || 'Unknown product' },
                { label: 'Quantity', value: `${fmtQty(entry.quantity_wasted)} ${entry.products?.unit || ''}`.trim() },
                { label: 'Reason', value: reasonLabel(entry.reason) },
            ],
            confirmLabel: 'Delete entry',
            tone: 'danger',
        })
        if (!ok) return
        const { error: e1 } = await supabase.from('waste_logs').delete().eq('id', entry.id)
        if (e1) setError(friendlyError(e1))
        else setRefresh(n => n + 1)
    }

    const dayTotal = entries.reduce((sum, e) => sum + Number(e.waste_value || 0), 0)

    const fieldCls = 'w-full border border-border rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-accent bg-white'
    const labelCls = 'text-xs text-gray-500 mb-1 block'

    if (loading) {
        return <p className="text-sm text-gray-400">Loading...</p>
    }

    return (
        <>
            <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Waste</h2>
                    <p className="text-sm text-gray-500 mt-1">{activeRestaurant?.name}</p>
                </div>
                {isManager && (
                    <button
                        onClick={() => navigate('/waste/summary')}
                        className={secondaryButton}
                    >
                        Weekly summary
                    </button>
                )}
            </div>

            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
            {success && <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3 mb-4">{success}</div>}

            {/* Two columns once there is room for them. What you are adding
                goes on the left and what is already logged stays on the right,
                so you can see both at the same time instead of scrolling up and
                down between them. It stacks back on a phone, with adding first,
                which is what you want when you are standing at the bin. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div>
                    {/* Employees only ever see today, so there is nothing to
                        move between, but a manager can look back. */}
                    {isManager ? (
                        <div className={`${card} p-4 mb-3`}>
                            <DateStepper
                                onBack={() => setLogDate(addDays(logDate, -1))}
                                onNext={() => setLogDate(addDays(logDate, 1))}
                                backLabel="Previous day"
                                nextLabel="Next day"
                                jump={(
                                    <button
                                        type="button"
                                        onClick={() => setLogDate(todayISO())}
                                        className={jumpButton(logDate === todayISO())}
                                    >
                                        Today
                                    </button>
                                )}
                            >
                                <input
                                    type="date"
                                    value={logDate}
                                    onChange={e => setLogDate(e.target.value)}
                                    aria-label="Day"
                                    className={`${dateField} w-full`}
                                />
                            </DateStepper>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 mb-3">{shortDate(logDate)}</p>
                    )}

                    {/* Adding items. Bigger touch targets than the rest of the
                        app, because this gets used one-handed on the floor. */}
                    {!reviewing && (
                        <form onSubmit={addToBasket} className={`${card} p-5 mb-3`}>
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Add an item</h3>

                            <div className="mb-3 relative">
                                <label className={labelCls}>Product</label>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => { setSearch(e.target.value); setProductId('') }}
                                    className={fieldCls}
                                    placeholder="Start typing a product name"
                                />
                                {filtered.length > 0 && !productId && (
                                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-border rounded-lg shadow-sm overflow-hidden">
                                        {filtered.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => pickProduct(p)}
                                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-border last:border-0"
                                            >
                                                {p.name}
                                                <span className="text-xs text-gray-400 ml-2">{p.unit}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className={labelCls}>
                                        Quantity {selectedProduct ? `(${selectedProduct.unit})` : ''}
                                    </label>
                                    <input
                                        {...numberField({
                                            value: quantity,
                                            onChange: setQuantity,
                                        })}
                                        className={`${fieldCls} text-right`}
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Reason</label>
                                    <select value={reason} onChange={e => setReason(e.target.value)} className={fieldCls}>
                                        {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* The money for this one item, live */}
                            {selectedProduct && quantity !== '' && (
                                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                    {costing.hasCost ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-600">
                                                {fmtQty(quantity)} {selectedProduct.unit} at {fmtMoney(costing.unitCost)}
                                            </span>
                                            <span className="text-lg font-semibold text-gray-900">{fmtMoney(costing.value)}</span>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-amber-700">
                                            No price is set for this product, so the value cannot be worked out. You can still
                                            log it, and a manager can set the price later.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="flex justify-end">
                                <button type="submit" className="px-6 py-3 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors">
                                    Add to list
                                </button>
                            </div>
                        </form>
                    )}

                    {/* The list being built. Nothing here is saved yet. */}
                    {basket.length > 0 && (
                        <div className={`bg-white rounded-xl p-5 mb-4 ${reviewing ? 'border-2 border-accent' : 'border border-border'}`}>
                            <div className="flex items-center justify-between mb-1">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {reviewing ? 'Check before saving' : 'Not saved yet'}
                                </h3>
                                <span className="text-xs text-gray-500">
                                    {basket.length} {basket.length === 1 ? 'item' : 'items'}
                                </span>
                            </div>
                            {reviewing && (
                                <p className="text-xs text-gray-500 mb-3">Once this is saved you cannot change it yourself.</p>
                            )}

                            <div className="border border-border rounded-lg divide-y divide-border mb-3 mt-3">
                                {basket.map(i => (
                                    <div key={i.key} className="flex items-center gap-3 px-3 py-2.5">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-gray-900 truncate">{i.product.name}</div>
                                            <div className="text-xs text-gray-400">
                                                {fmtQty(i.quantity)} {i.product.unit} · {reasonLabel(i.reason)}
                                                {i.hasCost && ` · at ${fmtMoney(i.unitCost)}`}
                                            </div>
                                        </div>
                                        <span className={`text-sm whitespace-nowrap ${i.hasCost ? 'text-gray-900 font-medium' : 'text-amber-600'}`}>
                                            {i.hasCost ? fmtMoney(i.value) : 'No price'}
                                        </span>
                                        {!reviewing && (
                                            <button onClick={() => removeFromBasket(i.key)}
                                                className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                                                aria-label={`Remove ${i.product.name}`}>×</button>
                                        )}
                                    </div>
                                ))}
                                <div className="flex items-center justify-between px-3 py-3 bg-gray-50">
                                    <span className="text-sm font-medium text-gray-700">Total</span>
                                    <span className="text-xl font-semibold text-gray-900">{fmtMoney(basketTotal)}</span>
                                </div>
                            </div>

                            {basketMissingPrices > 0 && (
                                <p className="text-xs text-amber-700 mb-3">
                                    {basketMissingPrices} {basketMissingPrices === 1 ? 'item has' : 'items have'} no price set, so
                                    the total is lower than the real cost. They will still be logged.
                                </p>
                            )}

                            <div className="flex justify-end gap-2">
                                {reviewing ? (
                                    <>
                                        <button onClick={() => setReviewing(false)} disabled={saving}
                                            className="px-5 py-3 border border-border text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                                            Go back
                                        </button>
                                        <button onClick={confirmSave} disabled={saving}
                                            className="px-6 py-3 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50">
                                            {saving ? 'Saving...' : 'Save it'}
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={() => setReviewing(true)}
                                        className="px-6 py-3 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors">
                                        Review and save
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* What is already logged. Dims while another day loads instead
                    of disappearing, so the page does not jump. */}
                <div className={`${card} p-5 transition-opacity ${loadingEntries ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">
                            {logDate === todayISO() ? 'Logged today' : `Logged on ${shortDate(logDate)}`}
                        </h3>
                        <span className="text-sm text-gray-500">
                            total: <span className="font-semibold text-gray-900">{fmtMoney(dayTotal)}</span>
                        </span>
                    </div>

                    {entries.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Nothing logged yet.</p>
                    ) : (
                        <div className="divide-y divide-border">
                            {entries.map(e => (
                                <div key={e.id} className="flex items-center gap-3 py-2.5">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-900 truncate">{e.products?.name || 'Unknown product'}</div>
                                        <div className="text-xs text-gray-400">
                                            {fmtQty(e.quantity_wasted)} {e.products?.unit} · {reasonLabel(e.reason)}
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-900 whitespace-nowrap">
                                        {e.waste_value == null ? '-' : fmtMoney(e.waste_value)}
                                    </span>
                                    {isManager && (
                                        <button onClick={() => handleDelete(e)}
                                            className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                                            aria-label="Delete entry">×</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}