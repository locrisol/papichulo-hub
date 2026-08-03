import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import PriceForm from '../../components/PriceForm'
import PriceCountUnitsEditor from '../../components/PriceCountUnitsEditor'
import { friendlyError } from '../../lib/errors'

export default function ProductPricesPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { activeRestaurant } = useRestaurant()

    const [product, setProduct] = useState(null)
    const [prices, setPrices] = useState([])
    const [suppliers, setSuppliers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [errors, setErrors] = useState({})
    const [showForm, setShowForm] = useState(false)
    const [editingPrice, setEditingPrice] = useState(null)
    const [formData, setFormData] = useState(emptyForm())
    const [formatsForPriceId, setFormatsForPriceId] = useState(null)

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

    useEffect(() => {
        fetchProduct()
        fetchSuppliers()
    }, [id])

    useEffect(() => {
        if (!activeRestaurant) return
        fetchPrices()
    }, [activeRestaurant, id])

    async function fetchProduct() {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .single()

        if (error) setError(friendlyError(error))
        else setProduct(data)
    }

    async function fetchSuppliers() {
        const { data } = await supabase
            .from('suppliers')
            .select('*')
            .eq('is_active', true)
            .order('name')

        if (data) setSuppliers(data)
    }

    async function fetchPrices() {
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
        setLoading(false)
    }

    function handleFieldChange(field, value) {
        setFormData({ ...formData, [field]: value })
    }

    function validate() {
        const newErrors = {}

        if (!formData.supplier_id) {
            newErrors.supplier_id = 'Supplier is required'
        }

        if (formData.purchase_type === 'case') {
            const ppc = parseFloat(formData.price_per_case)
            const upc = parseFloat(formData.units_per_case)
            if (isNaN(ppc) || ppc <= 0) {
                newErrors.price_per_case = 'Price per case must be greater than 0'
            }
            if (isNaN(upc) || upc <= 0) {
                newErrors.units_per_case = 'Units per case must be greater than 0'
            }
        } else {
            const ppu = parseFloat(formData.price_per_unit)
            if (isNaN(ppu) || ppu <= 0) {
                newErrors.price_per_unit = 'Price must be greater than 0'
            }
        }

        return newErrors
    }

    async function handleSave(e) {
        e.preventDefault()
        setError('')

        const newErrors = validate()
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors)
            return
        }
        setErrors({})

        const payload = {
            product_id: id,
            restaurant_id: activeRestaurant.id,
            supplier_id: formData.supplier_id,
            purchase_type: formData.purchase_type,
            supplier_code: formData.supplier_code || null,
        }

        if (formData.purchase_type === 'case') {
            const ppc = parseFloat(formData.price_per_case)
            const upc = parseFloat(formData.units_per_case)
            payload.price_per_case = ppc
            payload.units_per_case = upc
            payload.price_per_unit = ppc / upc
        } else {
            payload.price_per_case = null
            payload.units_per_case = null
            payload.price_per_unit = parseFloat(formData.price_per_unit)
        }

        if (editingPrice) {
            const { error } = await supabase
                .from('product_supplier_prices')
                .update(payload)
                .eq('id', editingPrice.id)

            if (error) handleSupabaseError(error)
            else { fetchPrices(); resetForm() }
        } else {
            // First price link for this product+restaurant becomes preferred by default
            if (prices.length === 0) {
                payload.is_preferred = true
            }

            const { error } = await supabase
                .from('product_supplier_prices')
                .insert(payload)

            if (error) handleSupabaseError(error)
            else { fetchPrices(); resetForm() }
        }
    }

    function handleSupabaseError(err) {
        // 23505 is the PostgreSQL unique-violation code
        if (err.code === '23505') {
            if (formData.purchase_type === 'case') {
                setError('A case price link with this pack size for this supplier already exists. Edit the existing one instead.')
            } else {
                setError('A loose price link for this supplier already exists. Edit the existing one instead.')
            }
        } else {
            setError(friendlyError(err))
        }
    }

    function resetForm() {
        setFormData(emptyForm())
        setEditingPrice(null)
        setShowForm(false)
        setErrors({})
    }

    function startEdit(price) {
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

    async function setAsPreferred(price) {
        setError('')

        // Unset all preferred for this product+restaurant first
        const { error: e1 } = await supabase
            .from('product_supplier_prices')
            .update({ is_preferred: false })
            .eq('product_id', id)
            .eq('restaurant_id', activeRestaurant.id)

        if (e1) { setError(friendlyError(e1)); return }

        const { error: e2 } = await supabase
            .from('product_supplier_prices')
            .update({ is_preferred: true })
            .eq('id', price.id)

        if (e2) setError(friendlyError(e2))
        else fetchPrices()
    }

    async function removePrice(price) {
        if (!confirm('Remove this price link?')) return

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

    return (
        <div>
            <button
                onClick={() => navigate('/catalogue/products')}
                className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
            >
                <span>←</span> Back to products
            </button>

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                        Prices: {product?.name || '...'}
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        {product ? `${product.section} • ${product.unit} • ` : ''}for {activeRestaurant?.name}
                    </p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowForm(true) }}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                >
                    + Add Price
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
            )}

            <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3 mb-4">
                Case and loose prices for the same supplier are saved as separate records. Add both if your supplier offers both options. Case prices are sometimes cheaper per unit and sometimes more expensive, so it pays to compare and pick the preferred one yourself.
            </div>

            {showForm && !editingPrice && (
                <div className="bg-white rounded-xl border border-border p-6 mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4">New Price Link</h3>
                    <PriceForm
                        formData={formData}
                        onChange={handleFieldChange}
                        onSubmit={handleSave}
                        onCancel={resetForm}
                        submitLabel="Add Price"
                        errors={errors}
                        suppliers={suppliers}
                        unit={product?.unit}
                    />
                </div>
            )}

            {loading ? (
                <div className="text-sm text-gray-500">Loading prices...</div>
            ) : prices.length === 0 ? (
                <div className="bg-white rounded-xl border border-border p-8 text-center">
                    <p className="text-sm text-gray-500">
                        No price links yet for this product at {activeRestaurant?.name}. Click "+ Add Price" to create the first one.
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border bg-gray-50">
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Supplier Code</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Pack</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost / {product?.unit || 'Unit'}</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Preferred</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
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
                                        <td className="px-4 py-3 font-medium text-gray-900">{getSupplierName(p.supplier_id)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${p.purchase_type === 'case'
                                                ? 'bg-purple-50 text-purple-700'
                                                : 'bg-amber-50 text-amber-700'
                                                }`}>
                                                {p.purchase_type === 'case' ? 'Case' : 'Loose'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">{p.supplier_code || '—'}</td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {p.purchase_type === 'case'
                                                ? `${parseFloat(p.units_per_case)} ${product?.unit} @ €${parseFloat(p.price_per_case).toFixed(2)}`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            €{parseFloat(p.price_per_unit).toFixed(4)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {p.is_preferred ? (
                                                <span className="text-xs font-semibold text-green-700">★ Preferred</span>
                                            ) : (
                                                <button
                                                    onClick={() => setAsPreferred(p)}
                                                    className="text-xs font-medium text-gray-500 hover:text-green-700"
                                                >
                                                    Set as preferred
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => editingPrice?.id === p.id ? resetForm() : startEdit(p)}
                                                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                                >
                                                    {editingPrice?.id === p.id ? 'Cancel' : 'Edit'}
                                                </button>
                                                <button
                                                    onClick={() => setFormatsForPriceId(formatsForPriceId === p.id ? null : p.id)}
                                                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
                                                >
                                                    {formatsForPriceId === p.id ? 'Hide formats' : 'Formats'}
                                                </button>
                                                <button
                                                    onClick={() => removePrice(p)}
                                                    className="text-xs font-medium text-red-500 hover:text-red-700"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {editingPrice?.id === p.id && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-4 bg-amber-50 border-b border-border">
                                                <PriceForm
                                                    formData={formData}
                                                    onChange={handleFieldChange}
                                                    onSubmit={handleSave}
                                                    onCancel={resetForm}
                                                    submitLabel="Save Changes"
                                                    errors={errors}
                                                    suppliers={suppliers}
                                                    unit={product?.unit}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                    {formatsForPriceId === p.id && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-4 bg-gray-50 border-b border-border">
                                                <PriceCountUnitsEditor
                                                    price={p}
                                                    unit={product?.unit}
                                                    onClose={() => setFormatsForPriceId(null)}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}