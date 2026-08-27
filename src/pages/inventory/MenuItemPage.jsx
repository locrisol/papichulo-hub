import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { calculateMixCost } from '../../lib/mixCost'
import { deriveMenuItemAllergens, ALLERGEN_KEYS } from '../../lib/allergens'
import { friendlyError } from '../../lib/errors'
import { tableHeadRow, tableCard, card, rowButton } from '../../lib/controlStyles'
import { useConfirm } from '../../context/ConfirmContext'
import Modal from '../../components/Modal'
import { numberField } from '../../lib/numberInput'

// One dish: what it is made of, what it costs, and what it contains.
//
// The menu items list shows all the dishes at once. This is the screen where you
// actually build one, by adding components. A component points at a product,
// bought or made in house, with a quantity.
//
// The three numbers on this page all come from somewhere else and none of them
// are stored. The cost is added up from the components using this restaurant's
// preferred prices, the margin comes off that against the net selling price, and
// the allergens are derived by following each component down through its recipe.
// Nothing here is typed in twice, so nothing can disagree with itself.
//
// The same product cannot be added twice to one dish. That is a unique
// constraint on menu_item_components rather than a check in this file, so it
// holds however the row got there.

const MARGIN_GREEN = 65
const MARGIN_AMBER = 60

const ALLERGEN_LABELS = {
  gluten: 'Gluten', crustaceans: 'Crustaceans', eggs: 'Eggs', fish: 'Fish',
  peanuts: 'Peanuts', soybeans: 'Soybeans', milk: 'Milk', nuts: 'Nuts',
  celery: 'Celery', mustard: 'Mustard', sesame: 'Sesame', sulphites: 'Sulphites',
  lupin: 'Lupin', molluscs: 'Molluscs',
}

function emptyComponentForm() {
  return { product_id: '', quantity: '', notes: '' }
}

function emptyHeaderForm(item) {
  return {
    name: item?.name || '',
    category_id: item?.category_id || '',
    selling_price: item?.selling_price ?? '',
    vat_rate: item?.vat_rate ?? '0',
    notes: item?.notes || '',
  }
}

