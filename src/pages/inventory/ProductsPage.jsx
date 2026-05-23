import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useRestaurant } from '../../context/RestaurantContext'

export default function ProductsPage() {
  const { user } = useAuth()
  const { activeRestaurant } = useRestaurant()

  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [showInactive, setShowInactive] = useState(() => {
    return localStorage.getItem('productsShowInactive') === 'true'
  })
  const [formData, setFormData] = useState({
    name: '',
    section: 'Freezer',
    unit: 'KG',
    is_mix: false,
    weight_loss_pct: 0,
    notes: '',
    is_active: true,
  })

  const sections = ['All', 'Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

  useEffect(() => {
    fetchProducts()
    fetchSuppliers()
  }, [])

  useEffect(() => {
    if (!activeRestaurant) return
    fetchPrices()
  }, [activeRestaurant])

  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')

    if (error) setError(error.message)
    else setProducts(data)
    setLoading(false)
  }

  async function fetchSuppliers() {
    const { data } = await supabase
      .from('suppliers')
      .select('*')

    if (data) setSuppliers(data)
  }

  async function fetchPrices() {
    const { data } = await supabase
      .from('product_supplier_prices')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('is_preferred', true)

    if (data) setPrices(data)
  }

  function getPreferredPrice(productId) {
    return prices.find(p => p.product_id === productId)
  }

  function getSupplierName(supplierId) {
    if (!supplierId) return '—'
    return suppliers.find(s => s.id === supplierId)?.name || '—'
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')

    if (editingProduct) {
      const { error } = await supabase
        .from('products')
        .update(formData)
        .eq('id', editingProduct.id)

      if (error) setError(error.message)
      else { fetchProducts(); resetForm() }
    } else {
      const { error } = await supabase
        .from('products')
        .insert(formData)

      if (error) setError(error.message)
      else { fetchProducts(); resetForm() }
    }
  }

  function resetForm() {
    setFormData({ name: '', section: 'Freezer', unit: 'KG', is_mix: false, weight_loss_pct: 0, notes: '', is_active: true })
    setEditingProduct(null)
    setShowForm(false)
  }

  function startEdit(product) {
    setFormData({
      name: product.name,
      section: product.section,
      unit: product.unit,
      is_mix: product.is_mix,
      weight_loss_pct: product.weight_loss_pct || 0,
      notes: product.notes || '',
      is_active: product.is_active,
    })
    setEditingProduct(product)
    setShowForm(true)
  }

  async function toggleActive(product) {
    const { error } = await supabase
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id)

    if (error) setError(error.message)
    else fetchProducts()
  }

  const filteredProducts = products
    .filter(p => showInactive || p.is_active)
    .filter(p => activeSection === 'All' || p.section === activeSection)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500 mt-1">
            Showing prices for {activeRestaurant?.name}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const next = !showInactive
              setShowInactive(next)
              localStorage.setItem('productsShowInactive', next)
            }}
            className={`px-4 py-2 border text-sm font-medium rounded-lg transition-colors ${
              showInactive
                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
          >
            + Add Product
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      {showForm && !editingProduct && (
        <div className="bg-white rounded-xl border border-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Product</h3>
          <form onSubmit={handleSave}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Section</label>
                <select
                  value={formData.section}
                  onChange={e => setFormData({ ...formData, section: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option>Freezer</option>
                  <option>Cold Room</option>
                  <option>Dry</option>
                  <option>Packaging</option>
                  <option>Cleaning</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Unit</label>
                <select
                  value={formData.unit}
                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option>KG</option>
                  <option>Each</option>
                  <option>Litre</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Loss %</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.weight_loss_pct}
                  onChange={e => setFormData({ ...formData, weight_loss_pct: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_mix}
                  onChange={e => setFormData({ ...formData, is_mix: e.target.checked })}
                  className="w-4 h-4 accent-accent"
                />
                <span className="text-sm text-gray-700">This is a MIX product (house-made, cost calculated from recipe)</span>
              </label>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
              >
                Add Product
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent w-64"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {sections.map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeSection === section
                ? 'bg-accent text-white'
                : 'bg-white border border-border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {section}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading products...</div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Section</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Preferred Supplier</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost/Unit</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Weight Loss</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p, i) => {
                const price = getPreferredPrice(p.id)
                return (
                  <>
                    <tr key={p.id} className={`border-b border-border ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                          {p.section}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          p.is_mix ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                        }`}>
                          {p.is_mix ? 'MIX' : 'Purchased'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {getSupplierName(price?.supplier_id)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {price ? `€${parseFloat(price.price_per_unit).toFixed(4)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {p.weight_loss_pct > 0 ? `${p.weight_loss_pct}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => editingProduct?.id === p.id ? resetForm() : startEdit(p)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            {editingProduct?.id === p.id ? 'Cancel' : 'Edit'}
                          </button>
                          <button className="text-xs font-medium text-gray-500 hover:text-gray-700">
                            Allergens
                          </button>
                          <button className="text-xs font-medium text-gray-500 hover:text-gray-700">
                            Prices
                          </button>
                          <button
                            onClick={() => toggleActive(p)}
                            className={`text-xs font-medium ${
                              p.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'
                            }`}
                          >
                            {p.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingProduct?.id === p.id && (
                      <tr key={`${p.id}-edit`}>
                        <td colSpan={8} className="px-4 py-4 bg-amber-50 border-b border-border">
                          <form onSubmit={handleSave}>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                                <input
                                  type="text"
                                  value={formData.name}
                                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Section</label>
                                <select
                                  value={formData.section}
                                  onChange={e => setFormData({ ...formData, section: e.target.value })}
                                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                >
                                  <option>Freezer</option>
                                  <option>Cold Room</option>
                                  <option>Dry</option>
                                  <option>Packaging</option>
                                  <option>Cleaning</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Unit</label>
                                <select
                                  value={formData.unit}
                                  onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                >
                                  <option>KG</option>
                                  <option>Each</option>
                                  <option>Litre</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Weight Loss %</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                  value={formData.weight_loss_pct}
                                  onChange={e => setFormData({ ...formData, weight_loss_pct: e.target.value })}
                                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                                />
                              </div>
                            </div>
                            <div className="mb-4">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.is_mix}
                                  onChange={e => setFormData({ ...formData, is_mix: e.target.checked })}
                                  className="w-4 h-4 accent-accent"
                                />
                                <span className="text-sm text-gray-700">MIX product</span>
                              </label>
                            </div>
                            <div className="mb-4">
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
                              <textarea
                                value={formData.notes}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                rows={2}
                                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                              />
                            </div>
                            <div className="flex gap-3">
                              <button
                                type="submit"
                                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                              >
                                Save Changes
                              </button>
                              <button
                                type="button"
                                onClick={resetForm}
                                className="px-4 py-2 border border-border text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 bg-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          {filteredProducts.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No products found.
            </div>
          )}
        </div>
      )}
    </div>
  )
}