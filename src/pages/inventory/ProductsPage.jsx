import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { useConfirm } from '../../context/ConfirmContext'
import { calculateMixCost } from '../../lib/mixCost'
import { EMPTY_PRICE, hasPrice, priceProblem, pricePayload } from '../../lib/productPrice'
import { emptyAllergens } from '../../lib/allergens'
import { sameName, sameSupplierCode, nameClashMessage } from '../../lib/products'
import ProductForm from '../../components/ProductForm'
import Modal from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { tableHeadRow, tableHeadCell, tableCard, badge, card, rowButton } from '../../lib/controlStyles'

// Every column in the table, in the order it appears.
//
// Only some of them can be sorted. Section, Unit and Type are short repeated
// values, so sorting by them tells you nothing you cannot already see, and Type
// did nothing at all because MIX products are always first anyway. To pick out
// one section you use the buttons above the table instead.
//
// The widths are there because sorting let the Name column take as much room as
// it wanted, which squeezed the others until a badge like "Cold Room" broke onto
// two lines.
// The other places a product is kept, beside the section it belongs to.
//
// Outlined rather than filled, so the section it actually is stays the solid
// badge and the rest read as "you will also find it here". Two solid blue
// badges side by side would leave nobody able to say which was which.
function extraPlaceBadge(isActive) {
  return isActive
    ? 'bg-white text-blue-700 border border-blue-300'
    : 'bg-white text-gray-400 border border-gray-200'
}

// One of the filter chips above the table. Written once because there are two
// rows of them now and they have to look identical, or the second row reads as
// a different kind of control rather than as another question.
function chipButton(isOn) {
  return 'px-3 py-1.5 rounded-full text-xs font-medium transition-colors '
    + (isOn
      ? 'bg-accent text-white'
      : 'bg-white border border-border text-gray-600 hover:bg-gray-50')
}

// What kind of thing a product is, as one badge. Written once because the table
// and the cards both say it, and a label that reads Drink in one place and
// Purchased in the other is worse than not saying it at all.
function typeBadge(p) {
  if (!p.is_active) return { label: p.is_mix ? 'MIX' : 'Purchased', cls: 'bg-gray-100 text-gray-400' }
  if (p.is_mix) return { label: 'MIX', cls: 'bg-amber-500 text-white' }
  if (p.category === 'drink') return { label: 'Drink', cls: 'bg-sky-100 text-sky-800' }
  return { label: 'Purchased', cls: 'bg-green-100 text-green-800' }
}

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'section', label: 'Section', width: 'w-48' },
  { key: 'unit', label: 'Unit', width: 'w-20' },
  { key: 'type', label: 'Type', width: 'w-32' },
  { key: 'supplier', label: 'Preferred Supplier', sortable: true },
  { key: 'cost', label: 'Cost/Unit', width: 'w-28', sortable: true },
  { key: 'weightLoss', label: 'Weight Loss', width: 'w-28', sortable: true },
]

