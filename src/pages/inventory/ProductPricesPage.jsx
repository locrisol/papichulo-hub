import { useState, useEffect, Fragment, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { fmtMoney, fmtUnitCost } from '@/lib/format'
import { priceProblem, pricePayload } from '@/lib/productPrice'
import { movePreferred, typedPriceEvent } from '@/lib/priceEvents'
import PriceForm from '@/components/inventory/PriceForm'
import Modal from '@/components/ui/Modal'
import PriceCountUnitsEditor from '@/components/inventory/PriceCountUnitsEditor'
import { friendlyError } from '@/lib/errors'
import { claimCode } from '@/lib/invoiceReview'
import {
    tableHeadRow, tableHeadCell, tableCard, badge, card, cardHeader, rowButton, primaryButton, toneBadge,
} from '@/lib/controlStyles'
import { useConfirm } from '@/context/confirm'
import BackButton from '@/components/ui/BackButton'
import ErrorBanner from '@/components/ui/ErrorBanner'
import PageHeader from '@/components/ui/PageHeader'
import ProductPriceHistory from '@/components/inventory/ProductPriceHistory'
import { useSaveOnce } from '@/components/ui/useSaveOnce'
import SupplierBadge from '@/components/ui/SupplierBadge'
import KeptHerePanel from '@/components/inventory/KeptHerePanel'
import { productsWithCode } from '@/lib/versionCodes'
import { readCostOf } from '@/lib/costPrices'
import { costsFromTheList, standingOf } from '@/lib/recommended'
import { versionLabel } from '@/lib/brandVersions'

// Every price we can buy one product at, for the restaurant you are working in.
//
// A product comes from more than one supplier, and the same supplier sells it in
// more than one way, so there are usually several rows here. What makes them
// different is the supplier, whether it is a case or loose, and the pack size.
//
// Exactly one of them is marked preferred, and that single row is what the whole
// app costs from: menu item margins, waste value, stock take value and the food
// cost on the dashboard all follow it. Changing which one is preferred changes
// every one of those numbers, which is why it is a deliberate action and not
// just whichever price is cheapest.
//
// Prices are per restaurant. Both restaurants sell the same dish at the same
// price, but they can buy the ingredient from different suppliers, so the cost
// and the margin differ by restaurant while the selling price does not.
export default function ProductPricesPage() {
    const { id } = useParams()
    const { user } = useAuth()
    const { activeRestaurant } = useRestaurant()
    const confirm = useConfirm()

    const [product, setProduct] = useState(null)
    // The product's versions and what recipes cost it at here (cost_prices).
    // For a product with a recommended set the database chooses the row it
    // costs from, so the page says which and offers no choice.
    const [versions, setVersions] = useState([])
    const [costRow, setCostRow] = useState(null)
    const [prices, setPrices] = useState([])
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    // Kept apart from the page's error above. That one is for something that
    // would not load, which belongs at the top because there is nothing else up
    // there to read. This is for a save that would not go through, and it
    // belongs beside the button that was pressed: at the foot of a form on a
    // phone, the top of the page is not on the screen, and inside a dialog it
    // is behind the dialog.
    const [formProblem, setFormProblem] = useState('')
    const [errors, setErrors] = useState({})
    const [showForm, setShowForm] = useState(false)
    const [editingPrice, setEditingPrice] = useState(null)
    const [formData, setFormData] = useState(emptyForm())
    const [formatsForPriceId, setFormatsForPriceId] = useState(null)
    // Bumped whenever a price moves here, so the chart above the rows reads
    // its events again. See recordPrice.
    const [historyVersion, setHistoryVersion] = useState(0)

    // The price the formats dialog is showing, looked up from the list rather
    // than kept as a second copy, so it cannot go stale if the list reloads.
    const formatsPrice = prices.find(p => p.id === formatsForPriceId) || null

    function emptyForm() {
        return {
            supplier_id: '',
            purchase_type: 'case',
            supplier_code: '',
            price_per_case: '',
            units_per_case: '',
            price_per_unit: '',
        }
    }

    

    

    const fetchProduct = useCallback(async () => {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single()

        if (error) setError(friendlyError(error))
        else setProduct(data)
        }, [id])

    async function fetchSuppliers() {
        const { data } = await supabase
            .from('suppliers')
            .select('*')
            .eq('is_active', true)
            .order('name')

        if (data) setSuppliers(data)
    }

    useEffect(() => {
        // The fetch sets a loading state before it starts, which is one render
        // this rule would rather avoid. The alternative is to leave it,
        // and then a change of what is shown keeps the previous one's figures
        // on screen under the new one's heading until the answer arrives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchProduct()
        fetchSuppliers()
    }, [fetchProduct])

    const fetchPrices = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('product_supplier_prices')
            .select('*')
            .eq('product_id', id)
            .eq('restaurant_id', activeRestaurant.id)
            .order('is_preferred', { ascending: false })
            .order('id', { ascending: true })

        if (error) setError(friendlyError(error))
        else setPrices(data)
        // Read after the prices, which may have just moved the cost.
        const [{ data: vs }, { data: cost }] = await Promise.all([
            supabase.from('product_versions')
                .select('id, product_id, supplier_id, supplier_code, name, is_recommended, is_active, fallback_rank')
                .eq('product_id', id),
            readCostOf(activeRestaurant.id, id),
        ])
        setVersions(vs || [])
        setCostRow(cost || null)
        setLoading(false)
        }, [activeRestaurant, id])

    useEffect(() => {
        if (!activeRestaurant) return
        // The fetch sets a loading state before it starts, which is one render
        // this rule would rather avoid. The alternative is to leave it,
        // and then a change of what is shown keeps the previous one's figures
        // on screen under the new one's heading until the answer arrives.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchPrices()
    }, [fetchPrices, activeRestaurant])

    function handleFieldChange(field, value) {
        setFormData({ ...formData, [field]: value })
    }

    const validate = () => priceProblem(formData, suppliers)

    // A second tap on Save while the first was on its way added the price
    // twice, and a first price twice is two prices both marked preferred. See
    // useSaveOnce.
    const [saving, once] = useSaveOnce()

    function handleSave(e) {
        e.preventDefault()
        return once(savePrice)
    }

    async function savePrice() {
        setFormProblem('')

        const newErrors = validate()
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }
        setErrors({})

        const payload = {
            ...pricePayload(formData),
            product_id: id,
            restaurant_id: activeRestaurant.id,
        }

        // A code means one thing across the brand, so one another product
        // goes by at either restaurant is refused here rather than half saved.
        const code = String(formData.supplier_code || '').trim()
        if (code) {
            const { data: withCode, error: codeErr } = await productsWithCode(formData.supplier_id, code)
            if (codeErr) { setFormProblem(friendlyError(codeErr)); return }
            if ((withCode || []).some(productId => productId !== id)) {
                setErrors({ supplier_code: 'Another product already has this code with this supplier.' })
                return
            }
        }

        if (editingPrice) {
            // A new code on a price the invoices already have is either the
            // same thing renumbered, which code_update joins at every
            // restaurant without losing the star or the allergens, or a
            // mistake: the invoices would go on saying the old code.
            const was = String(editingPrice.supplier_code || '').trim()
            if (was && code && was.toLowerCase() !== code.toLowerCase()) {
                const { count, error: countErr } = await supabase.from('invoice_lines')
                    .select('id', { count: 'exact', head: true }).eq('price_id', editingPrice.id)
                if (countErr) { setFormProblem(friendlyError(countErr)); return }
                if (count > 0) {
                    const same = await confirm({
                        title: 'Is this the same thing under a new code?',
                        message: `Invoices have this price under code ${was}. If ${getSupplierName(editingPrice.supplier_id) || 'the supplier'} `
                            + `renumbered it, ${code} becomes its code at every restaurant, and it keeps its place on the `
                            + 'Recommended list and its allergens.',
                        confirmLabel: 'Same thing, new code',
                        cancelLabel: 'Go back',
                    })
                    if (!same) {
                        setFormProblem(`Invoices have this price under code ${was}, so its code stays. To price something else, add a new price instead.`)
                        return
                    }
                    const { error: joinErr } = await supabase.rpc('code_update', {
                        keep_price: editingPrice.id, new_code: code, make_main: true,
                    })
                    if (joinErr) { setFormProblem(friendlyError(joinErr)); return }
                    delete payload.supplier_code
                }
            }

            const { data: saved, error } = await supabase
                .from('product_supplier_prices')
                .update(payload)
                .eq('id', editingPrice.id)
                .select()
                .single()

            if (error) handleSupabaseError(error)
            else {
                await recordPrice(typedPriceEvent({ id }, saved, {
                    ...who(), before: editingPrice,
                }))
                await findsItsCode(saved)
                fetchPrices(); resetForm()
            }
        } else {
            // First price link for this product+restaurant becomes preferred by default
            if (prices.length === 0) {
                payload.is_preferred = true
            }

            const { data: saved, error } = await supabase
                .from('product_supplier_prices')
                .insert(payload)
                .select()
                .single()

            if (error) handleSupabaseError(error)
            else {
                await recordPrice(typedPriceEvent({ id }, saved, who()))
                await findsItsCode(saved)
                resetForm()
                await askToCostFrom(saved)
                fetchPrices()
            }
        }
    }

    // A second price for a product that already has one: whether recipes and
    // the stock take cost from it now, asked the way the import asks when a
    // line comes in at a new pack (his ask, 4 October). Kept as an extra price
    // otherwise, to compare against.
    async function askToCostFrom(saved) {
        if (fromTheList) return
        const now = prices.find(p => p.is_preferred && p.id !== saved.id)
        if (!now) return
        const yes = await confirm({
            title: 'Cost from this price?',
            message: `Recipes and the stock take cost ${product?.name || 'this product'} from the price marked `
                + 'preferred. Say whether this one takes its place.',
            details: [
                { label: 'Costed from now', value: `${getSupplierName(now.supplier_id)}, ${fmtUnitCost(parseFloat(now.price_per_unit))}` },
                { label: 'This price', value: `${getSupplierName(saved.supplier_id)}, ${fmtUnitCost(parseFloat(saved.price_per_unit))}` },
            ],
            confirmLabel: 'Cost from this one',
            cancelLabel: 'Keep it as an extra price',
        })
        if (yes) await setAsPreferred(saved)
    }

    // Who is changing a price, where, and when, for the event that says so.
    function who() {
        return { restaurantId: activeRestaurant.id, userId: user?.id, at: new Date().toISOString() }
    }

    // Writing down that what the Hub costs from has moved.
    //
    // The chart above the rows draws the product's own line from these
    // events, and this page used to change prices without writing one, so
    // the line stayed where an invoice last left it while every recipe had
    // moved. Nothing is written when there is nothing to say (see
    // typedPriceEvent). The price itself is saved by then, so a failure here
    // says so on the page rather than undoing it.
    async function recordPrice(event) {
        if (!event) return
        const { error } = await supabase.from('product_price_events').insert(event)
        if (error) setError(`The price was saved, but the price history was not updated: ${friendlyError(error)}`)
        setHistoryVersion(n => n + 1)
    }

    // A code the invoices already met means this price from now on. See
    // claimCode. Said after anything the price history said.
    async function findsItsCode(saved) {
        const said = await claimCode(saved, activeRestaurant.id)
        if (said) setError(before => (before ? `${before} ${said}` : said))
    }

    function handleSupabaseError(err) {
        // 23505 is the PostgreSQL unique-violation code
        if (err.code === '23505') {
            if (formData.purchase_type === 'case') {
                setFormProblem('This supplier already has a case price with this many units per case. Edit that one instead.')
            } else {
                setFormProblem('This supplier already has a loose price. Edit that one instead.')
            }
        } else {
            setFormProblem(friendlyError(err))
        }
    }

    function resetForm() {
        setFormProblem('')
        setFormData(emptyForm())
        setEditingPrice(null)
        setShowForm(false)
        setErrors({})
    }

    function startEdit(price) {
        setFormProblem('')
        setFormData({
            supplier_id: price.supplier_id,
            purchase_type: price.purchase_type,
            supplier_code: price.supplier_code || '',
            price_per_case: price.price_per_case ?? '',
            units_per_case: price.units_per_case ?? '',
            price_per_unit: price.price_per_unit ?? '',
        })
        setEditingPrice(price)
        setShowForm(true)
        setErrors({})
    }

    // Moves the preferred flag to a different price, for a product with no
    // recommendation (one with a set is costed from the Recommended list and
    // offers no button).
    //
    // One call, set_cost_row, which moves it in a single update: the database
    // allows one preferred price per product at each restaurant (migration
    // 010), so the old way, the new row on and then the others off in two
    // requests, is refused at the first. And there is never a moment with two
    // rows marked, or none, which is what the two requests used to risk.
    async function setAsPreferred(price) {
        setError('')

        const { error: e1 } = await supabase.rpc('set_cost_row', { price: price.id })
        if (e1) { setError(friendlyError(e1)); return }

        // Buying it somewhere else is the decision with no document behind
        // it, so this is the only record the chart has of it. The row it
        // moved from is named, which a row read with select('*') is not.
        const before = prices.find(p => p.is_preferred && p.id !== price.id) || null
        const move = movePreferred({ id }, price, {
            ...who(),
            from: before && { ...before, supplier_name: getSupplierName(before.supplier_id) },
        })
        await recordPrice(move.event)
        fetchPrices()
    }

    async function removePrice(price) {
        const ok = await confirm({
            title: 'Remove this price?',
            message: fromTheList
                ? 'Recipes go on costing it from the versions on the Recommended list.'
                : price.is_preferred
                    ? 'This is the preferred price, so the product will have no cost until another one is set.'
                    : 'The product keeps whichever price is preferred.',
            details: [
                { label: 'Supplier', value: getSupplierName(price.supplier_id) },
                { label: 'Per unit', value: fmtUnitCost(parseFloat(price.price_per_unit)) },
            ],
            confirmLabel: 'Remove price',
            tone: 'danger',
        })
        if (!ok) return

        const { error } = await supabase
            .from('product_supplier_prices')
            .delete()
            .eq('id', price.id)

        if (error) setError(friendlyError(error))
        else fetchPrices()
    }

    function getSupplierName(supplierId) {
        return suppliers.find(s => s.id === supplierId)?.name || '—'
    }

    // A product with a recommended set costs from the dearest of it (his
    // decision of 18 October 2026), so nobody chooses its price here: the
    // Recommended list does. A product with no recommendation keeps Set as
    // preferred.
    const fromTheList = costsFromTheList(product, versions)
    const costVersion = versions.find(v => v.id === costRow?.version_id) || null
    const standing = price => standingOf(versions.find(v => v.id === price.version_id), product, versions)

    // Where a price stands: for a product costed from the Recommended list,
    // its place on the list and whether recipes cost from it; otherwise
    // preferred, or the button that makes it so. A plain function, so the
    // phone card and the table say the same.
    function costChoice(price, buttonClass = '') {
        if (fromTheList) {
            const said = standing(price)
            return (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className={toneBadge(said?.tone === 'recommended' ? 'good' : 'plain')}>{said?.label || 'Not recommended'}</span>
                    {costRow?.own_price_id === price.id && (
                        <span className="text-xs font-semibold text-green-700">★ Recipes cost from this</span>
                    )}
                </span>
            )
        }
        return price.is_preferred
            ? <span className="text-xs font-semibold text-green-700">★ Preferred</span>
            : <button onClick={() => setAsPreferred(price)} className={`${rowButton('good')} ${buttonClass}`}>Set as preferred</button>
    }

    return (
        <div>
            <BackButton to="/catalogue/products" className="mb-4">Back to products</BackButton>

            <PageHeader
                title={`Prices: ${product?.name || '...'}`}
                subtitle={`${product ? `${product.section} · ${product.unit} · ` : ''}for ${activeRestaurant?.name ?? ''}`}
            >
                <button
                    onClick={() => { resetForm(); setShowForm(true) }}
                    className={primaryButton()}
                >
                    + Add price
                </button>
            </PageHeader>

            {error && (
                <ErrorBanner className="mb-4">{error}</ErrorBanner>
            )}

            {/* Above the list on purpose. The rows below say what a thing
                costs today, and the only question anybody opens this screen
                with is whether that has moved. */}
            <ProductPriceHistory
                productId={id}
                restaurantId={activeRestaurant?.id}
                product={product}
                suppliers={suppliers}
                refresh={historyVersion}
            />

            <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3 mb-4">
                {fromTheList ? (
                    <>
                        {costRow
                            ? <>Recipes cost it at {fmtUnitCost(parseFloat(costRow.price_per_unit))}, from {costVersion ? versionLabel(costVersion, product) : 'a recommended version'}
                                {costRow.borrowed ? `, the other restaurant's price: ${activeRestaurant?.name} has not bought it yet.` : '.'}</>
                            : 'No recommended version has a price yet, here or at the other restaurant.'}
                        {' '}It is the dearest of the versions on the Recommended list, which is where they are chosen.
                    </>
                ) : (
                    'Case and loose prices from the same supplier are kept separately. If a supplier sells both, add both, compare the cost per unit, and press Set as preferred on the one to use.'
                )}
            </div>

            {showForm && !editingPrice && (
                <div className={`${card} overflow-hidden mb-6`}>
                    <h3 className={cardHeader}>New price</h3>
                    <div className="p-6">
                        <PriceForm
                            problem={formProblem}
                            formData={formData}
                            onChange={handleFieldChange}
                            onSubmit={handleSave}
                            onCancel={resetForm}
                            submitLabel="Add price"
                            saving={saving}
                            errors={errors}
                            suppliers={suppliers}
                            unit={product?.unit}
                        />
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-sm text-muted">Loading prices...</div>
            ) : prices.length === 0 ? (
                <div className={`${card} p-8 text-center`}>
                    <p className="text-sm text-muted">
                        No prices yet for this product at {activeRestaurant?.name}. Press Add price to add the first one.
                    </p>
                </div>
            ) : (
                <>
                {/* One card per supplier on a phone, the table from sm up.

                    Seven columns will not fit on a 390px screen at any setting,
                    so it was a sideways scroll, and the column furthest off the
                    edge was the cost per unit: the one figure the page exists to
                    show. A card puts the supplier and that cost on the same
                    line, which is the comparison actually being made, and the
                    pack and code underneath where they belong.

                    The table stays exactly as it was above sm, because reading
                    four suppliers down a column really is easier there. */}
                <div className="sm:hidden space-y-2">
                    {prices.map(p => (
                        <div
                            key={p.id}
                            className={`rounded-lg border p-3 ${p.is_preferred
                                ? 'border-green-700 bg-green-50'
                                : 'border-border bg-white'}`}
                        >
                            <div className="flex items-baseline justify-between gap-3">
                                <SupplierBadge name={getSupplierName(p.supplier_id)} />
                                <span className="text-base font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                                    {fmtUnitCost(parseFloat(p.price_per_unit))}
                                </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-3 mt-0.5">
                                <span className="text-xs text-muted">
                                    {p.purchase_type === 'case'
                                        ? `Case · ${parseFloat(p.units_per_case)} ${product?.unit} @ ${fmtMoney(p.price_per_case)}`
                                        : 'Loose'}
                                </span>
                                <span className="text-xs text-muted whitespace-nowrap">
                                    per {product?.unit || 'unit'}
                                </span>
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                                {p.supplier_code || 'No supplier code'}
                            </p>

                            <div className="mt-2">{costChoice(p)}</div>

                            <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-border">
                                <button
                                    onClick={() => editingPrice?.id === p.id ? resetForm() : startEdit(p)}
                                    className={rowButton('edit')}
                                >
                                    {editingPrice?.id === p.id ? 'Cancel' : 'Edit'}
                                </button>
                                <button onClick={() => setFormatsForPriceId(p.id)} className={rowButton()}>
                                    Packs
                                </button>
                                <button onClick={() => removePrice(p)} className={rowButton('danger')}>
                                    Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className={`hidden sm:block ${tableCard}`}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className={tableHeadRow}>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Supplier</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Type</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Supplier code</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Pack</th>
                                <th className={`text-right px-4 py-3 ${tableHeadCell}`}>Cost / {product?.unit || 'Unit'}</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>{fromTheList ? 'Recommended list' : 'Preferred'}</th>
                                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {prices.map((p, i) => (
                                <Fragment key={p.id}>
                                    <tr
                                        className={`border-b border-border ${p.is_preferred
                                            ? 'bg-green-50'
                                            : i % 2 === 0
                                                ? 'bg-white'
                                                : 'bg-gray-50'
                                            }`}
                                    >
                                        <td className="px-4 py-3"><SupplierBadge name={getSupplierName(p.supplier_id)} /></td>
                                        <td className="px-4 py-3">
                                            <span className={`${badge} ${p.purchase_type === 'case'
                                                ? 'bg-purple-50 text-purple-700'
                                                : 'bg-amber-50 text-amber-700'
                                                }`}>
                                                {p.purchase_type === 'case' ? 'Case' : 'Loose'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted">{p.supplier_code || '—'}</td>
                                        <td className="px-4 py-3 text-muted">
                                            {p.purchase_type === 'case'
                                                ? `${parseFloat(p.units_per_case)} ${product?.unit} @ ${fmtMoney(parseFloat(p.price_per_case))}`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900 text-right tabular-nums">
                                            {fmtUnitCost(parseFloat(p.price_per_unit))}
                                        </td>
                                        <td className="px-4 py-3">
                                            {costChoice(p)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => editingPrice?.id === p.id ? resetForm() : startEdit(p)}
                                                    className={rowButton('edit')}
                                                >
                                                    {editingPrice?.id === p.id ? 'Cancel' : 'Edit'}
                                                </button>
                                                <button
                                                    onClick={() => setFormatsForPriceId(p.id)}
                                                    className={rowButton()}
                                                >
                                                    Packs
                                                </button>
                                                <button
                                                    onClick={() => removePrice(p)}
                                                    className={rowButton('danger')}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            {/* Under the prices, since it is the restaurant's own and not about
                any one of them. It was a version's in the old Versions dialog,
                the same at both restaurants. */}
            <div className="mt-6">
                <KeptHerePanel product={product} restaurant={activeRestaurant} />
            </div>

            {/* The pack formats open in a dialog too, for the same reason as
                editing: pushed into the table they were hard to tell apart from
                the prices around them, and they pushed every row below down. */}
            {formatsPrice && (
                <Modal
                    title={`Packs for the ${getSupplierName(formatsPrice.supplier_id)} price`}
                    onClose={() => setFormatsForPriceId(null)}
                    width="max-w-2xl"
                >
                    <div className="px-6 py-4">
                        <PriceCountUnitsEditor
                            price={formatsPrice}
                            unit={product?.unit}
                            onClose={() => setFormatsForPriceId(null)}
                        />
                    </div>
                </Modal>
            )}

            {editingPrice && (
                <Modal title={`Edit the ${getSupplierName(editingPrice.supplier_id)} price`} onClose={resetForm} width="max-w-2xl">
                    <div className="px-6 py-4">
                        <PriceForm
                            problem={formProblem}
                            formData={formData}
                            onChange={handleFieldChange}
                            onSubmit={handleSave}
                            onCancel={resetForm}
                            submitLabel="Save changes"
                            saving={saving}
                            errors={errors}
                            suppliers={suppliers}
                            unit={product?.unit}
                        />
                    </div>
                </Modal>
            )}

        </div>
    )
}