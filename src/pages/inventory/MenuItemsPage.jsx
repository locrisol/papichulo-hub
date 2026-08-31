import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { useConfirm } from '../../context/ConfirmContext'
import { menuItemCost } from '../../lib/mixCost'
import { deriveMenuItemAllergens, summariseAllergens } from '../../lib/allergens'
import CategoryManagerModal from '../../components/CategoryManagerModal'
import { friendlyError } from '../../lib/errors'
import { secondaryButton, tableHeadRow, tableHeadCell, tableCard, badge, card, rowButton } from '../../lib/controlStyles'
import { numberField } from '../../lib/numberInput'

// Every dish we sell, with what it costs us and what it makes.
//
// The margin is worked out against the net price, not the price on the menu. VAT
// is not ours, so counting it as income makes every dish look better than it is.
//
// The cost is all or nothing. If one component cannot be costed, because nothing
// is priced or a MIX in it is incomplete, the whole dish shows no cost and no
// margin instead of a total that quietly leaves an ingredient out. A margin that
// is wrong is worse than a margin that is missing, because nobody checks it.
//
// Everything here is per restaurant. The selling price is the same in both, but
// the cost follows whichever supplier that restaurant prefers, so the same dish
// can have a different margin in each one.

const MARGIN_GREEN = 65   // >= 65% net margin = green
const MARGIN_AMBER = 60   // 60-65% = amber, < 60% = red