export default function ProductsPage() {
  const confirm = useConfirm()
  const { activeRestaurant } = useRestaurant()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  // The supplier price typed alongside a new product. Only ever used when
  // adding one: editing a product leaves prices where they live, because by
  // then there can be several and one form cannot speak for all of them.
  // What kind of thing to show: everything, only what goes into food, or only
  // the drinks. Separate from the section buttons because it is a different
  // question: one is where a thing is kept, the other is what it is.
  const [activeKind, setActiveKind] = useState('All')
  const [priceForm, setPriceForm] = useState(EMPTY_PRICE)
  const [priceErrors, setPriceErrors] = useState({})
  const [allergens, setAllergens] = useState(emptyAllergens())
  // Whether anybody opened the allergens and answered, as opposed to leaving
  // them at the default. All fourteen at Not Present is a real answer for a bag
  // of rice, so it cannot be told apart from never looking by the values alone.
  const [allergensTouched, setAllergensTouched] = useState(false)
  // One section open at a time, and both shut to start with.
  const [openExtra, setOpenExtra] = useState(null)
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
    also_in: [],
    category: 'ingredient',
    unit: 'KG',
    is_mix: false,
    weight_loss_pct: 0,
    notes: '',
    is_active: true,
  })

  // The filter buttons above the table. There is no separate order list any
  // more: the sort runs across the whole list, so nothing needs to know which
  // section comes before which.
  const sections = ['All', 'Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']
  const kinds = ['All', 'Ingredients', 'Drinks']

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

  function handlePriceChange(field, value) {
    setPriceForm({ ...priceForm, [field]: value })
  }

  function handleAllergenChange(key, value) {
    setAllergens({ ...allergens, [key]: value })
    setAllergensTouched(true)
  }

  // Nothing to declare, said in one tap from the bar. The values are already
  // all Not Present, so this only records that somebody looked and that is the
  // answer, which is what the save asks about.
  function handleNoAllergens() {
    setAllergens(emptyAllergens())
    setAllergensTouched(true)
    // Only its own section, and only if that was the one open. It used to shut
    // whatever was open, so answering the allergens from the bar closed the
    // supplier section you were halfway through filling in.
    setOpenExtra(current => (current === 'allergens' ? null : current))
  }

  function validate() {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    } else if (sameName(products, formData.name, editingProduct?.id)) {
      // Refused rather than warned about. Two rows with the same name on a
      // stock take is somebody guessing which one to count, and a guess is
      // worse than not having the product at all. A deactivated one still
      // holds its name, and the message says to turn that one back on.
      newErrors.name = nameClashMessage(sameName(products, formData.name, editingProduct?.id))
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
    // The price block is only checked if somebody started filling it in. Left
    // alone it is not an error, it is the normal case.
    const wantsPrice = !editingProduct && !formData.is_mix && hasPrice(priceForm)
    const newPriceErrors = wantsPrice ? priceProblem(priceForm) : {}

    // The same code from the same supplier, against what this screen already
    // holds. Only that supplier: two of them using one code for two different
    // things is a coincidence rather than a mistake.
    if (wantsPrice && !newPriceErrors.supplier_code) {
      const clash = sameSupplierCode(prices, priceForm.supplier_id, priceForm.supplier_code)
      if (clash) {
        const owner = products.find(p => p.id === clash.product_id)
        newPriceErrors.supplier_code =
          `${owner?.name || 'Another product'} already has this code with this supplier.`
      }
    }

    if (Object.keys(newErrors).length > 0 || Object.keys(newPriceErrors).length > 0) {
      setErrors(newErrors)
      setPriceErrors(newPriceErrors)
      // A message inside a section that is shut is a message nobody reads.
      if (Object.keys(newPriceErrors).length > 0) setOpenExtra('supplier')
      return
    }
    setErrors({})
    setPriceErrors({})

    // The codes this screen holds are only the preferred ones, so the real
    // check is a question to the database. One query, and only when a code was
    // actually typed.
    if (wantsPrice && priceForm.supplier_code?.trim()) {
      const { data: codeRows } = await supabase
        .from('product_supplier_prices')
        .select('product_id')
        .eq('supplier_id', priceForm.supplier_id)
        .eq('supplier_code', priceForm.supplier_code.trim())
        .limit(1)

      if (codeRows?.length > 0) {
        const owner = products.find(p => p.id === codeRows[0].product_id)
        setPriceErrors({
          supplier_code: `${owner?.name || 'Another product'} already has this code with this supplier.`,
        })
        setOpenExtra('supplier')
        return
      }
    }

    // Asked once, and only when adding. A product with no supplier and no
    // allergens is a product somebody has to come back to twice, and the two
    // screens it sends you to are the two you have just walked past. It is a
    // question rather than a refusal: a product typed in a hurry mid stock take
    // is a real thing and stopping it would be worse.
    if (!editingProduct && !formData.is_mix) {
      const missing = []
      if (!wantsPrice) missing.push('a supplier price')
      if (!allergensTouched) missing.push('allergens')

      if (missing.length > 0) {
        const ok = await confirm({
          title: 'Save without ' + missing.join(' or ') + '?',
          message: missing.length === 2
            ? 'Nothing is set for either. You can add both later from the product\'s own screens, but the allergens are what customers are shown, so a product with none declared reads as having none.'
            : missing[0] === 'a supplier price'
              ? 'It will have no cost until a price is set, so it counts as nothing on a stock take and adds nothing to a dish.'
              : 'Allergens are what customers are shown, so a product with none declared reads as having none of the fourteen.',
          confirmLabel: 'Save anyway',
          cancelLabel: 'Go back',
        })
        if (!ok) {
          // Open whichever one is missing, so Go back lands somewhere useful
          // rather than on the form they were already looking at.
          setOpenExtra(!wantsPrice ? 'supplier' : 'allergens')
          return
        }
      }
    }

    const payload = {
      ...formData,
      weight_loss_pct: parseFloat(formData.weight_loss_pct),
      // Somewhere it is already kept is not somewhere it is also kept. The
      // section can be changed after the boxes are ticked, so this is cleared
      // on the way out rather than trusted on the way in.
      also_in: (formData.also_in || []).filter(place => place !== formData.section),
    }

    if (editingProduct) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingProduct.id)

      if (error) setError(friendlyError(error))
      else { fetchProducts(); resetForm() }
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select()
        .single()

      if (error) { setError(friendlyError(error)); return }

      // The supplier and the cost on this screen are read out of prices,
      // which is its own fetch. Refetching the products alone left a product
      // that had just been given a price showing as having none until the page
      // was reloaded, which read as the price not having saved.
      const refresh = () => {
        fetchProducts()
        if (wantsPrice) fetchPrices()
      }

      // The first price on a product is the preferred one, since it is the
      // only one. The same rule the prices screen uses.
      if (wantsPrice && data) {
        const { error: priceErr } = await supabase
          .from('product_supplier_prices')
          .insert({
            ...pricePayload(priceForm),
            product_id: data.id,
            restaurant_id: activeRestaurant.id,
            is_preferred: true,
          })

        // The product is saved either way. Saying so and leaving the form open
        // would be worse than saying the price did not take: the product would
        // be entered twice.
        if (priceErr) {
          setError(`${data.name} was saved, but the price was not: ${friendlyError(priceErr)}`)
          fetchProducts()
          return
        }
      }

      // The allergens, if anybody answered them. One row per product, and this
      // is always the first one, so an insert rather than the upsert the
      // allergen page has to do.
      if (allergensTouched && data) {
        const { error: allergenErr } = await supabase
          .from('product_allergens')
          .insert({ product_id: data.id, ...allergens })

        if (allergenErr) {
          setError(`${data.name} was saved, but the allergens were not: ${friendlyError(allergenErr)}`)
          refresh()
          return
        }
      }

      refresh()
      resetForm()
    }
  }

  function resetForm() {
    setFormData({
      name: '', section: 'Freezer', also_in: [], category: 'ingredient', unit: 'KG',
      is_mix: false, weight_loss_pct: 0, notes: '', is_active: true,
    })
    setPriceForm(EMPTY_PRICE)
    setAllergens(emptyAllergens())
    setAllergensTouched(false)
    setOpenExtra(null)
    setEditingProduct(null)
    setShowForm(false)
    setErrors({})
    setPriceErrors({})
  }

  function startEdit(product) {
    setFormData({
      name: product.name,
      section: product.section,
      also_in: product.also_in || [],
      category: product.category || 'ingredient',
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
    // Deactivating is the one action on the row that changes what everybody
    // else sees, and it was one tap away with nothing in between. Turning it
    // back on is not, so that goes straight through.
    if (product.is_active) {
      const ok = await confirm({
        title: `Deactivate ${product.name}?`,
        message: 'It stays on every recipe and every count that already used it, and it cannot be picked for anything new.',
        confirmLabel: 'Deactivate it',
        tone: 'danger',
        dangerNote: 'You can turn it back on at any time.',
      })
      if (!ok) return
    }

    const { error } = await supabase
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id)

    if (error) setError(friendlyError(error))
    else fetchProducts()
  }

  // The row buttons, written once and used by both layouts.
  //
  // This is a plain function rather than a component on purpose. A component
  // declared inside another component is a new type on every render, so React
  // throws the old one away and builds it again, and that is a lot of churn for
  // five buttons.
  function rowActions(p) {
    return (
      <>
        <button
          onClick={() => editingProduct?.id === p.id ? resetForm() : startEdit(p)}
          className={rowButton('edit')}
        >
          {editingProduct?.id === p.id ? 'Cancel' : 'Edit'}
        </button>
        <button
          onClick={() => navigate(`/catalogue/products/${p.id}/allergens`)}
          className={rowButton()}
        >
          Allergens
        </button>
        {p.is_mix && (
          <button
            onClick={() => navigate(`/catalogue/products/${p.id}/recipe`)}
            className={rowButton()}
          >
            Recipe
          </button>
        )}
        <button
          onClick={() => navigate(`/catalogue/products/${p.id}/prices`)}
          className={rowButton()}
        >
          Prices
        </button>
        <button
          onClick={() => toggleActive(p)}
          className={rowButton(p.is_active ? 'danger' : 'good')}
        >
          {p.is_active ? 'Deactivate' : 'Reactivate'}
        </button>
      </>
    )
  }

  // Everything a product shows that is not simply a column off the record,
  // worked out once so the table and the phone cards cannot end up saying
  // different things about the same product.
  function rowValues(p) {
    const price = getPreferredPrice(p.id)
    const mixResult = p.is_mix ? calculateMixCost(p, products, recipeLines, prices) : null
    return {
      supplier: p.is_mix ? 'House-made' : getSupplierName(price?.supplier_id),
      // Null means we could not work it out: a MIX with an ingredient that has
      // no price, or a bought product with no preferred price set.
      cost: p.is_mix
        ? (mixResult?.cost != null ? `€${mixResult.cost.toFixed(4)}` : null)
        : (price ? `€${parseFloat(price.price_per_unit).toFixed(4)}` : null),
      weightLoss: p.weight_loss_pct > 0 ? `${p.weight_loss_pct}%` : '—',
    }
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

  // Said while it is being typed and again when saving. The products are all
  // loaded, so the name costs nothing to check on every keystroke.
  const nameClash = showForm
    ? sameName(products, formData.name, editingProduct?.id)
    : null

  const filteredProducts = products
    .filter(p => showInactive || p.is_active)
    // Somewhere it is also kept counts. Picking Freezer is asking what is in
    // the freezer, and the two boxes of tacos defrosting in the cold room are
    // still freezer stock as far as anybody walking up to it is concerned.
    .filter(p => activeSection === 'All'
      || p.section === activeSection
      || (p.also_in || []).includes(activeSection))
    .filter(p => activeKind === 'All'
      || (activeKind === 'Drinks' ? p.category === 'drink' : p.category !== 'drink'))
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      // Sorting runs across the whole list, not inside each section. Sorting by
      // cost should give the dearest product there is, not the dearest in every
      // section. If you only want one section you use the buttons above the
      // table, which is what they are for.

      // MIX products still come first. They are the ones that behave
      // differently, since their cost comes from a recipe rather than a
      // supplier, and the yellow row goes with that.
      if (a.is_mix !== b.is_mix) return a.is_mix ? -1 : 1

      // Drinks sink to the bottom, so they sit together rather than scattered
      // through the food a name at a time. They are counted and ordered as
      // their own job and nobody looking for chicken wants a row of cans in
      // the middle of it.
      const aDrink = a.category === 'drink'
      const bDrink = b.category === 'drink'
      if (aDrink !== bDrink) return aDrink ? 1 : -1

      const result = compareValues(sortValue(a, sortBy), sortValue(b, sortBy))
      const directed = sortDir === 'desc' ? -result : result

      // Same value in the sorted column, so fall back to name to keep the order
      // stable instead of letting it shuffle on every render.
      return directed !== 0 ? directed : a.name.localeCompare(b.name)
    })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
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
        <div className={`${card} p-6 mb-6`}>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Product</h3>
          <ProductForm
            formData={formData}
            onChange={handleFieldChange}
            onSubmit={handleSave}
            onCancel={resetForm}
            submitLabel="Add Product"
            errors={errors}
            extras
            priceForm={priceForm}
            onPriceChange={handlePriceChange}
            priceErrors={priceErrors}
            nameClash={nameClash}
            suppliers={suppliers}
            allergens={allergens}
            onAllergenChange={handleAllergenChange}
            allergensAnswered={allergensTouched}
            onNoAllergens={handleNoAllergens}
            openExtra={openExtra}
            onOpenExtra={setOpenExtra}
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

      {/* Two rows because they are two questions. Where a thing is kept, and
          what kind of thing it is. Mixing them into one row of chips would
          leave somebody wondering why picking Drinks turned off Freezer. */}
      <div className="flex gap-2 mb-2 flex-wrap">
        {sections.map(section => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={chipButton(activeSection === section)}
          >
            {section}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {kinds.map(kind => (
          <button
            key={kind}
            onClick={() => setActiveKind(kind)}
            className={chipButton(activeKind === kind)}
          >
            {kind}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading products...</div>
      ) : (
        <>
        {/* Phone: one card per product instead of a table to swipe.

            This screen gets used standing in a cold room with one hand, so
            eight columns and a sideways swipe is the wrong shape for it. The
            card says the same things in the same order, just stacked. The
            desktop table is untouched and takes over from the medium
            breakpoint up.

            Both layouts get their values from rowValues and their buttons from
            rowActions, so there is only one place to change if any of it
            changes. */}
        <div className="md:hidden space-y-3">
          {filteredProducts.map(p => {
            const v = rowValues(p)
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-4 ${!p.is_active
                  ? 'bg-red-100 border-red-200'
                  : p.is_mix
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-border'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`font-semibold ${p.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                    {p.name}
                  </p>
                  <span className={`${badge} flex-shrink-0 ${typeBadge(p).cls}`}>
                    {typeBadge(p).label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`${badge} ${p.is_active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'}`}>
                    {p.section}
                  </span>
                  {(p.also_in || []).map(place => (
                    <span key={place} className={`${badge} ${extraPlaceBadge(p.is_active)}`}>
                      {place}
                    </span>
                  ))}
                  <span className="text-xs text-gray-500">{p.unit}</span>
                  {/* The table says this with a red row, which a single card
                      cannot do on its own, so it says it in words instead. */}
                  {!p.is_active && (
                    <span className={`${badge} bg-red-200 text-red-800`}>Inactive</span>
                  )}
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Cost/unit</dt>
                    <dd className={`font-medium text-right ${p.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                      {v.cost ?? (
                        <span className="text-amber-600 text-xs">
                          {p.is_mix ? 'Incomplete' : 'No price set'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Supplier</dt>
                    <dd className={`text-right ${p.is_active ? 'text-gray-700' : 'text-gray-400'} ${p.is_mix ? 'italic' : ''}`}>
                      {v.supplier}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Weight loss</dt>
                    <dd className={`text-right ${p.is_active ? 'text-gray-700' : 'text-gray-400'}`}>
                      {v.weightLoss}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/10">
                  {rowActions(p)}
                </div>

                {editingProduct?.id === p.id && (
                  <div className="mt-3 pt-3 border-t border-black/10">
                    <ProductForm
                      formData={formData}
                      onChange={handleFieldChange}
                      onSubmit={handleSave}
                      onCancel={resetForm}
                      submitLabel="Save Changes"
                      errors={errors}
                      nameClash={nameClash}
                    />
                  </div>
                )}
              </div>
            )
          })}
          {filteredProducts.length === 0 && (
            <div className={`${card} px-4 py-8 text-center text-sm text-gray-500`}>
              No products found.
            </div>
          )}
        </div>

        <div className={`${tableCard} hidden md:block`}>
          <table className="w-full text-sm">
            {/* The heading row used to be bg-gray-50, exactly the same as every
                other striped row, so it did not read as a heading at all. It is
                the dark sidebar green now, which there is no mistaking. */}
            <thead>
              <tr className={tableHeadRow}>
                {COLUMNS.map(col => (
                  <th key={col.key} className={`text-left px-4 py-3 whitespace-nowrap ${col.width || ''}`}>
                    {col.sortable ? (
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
                    ) : (
                      <span className={`whitespace-nowrap ${tableHeadCell}`}>{col.label}</span>
                    )}
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
                        <span className="flex flex-wrap gap-1">
                          <span className={`${badge} ${
                            p.is_active ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {p.section}
                          </span>
                          {(p.also_in || []).map(place => (
                            <span key={place} className={`${badge} ${extraPlaceBadge(p.is_active)}`}>
                              {place}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${p.is_active ? 'text-gray-500' : 'text-gray-400'}`}>{p.unit}</td>
                      <td className="px-4 py-3">
                        <span className={`${badge} ${typeBadge(p).cls}`}>
                          {typeBadge(p).label}
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
                        <div className="flex flex-wrap gap-2">{rowActions(p)}</div>
                      </td>
                    </tr>
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
      {/* Editing opens in a dialog rather than pushing a form into the middle
          of the table. In the table the row being edited was hard to pick out
          from the rows around it, and everything below it jumped down the page. */}
      {editingProduct && (
        <Modal title={`Edit ${editingProduct.name}`} onClose={resetForm} width="max-w-2xl">
          <div className="px-6 py-4">
            <ProductForm
              formData={formData}
              onChange={handleFieldChange}
              onSubmit={handleSave}
              onCancel={resetForm}
              submitLabel="Save changes"
              errors={errors}
              nameClash={nameClash}
            />
          </div>
        </Modal>
      )}

        </>
      )}
    </div>
  )
}