export default function MenuItemPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeRestaurant } = useRestaurant()
  const confirm = useConfirm()

  const [item, setItem] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [components, setComponents] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [prices, setPrices] = useState([])
  const [allergens, setAllergens] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [headerForm, setHeaderForm] = useState(emptyHeaderForm(null))
  const [headerErrors, setHeaderErrors] = useState({})
  const [headerSaving, setHeaderSaving] = useState(false)
  const [headerSavedMessage, setHeaderSavedMessage] = useState('')

  const [showComponentForm, setShowComponentForm] = useState(false)
  const [editingComponent, setEditingComponent] = useState(null)
  const [componentForm, setComponentForm] = useState(emptyComponentForm())
  const [componentErrors, setComponentErrors] = useState({})

  const productSelectRef = useRef(null)

  useEffect(() => {
    fetchAll()
  }, [id])

  useEffect(() => {
    if (!activeRestaurant) return
    fetchPrices()
  }, [activeRestaurant])

  useEffect(() => {
    // Auto-focus the product dropdown after the form clears (post-add)
    if (showComponentForm && !componentForm.product_id && productSelectRef.current) {
      const scrollContainer = productSelectRef.current.closest('main')
      const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0
      productSelectRef.current.focus({ preventScroll: true })
      if (scrollContainer) scrollContainer.scrollTop = scrollTop
    }
  }, [componentForm.product_id, showComponentForm])

  async function fetchAll() {
    setLoading(true)
    const [itemRes, categoriesRes, productsRes, componentsRes, recipesRes, allergensRes] = await Promise.all([
      supabase.from('menu_items').select('*').eq('id', id).single(),
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
      supabase.from('menu_item_components').select('*').eq('menu_item_id', id),
      supabase.from('mix_recipes').select('*'),
      supabase.from('product_allergens').select('*'),
    ])

    if (itemRes.error) { setError(friendlyError(itemRes.error)); setLoading(false); return }
    setItem(itemRes.data)
    setHeaderForm(emptyHeaderForm(itemRes.data))

    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    if (componentsRes.data) setComponents(componentsRes.data)
    if (recipesRes.data) setRecipeLines(recipesRes.data)
    if (allergensRes.data) setAllergens(allergensRes.data)

    setLoading(false)
  }

  async function fetchPrices() {
    const { data } = await supabase
      .from('product_supplier_prices')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('is_preferred', true)
    if (data) setPrices(data)
  }

  function handleHeaderChange(field, value) {
    setHeaderForm({ ...headerForm, [field]: value })
    setHeaderSavedMessage('')
  }

  function validateHeader() {
    const e = {}
    if (!headerForm.name.trim()) e.name = 'Name is required'
    if (!headerForm.category_id) e.category_id = 'Category is required'
    const price = parseFloat(headerForm.selling_price)
    if (isNaN(price) || price < 0) e.selling_price = 'Selling price must be 0 or more'
    const vat = parseFloat(headerForm.vat_rate)
    if (isNaN(vat) || vat < 0 || vat > 100) e.vat_rate = 'VAT rate must be 0–100'
    return e
  }

  async function saveHeader() {
    setError('')
    setHeaderSavedMessage('')
    const e = validateHeader()
    if (Object.keys(e).length) { setHeaderErrors(e); return }
    setHeaderErrors({})
    setHeaderSaving(true)

    const payload = {
      name: headerForm.name.trim(),
      category_id: headerForm.category_id,
      selling_price: parseFloat(headerForm.selling_price),
      vat_rate: parseFloat(headerForm.vat_rate),
      notes: headerForm.notes || null,
    }

    const { error: err } = await supabase
      .from('menu_items')
      .update(payload)
      .eq('id', id)

    if (err) setError(friendlyError(err))
    else {
      setHeaderSavedMessage('Saved')
      fetchAll()
    }
    setHeaderSaving(false)
  }

  function handleComponentChange(field, value) {
    setComponentForm({ ...componentForm, [field]: value })
  }

  function validateComponent() {
    const e = {}
    if (!componentForm.product_id) e.product_id = 'Product is required'
    const qty = parseFloat(componentForm.quantity)
    if (isNaN(qty) || qty <= 0) e.quantity = 'Quantity must be greater than 0'
    return e
  }

  async function handleComponentSave(e) {
    e.preventDefault()
    setError('')
    const v = validateComponent()
    if (Object.keys(v).length) { setComponentErrors(v); return }
    setComponentErrors({})

    const payload = {
      menu_item_id: id,
      product_id: componentForm.product_id,
      quantity: parseFloat(componentForm.quantity),
      notes: componentForm.notes || null,
    }

    if (editingComponent) {
      const { error: err } = await supabase
        .from('menu_item_components')
        .update(payload)
        .eq('id', editingComponent.id)

      if (err) handleSupabaseError(err)
      else { fetchComponents(); resetComponentForm() }
    } else {
      const { error: err } = await supabase
        .from('menu_item_components')
        .insert(payload)

      if (err) handleSupabaseError(err)
      else {
        fetchComponents()
        setComponentForm(emptyComponentForm())
        setComponentErrors({})
        // Form stays open for rapid bulk entry. Done button closes.
      }
    }
  }

  function handleSupabaseError(err) {
    if (err.code === '23505') {
      setError('This product is already a component of this menu item. Edit the existing row instead.')
    } else {
      setError(friendlyError(err))
    }
  }

  async function fetchComponents() {
    const { data } = await supabase
      .from('menu_item_components')
      .select('*')
      .eq('menu_item_id', id)
    if (data) setComponents(data)
  }

  function resetComponentForm() {
    setComponentForm(emptyComponentForm())
    setEditingComponent(null)
    setShowComponentForm(false)
    setComponentErrors({})
  }

  function startEditComponent(component) {
    setComponentForm({
      product_id: component.product_id,
      quantity: component.quantity ?? '',
      notes: component.notes || '',
    })
    setEditingComponent(component)
    setShowComponentForm(true)
    setComponentErrors({})
  }

  async function removeComponent(component) {
    const ingredient = products.find(p => p.id === component.product_id)
    const ok = await confirm({
      title: 'Remove this component?',
      message: 'The dish will be costed without it from now on.',
      details: [
        { label: 'Component', value: ingredient?.name || 'Unknown product' },
        { label: 'Quantity', value: `${component.quantity} ${ingredient?.unit || ''}`.trim() },
      ],
      confirmLabel: 'Remove component',
      tone: 'danger',
    })
    if (!ok) return
    const { error: err } = await supabase
      .from('menu_item_components')
      .delete()
      .eq('id', component.id)
    if (err) setError(friendlyError(err))
    else fetchComponents()
  }

  // Available products in the dropdown: all active products except those
  // already added (unless we're editing that specific component).
  const availableProducts = products.filter(p => {
    if (editingComponent && editingComponent.product_id === p.id) return true
    return !components.some(c => c.product_id === p.id)
  })

  // Derived numbers
  const totalCost = (() => {
    if (components.length === 0) return null
    let total = 0
    for (const c of components) {
      const product = products.find(p => p.id === c.product_id)
      if (!product) return null
      const result = calculateMixCost(product, products, recipeLines, prices)
      if (result.cost === null) return null
      total += parseFloat(c.quantity) * result.cost
    }
    return total
  })()

  const grossPrice = item ? parseFloat(item.selling_price) : 0
  const vatRate = item ? parseFloat(item.vat_rate) : 0
  const netPrice = grossPrice / (1 + vatRate / 100)
  const margin = totalCost !== null ? netPrice - totalCost : null
  const marginPct = (margin !== null && netPrice > 0) ? (margin / netPrice) * 100 : null

  function marginColour(pct) {
    if (pct === null) return 'text-gray-400'
    if (pct >= MARGIN_GREEN) return 'text-green-700'
    if (pct >= MARGIN_AMBER) return 'text-amber-700'
    return 'text-red-600'
  }

  const derivedAllergens = deriveMenuItemAllergens(components, products, recipeLines, allergens)

  function getProduct(productId) {
    return products.find(p => p.id === productId)
  }

  function getLineCost(component) {
    const product = getProduct(component.product_id)
    if (!product) return null
    const result = calculateMixCost(product, products, recipeLines, prices)
    if (result.cost === null) return null
    return parseFloat(component.quantity) * result.cost
  }

  function getIngredientUnitCost(product) {
    if (!product) return null
    const result = calculateMixCost(product, products, recipeLines, prices)
    return result.cost
  }

  if (loading) return <div className="text-sm text-gray-500">Loading menu item...</div>

  return (
    <div>
      <button
        onClick={() => navigate('/catalogue/menu-items')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
      >
        <span>←</span> Back to menu items
      </button>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Menu Item: {item?.name}</h2>
        <p className="text-sm text-gray-500 mt-1">Costs and margins for {activeRestaurant?.name}</p>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}

      {/* Header form: name, category, price, VAT, notes */}
      <div className={`${card} p-6 mb-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Details</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
            <input
              type="text"
              value={headerForm.name}
              onChange={e => handleHeaderChange('name', e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {headerErrors.name && <p className="text-xs text-red-600 mt-1">{headerErrors.name}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
            <select
              value={headerForm.category_id}
              onChange={e => handleHeaderChange('category_id', e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            >
              <option value="">Select a category...</option>
              {categories.filter(c => c.is_active).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {headerErrors.category_id && <p className="text-xs text-red-600 mt-1">{headerErrors.category_id}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Selling Price (€, gross)</label>
            <input
              {...numberField({
                value: headerForm.selling_price,
                onChange: v => handleHeaderChange('selling_price', v),
              })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {headerErrors.selling_price && <p className="text-xs text-red-600 mt-1">{headerErrors.selling_price}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">VAT Rate (%)</label>
            <input
              {...numberField({
                value: headerForm.vat_rate,
                onChange: v => handleHeaderChange('vat_rate', v),
              })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {headerErrors.vat_rate && <p className="text-xs text-red-600 mt-1">{headerErrors.vat_rate}</p>}
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes (optional)</label>
          <textarea
            value={headerForm.notes}
            onChange={e => handleHeaderChange('notes', e.target.value)}
            rows={2}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveHeader}
            disabled={headerSaving}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {headerSaving ? 'Saving...' : 'Save Details'}
          </button>
          {headerSavedMessage && <span className="text-xs text-green-700">{headerSavedMessage}</span>}
        </div>
      </div>

      {/* Components section */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Components</h3>
        <button
          onClick={() => { resetComponentForm(); setShowComponentForm(true) }}
          disabled={availableProducts.length === 0}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + Add Component
        </button>
      </div>

      {showComponentForm && !editingComponent && (
        <div className={`${card} p-6 mb-6`}>
          <h4 className="text-sm font-semibold text-gray-900 mb-4">New Component</h4>
          <ComponentForm
            formData={componentForm}
            onChange={handleComponentChange}
            onSubmit={handleComponentSave}
            onCancel={resetComponentForm}
            submitLabel="Add Component"
            errors={componentErrors}
            availableProducts={availableProducts}
            productSelectRef={productSelectRef}
          />
        </div>
      )}

      {components.length === 0 ? (
        <div className={`${card} p-8 text-center mb-6`}>
          <p className="text-sm text-gray-500">No components yet. Click "+ Add Component" to start building this menu item.</p>
        </div>
      ) : (
        <div className={`${tableCard} mb-6`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Component</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Cost</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Cost</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c, i) => {
                const product = getProduct(c.product_id)
                const unitCost = getIngredientUnitCost(product)
                const lineCost = getLineCost(c)
                return (
                  <Fragment key={c.id}>
                    <tr className={`border-b border-border ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {product ? (
                          <>
                            {product.name}
                            {product.is_mix && <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700">MIX</span>}
                          </>
                        ) : <span className="text-red-600">Missing product</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{parseFloat(c.quantity)} {product?.unit}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {unitCost !== null ? `€${unitCost.toFixed(4)} / ${product?.unit}` : <span className="text-amber-600 text-xs">No cost available</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {lineCost !== null ? `€${lineCost.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.notes || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3">
                          <button
                            onClick={() => editingComponent?.id === c.id ? resetComponentForm() : startEditComponent(c)}
                            className={rowButton('edit')}
                          >
                            {editingComponent?.id === c.id ? 'Cancel' : 'Edit'}
                          </button>
                          <button
                            onClick={() => removeComponent(c)}
                            className={rowButton('danger')}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <div className={`${card} p-6 mb-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Summary</h3>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cost</p>
            <p className="text-xl font-semibold text-gray-900">
              {totalCost !== null ? `€${totalCost.toFixed(2)}` : <span className="text-amber-600 text-base">—</span>}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Price (gross)</p>
            <p className="text-xl font-semibold text-gray-900">€{grossPrice.toFixed(2)}</p>
            <p className="text-xs text-gray-400">VAT {vatRate.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Net Price</p>
            <p className="text-xl font-semibold text-gray-900">€{netPrice.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Margin</p>
            <p className={`text-xl font-semibold ${marginColour(marginPct)}`}>
              {margin !== null ? `€${margin.toFixed(2)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Margin %</p>
            <p className={`text-xl font-semibold ${marginColour(marginPct)}`}>
              {marginPct !== null ? `${marginPct.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
        {totalCost === null && components.length > 0 && (
          <p className="text-xs text-amber-700 mt-3">
            Some components have no preferred price (raw products) or no complete recipe (MIX products) for {activeRestaurant?.name}. The cost and margin cannot be calculated until all are configured.
          </p>
        )}
      </div>

      {/* Derived allergens */}
      <div className={`${card} p-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Derived Allergens</h3>
        <p className="text-xs text-gray-500 mb-4">
          Calculated automatically from the allergens set on each component (and recursively from the ingredients of any MIX component). To change, edit the allergens on the underlying products.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALLERGEN_KEYS.map(key => {
            const state = derivedAllergens[key]
            const colour = state === 'contains'
              ? 'bg-red-100 text-red-800 border-red-300'
              : state === 'may_contain'
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-gray-100 text-gray-500 border-gray-300'
            const label = state === 'contains' ? 'Contains' : state === 'may_contain' ? 'May Contain' : 'Not Present'
            return (
              <div key={key} className={`px-3 py-2 rounded-lg border text-sm flex items-center justify-between ${colour}`}>
                <span className="font-medium">{ALLERGEN_LABELS[key]}</span>
                <span className="text-xs">{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Editing opens in a dialog rather than pushing a form into the middle of
          the table, where the row being changed was hard to pick out from the
          rows around it and everything below jumped down the page. */}
      {editingComponent && (
        <Modal
          title={`Edit ${products.find(p => p.id === editingComponent.product_id)?.name || 'this component'}`}
          onClose={resetComponentForm}
          width="max-w-2xl"
        >
          <div className="px-6 py-4">
            <ComponentForm
              formData={componentForm}
              onChange={handleComponentChange}
              onSubmit={handleComponentSave}
              onCancel={resetComponentForm}
              submitLabel="Save changes"
              errors={componentErrors}
              availableProducts={availableProducts}
              productSelectRef={null}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

function ComponentForm({ formData, onChange, onSubmit, onCancel, submitLabel, errors, availableProducts, productSelectRef }) {
  const product = availableProducts.find(p => p.id === formData.product_id)
  const unit = product?.unit || 'unit'

  const [displayUnit, setDisplayUnit] = useState(unit)

  // When the chosen product changes (and so its canonical unit), reset
  // the display unit to the canonical one.
  useEffect(() => {
    if (unit === 'KG') setDisplayUnit('g')
    else if (unit === 'Litre') setDisplayUnit('ml')
    else setDisplayUnit(unit)
    }, [unit])

  function getDisplayValue() {
    if (!formData.quantity) return ''
    const stored = parseFloat(formData.quantity)
    if (isNaN(stored)) return formData.quantity
    if (displayUnit === 'g' || displayUnit === 'ml') {
      return (stored * 1000).toString()
    }
    return formData.quantity
  }

  function handleDisplayChange(value) {
    if (value === '') {
      onChange('quantity', '')
      return
    }
    const num = parseFloat(value)
    if (isNaN(num)) {
      onChange('quantity', value)
      return
    }
    if (displayUnit === 'g' || displayUnit === 'ml') {
      onChange('quantity', (num / 1000).toString())
    } else {
      onChange('quantity', value)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Component</label>
          <select
            ref={productSelectRef}
            value={formData.product_id}
            onChange={e => onChange('product_id', e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
          >
            <option value="">Select a product...</option>
            {availableProducts.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unit}){p.is_mix ? ' (MIX)' : ''}
              </option>
            ))}
          </select>
          {errors.product_id && <p className="text-xs text-red-600 mt-1">{errors.product_id}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Quantity</label>
          <div className="flex gap-2">
            <input
              {...numberField({
                value: getDisplayValue(),
                onChange: handleDisplayChange,
              })}
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
            />
            {(unit === 'KG' || unit === 'Litre') ? (
              <select
                value={displayUnit}
                onChange={e => setDisplayUnit(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
              >
                {unit === 'KG' ? (
                  <>
                    <option value="KG">KG</option>
                    <option value="g">g</option>
                  </>
                ) : (
                  <>
                    <option value="Litre">Litre</option>
                    <option value="ml">ml</option>
                  </>
                )}
              </select>
            ) : (
              <span className="px-3 py-2 text-sm text-gray-500 border border-border rounded-lg bg-gray-50">
                {unit}
              </span>
            )}
          </div>
          {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes (optional)</label>
        <input
          type="text"
          value={formData.notes}
          onChange={e => onChange('notes', e.target.value)}
          placeholder="e.g. on top, on the side"
          className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-green-600 text-green-700 text-sm font-medium rounded-lg hover:bg-green-50 bg-white transition-colors"
        >
          Done
        </button>
      </div>
    </form>
  )
}