import { useState, useEffect, Fragment } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { calculateMixCost } from '../../lib/mixCost'
import RecipeIngredientForm from '../../components/RecipeIngredientForm'
import Modal from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { fmtMoney, fmtUnitCost } from '../../lib/format'
import { tableHeadRow, tableCard, card, rowButton, captionClass, fieldClass, pageTitle } from '../../lib/controlStyles'
import { useConfirm } from '../../context/ConfirmContext'
import { canBeIngredient } from '../../lib/products'
import { numberField } from '../../lib/numberInput'
import BackButton from '../../components/BackButton'

// The recipe behind a MIX, meaning something we make ourselves rather than buy.
//
// A MIX has no supplier and no invoice, so its cost has to come from what goes
// into it. The recipe is the ingredient lines plus the batch yield, and the cost
// per unit is everything the ingredients came to divided by how much the batch
// makes. Change the price of any ingredient and every MIX using it follows on
// its own, along with every dish those MIXes go into.
//
// The batch yield lives on the product rather than on each line, because it
// describes the whole recipe, not one ingredient. Without it there is nothing to
// divide by and the cost cannot be worked out at all, which is why it is asked
// for separately and saved on its own.
//
// An ingredient can itself be a MIX, so the calculation recurses. A recipe that
// ends up pointing back at itself stops cleanly instead of looping forever, and
// that guard is in lib/mixCost.js rather than here.
export default function RecipePage() {
  const { id } = useParams()
  const { activeRestaurant } = useRestaurant()
  const confirm = useConfirm()

  const [product, setProduct] = useState(null)
  const [recipeLines, setRecipeLines] = useState([])
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Kept apart from the page's error above. That one is for something that
  // would not load; this is for a save that would not go through, and it
  // belongs beside the button that was pressed rather than at the top of a
  // page that is not on screen when you press it.
  const [formProblem, setFormProblem] = useState('')
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

    if (error) setError(friendlyError(error))
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
    const { data, error } = await supabase
      .from('mix_recipes')
      .select('*')
      .order('id')

    if (error) setError(friendlyError(error))
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

  function getIngredientUnitCost(ingredientProduct) {
    // Uses the recursive helper. For raw ingredients it returns the preferred
    // price. For MIX ingredients it recursively computes the per-unit cost
    // from the nested recipe.
    if (!ingredientProduct) return null
    const result = calculateMixCost(ingredientProduct, products, recipeLines, prices)
    return result.cost
  }

  function getLineCost(line) {
    const ingredient = getProduct(line.ingredient_product_id)
    const unitCost = getIngredientUnitCost(ingredient)
    if (unitCost === null) return null
    return parseFloat(line.quantity) * unitCost
  }

  // Ingredients available in the dropdown: all active products except those
  // already added to this recipe (unless we're editing that specific line).
  //
  // Drinks and cleaning are left out, which is canBeIngredient's business. A
  // line already on the recipe still shows whatever it is, because hiding one
  // that is really there would leave a cost nobody could account for.
  const availableProducts = products.filter(p => {
    if (editingLine && editingLine.ingredient_product_id === p.id) return true
    if (!canBeIngredient(p)) return false
    return !recipeLines.some(l => l.ingredient_product_id === p.id && l.mix_product_id === id)
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

    setFormProblem('')

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

      if (error) setFormProblem(friendlyError(error))
      else { fetchRecipeLines(); resetForm() }
    } else {
      const { error } = await supabase
        .from('mix_recipes')
        .insert(payload)

      if (error) setFormProblem(friendlyError(error))
      else {
        fetchRecipeLines()
        setFormData(emptyForm())
        setErrors({})
        // Form stays open for rapid bulk entry. User clicks Done to close.
      }
    }
  }

  function resetForm() {
    setFormProblem('')
    setFormData(emptyForm())
    setEditingLine(null)
    setShowForm(false)
    setErrors({})
  }

  function startEdit(line) {
    setFormProblem('')
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
    const ingredient = getProduct(line.ingredient_product_id)
    const ok = await confirm({
      title: 'Remove this ingredient?',
      message: 'The mix will be costed without it, and every dish using the mix follows.',
      details: [
        { label: 'Ingredient', value: ingredient?.name || 'Unknown product' },
        { label: 'Quantity', value: `${line.quantity} ${ingredient?.unit || ''}`.trim() },
      ],
      confirmLabel: 'Remove ingredient',
      tone: 'danger',
    })
    if (!ok) return

    const { error } = await supabase
      .from('mix_recipes')
      .delete()
      .eq('id', line.id)

    if (error) setError(friendlyError(error))
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
      setBatchYieldMessage(friendlyError(error))
    } else {
      setBatchYieldMessage('Saved')
      fetchProduct()
    }
    setBatchYieldSaving(false)
  }

  // Recipe summary uses the shared calculateMixCost helper. The helper handles
  // nested MIXes recursively, so a MIX ingredient like Salsa Verde in Lime
  // Crema is costed correctly rather than flagged as missing a price.
  const summary = (() => {
    if (!product || recipeLines.length === 0) return null

    const result = calculateMixCost(product, products, recipeLines, prices)
    const batchYield = product?.batch_yield ? parseFloat(product.batch_yield) : null

    // For display we also want the absolute batch total (cost × batch_yield),
    // which is the per-unit cost scaled back up to one whole batch.
    const total = (result.cost !== null && batchYield)
      ? result.cost * batchYield
      : null

    return {
      perUnit: result.cost,
      total,
      batchYield,
      status: result.status,
      missing: result.missing || [],
    }
  })()

  return (
    <div>
      <BackButton to="/catalogue/products" className="mb-4">Back to products</BackButton>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className={pageTitle}>
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

      <div className={`${card} p-6 mb-6`}>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Batch Yield</h3>
        <p className="text-xs text-gray-500 mb-3">
          How much finished {product?.name || 'product'} one batch of this recipe produces,
          measured in {product?.unit || 'the product unit'}.
        </p>
        {/* The box and its unit on one line, the button under them on a phone
            and beside them from sm. All three across 390px left the button
            hanging off the edge, and it is the one thing here you have to
            press. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              {...numberField({
                value: batchYieldInput,
                onChange: setBatchYieldInput,
              })}
              placeholder="e.g. 10"
              className={`${fieldClass} flex-1 sm:w-40 sm:flex-none`}
            />
            <span className="text-sm text-gray-600 whitespace-nowrap">{product?.unit}</span>
          </div>
          <button
            onClick={saveBatchYield}
            disabled={batchYieldSaving}
            className="w-full sm:w-auto px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {batchYieldSaving ? 'Saving...' : 'Save batch yield'}
          </button>
          {batchYieldMessage && (
            <span className={`text-xs ${batchYieldMessage === 'Saved' ? 'text-green-700' : 'text-red-600'}`}>
              {batchYieldMessage}
            </span>
          )}
        </div>
      </div>

      {showForm && !editingLine && (
        <div className={`${card} p-6 mb-6`}>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Ingredient</h3>
          <RecipeIngredientForm
            problem={formProblem}
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
      ) : recipeLines.filter(line => line.mix_product_id === id).length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="text-sm text-gray-500">
            No ingredients yet. Click "+ Add Ingredient" to start building the recipe.
          </p>
        </div>
      ) : (
        <>
          {/* A card each on a phone, the table from sm up. Six columns across
              390px left the ingredient name wrapping inside about ninety
              pixels while the line cost sat off the right hand edge, so the
              two things you actually read were the two hardest to get at. */}
          <div className="sm:hidden space-y-2">
            {recipeLines.filter(line => line.mix_product_id === id).map(line => {
              const ingredient = getProduct(line.ingredient_product_id)
              const unitCost = getIngredientUnitCost(ingredient)
              const lineCost = getLineCost(line)
              return (
                <div key={line.id} className="rounded-lg border border-border bg-white p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-gray-900">
                      {ingredient ? ingredient.name : <span className="text-red-600">Missing product</span>}
                    </span>
                    <span className="text-base font-semibold text-gray-900 whitespace-nowrap tabular-nums">
                      {lineCost !== null ? fmtMoney(lineCost) : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {parseFloat(line.quantity)} {ingredient?.unit || ''}
                    {unitCost !== null
                      ? ` at ${fmtUnitCost(unitCost)} / ${ingredient?.unit}`
                      : <span className="text-amber-600"> · no cost available</span>}
                  </p>
                  {line.notes && <p className="text-xs text-gray-400 mt-0.5">{line.notes}</p>}
                  <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-border">
                    <button
                      onClick={() => editingLine?.id === line.id ? resetForm() : startEdit(line)}
                      className={rowButton('edit')}
                    >
                      {editingLine?.id === line.id ? 'Cancel' : 'Edit'}
                    </button>
                    <button onClick={() => removeLine(line)} className={rowButton('danger')}>
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className={`hidden sm:block ${tableCard}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={tableHeadRow}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Ingredient</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Quantity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Unit Cost</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Line Cost</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Notes</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recipeLines.filter(line => line.mix_product_id === id).map((line, i) => {
                  const ingredient = getProduct(line.ingredient_product_id)
                  const unitCost = getIngredientUnitCost(ingredient)
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
                          {unitCost !== null ? `${fmtUnitCost(unitCost)} / ${ingredient?.unit}` : <span className="text-amber-600">No cost available</span>}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {lineCost !== null ? `${fmtMoney(lineCost)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{line.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button
                              onClick={() => editingLine?.id === line.id ? resetForm() : startEdit(line)}
                              className={rowButton('edit')}
                            >
                              {editingLine?.id === line.id ? 'Cancel' : 'Edit'}
                            </button>
                            <button
                              onClick={() => removeLine(line)}
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

          {summary && (
            <div className={`${card} p-6 mt-6`}>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recipe summary</h3>

              {/* The cost per unit is what this panel is for: it is the figure
                  every menu item using this mix is costed from. The batch total
                  and the yield are the two numbers it was divided out of, so
                  they read as the working underneath rather than as three equal
                  columns squeezed into 130 pixels each. Same shape as the Menu
                  Item summary, for the same reason. */}
              <div className="bg-app-bg rounded-lg p-4 mb-3">
                <p className={`${captionClass} mb-1`}>Cost per {product?.unit}</p>
                <p className="font-serif text-3xl font-bold text-gray-900 leading-none">
                  {summary.perUnit !== null ? `${fmtUnitCost(summary.perUnit)}` : '—'}
                </p>
              </div>
              <div>
                <div className="flex justify-between gap-3 text-sm py-2 border-b border-border">
                  <span className="text-muted">Total cost per batch</span>
                  <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {summary.total !== null ? fmtMoney(summary.total) : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-sm py-2">
                  <span className="text-muted">Batch yield</span>
                  <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {summary.batchYield
                      ? `${summary.batchYield} ${product?.unit}`
                      : <span className="text-amber-600">Not set</span>}
                  </span>
                </div>
              </div>
              {summary.status === 'missing_price' && (
                <p className="text-xs text-amber-700 mt-3">
                  Some ingredients (or nested MIX ingredients) have no preferred price set for {activeRestaurant?.name}. The cost above cannot be calculated until all ingredient prices are configured.
                </p>
              )}
              {summary.status === 'no_batch_yield' && (
                <p className="text-xs text-amber-700 mt-3">
                  Set a batch yield above to see the cost per {product?.unit}.
                </p>
              )}
              {summary.status === 'cycle' && (
                <p className="text-xs text-red-600 mt-3">
                  This recipe references itself somewhere in the chain (a MIX appearing in its own recipe, directly or via another MIX). The cost cannot be calculated until the cycle is removed.
                </p>
              )}
            </div>
          )}
      {editingLine && (
        <Modal
          title={`Edit ${getProduct(editingLine.ingredient_product_id)?.name || 'this ingredient'}`}
          onClose={resetForm}
          width="max-w-2xl"
        >
          <div className="px-6 py-4">
            <RecipeIngredientForm
              problem={formProblem}
              formData={formData}
              onChange={handleFieldChange}
              onSubmit={handleSave}
              onCancel={resetForm}
              submitLabel="Save changes"
              errors={errors}
              availableProducts={availableProducts}
            />
          </div>
        </Modal>
      )}

        </>
      )}
    </div>
  )
}
