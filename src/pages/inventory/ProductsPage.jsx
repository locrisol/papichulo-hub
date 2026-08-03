import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { calculateMixCost } from '../../lib/mixCost'
import ProductForm from '../../components/ProductForm'
import { friendlyError } from '../../lib/errors'
import { tableHeadRow, tableHeadCell } from '../../lib/controlStyles'

// The columns you can sort by, in the order they appear across the table.
// Actions is not in here, because there is nothing to sort it on.
//
// Section and Type carry a fixed width. Sorting let the Name column take as much
// room as it wanted, which squeezed the others until a badge like "Cold Room"
// broke onto two lines.
const SORTABLE_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'section', label: 'Section', width: 'w-36' },
  { key: 'unit', label: 'Unit', width: 'w-20' },
  { key: 'type', label: 'Type', width: 'w-32' },
  { key: 'supplier', label: 'Preferred Supplier' },
  { key: 'cost', label: 'Cost/Unit', width: 'w-28' },
  { key: 'weightLoss', label: 'Weight Loss', width: 'w-28' },
]

// Badges carry the meaning now that the MIX row tint is very light, so they are
// a step stronger than they were. whitespace-nowrap keeps two word labels like
// "Cold Room" on one line.
const badge = 'inline-block px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap'

export default function ProductsPage() {
  const { activeRestaurant } = useRestaurant()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
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
  const sectionOrder = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']

  // Which column the table is sorted by, and which way.
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  function toggleSort(key) {
    if (sortBy === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  useEffect(() => {
    fetchProducts()
    fetchSuppliers()
  }, [])

  useEffect(() => {
    if (!activeRestaurant) return
    fetchPrices()
    fetchRecipeLines()
  }, [activeRestaurant])

  // Ordered by name. Without an order the database returns the rows however it
  // likes, and updating a row moves it, so deactivating a product and turning it
  // back on sent it somewhere else in the list.
  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name')

    if (error) setError(friendlyError(error))
    else setProducts(data)
    setLoading(false)
  }

  async function fetchSuppliers() {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .order('name')

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

  async function fetchRecipeLines() {
    const { data } = await supabase
      .from('mix_recipes')
      .select('*')

    if (data) setRecipeLines(data)
  }

  function getPreferredPrice(productId) {
    return prices.find(p => p.product_id === productId)
  }

  function getSupplierName(supplierId) {
    if (!supplierId) return '—'
    return suppliers.find(s => s.id === supplierId)?.name || '—'
  }

  function handleFieldChange(field, value) {
    setFormData({ ...formData, [field]: value })
  }

  function validate() {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    const weightLoss = parseFloat(formData.weight_loss_pct)
    if (isNaN(weightLoss) || weightLoss < 0 || weightLoss > 100) {
      newErrors.weight_loss_pct = 'Weight loss must be between 0 and 100'
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
      ...formData,
      weight_loss_pct: parseFloat(formData.weight_loss_pct),
    }

    if (editingProduct) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingProduct.id)

      if (error) setError(friendlyError(error))
      else { fetchProducts(); resetForm() }
    } else {
      const { error } = await supabase
        .from('products')
        .insert(payload)

      if (error) setError(friendlyError(error))
      else { fetchProducts(); resetForm() }
    }
  }

  function resetForm() {
    setFormData({ name: '', section: 'Freezer', unit: 'KG', is_mix: false, weight_loss_pct: 0, notes: '', is_active: true })
    setEditingProduct(null)
    setShowForm(false)
    setErrors({})
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
    setErrors({})
  }

  async function toggleActive(product) {
    const { error } = await supabase
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id)

    if (error) setError(friendlyError(error))
    else fetchProducts()
  }

  // What a product is worth per unit. A MIX is costed from its recipe, a bought
  // product from its preferred supplier price. Null when neither can be worked
  // out, which sorts to the bottom rather than pretending to be zero.
  function unitCostOf(p) {
    if (p.is_mix) {
      const result = calculateMixCost(p, products, recipeLines, prices)
      return result?.cost ?? null
    }
    const price = getPreferredPrice(p.id)
    return price ? parseFloat(price.price_per_unit) : null
  }

  // The value a column sorts on. Text comes back lowercased so the sort is not
  // case sensitive, which would otherwise put every capital letter first.
  function sortValue(p, key) {
    switch (key) {
      case 'section': return sectionOrder.indexOf(p.section)
      case 'unit': return (p.unit || '').toLowerCase()
      case 'type': return p.is_mix ? 0 : 1
      case 'supplier':
        return p.is_mix
          ? ''
          : (getSupplierName(getPreferredPrice(p.id)?.supplier_id) || '').toLowerCase()
      case 'cost': return unitCostOf(p)
      case 'weightLoss': return Number(p.weight_loss_pct) || 0
      default: return p.name.toLowerCase()
    }
  }

  function compareValues(a, b) {
    // Nulls last whichever way the column is sorted, so "no price set" never
    // looks like the cheapest thing in the list.
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b))
  }

  const filteredProducts = products
    .filter(p => showInactive || p.is_active)
    .filter(p => activeSection === 'All' || p.section === activeSection)
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      // Sections always group together. Clicking the Section heading flips the
      // order of the groups; any other column leaves them alone and sorts
      // inside them.
      const sectionA = sectionOrder.indexOf(a.section)
      const sectionB = sectionOrder.indexOf(b.section)
      if (sectionA !== sectionB) {
        const diff = sectionA - sectionB
        return sortBy === 'section' && sortDir === 'desc' ? -diff : diff
      }

      // MIX products come first inside their section, whatever is being sorted.
      // They are the ones that behave differently, since their cost comes from a
      // recipe rather than a supplier, so they are worth keeping together at the
      // top where they are easy to find.
      if (a.is_mix !== b.is_mix) return a.is_mix ? -1 : 1

      const result = compareValues(sortValue(a, sortBy), sortValue(b, sortBy))
      const directed = sortDir === 'desc' ? -result : result

      // Same value in the sorted column, so fall back to name to keep the order
      // stable instead of letting it shuffle on every render.
      return directed !== 0 ? directed : a.name.localeCompare(b.name)
    })

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
          <ProductForm
            formData={formData}
            onChange={handleFieldChange}
            onSubmit={handleSave}
            onCancel={resetForm}
            submitLabel="Add Product"
            errors={errors}
          />
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
            {/* The heading row used to be bg-gray-50, exactly the same as every
                other striped row, so it did not read as a heading at all. It is
                the dark sidebar green now, which there is no mistaking. */}
            <thead>
              <tr className={tableHeadRow}>
                {SORTABLE_COLUMNS.map(col => (
                  <th key={col.key} className={`text-left px-4 py-3 whitespace-nowrap ${col.width || ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={`flex items-center gap-1 whitespace-nowrap ${tableHeadCell} hover:text-white/70`}
                    >
                      {col.label}
                      <span className={sortBy === col.key ? 'text-accent' : 'text-white/30'}>
                        {sortBy === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
                      </span>
                    </button>
                  </th>
                ))}
                <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p, i) => {
                const price = getPreferredPrice(p.id)
                const mixResult = p.is_mix ? calculateMixCost(p, products, recipeLines, prices) : null
                return (
                  <Fragment key={p.id}>
                    {/* MIX rows are yellow the whole way across. They are costed
                        from a recipe instead of a supplier price, so it matters
                        which ones they are. Inactive still wins, because a
                        deactivated product matters more than how it is costed. */}
                    <tr className={`border-b border-border ${!p.is_active
                      ? 'bg-red-100'
                      : p.is_mix
                        ? 'bg-amber-50'
                        : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className={`px-4 py-3 font-medium ${p.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{p.name}</td>
                      <td className="px-4 py-3">
                        <span className={`${badge} ${
                          p.is_active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'
                        }`}>
                          {p.section}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${p.is_active ? 'text-gray-500' : 'text-gray-400'}`}>{p.unit}</td>
                      <td className="px-4 py-3">
                        <span className={`${badge} ${
                          !p.is_active
                            ? 'bg-gray-100 text-gray-400'
                            : p.is_mix
                              ? 'bg-amber-500 text-white'
                              : 'bg-green-100 text-green-800'
                        }`}>
                          {p.is_mix ? 'MIX' : 'Purchased'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${p.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                        {p.is_mix ? <span className="italic">House-made</span> : getSupplierName(price?.supplier_id)}
                      </td>
                      <td className={`px-4 py-3 font-medium ${p.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                        {p.is_mix
                          ? (mixResult?.cost !== null
                              ? `€${mixResult.cost.toFixed(4)}`
                              : <span className="text-amber-600 text-xs">Incomplete</span>)
                          : (price ? `€${parseFloat(price.price_per_unit).toFixed(4)}` : '—')}
                      </td>
                      <td className={`px-4 py-3 ${p.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
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
                          <button
                            onClick={() => navigate(`/catalogue/products/${p.id}/allergens`)}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
                            Allergens
                          </button>
                          {p.is_mix && (
                            <button
                              onClick={() => navigate(`/catalogue/products/${p.id}/recipe`)}
                              className="text-xs font-medium text-gray-500 hover:text-gray-700"
                            >
                              Recipe
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/catalogue/products/${p.id}/prices`)}
                            className="text-xs font-medium text-gray-500 hover:text-gray-700"
                          >
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
                      <tr>
                        <td colSpan={8} className="px-4 py-4 bg-amber-50 border-b border-border">
                          <ProductForm
                            formData={formData}
                            onChange={handleFieldChange}
                            onSubmit={handleSave}
                            onCancel={resetForm}
                            submitLabel="Save Changes"
                            errors={errors}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
