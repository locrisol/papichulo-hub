import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useNavigate } from 'react-router-dom'
import { fmtMoney, fmtQty } from '@/lib/format'
import { todayISO, shortDate, addDays } from '@/lib/dates'
import { calculateWasteValue } from '@/lib/wasteValue'
import { REASONS, reasonLabel } from '@/lib/wasteReasons'
import { card, dateField, removeButton, secondaryButton, labelClass, fieldClass, hintClass, primaryButton } from '@/lib/controlStyles'
import JumpButton from '@/components/ui/JumpButton'
import DateStepper from '@/components/ui/DateStepper'
import { friendlyError } from '@/lib/errors'
import { heldFor } from '@/lib/products'
import { useConfirm } from '@/context/confirm'
import { numberField } from '@/lib/numberInput'
import { can, MANAGERS } from '@/lib/access'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'
import ProductSelect from '@/components/ui/ProductSelect'

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

// What to say when an item cannot be valued. A MIX is costed from its recipe,
// so "no price is set" is only ever true of something bought. For a MIX it is
// an ingredient that cannot be costed (no price, switched off, or a MIX of its
// own that is not complete), or its own recipe that is not complete.
//
// It does not say a manager can fix it later. The value is kept as it was on
// the day, so setting the price afterwards never reaches this entry.
function noValueMessage(product, status) {
    const reason = !product?.is_mix
        ? 'No price is set for this product'
        : status === 'missing_price'
            ? 'An ingredient in this recipe cannot be costed'
            : 'The recipe for this product is not complete'
    return `${reason}, so the value cannot be worked out. You can still log it, but it will be saved without a value.`
}

