import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import RecipeIngredientForm from '../../components/RecipeIngredientForm'

export default function RecipePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeRestaurant } = useRestaurant()

  const [product, setProduct] = useState(null)
  const [recipeLines, setRecipeLines] = useState([])
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [editingLine, setEditingLine] = useState(null)
  const [formData, setFormData] = useState(emptyForm())
  const [batchYieldInput, setBatchYieldInput] = useState('')
  const [batchYieldSaving, setBatchYieldSaving] = useState(false)
  const [batchYieldMessage, setBatchYieldMessage] = useState('')

  function emptyForm() {
    return {
      ingredient_product_id: '',
      quantity: '',
      notes: '',
    }
  }

  useEffect(() => {
    fetchProduct()
    fetchProducts()
    fetchRecipeLines()
  }, [id])

  useEffect(() => {
    if (!activeRestaurant) return
    fetchPrices()
  }, [activeRestaurant])

  async function fetchProduct() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error) setError(error.message)
    else {
      setProduct(data)
      setBatchYieldInput(data.batch_yield ?? '')
    }
  }

  async function fetchProducts() {
    // Ingredients are any active product except the MIX itself (no self-reference)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .neq('id', id)
      .order('name')

    if (data) setProducts(data)
  }

  async function fetchRecipeLines() {
    setLoading(true)
    const { data, error } = await supabase
      .from('mix_recipes')
      .select('*')
      .eq('mix_product_id', id)
      .order('id')

    if (error) setError(error.message)
    else setRecipeLines(data)
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

  function getProduct(productId) {
    return products.find(p => p.id === productId)
  }

  function getPreferredUnitCost(productId) {
    const price = prices.find(p => p.product_id === productId)
    return price ? parseFloat(price.price_per_unit) : null
  }

  function getLineCost(line) {
    const unitCost = getPreferredUnitCost(line.ingredient_product_id)
    if (unitCost === null) return null
    return parseFloat(line.quantity) * unitCost
  }

  // Ingredients available in the dropdown: all active products except those
  // already added to this recipe (unless we're editing that specific line)
  const availableProducts = products.filter(p => {
    if (editingLine && editingLine.ingredient_product_id === p.id) return true
    return !recipeLines.some(l => l.ingredient_product_id === p.id)
  })

  function handleFieldChange(field, value) {
    setFormData({ ...formData, [field]: value })
  }

  function validate() {
    const newErrors = {}

    if (!formData.ingredient_product_id) {
      newErrors.ingredient_product_id = 'Ingredient is required'
    }

    const qty = parseFloat(formData.quantity)
    if (isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0'
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
      mix_product_id: id,
      ingredient_product_id: formData.ingredient_product_id,
      quantity: parseFloat(formData.quantity),
      notes: formData.notes || null,
    }

    if (editingLine) {
      const { error } = await supabase
        .from('mix_recipes')
        .update(payload)
        .eq('id', editingLine.id)

      if (error) setError(error.message)
      else { fetchRecipeLines(); resetForm() }
    } else {
      const { error } = await supabase
        .from('mix_recipes')
        .insert(payload)

      if (error) setError(error.message)
      else { fetchRecipeLines(); resetForm() }
    }
  }

  function resetForm() {
    setFormData(emptyForm())
    setEditingLine(null)
    setShowForm(false)
    setErrors({})
  }

  function startEdit(line) {
    setFormData({
      ingredient_product_id: line.ingredient_product_id,
      quantity: line.quantity ?? '',
      notes: line.notes || '',
    })
    setEditingLine(line)
    setShowForm(true)
    setErrors({})
  }

  async function removeLine(line) {
    if (!confirm('Remove this ingredient from the recipe?')) return

    const { error } = await supabase
      .from('mix_recipes')
      .delete()
      .eq('id', line.id)

    if (error) setError(error.message)
    else fetchRecipeLines()
  }

  async function saveBatchYield() {
    setBatchYieldMessage('')
    setBatchYieldSaving(true)

    const value = parseFloat(batchYieldInput)
    if (isNaN(value) || value <= 0) {
      setBatchYieldMessage('Batch yield must be greater than 0')
      setBatchYieldSaving(false)
      return
    }

    const { error } = await supabase
      .from('products')
      .update({ batch_yield: value })
      .eq('id', id)

    if (error) {
      setBatchYieldMessage(error.message)
    } else {
      setBatchYieldMessage('Saved')
      fetchProduct()
    }
    setBatchYieldSaving(false)
  }

  // Recipe summary: total cost and per-unit cost. Per-unit is total / batch_yield.
  // Returns null if any ingredient is missing a preferred price (incomplete data).
  const summary = (() => {
    if (recipeLines.length === 0) return null

    let total = 0
    let anyMissing = false
    for (const line of recipeLines) {
      const lineCost = getLineCost(line)
      if (lineCost === null) {
        anyMissing = true
        continue
      }
      total += lineCost
    }

    const batchYield = product?.batch_yield ? parseFloat(product.batch_yield) : null
    const perUnit = (batchYield && batchYield > 0) ? total / batchYield : null

    return { total, perUnit, anyMissing, batchYield }
  })()

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
            Recipe: {product?.name || '...'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {product ? `${product.section} • ${product.unit} • ` : ''}costs for {activeRestaurant?.name}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          disabled={availableProducts.length === 0}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + Add Ingredient
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      {product && !product.is_mix && (
        <div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-3 mb-4">
          This product is not marked as a MIX. Recipes only make sense for house-made MIX products. Edit the product and tick the MIX checkbox to make this recipe meaningful.
        </div>
      )}

      <div className="bg-white rounded-xl border border-border p-6 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Batch Yield</h3>
        <p className="text-xs text-gray-500 mb-3">
          How much finished {product?.name || 'product'} one batch of this recipe produces,
          measured in {product?.unit || 'the product unit'}.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.001"
            min="0"
            value={batchYieldInput}
            onChange={e => setBatchYieldInput(e.target.value)}
            placeholder="e.g. 10"
            className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white w-40"
          />
          <span className="text-sm text-gray-600">{product?.unit}</span>
          <button
            onClick={saveBatchYield}
            disabled={batchYieldSaving}
            className="px-3 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {batchYieldSaving ? 'Saving...' : 'Save Batch Yield'}
          </button>
          {batchYieldMessage && (
            <span className={`text-xs ${batchYieldMessage === 'Saved' ? 'text-green-700' : 'text-red-600'}`}>
              {batchYieldMessage}
            </span>
          )}
        </div>
      </div>

      {showForm && !editingLine && (
        <div className="bg-white rounded-xl border border-border p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Ingredient</h3>
          <RecipeIngredientForm
            formData={formData}
            onChange={handleFieldChange}
            onSubmit={handleSave}
            onCancel={resetForm}
            submitLabel="Add Ingredient"
            errors={errors}
            availableProducts={availableProducts}
          />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading recipe...</div>
      ) : recipeLines.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-gray-500">
            No ingredients yet. Click "+ Add Ingredient" to start building the recipe.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ingredient</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Cost</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Line Cost</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipeLines.map((line, i) => {
                  const ingredient = getProduct(line.ingredient_product_id)
                  const unitCost = getPreferredUnitCost(line.ingredient_product_id)
                  const lineCost = getLineCost(line)
                  return (
                    <Fragment key={line.id}>
                      <tr className={`border-b border-border ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {ingredient ? ingredient.name : <span className="text-red-600">Missing product</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {parseFloat(line.quantity)} {ingredient?.unit || ''}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {unitCost !== null ? `€${unitCost.toFixed(4)} / ${ingredient?.unit}` : <span className="text-amber-600">No preferred price</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {lineCost !== null ? `€${lineCost.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{line.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button
                              onClick={() => editingLine?.id === line.id ? resetForm() : startEdit(line)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-800"
                            >
                              {editingLine?.id === line.id ? 'Cancel' : 'Edit'}
                            </button>
                            <button
                              onClick={() => removeLine(line)}
                              className="text-xs font-medium text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingLine?.id === line.id && (
                        <tr>
                          <td colSpan={6} className="px-4 py-4 bg-amber-50 border-b border-border">
                            <RecipeIngredientForm
                              formData={formData}
                              onChange={handleFieldChange}
                              onSubmit={handleSave}
                              onCancel={resetForm}
                              submitLabel="Save Changes"
                              errors={errors}
                              availableProducts={availableProducts}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {summary && (
            <div className="bg-white rounded-xl border border-border p-6 mt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recipe Summary</h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Cost per Batch</p>
                  <p className="text-2xl font-semibold text-gray-900">€{summary.total.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Batch Yield</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {summary.batchYield ? `${summary.batchYield} ${product?.unit}` : <span className="text-amber-600 text-base">Not set</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cost per {product?.unit}</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {summary.perUnit !== null ? `€${summary.perUnit.toFixed(4)}` : '—'}
                  </p>
                </div>
              </div>
              {summary.anyMissing && (
                <p className="text-xs text-amber-700 mt-3">
                  Some ingredients have no preferred price set for {activeRestaurant?.name}. The total above only counts ingredients that do.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