export default function MenuItemsPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { activeRestaurant } = useRestaurant()

  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [components, setComponents] = useState([])
  const [products, setProducts] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [prices, setPrices] = useState([])
  const [allergens, setAllergens] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState({})

  const [showForm, setShowForm] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showInactive, setShowInactive] = useState(() => {
    return localStorage.getItem('menuItemsShowInactive') === 'true'
  })

  const [formData, setFormData] = useState(emptyForm())

  function emptyForm() {
    return {
      name: '',
      category_id: '',
      selling_price: '',
      vat_rate: '0',
      notes: '',
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  useEffect(() => {
    if (!activeRestaurant) return
    fetchPrices()
  }, [activeRestaurant])

  async function fetchAll() {
    setLoading(true)
    const [
      menuItemsRes, categoriesRes, componentsRes, productsRes,
      recipeLinesRes, allergensRes,
    ] = await Promise.all([
      supabase.from('menu_items').select('*').order('name'),
      supabase.from('menu_categories').select('*').order('sort_order'),
      supabase.from('menu_item_components').select('*'),
      supabase.from('products').select('*').order('name'),
      supabase.from('mix_recipes').select('*'),
      supabase.from('product_allergens').select('*'),
    ])

    if (menuItemsRes.error) setError(friendlyError(menuItemsRes.error))
    else setMenuItems(menuItemsRes.data)

    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (componentsRes.data) setComponents(componentsRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    if (recipeLinesRes.data) setRecipeLines(recipeLinesRes.data)
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

  function handleFieldChange(field, value) {
    setFormData({ ...formData, [field]: value })
  }

  function validate() {
    const e = {}
    if (!formData.name.trim()) e.name = 'Name is required'
    if (!formData.category_id) e.category_id = 'Category is required'
    const price = parseFloat(formData.selling_price)
    if (isNaN(price) || price < 0) e.selling_price = 'Selling price must be 0 or more'
    const vat = parseFloat(formData.vat_rate)
    if (isNaN(vat) || vat < 0 || vat > 100) e.vat_rate = 'VAT rate must be between 0 and 100'
    return e
  }

  async function handleSave(e) {
    e.preventDefault()
    setError('')
    const v = validate()
    if (Object.keys(v).length) { setErrors(v); return }
    setErrors({})

    const payload = {
      name: formData.name.trim(),
      category_id: formData.category_id,
      selling_price: parseFloat(formData.selling_price),
      vat_rate: parseFloat(formData.vat_rate),
      notes: formData.notes || null,
    }

    const { data, error } = await supabase
      .from('menu_items')
      .insert(payload)
      .select()
      .single()

    if (error) setError(friendlyError(error))
    else {
      // Jump straight into the editor for the new item so the user can
      // start adding components immediately.
      navigate(`/catalogue/menu-items/${data.id}`)
    }
  }

  function resetForm() {
    setFormData(emptyForm())
    setShowForm(false)
    setErrors({})
  }

  async function toggleActive(item) {
    // Same as the products list: taking something off the menu is worth one
    // question, putting it back is not.
    if (item.is_active) {
      const ok = await confirm({
        title: `Deactivate ${item.name}?`,
        message: 'It comes off the menu and off the allergen sheet. Everything already recorded against it stays as it is.',
        confirmLabel: 'Deactivate it',
        tone: 'danger',
        dangerNote: 'You can put it back at any time.',
      })
      if (!ok) return
    }

    const { error } = await supabase
      .from('menu_items')
      .update({ is_active: !item.is_active })
      .eq('id', item.id)
    if (error) setError(friendlyError(error))
    else fetchAll()
  }

  function getItemComponents(itemId) {
    return components.filter(c => c.menu_item_id === itemId)
  }

  function getItemCost(item) {
    return menuItemCost(getItemComponents(item.id), products, recipeLines, prices)
  }

  function getItemAllergens(item) {
    const lines = getItemComponents(item.id)
    return deriveMenuItemAllergens(lines, products, recipeLines, allergens)
  }

  function getNet(item) {
    const vat = parseFloat(item.vat_rate) || 0
    return parseFloat(item.selling_price) / (1 + vat / 100)
  }

  function getMargin(item) {
    const cost = getItemCost(item)
    if (cost === null) return null
    const net = getNet(item)
    return { net, margin: net - cost, marginPct: net > 0 ? ((net - cost) / net) * 100 : null }
  }

  function marginColour(pct) {
    if (pct === null) return 'text-gray-400'
    if (pct >= MARGIN_GREEN) return 'text-green-700'
    if (pct >= MARGIN_AMBER) return 'text-amber-700'
    return 'text-red-600'
  }

  // The row buttons, written once and used by the table and the phone cards, so
  // the two cannot end up offering different things. A plain function rather
  // than a component, since a component declared in here would be a new type on
  // every render and get rebuilt each time.
  function rowActions(item) {
    return (
      <>
        <button
          onClick={() => navigate(`/catalogue/menu-items/${item.id}`)}
          className={rowButton('edit')}
        >
          Edit
        </button>
        <button
          onClick={() => toggleActive(item)}
          className={rowButton(item.is_active ? 'danger' : 'good')}
        >
          {item.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      </>
    )
  }

  // How the allergen count reads. Both layouts show the same thing, so it is
  // worked out here rather than written twice.
  function allergenText(item) {
    const s = summariseAllergens(getItemAllergens(item))
    if (s.contains === 0 && s.mayContain === 0) return null
    return s
  }

  // Filter, group, sort
  const filteredItems = menuItems.filter(i => showInactive || i.is_active)
  const itemsByCategory = categories
    .filter(c => c.is_active)
    .map(c => ({
      category: c,
      items: filteredItems
        .filter(i => i.category_id === c.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter(group => group.items.length > 0 || showInactive)

  return (
    <div>
      {/* Allowed to wrap. A title, a subtitle and three buttons never fit
          across a phone, and with no wrapping the title was squeezed into a
          narrow column while the last button hung off the right edge. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Menu Items</h2>
          <p className="text-sm text-gray-500 mt-1">
            Costs and margins for {activeRestaurant?.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            onClick={() => setShowCategoryModal(true)}
            className={secondaryButton}
          >
            Manage Categories
          </button>
          <button
            onClick={() => {
              const next = !showInactive
              setShowInactive(next)
              localStorage.setItem('menuItemsShowInactive', next)
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
            + Add Menu Item
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
      )}

      {showForm && (
        <div className={`${card} p-6 mb-6`}>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Menu Item</h3>
          <form onSubmit={handleSave}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => handleFieldChange('name', e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Category</label>
                <select
                  value={formData.category_id}
                  onChange={e => handleFieldChange('category_id', e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                >
                  <option value="">Select a category...</option>
                  {categories.filter(c => c.is_active).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {errors.category_id && <p className="text-xs text-red-600 mt-1">{errors.category_id}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Selling Price (€, gross)</label>
                <input
                  {...numberField({
                    value: formData.selling_price,
                    onChange: v => handleFieldChange('selling_price', v),
                  })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
                {errors.selling_price && <p className="text-xs text-red-600 mt-1">{errors.selling_price}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">VAT Rate (%)</label>
                <input
                  {...numberField({
                    value: formData.vat_rate,
                    onChange: v => handleFieldChange('vat_rate', v),
                  })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
                />
                {errors.vat_rate && <p className="text-xs text-red-600 mt-1">{errors.vat_rate}</p>}
                <p className="text-xs text-gray-400 mt-1">Use 0 if no VAT applies. Margin calculation handles any rate.</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes (optional)</label>
              <textarea
                value={formData.notes}
                onChange={e => handleFieldChange('notes', e.target.value)}
                rows={2}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
              >
                Create & Edit Components
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
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading menu items...</div>
      ) : itemsByCategory.every(g => g.items.length === 0) ? (
        <div className={`${card} p-8 text-center`}>
          <p className="text-sm text-gray-500">No menu items yet. Click "+ Add Menu Item" to add your first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {itemsByCategory.map(({ category, items }) => (
            items.length === 0 ? null : (
              <div key={category.id}>
                {/* The category name was small grey uppercase, the same weight
                    as a column heading, so it did not read as the start of a
                    group. It is a proper heading now. */}
                {/* The category heading.

                    On a phone it is the dark green bar Stock Take uses for its
                    sections, with the number of dishes on the right. Once the
                    dishes became cards they all carried the same weight, so a
                    plain line of text between two white cards did not read as
                    the start of a group at all. You scrolled past Rice Bowls
                    without noticing you had left Burritos.

                    On a desktop it goes back to plain text, because there it
                    sits directly on top of the table heading row, which is
                    already this same green, and two green bands touching is
                    heavy. */}
                <div className="bg-sidebar rounded-lg shadow-md px-3 py-2.5 mb-2 flex items-center justify-between md:block md:bg-transparent md:shadow-none md:px-1 md:py-0">
                  <h3 className="font-serif text-base font-bold text-white md:text-gray-900">
                    {category.name}
                  </h3>
                  <span className={`${badge} bg-white/20 text-white md:hidden`}>
                    {items.length}
                  </span>
                </div>

                {/* Phone: one card per dish instead of eight columns to swipe
                    through. Same figures in the same order, stacked. The
                    desktop table below is untouched and takes over from the
                    medium breakpoint up. Both read their buttons from
                    rowActions so they cannot drift apart. */}
                <div className="md:hidden space-y-3">
                  {items.map(item => {
                    const cost = getItemCost(item)
                    const m = getMargin(item)
                    const allergens = allergenText(item)
                    const componentCount = getItemComponents(item.id).length

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-4 ${item.is_active
                          ? 'bg-white border-border'
                          : 'bg-red-100 border-red-200'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-semibold ${item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                            {item.name}
                          </p>
                          {/* The table says this with a red row, which a single
                              card cannot do, so it says it in words. */}
                          {!item.is_active && (
                            <span className={`${badge} flex-shrink-0 bg-red-200 text-red-800`}>Inactive</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {componentCount} {componentCount === 1 ? 'component' : 'components'}
                        </p>

                        <dl className="mt-3 space-y-1.5 text-sm">
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-gray-500">Cost</dt>
                            <dd className={`text-right font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                              {cost !== null
                                ? `€${cost.toFixed(2)}`
                                : <span className="text-amber-600 text-xs">Incomplete</span>}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-gray-500">Price (gross)</dt>
                            <dd className={`text-right ${item.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                              €{parseFloat(item.selling_price).toFixed(2)}
                              <span className="text-xs text-gray-400 ml-1">
                                (VAT {parseFloat(item.vat_rate)}%)
                              </span>
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-gray-500">Net</dt>
                            <dd className={`text-right ${item.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                              €{getNet(item).toFixed(2)}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-gray-500">Margin</dt>
                            <dd className="text-right">
                              {m ? (
                                <span className={`font-medium ${marginColour(m.marginPct)}`}>
                                  €{m.margin.toFixed(2)}
                                  <span className="text-xs ml-1">
                                    ({m.marginPct !== null ? `${m.marginPct.toFixed(1)}%` : '—'})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-amber-600 text-xs">—</span>
                              )}
                            </dd>
                          </div>
                          <div className="flex items-baseline justify-between gap-3">
                            <dt className="text-gray-500">Allergens</dt>
                            <dd className={`text-right text-xs ${item.is_active ? 'text-gray-600' : 'text-gray-400'}`}>
                              {!allergens ? 'None' : (
                                <>
                                  {allergens.contains > 0 && (
                                    <span className="text-red-600 mr-2">{allergens.contains} contains</span>
                                  )}
                                  {allergens.mayContain > 0 && (
                                    <span className="text-amber-700">{allergens.mayContain} may</span>
                                  )}
                                </>
                              )}
                            </dd>
                          </div>
                        </dl>

                        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/10">
                          {rowActions(item)}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className={`${tableCard} hidden md:block`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={tableHeadRow}>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Name</th>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Components</th>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Cost</th>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Price (gross)</th>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Net</th>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Margin</th>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Allergens</th>
                        <th className={`text-left px-4 py-3 ${tableHeadCell}`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => {
                        const cost = getItemCost(item)
                        const m = getMargin(item)
                        const allergenSummary = summariseAllergens(getItemAllergens(item))
                        const componentCount = getItemComponents(item.id).length

                        return (
                          <tr
                            key={item.id}
                            className={`border-b border-border ${
                              !item.is_active ? 'bg-red-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                            }`}
                          >
                            <td className={`px-4 py-3 font-medium ${item.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                              {item.name}
                            </td>
                            <td className={`px-4 py-3 ${item.is_active ? 'text-gray-500' : 'text-gray-400'}`}>
                              {componentCount}
                            </td>
                            <td className={`px-4 py-3 ${item.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                              {cost !== null ? `€${cost.toFixed(2)}` : <span className="text-amber-600 text-xs">Incomplete</span>}
                            </td>
                            <td className={`px-4 py-3 ${item.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                              €{parseFloat(item.selling_price).toFixed(2)}
                              <span className="text-xs text-gray-400 ml-1">(VAT {parseFloat(item.vat_rate)}%)</span>
                            </td>
                            <td className={`px-4 py-3 ${item.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                              €{getNet(item).toFixed(2)}
                            </td>
                            <td className="px-4 py-3">
                              {m ? (
                                <>
                                  <span className={`font-medium ${marginColour(m.marginPct)}`}>
                                    €{m.margin.toFixed(2)}
                                  </span>
                                  <span className={`text-xs ml-1 ${marginColour(m.marginPct)}`}>
                                    ({m.marginPct !== null ? `${m.marginPct.toFixed(1)}%` : '—'})
                                  </span>
                                </>
                              ) : (
                                <span className="text-amber-600 text-xs">—</span>
                              )}
                            </td>
                            <td className={`px-4 py-3 text-xs ${item.is_active ? 'text-gray-600' : 'text-gray-400'}`}>
                              {allergenSummary.contains === 0 && allergenSummary.mayContain === 0 ? (
                                'None'
                              ) : (
                                <>
                                  {allergenSummary.contains > 0 && (
                                    <span className="text-red-600 mr-2">{allergenSummary.contains} contains</span>
                                  )}
                                  {allergenSummary.mayContain > 0 && (
                                    <span className="text-amber-700">{allergenSummary.mayContain} may</span>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">{rowActions(item)}</div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {showCategoryModal && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setShowCategoryModal(false)}
          onChange={fetchAll}
        />
      )}
    </div>
  )
}