export default function WasteLogPage() {
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const confirm = useConfirm()

    const isManager = can(user, MANAGERS)
    const navigate = useNavigate()

    const [logDate, setLogDate] = useState(todayISO())
    // What can be logged: the products still in use. Costing a MIX reads only
    // these, so an ingredient switched off cannot be costed.
    const [products, setProducts] = useState([])
    // Every product, switched off ones included, for the names on the day's
    // list. Something logged this morning and switched off this afternoon is
    // still on today's list.
    const [allProducts, setAllProducts] = useState([])
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
    // Kept apart from the page's error above. That one is for something that
    // would not load, which belongs at the top of the page because there is
    // nothing else up there to read. This is for a save that would not go
    // through, and that belongs beside the button you pressed: at the foot of
    // a form on a phone, the top of the page is not on the screen at all.
    const [formProblem, setFormProblem] = useState('')
    const [success, setSuccess] = useState('')
    const [refresh, setRefresh] = useState(0)

    // The form for one item
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

            // Through staff_products, for a manager too, since this page
            // needs nothing the view leaves out: the notes, the weight loss
            // and the rest of what only the Products page uses.
            const { data: prods, error: pErr } = await supabase
                .from('staff_products')
                .select('*')
                .order('name')

            if (pErr) { setError(friendlyError(pErr)); setLoading(false); return }
            setAllProducts(prods || [])
            setProducts((prods || []).filter(p => p.is_active))

            // Needed to cost a MIX, which has no supplier price of its own.
            // What goes in and how much, without the notes, which is what
            // staff are given of the recipes.
            const { data: recipes, error: rErr } = await supabase
                .from('staff_mix_recipes')
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

            // The names come from the products already loaded rather than
            // from the products table beside each entry, which staff cannot
            // read.
            const { data: logs, error: wErr } = await supabase
                .from('waste_logs')
                .select('*')
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
    const productOf = id => allProducts.find(p => p.id === id) || null

    // Worked out live as you type, so the money is on screen before you add it.
    const costing = calculateWasteValue(selectedProduct, quantity, products, recipeLines, prices)

    // What can be picked: every product in use that is not held back. Every
    // match shows, grouped by section, where the old list stopped at eight
    // without saying there were more.
    const pickable = useMemo(() => products.filter(p => !heldFor(p)), [products])

    function addToBasket(e) {
        e.preventDefault()
        setFormProblem(''); setSuccess('')

        if (!selectedProduct) { setFormProblem('Pick a product'); return }
        const qty = parseFloat(quantity)
        if (isNaN(qty) || qty <= 0) { setFormProblem('Enter a quantity above 0'); return }

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
        setQuantity('')
    }

    function removeFromBasket(key) {
        setBasket(prev => prev.filter(i => i.key !== key))
    }

    const basketTotal = basket.reduce((sum, i) => sum + (i.value || 0), 0)
    const basketMissingPrices = basket.filter(i => !i.hasCost).length

    async function confirmSave() {
        setSaving(true)
        setFormProblem('')

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
        if (e1) { setFormProblem(friendlyError(e1)); return }

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
                { label: 'Product', value: productOf(entry.product_id)?.name || 'Unknown product' },
                { label: 'Quantity', value: `${fmtQty(entry.quantity_wasted)} ${productOf(entry.product_id)?.unit || ''}`.trim() },
                { label: 'Reason', value: reasonLabel(entry.reason) },
            ],
            confirmLabel: 'Delete entry',
            tone: 'danger',
        })
        if (!ok) return
        // A delete the rules turn away is not an error, it just removes
        // nothing, so the row has to come back for it to count as gone.
        const { data: gone, error: e1 } = await supabase.from('waste_logs')
            .delete().eq('id', entry.id).select('id')
        if (e1) setError(friendlyError(e1))
        else if (!gone?.length) setError('That entry could not be deleted, so nothing has changed.')
        else setRefresh(n => n + 1)
    }

    const dayTotal = entries.reduce((sum, e) => sum + Number(e.waste_value || 0), 0)


    if (loading) {
        return <p className="text-sm text-muted">Loading...</p>
    }

    return (
        <>
            <PageHeader title="Waste" subtitle={activeRestaurant?.name}>
                {isManager && (
                    <button
                        onClick={() => navigate('/waste/summary')}
                        className={secondaryButton}
                    >
                        Waste summary
                    </button>
                )}
            </PageHeader>

            <ErrorBanner className="mb-4">{error}</ErrorBanner>
            <Notice tone="good" className="mb-4">{success}</Notice>

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
                                    <JumpButton
                                        isCurrent={logDate === todayISO()}
                                        unit="day"
                                        onClick={() => setLogDate(todayISO())}
                                    />
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
                        <p className="text-sm text-muted mb-3">{shortDate(logDate)}</p>
                    )}

                    {/* Adding items. Bigger touch targets than the rest of the
                        app, because this gets used one-handed on the floor. */}
                    {!reviewing && (
                        <form onSubmit={addToBasket} className={`${card} p-5 mb-3`}>
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">Add an item</h3>

                            <div className="mb-3">
                                <label className={labelClass}>Product</label>
                                <ProductSelect
                                    large
                                    value={productId}
                                    onChange={setProductId}
                                    products={pickable}
                                    placeholder="Product name"
                                />
                                <p className={hintClass}>Start typing and pick from the list.</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className={labelClass}>
                                        Quantity {selectedProduct ? `(${selectedProduct.unit})` : ''}
                                    </label>
                                    <input
                                        {...numberField({
                                            value: quantity,
                                            onChange: setQuantity,
                                        })}
                                        className={`${fieldClass} text-right`}
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Reason</label>
                                    <select value={reason} onChange={e => setReason(e.target.value)} className={fieldClass}>
                                        {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* The money for this one item, live. Nothing until the
                                quantity is above zero, or typing 0.5 would say for a
                                moment that something is missing when nothing is. */}
                            {costing.status && (
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
                                            {noValueMessage(selectedProduct, costing.status)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Above the button row rather than inside it. As a sibling of the
                                button it sat beside it on one line, which squeezes both on a
                                phone and is not where the eye goes after a press. */}
                            {formProblem && (
                              <ErrorBanner className="mb-3">{formProblem}</ErrorBanner>
                            )}

                            <div className="flex justify-end">
                                <button type="submit" className={primaryButton('xl')}>
                                    Add to list
                                </button>
                            </div>
                        </form>
                    )}

                    {/* The list being built. Nothing here is saved yet. */}
                    {basket.length > 0 && (
                        <div className={`bg-white rounded-xl p-5 mb-4 ${reviewing ? 'border-2 border-accent' : 'border border-border'}`}>
                            <div className="flex items-center justify-between gap-3 mb-1">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {reviewing ? 'Check before saving' : 'Not saved yet'}
                                </h3>
                                <span className="text-xs text-muted">
                                    {basket.length} {basket.length === 1 ? 'item' : 'items'}
                                </span>
                            </div>
                            {reviewing && (
                                <p className="text-xs text-muted mb-3">Once saved, only a manager can delete an entry.</p>
                            )}

                            <div className="border border-border rounded-lg divide-y divide-border mb-3 mt-3">
                                {basket.map(i => (
                                    <div key={i.key} className="flex items-center gap-3 px-3 py-2.5">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-gray-900 break-words">{i.product.name}</div>
                                            <div className="text-xs text-muted">
                                                {fmtQty(i.quantity)} {i.product.unit} · {reasonLabel(i.reason)}
                                                {i.hasCost && ` · at ${fmtMoney(i.unitCost)}`}
                                            </div>
                                        </div>
                                        <span className={`text-sm whitespace-nowrap ${i.hasCost ? 'text-gray-900 font-medium' : 'text-amber-700'}`}>
                                            {i.hasCost ? fmtMoney(i.value) : (i.product.is_mix ? 'No value' : 'No price')}
                                        </span>
                                        {!reviewing && (
                                            <button onClick={() => removeFromBasket(i.key)}
                                                className={removeButton}
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
                                    {basketMissingPrices} {basketMissingPrices === 1 ? 'item' : 'items'} could not be valued, so
                                    the total is lower than the real cost. They will still be logged.
                                </p>
                            )}

                            {/* Above the button row rather than inside it. As a sibling of the
                                button it sat beside it on one line, which squeezes both on a
                                phone and is not where the eye goes after a press. */}
                            {formProblem && (
                              <ErrorBanner className="mb-3">{formProblem}</ErrorBanner>
                            )}

                            <div className="flex justify-end gap-2">
                                {reviewing ? (
                                    <>
                                        <button onClick={() => setReviewing(false)} disabled={saving}
                                            className={secondaryButton}>
                                            Go back
                                        </button>
                                        <button onClick={confirmSave} disabled={saving}
                                            className={primaryButton('xl')}>
                                            {saving ? 'Saving...' : 'Save'}
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={() => setReviewing(true)}
                                        className={primaryButton('xl')}>
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
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-sm font-semibold text-gray-700">
                            {logDate === todayISO() ? 'Logged today' : `Logged on ${shortDate(logDate)}`}
                        </h3>
                        <span className="text-sm text-muted">
                            Total: <span className="font-semibold text-gray-900">{fmtMoney(dayTotal)}</span>
                        </span>
                    </div>

                    {entries.length === 0 ? (
                        <p className="text-sm text-muted italic">Nothing logged yet.</p>
                    ) : (
                        <div className="divide-y divide-border">
                            {entries.map(e => (
                                <div key={e.id} className="flex items-center gap-3 py-2.5">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-gray-900 break-words">{productOf(e.product_id)?.name || 'Unknown product'}</div>
                                        <div className="text-xs text-muted">
                                            {fmtQty(e.quantity_wasted)} {productOf(e.product_id)?.unit} · {reasonLabel(e.reason)}
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-900 whitespace-nowrap">
                                        {e.waste_value == null ? '—' : fmtMoney(e.waste_value)}
                                    </span>
                                    {isManager && (
                                        <button onClick={() => handleDelete(e)}
                                            className={removeButton}
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