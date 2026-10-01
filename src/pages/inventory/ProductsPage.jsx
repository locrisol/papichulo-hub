import { fmtUnitCost } from '@/lib/format'
import { useState, useEffect, useRef, Fragment, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { useRestaurant } from '@/context/restaurant'
import { useConfirm } from '@/context/confirm'
import { calculateMixCost } from '@/lib/mixCost'
import { EMPTY_PRICE, hasPrice, priceProblem, pricePayload } from '@/lib/productPrice'
import { typedPriceEvent } from '@/lib/priceEvents'
import { emptyAllergens, noAllergensDeclared } from '@/lib/allergens'
import { everyReadArrived } from '@/lib/allergenSheet'
import { allergensChanged } from '@/lib/allergensChanged'
import {
  sameName, sameSupplierCode, nameClashMessage, canBeIngredient, declaresAllergens,
  heldFor, partiesIn, prefillFrom,
} from '@/lib/products'
import SearchBox from '@/components/ui/SearchBox'
import { useSaveOnce } from '@/components/ui/useSaveOnce'
import RowActions from '@/components/ui/RowActions'
import { useKeepScroll } from '@/context/scroll'
import { sectionColour, productInk, DRINK_COLOUR } from '@/lib/sections'
import ProductForm from '@/components/inventory/ProductForm'
import Modal from '@/components/ui/Modal'
import { friendlyError } from '@/lib/errors'
import { matches } from '@/lib/search'
import { orderFormats } from '@/lib/countUnits'
import {
  tableHeadRow, tableHeadCell, badge, card, cardEdge, rowButton, pageTitle, primaryButton, secondaryButton, urgentNote,
  warningNote,
} from '@/lib/controlStyles'
import ErrorBanner from '@/components/ui/ErrorBanner'
import ShowInactiveButton from '@/components/ui/ShowInactiveButton'

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
// The section a product belongs to, and the other places it is kept, each in
// its own colour rather than all of them in one blue. A deactivated product
// goes grey whatever section it is in, because that is the thing worth reading
// about it first.
function sectionBadge(section, isActive) {
  if (!isActive) return { className: 'bg-gray-100 text-muted border border-gray-200' }
  const colour = sectionColour(section)
  return { className: `${colour.bg} ${colour.text} border ${colour.border}` }
}

function extraPlaceBadge(section, isActive) {
  if (!isActive) return { className: 'bg-white text-muted border border-gray-200' }
  return {
    className: 'bg-white border',
    style: { color: sectionColour(section).ink, borderColor: sectionColour(section).ink },
  }
}

// What goes into a MIX, held on the form until the product exists to hang it
// on. lines are what has been added, draft is the row being typed.
// The packs a price can be counted in, held on the form until the price it
// belongs to exists.
const EMPTY_FORMATS = { packs: [], allowLoose: true, draft: { label: '', factor: '' } }

const EMPTY_RECIPE = {
  batchYield: '',
  lines: [],
  draft: { ingredient_product_id: '', quantity: '' },
}

// One of the filter chips above the table.
//
// Each one wears the colour of what it filters to, the same colour that section
// has on the stock take, in the dropdowns and down the side of its rows below.
// Picking Freezer and then looking for blue rows is one thought instead of two.
//
// All has no colour of its own, so it keeps the app's accent. Written once
// because there are two rows of them and they have to be the same control asked
// twice, not two kinds of control.
function FilterChip({ label, isOn, ink, onClick }) {
  const base = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors '

  if (!ink) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={base + (isOn
          ? 'bg-accent border-accent text-white'
          : 'bg-white border-border text-gray-600 hover:bg-gray-50')}
      >
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={base + (isOn ? 'text-white' : 'bg-white hover:bg-gray-50')}
      style={isOn
        ? { backgroundColor: ink, borderColor: ink }
        : { color: ink, borderColor: ink }}
    >
      {label}
    </button>
  )
}

// Where the heading comes to rest when it sticks.
//
// Zero would be the obvious answer and it leaves a gap. A sticky element sits
// against the padding edge of whatever is scrolling, and the main area of the
// app has md:p-7 on it, so the heading stopped 1.75rem down with rows sliding
// through the strip above it. Pulling it up by exactly that padding puts it
// flush under the page header.
//
// It is tied to AppLayout's md:p-7. If that padding changes, this changes with
// it, which is why it is one named thing rather than a number typed twice.
const STICK_TOP = 'top-[-1.75rem]'

// What kind of thing a product is, as one badge. Written once because the table
// and the cards both say it, and a label that reads Drink in one place and
// Purchased in the other is worse than not saying it at all.
function typeBadge(p) {
  if (!p.is_active) return { label: p.is_mix ? 'MIX' : 'Purchased', cls: 'bg-gray-100 text-muted' }
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
  const { user } = useAuth()
  const { activeRestaurant } = useRestaurant()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  // The packs each preferred price can be counted in. Only for showing on the
  // row: the stock take reads its own.
  const [countUnits, setCountUnits] = useState([])
  const [suppliers, setSuppliers] = useState([])
  // The supplier price typed alongside a new product. Only ever used when
  // adding one: editing a product leaves prices where they live, because by
  // then there can be several and one form cannot speak for all of them.
  // What kind of thing to show: everything, only what goes into food, or only
  // the drinks. Separate from the section buttons because it is a different
  // question: one is where a thing is kept, the other is what it is.
  const [activeKind, setActiveKind] = useState('All')

  function toggleSection(section) {
    setActiveSections(current => (current.includes(section)
      ? current.filter(s => s !== section)
      : [...current, section]))
  }
  // Arriving from the invoice review with a line nobody has ever bought.
  //
  // The review hands off rather than growing a creation flow of its own: this
  // one asks for the allergens, the packs and the recipe, all of which a new
  // product needs and none of which an invoice line knows anything about.
  //
  // **Read once, on the way in.** The link fills the form the first time the
  // screen is built and never again, so typing over it cannot be undone by a
  // render, and the same snapshot decides that the form should be open at all.
  const [params] = useSearchParams()
  const [fromLink] = useState(() => prefillFrom(params))

  const [priceForm, setPriceForm] = useState(() => ({ ...EMPTY_PRICE, ...(fromLink?.price || {}) }))
  const [priceErrors, setPriceErrors] = useState({})
  const [priceCounts, setPriceCounts] = useState({})
  const [formats, setFormats] = useState(EMPTY_FORMATS)
  const [recipe, setRecipe] = useState(EMPTY_RECIPE)
  const [allergens, setAllergens] = useState(emptyAllergens())
  // Whether anybody opened the allergens and answered, as opposed to leaving
  // them at the default. All fourteen at Not Present is a real answer for a bag
  // of rice, so it cannot be told apart from never looking by the values alone.
  const [allergensTouched, setAllergensTouched] = useState(false)
  // Whether opening a product to change it could not read its allergens. A
  // failed read looked like a product nobody had answered, with the one tap
  // that declares it has none, and saving wrote that over the real answer.
  // So the form offers nothing for them and the save leaves them alone.
  const [allergensUnread, setAllergensUnread] = useState(false)
  // Which product the form is for, so a read for one opened earlier that
  // lands late does not fill in the one open now.
  const editingId = useRef(null)
  // One section open at a time, and both shut to start with.
  // Open on the supplier when the link brought a price with it, since that
  // is the half already filled in and the half worth checking.
  const [openExtra, setOpenExtra] = useState(fromLink ? 'supplier' : null)

  // Whether the heading has left its resting place and is riding along.
  //
  // It is rounded at the top when it is sitting in the card, because that is
  // the card's corner. Once it is floating it has to be square, or the rows
  // passing underneath show through the two little cut outs at either end.
  const tableTop = useRef(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const mark = tableTop.current
    if (!mark) return

    // The page header is four rem tall and does not scroll, so the heading
    // comes to rest under it rather than at the top of the window. The margin
    // is that height, which is what makes the corners square at the moment the
    // heading actually stops rather than a moment later.
    const watcher = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { rootMargin: '-76px 0px 0px 0px' },
    )
    watcher.observe(mark)
    return () => watcher.disconnect()
  }, [])
  const [loading, setLoading] = useState(true)

  // Opening a product's prices or its recipe leaves this page and comes
  // back to it, and coming back landed at the top of a few hundred rows
  // every time. Below the state it reads, or it reads it before it exists.
  //
  // Only from a product's own screens. Coming back from the sales page an
  // hour later is a new visit, not the end of an errand, and landing two
  // hundred rows down a list you have not seen since is not helpful.
  useKeepScroll('products', !loading, to => to.startsWith('/catalogue/products/'))
  const [error, setError] = useState('')
  // Kept apart from the page's error above. That one is for something that
  // would not load; this is for a save that would not go through, and it
  // belongs beside the button that was pressed rather than at the top of a
  // page that is not on screen when you press it.
  const [formProblem, setFormProblem] = useState('')
  const [errors, setErrors] = useState({})
  // A second tap on Save while the first is on its way ran the whole save
  // again and made a second product. See useSaveOnce.
  const [saving, once] = useSaveOnce()
  // While it asks whether to save without a price or allergens. Nothing is
  // being saved yet, so the button behind the question keeps its own name
  // rather than saying Saving. A second tap is still turned away by once.
  const [asking, setAsking] = useState(false)
  const [search, setSearch] = useState('')
  // Which sections are showing. Empty means all of them, which is the same
  // thing and one fewer state to keep straight than a list that has to contain
  // every section to mean nothing is being filtered.
  const [activeSections, setActiveSections] = useState([])
  const [showForm, setShowForm] = useState(!!fromLink)
  const [editingProduct, setEditingProduct] = useState(null)
  const [showInactive, setShowInactive] = useState(() => {
    return localStorage.getItem('productsShowInactive') === 'true'
  })

  // What the count of products with no allergens set is worked out from,
  // beyond the products and recipes this page already holds: which products
  // have an allergen row, and what is in each dish. Null until all of it has
  // arrived, and for good if any of it failed. Read before then, every food
  // product would look unanswered.
  const [answers, setAnswers] = useState(null)
  // Whether the recipes came back. A MIX with a recipe is answered by what is
  // in it, so until they arrive every MIX would look like it has none.
  const [recipesRead, setRecipesRead] = useState(false)
  // Whether the last read of either failed. Nothing is marked then, which is
  // right, but the red line going quietly read as every product done, so the
  // page says it could not check. Its own flag rather than the page's error,
  // which a save clears and fills with its own message.
  const [answersFailed, setAnswersFailed] = useState(false)
  const [recipesFailed, setRecipesFailed] = useState(false)
  // Whether the product list has arrived. Until it has, an empty list is not a
  // list with nothing missing, so the choice to show only those is kept.
  const [productsRead, setProductsRead] = useState(false)

  // Showing only the products with no allergens set, so they can be worked
  // through. Kept for the session: each one is answered on its own Allergens
  // or Recipe page, and coming back from it is a fresh visit to this one that
  // should land on the same short list rather than all of them.
  const [onlyNoAllergens, setOnlyNoAllergens] = useState(() => {
    try { return sessionStorage.getItem('productsOnlyNoAllergens') === 'true' } catch { return false }
  })

  function showOnlyNoAllergens(on) {
    setOnlyNoAllergens(on)
    try { sessionStorage.setItem('productsOnlyNoAllergens', String(on)) } catch { /* only a convenience */ }
  }
  const [formData, setFormData] = useState(() => ({
    name: '',
    section: 'Freezer',
    also_in: [],
    held_for: '',
    category: 'ingredient',
    unit: 'KG',
    is_mix: false,
    weight_loss_pct: 0,
    piece_weight: '',
    notes: '',
    is_active: true,
    ...(fromLink?.form || {}),
  }))

  // The filter buttons above the table. There is no separate order list any
  // more: the sort runs across the whole list, so nothing needs to know which
  // section comes before which.
  const sections = ['Freezer', 'Cold Room', 'Dry', 'Packaging', 'Cleaning']
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
    fetchAnswers()
  }, [])

  // Whether each product has an allergen row, and what is in each dish on
  // sale. Only the columns the rule reads: what the allergens actually are is
  // the Allergens page's business. All three or nothing, see answers above.
  //
  // Every row, a page at a time, each in an order that cannot tie. Read
  // short, every answered product past the first thousand rows would be
  // marked as not set.
  async function fetchAnswers() {
    const reads = await Promise.all([
      everyRow(() => supabase.from('product_allergens').select('product_id').order('product_id')),
      everyRow(() => supabase.from('menu_items').select('id, is_active').order('id')),
      everyRow(() => supabase.from('menu_item_components')
        .select('id, menu_item_id, product_id').order('id')),
    ])
    if (!everyReadArrived(reads)) { setAnswers(null); setAnswersFailed(true); return }
    const [allergens, menuItems, components] = reads.map(r => r.data)
    setAnswersFailed(false)
    setAnswers({ allergens, menuItems, components })
  }

  

  // Ordered by name. Without an order the database returns the rows however it
  // likes, and updating a row moves it, so deactivating a product and turning it
  // back on sent it somewhere else in the list.
  async function fetchProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name')

    if (error) setError(friendlyError(error))
    else { setProducts(data); setProductsRead(true) }
    setLoading(false)
  }

  // All of them, active or not.
  //
  // The table has to be able to name the supplier on a product that was priced
  // years ago from somebody we no longer buy from, so this cannot be filtered
  // here. What must not show a retired supplier is the picker, and that is
  // narrowed where it is handed over rather than here.
  async function fetchSuppliers() {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .order('name')

    if (data) setSuppliers(data)
  }

  const fetchPrices = useCallback(async () => {
    if (!activeRestaurant) return
    const { data } = await supabase
      .from('product_supplier_prices')
      .select('*')
      .eq('restaurant_id', activeRestaurant.id)
      .eq('is_preferred', true)

    if (!data) return
    setPrices(data)

    // The packs hanging off those prices. Fetched here rather than in its own
    // effect because it is meaningless without them: a pack belongs to a price
    // and there is nothing to look up until we know which prices are preferred.
    const ids = data.map(p => p.id)
    if (ids.length === 0) { setCountUnits([]); return }
    const { data: units } = await supabase
      .from('price_count_units')
      .select('*')
      .in('price_id', ids)
      .order('sort_order')
    setCountUnits(units || [])

    // How many suppliers price each product, counting the ones that are not
    // preferred. The edit form holds one price and has to be able to say when
    // there are others, rather than quietly showing one of several as if it
    // were the whole story. Comparing two suppliers is the point of the table
    // carrying more than one row per product.
    const { data: everyPrice } = await supabase
      .from('product_supplier_prices')
      .select('product_id')
      .eq('restaurant_id', activeRestaurant.id)

    const counts = {}
    for (const row of everyPrice || []) {
      counts[row.product_id] = (counts[row.product_id] || 0) + 1
    }
    setPriceCounts(counts)
    }, [activeRestaurant])

  useEffect(() => {
    if (!activeRestaurant) return
    // The fetch sets a loading state before it starts, which is one render
    // this rule would rather avoid. The alternative is to leave it,
    // and then a change of restaurant keeps the previous one's figures
    // on screen under the new one's heading until the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPrices()
    fetchRecipeLines()
  }, [fetchPrices, activeRestaurant])

  // Every line, a page at a time. Read short, a MIX whose lines fell past the
  // first thousand would be marked as having no recipe here while the sidebar,
  // which reads every row, did not count it.
  async function fetchRecipeLines() {
    const { data } = await everyRow(() => supabase
      .from('mix_recipes')
      .select('*')
      .order('id'))

    if (data) {
      setRecipeLines(data)
      setRecipesRead(true)
    }
    setRecipesFailed(!data)
  }

  function getPreferredPrice(productId) {
    return prices.find(p => p.product_id === productId)
  }

  // A price typed on the form, written down for the chart on the product's
  // Prices screen, which draws what the Hub costs from out of these events.
  // The form wrote prices and recorded nothing, so that line stayed where an
  // invoice last left it. typedPriceEvent says when there is nothing to
  // record. The price is saved by then, so a failure here is said on the page
  // rather than stopping the save.
  async function recordPrice(productId, saved, before) {
    const event = typedPriceEvent({ id: productId }, saved, {
      before,
      restaurantId: activeRestaurant.id,
      userId: user?.id,
      at: new Date().toISOString(),
    })
    if (!event) return
    const { error: eventErr } = await supabase.from('product_price_events').insert(event)
    if (eventErr) setError(`The price was saved, but the price history was not updated: ${friendlyError(eventErr)}`)
  }

  function getSupplierName(supplierId) {
    if (!supplierId) return '—'
    return suppliers.find(s => s.id === supplierId)?.name || '—'
  }

  function handleFieldChange(field, value) {
    // Ticking drink puts the unit on Units, because a can is a can and almost
    // nothing behind the bar is weighed. It is a default and not a rule: the
    // unit is still a box you can change, and the few that are poured stay
    // Litre by changing it back. Unticking leaves whatever is there, since by
    // then it may have been set on purpose.
    if (field === 'category' && value === 'drink') {
      setFormData({ ...formData, category: value, unit: 'Units' })
      return
    }

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

    // Empty is a real answer: nobody has said. A number has to be more than
    // nothing, since a piece that weighs nothing would make a case of ten free.
    if (String(formData.piece_weight ?? '').trim() !== '' && !(parseFloat(formData.piece_weight) > 0)) {
      newErrors.piece_weight = 'Leave it empty, or say roughly what one piece weighs'
    }

    return newErrors
  }

  function handleSave(e) {
    e.preventDefault()
    return once(saveProduct)
  }

  // The pack sizes on a price, swapped for the ones on the form.
  //
  // Replaced rather than reconciled: there are a handful of them, they have no
  // history worth keeping, and working out which one somebody renamed is a lot
  // of care for a list of three. The new ones go in before the old ones come
  // out, and the old ones go by their own ids. It used to delete first and
  // check nothing, so a put in that failed lost every pack and the dialog
  // closed as if it had saved. Hands back the error, or nothing.
  async function replacePacks(priceId) {
    const { data: old, error: readErr } = await supabase
      .from('price_count_units').select('id').eq('price_id', priceId)
    if (readErr) return readErr

    if (formats.packs.length > 0) {
      const { error: insertErr } = await supabase.from('price_count_units').insert(
        formats.packs.map((pack, order) => ({
          price_id: priceId,
          label: pack.label,
          factor: pack.factor,
          sort_order: order,
        })),
      )
      if (insertErr) return insertErr
    }

    const oldIds = (old || []).map(u => u.id)
    if (oldIds.length > 0) {
      const { error: deleteErr } = await supabase.from('price_count_units').delete().in('id', oldIds)
      if (deleteErr) return deleteErr
    }
    return null
  }

  // What went in and what did not, when a save gets part of the way. The
  // product row is the first write and the rest hang off it, so by the time
  // any of them fails the product exists.
  //
  // missed is a list of { what, plural, error, next }: what did not save, and
  // the sentence saying where to add it. One reason is enough, since on a weak
  // signal it is the same one each time.
  function savedButNot(name, missed) {
    const what = missed.map(m => m.what)
    const list = what.length > 1 ? `${what.slice(0, -1).join(', ')} and ${what.at(-1)}` : what[0]
    const verb = missed.length > 1 || missed[0].plural ? 'were' : 'was'
    const reason = friendlyError(missed[0].error).replace(/\.?$/, '.')
    return `${name} was saved, but its ${list} ${verb} not: ${reason} ${missed.map(m => m.next).join(' ')}`
  }

  async function saveProduct() {
    setFormProblem('')
    setError('')

    const newErrors = validate()
    // The price block is only checked if somebody started filling it in. Left
    // alone it is not an error, it is the normal case.
    const wantsPrice = !formData.is_mix && hasPrice(priceForm)
    const newPriceErrors = wantsPrice ? priceProblem(priceForm) : {}

    // The same code from the same supplier, against what this screen already
    // holds. Only that supplier: two of them using one code for two different
    // things is a coincidence rather than a mistake.
    if (wantsPrice && !newPriceErrors.supplier_code) {
      const clash = sameSupplierCode(prices, priceForm.supplier_id, priceForm.supplier_code)
      // Its own code is not a clash with itself.
      if (clash && clash.product_id !== editingProduct?.id) {
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
        .limit(2)

      const someoneElse = (codeRows || []).filter(r => r.product_id !== editingProduct?.id)
      if (someoneElse.length > 0) {
        const owner = products.find(p => p.id === someoneElse[0].product_id)
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
      // Nothing to ask about a bottle of bleach or a paper container.
      if (!allergensTouched && declaresAllergens(formData)) missing.push('allergens')

      // Allergens nobody entered are not none. Until they are set, the
      // allergen sheet asks customers about any dish the product goes into
      // to see staff, so that is what the question says.
      if (missing.length > 0) {
        setAsking(true)
        const ok = await confirm({
          title: 'Save without ' + missing.join(' or ') + '?',
          message: missing.length === 2
            ? 'Nothing is set for either. You can add both later from the product\'s own screens. Until the allergens are set, the allergen sheet asks customers to speak to a member of staff about any dish it goes into.'
            : missing[0] === 'a supplier price'
              ? 'It will have no cost until a price is set, so it counts as nothing on a stock take and adds nothing to a dish.'
              : 'Until the allergens are set, the allergen sheet asks customers to speak to a member of staff about any dish it goes into.',
          confirmLabel: 'Save anyway',
          cancelLabel: 'Go back',
        })
        setAsking(false)
        if (!ok) {
          // Open whichever one is missing, so Go back lands somewhere useful
          // rather than on the form they were already looking at.
          setOpenExtra(!wantsPrice ? 'supplier' : 'allergens')
          return
        }
      }
    }

    // The same question for something made here, and it is about the recipe
    // instead. A MIX has no supplier, and its allergens come from what goes
    // into it, so with nothing in it there is no cost and no allergens either.
    // Its own branch rather than the one above: that one would ask about a
    // supplier price and open a section a MIX never shows.
    if (!editingProduct && formData.is_mix && recipe.lines.length === 0) {
      setAsking(true)
      const ok = await confirm({
        title: 'Save without a recipe?',
        message: 'Nothing goes into it yet, so it has no cost and its allergens are not known. '
          + 'Until a recipe is added, the allergen sheet asks customers to speak to a member of staff about any dish it goes into.',
        confirmLabel: 'Save anyway',
        cancelLabel: 'Go back',
      })
      setAsking(false)
      if (!ok) {
        setOpenExtra('recipe')
        return
      }
    }

    const payload = {
      ...formData,
      weight_loss_pct: parseFloat(formData.weight_loss_pct),
      piece_weight: parseFloat(formData.piece_weight) > 0 && !formData.is_mix
        ? parseFloat(formData.piece_weight)
        : null,
      // Somewhere it is already kept is not somewhere it is also kept. The
      // section can be changed after the boxes are ticked, so this is cleared
      // on the way out rather than trusted on the way in.
      also_in: (formData.also_in || []).filter(place => place !== formData.section),
      held_for: String(formData.held_for || '').trim() || null,
    }

    // batch_yield lives on the product rather than on the recipe, so it goes in
    // with everything else rather than waiting for the lines.
    if (!editingProduct && formData.is_mix && parseFloat(recipe.batchYield) > 0) {
      payload.batch_yield = parseFloat(recipe.batchYield)
    }

    if (editingProduct) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editingProduct.id)

      if (error) { setFormProblem(friendlyError(error)); return }

      // The price, the packs and the allergens, the same three things creating
      // a product asks for. Written here so changing any of them is done where
      // you are rather than on two other screens.
      const existing = getPreferredPrice(editingProduct.id)

      if (wantsPrice) {
        const row = {
          ...pricePayload(priceForm),
          allow_loose_count: formats.allowLoose,
        }

        const { data: saved, error: priceErr } = existing
          ? await supabase.from('product_supplier_prices')
              .update(row).eq('id', existing.id).select().single()
          : await supabase.from('product_supplier_prices')
              .insert({
                ...row,
                product_id: editingProduct.id,
                restaurant_id: activeRestaurant.id,
                is_preferred: true,
              }).select().single()

        // An edit stays open when part of it fails, and Save changes again
        // is safe: the product and the price are updated, not added. The
        // prices are read again first, so a price this save has just added
        // is the one updated next time rather than a second one.
        if (priceErr) {
          setFormProblem(savedButNot(formData.name,
            [{ what: 'price', error: priceErr, next: 'Press Save changes to try again.' }]))
          fetchProducts()
          // The product row itself was saved, so the count may have moved.
          allergensChanged()
          return
        }

        await recordPrice(editingProduct.id, saved, existing || null)

        if (saved) {
          const packsErr = await replacePacks(saved.id)
          if (packsErr) {
            setFormProblem(savedButNot(formData.name,
              [{ what: 'pack sizes', plural: true, error: packsErr, next: 'Press Save changes to try again.' }]))
            await fetchPrices()
            fetchProducts()
            // The product row itself was saved, so the count may have moved.
            allergensChanged()
            return
          }
        }
      }

      // Emptying the supplier boxes does not remove a price. Taking a supplier
      // off a product is what the Prices screen is for, and doing it silently
      // because somebody cleared a field would be a poor way to lose a cost.

      if (allergensTouched && !allergensUnread && declaresAllergens(formData)) {
        const { error: allergenErr } = await supabase
          .from('product_allergens')
          .upsert({ product_id: editingProduct.id, ...allergens, updated_at: new Date().toISOString() },
            { onConflict: 'product_id' })

        if (allergenErr) {
          setFormProblem(savedButNot(formData.name,
            [{ what: 'allergens', plural: true, error: allergenErr, next: 'Press Save changes to try again.' }]))
          await fetchPrices()
          fetchProducts()
          // The product row itself was saved, so the count may have moved.
          allergensChanged()
          return
        }
      }

      fetchProducts()
      fetchPrices()
      // The allergens may have been answered in this same dialog, and the
      // count in the sidebar goes with them.
      fetchAnswers()
      allergensChanged()
      resetForm()
    } else {
      const { data, error } = await supabase
        .from('products')
        .insert(payload)
        .select()
        .single()

      if (error) { setFormProblem(friendlyError(error)); return }

      // The supplier and the cost on this screen are read out of prices,
      // which is its own fetch. Refetching the products alone left a product
      // that had just been given a price showing as having none until the page
      // was reloaded, which read as the price not having saved.
      // Everything the catalogue reads, not only the products.
      //
      // The cost and the supplier on a row come out of prices, and whether a
      // MIX is complete comes out of its recipe lines, and both are their own
      // fetch. Refetching the products alone left a product that had just been
      // given a price showing as having none, and then a MIX that had just been
      // given a recipe showing as incomplete, until the page was reloaded.
      //
      // The same bug twice, so it stops picking and refetches the three. They
      // are small queries and this runs once, on a save that already did more
      // work than this.
      const refresh = () => {
        fetchProducts()
        fetchPrices()
        fetchRecipeLines()
        fetchAnswers()
        allergensChanged()
      }

      // Once the product is in, anything after it that fails closes the form
      // and says what is missing and where to add it. Left open, the form
      // still said Add Product, and pressing it again made a second product
      // with the same name. The rest of the product is on its own screens.
      //
      // A failure does not stop the writes after it unless they hang off it:
      // the packs need the price, but the recipe and the allergens need only
      // the product. Stopping at the price threw the ticked allergens away
      // with the form, and a product with no allergen row reads to a customer
      // as having none of the fourteen.
      const missed = []

      // The first price on a product is the preferred one, since it is the
      // only one. The same rule the prices screen uses.
      if (wantsPrice && data) {
        const { data: newPrice, error: priceErr } = await supabase
          .from('product_supplier_prices')
          .insert({
            ...pricePayload(priceForm),
            product_id: data.id,
            restaurant_id: activeRestaurant.id,
            is_preferred: true,
            allow_loose_count: formats.allowLoose,
          })
          .select()
          .single()

        const packsMissed = { what: 'pack sizes', plural: true, next: 'Add the pack sizes under Formats on its Prices page.' }

        if (priceErr) {
          missed.push({ what: 'price', error: priceErr, next: 'Add the price from its Prices page.' })
          // The packs typed in go with it, since they have nothing to hang off.
          if (formats.packs.length > 0) missed.push({ ...packsMissed, error: priceErr })
        } else {
          await recordPrice(data.id, newPrice, null)

          // The packs, which belong to the price rather than to the product and
          // so have to wait for it the same way the recipe waits for the product.
          if (newPrice) {
            const packsErr = await replacePacks(newPrice.id)
            if (packsErr) missed.push({ ...packsMissed, error: packsErr })
          }
        }
      }

      // What goes into it, if it is something we make and anything was typed.
      // A recipe line needs the product to exist, which is why it waits until
      // here rather than being written alongside.
      if (formData.is_mix && recipe.lines.length > 0 && data) {
        const { error: recipeErr } = await supabase
          .from('mix_recipes')
          .insert(recipe.lines.map(line => ({
            mix_product_id: data.id,
            ingredient_product_id: line.ingredient_product_id,
            quantity: parseFloat(line.quantity),
          })))

        if (recipeErr) {
          missed.push({ what: 'recipe', error: recipeErr, next: 'Add the ingredients from its Recipe page.' })
        }
      }

      // The allergens, if anybody answered them. One row per product, and this
      // is always the first one, so an insert rather than the upsert the
      // allergen page has to do.
      // Not written for anything that has none to declare, even if the boxes
      // were ticked before the section was changed to Cleaning.
      if (allergensTouched && declaresAllergens(formData) && data) {
        const { error: allergenErr } = await supabase
          .from('product_allergens')
          .insert({ product_id: data.id, ...allergens })

        if (allergenErr) {
          missed.push({ what: 'allergens', plural: true, error: allergenErr, next: 'Set the allergens from its Allergens page.' })
        }
      }

      if (missed.length > 0) setError(savedButNot(data.name, missed))
      refresh()
      resetForm()
    }
  }

  function resetForm() {
    setFormProblem('')
    setFormData({
      name: '', section: 'Freezer', also_in: [], held_for: '', category: 'ingredient',
      unit: 'KG', is_mix: false, weight_loss_pct: 0, piece_weight: '', notes: '', is_active: true,
    })
    setPriceForm(EMPTY_PRICE)
    setFormats(EMPTY_FORMATS)
    setRecipe(EMPTY_RECIPE)
    setAllergens(emptyAllergens())
    setAllergensTouched(false)
    setAllergensUnread(false)
    editingId.current = null
    setOpenExtra(null)
    setEditingProduct(null)
    setShowForm(false)
    setErrors({})
    setPriceErrors({})
  }

  // Opening a product to change it.
  //
  // The form offers the same things whether a product is being made or being
  // changed, so this has to fill in what creating one would have asked for: the
  // preferred price, the packs hanging off it, and the allergens. Without that
  // the sections would all read Not set on a product that has had a supplier
  // for a year, and saving would look like it had wiped them.
  //
  // The price and the packs are already on this screen. The allergens are their
  // own row and their own fetch, which is why this waits.
  async function startEdit(product) {
    setFormProblem('')
    setFormData({
      name: product.name,
      section: product.section,
      also_in: product.also_in || [],
      held_for: product.held_for || '',
      category: product.category || 'ingredient',
      unit: product.unit,
      is_mix: product.is_mix,
      weight_loss_pct: product.weight_loss_pct || 0,
      piece_weight: product.piece_weight == null ? '' : String(Number(product.piece_weight)),
      notes: product.notes || '',
      is_active: product.is_active,
    })

    const price = getPreferredPrice(product.id)
    setPriceForm(price
      ? {
          supplier_id: price.supplier_id || '',
          purchase_type: price.purchase_type || 'case',
          supplier_code: price.supplier_code || '',
          price_per_case: price.price_per_case ?? '',
          units_per_case: price.units_per_case ?? '',
          price_per_unit: price.price_per_unit ?? '',
        }
      : EMPTY_PRICE)

    setFormats(price
      ? {
          packs: countUnits
            .filter(u => u.price_id === price.id)
            .map(u => ({ label: u.label, factor: Number(u.factor) })),
          allowLoose: price.allow_loose_count !== false,
          draft: { label: '', factor: '' },
        }
      : EMPTY_FORMATS)

    setRecipe(EMPTY_RECIPE)
    setEditingProduct(product)
    setShowForm(true)
    setErrors({})
    setPriceErrors({})
    setOpenExtra(null)

    // Whatever is on the row now, so ticking nothing and saving does not read
    // as declaring the product free of all fourteen. Cleared while it is on
    // its way, so the product open before this one is not what gets saved.
    setAllergens(emptyAllergens())
    setAllergensTouched(false)
    setAllergensUnread(false)
    editingId.current = product.id
    const { data: row, error: rowError } = await supabase
      .from('product_allergens')
      .select('*')
      .eq('product_id', product.id)
      .maybeSingle()

    // Another product was opened, or the form shut, while this was on its way.
    if (editingId.current !== product.id) return
    if (rowError) {
      setAllergensUnread(true)
      return
    }

    if (row) {
      // Only the fourteen. The row also carries its own id and stamps, and
      // handing those to the picker would put them straight back into the save.
      const values = {}
      for (const key of Object.keys(emptyAllergens())) {
        if (key in row) values[key] = row[key]
      }
      setAllergens({ ...emptyAllergens(), ...values })
      setAllergensTouched(true)
    } else {
      setAllergens(emptyAllergens())
      setAllergensTouched(false)
    }
  }

  async function toggleActive(product) {
    // Deactivating is the one action on the row that changes what everybody
    // else sees, and it was one tap away with nothing in between. Turning it
    // back on is not, so that goes straight through.
    if (product.is_active) {
      const ok = await confirm({
        title: `Deactivate ${product.name}?`,
        // The cost part is said here because it is the surprise. Its old
        // price is not used for anything made with it, see lib/mixCost.
        message: 'It stays on every recipe and every count that already used it, and it cannot be picked for anything new. '
          + 'A recipe or dish still using it has no cost until it is replaced.',
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

    // Switching one off or on changes what the sidebar's count asks about.
    if (error) setError(friendlyError(error))
    else { fetchProducts(); allergensChanged() }
  }

  // What you can do to a product, written once as a list rather than as
  // markup, because the table and the phone cards lay the same things out
  // differently and a list cannot drift the way two copies of markup can.
  //
  // A plain function rather than a component on purpose. A component declared
  // inside another component is a new type on every render, so React throws the
  // old one away and builds it again.
  function rowActionList(p) {
    const editing = editingProduct?.id === p.id
    return {
      primary: {
        label: editing ? 'Cancel' : 'Edit',
        tone: 'edit',
        onClick: () => editing ? resetForm() : startEdit(p),
      },
      items: [
        { label: 'Allergens', onClick: () => navigate(`/catalogue/products/${p.id}/allergens`) },
        p.is_mix && { label: 'Recipe', onClick: () => navigate(`/catalogue/products/${p.id}/recipe`) },
        { label: 'Prices', onClick: () => navigate(`/catalogue/products/${p.id}/prices`) },
        {
          label: p.is_active ? 'Deactivate' : 'Reactivate',
          tone: p.is_active ? 'danger' : 'good',
          onClick: () => toggleActive(p),
        },
      ].filter(Boolean),
    }
  }

  // The phone card shows all of them side by side. It is a card, there is
  // nothing beside them to collide with, and hiding any of it behind a menu
  // would cost a tap and buy nothing.
  function rowActions(p) {
    const { primary, items } = rowActionList(p)
    return [primary, ...items].map(a => (
      <button key={a.label} onClick={a.onClick} className={rowButton(a.tone)}>
        {a.label}
      </button>
    ))
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
        ? (mixResult?.cost != null ? fmtUnitCost(mixResult.cost) : null)
        : (price ? fmtUnitCost(parseFloat(price.price_per_unit)) : null),
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

  // What a MIX can be built out of, which is the same rule the recipe screen
  // uses. Only active ones: a product nobody can buy is not an ingredient.
  const ingredientOptions = products.filter(p => p.is_active && canBeIngredient(p))

  // How a product is counted, off its preferred price.
  function packsFor(productId) {
    const price = getPreferredPrice(productId)
    if (!price) return []
    return orderFormats(countUnits.filter(u => u.price_id === price.id))
  }

  // The names already used, so the same arrangement is not typed two ways.
  const heldForNames = partiesIn(products).filter(Boolean)

  // Who you can still buy from. A deactivated supplier is one we have stopped
  // using, so offering it on a new product is offering a mistake.
  const activeSuppliers = suppliers.filter(sup => sup.is_active)

  // The products with no allergens set: the same ones the red count on
  // Products in the sidebar counts, by the same rule, which is the one the
  // customer sheet uses to send people to staff. Nothing until everything it
  // is worked out from has arrived.
  const allergensKnown = Boolean(answers && recipesRead && productsRead && !loading)
  const noAllergens = allergensKnown
    ? new Set(noAllergensDeclared({ products, recipeLines, ...answers }).map(p => p.id))
    : new Set()
  // Only while there are any. With none left the list would be empty, and the
  // line with the way back to everything would be gone with them.
  const onlyThose = onlyNoAllergens && noAllergens.size > 0

  // And forgotten once there are none. Kept, the choice waited in the browser
  // for the next product saved without allergens, and shrank the whole list to
  // that one product without anybody asking. Only once everything has
  // arrived, so a page still loading does not lose it.
  const noneLeft = allergensKnown && noAllergens.size === 0
  useEffect(() => {
    if (!noneLeft || !onlyNoAllergens) return
    // The rule would rather this were worked out while drawing, but the
    // choice is also kept in the browser, and forgetting it there is a side
    // effect. One extra render, once, when the last one is answered.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnlyNoAllergens(false)
    try { sessionStorage.setItem('productsOnlyNoAllergens', 'false') } catch { /* only a convenience */ }
  }, [noneLeft, onlyNoAllergens])

  // Where a product with no allergens set is answered. A MIX with no recipe
  // has nothing to work its allergens out from, and adding the recipe is what
  // answers it, so its Recipe page. Anything else, its Allergens page.
  function whereToAnswer(p) {
    const noRecipe = p.is_mix && !recipeLines.some(l => l.mix_product_id === p.id)
    return `/catalogue/products/${p.id}/${noRecipe ? 'recipe' : 'allergens'}`
  }

  // The mark on a product with no allergens set, written once for the table
  // and the cards. A link straight to where it is answered, because that is
  // the one thing to do about it. Named with the product for a screen reader,
  // where a column of links all saying the same thing is no help.
  //
  // Allergens not set, never No allergens: a red pill saying No allergens
  // reads as allergen free, which is the very mix-up that let these build up.
  //
  // Solid red-700 so it still stands out on a deactivated product's pale red
  // row. White on it is 6.4 to 1.
  function noAllergensMark(p) {
    if (!noAllergens.has(p.id)) return null
    return (
      <Link
        to={whereToAnswer(p)}
        aria-label={`Allergens not set for ${p.name}`}
        className={`${badge} bg-red-700 text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-accent`}
      >
        Allergens not set
      </Link>
    )
  }

  const filteredProducts = products
    // A switched off product still in a dish on sale is one of the ones to
    // answer, because the sheet still reads it. So showing only those shows
    // it, whether the inactive ones are showing or not.
    .filter(p => showInactive || p.is_active || (onlyThose && noAllergens.has(p.id)))
    // On top of every other filter rather than instead of them, so the dry
    // store's can be done on their own and turning this off leaves the rest
    // as they were.
    .filter(p => !onlyThose || noAllergens.has(p.id))
    // Somewhere it is also kept counts. Picking Freezer is asking what is in
    // the freezer, and the two boxes of tacos defrosting in the cold room are
    // still freezer stock as far as anybody walking up to it is concerned.
    //
    // More than one section is an or rather than an and. Nothing is kept in two
    // places at once in the sense an and would mean, so picking Freezer and
    // Cold Room together can only sensibly be asking to see both.
    .filter(p => activeSections.length === 0
      || activeSections.some(place => p.section === place || (p.also_in || []).includes(place)))
    .filter(p => activeKind === 'All'
      || (activeKind === 'Drinks' ? p.category === 'drink' : p.category !== 'drink'))
    .filter(p => matches(p.name, search))
    .slice()
    .sort((a, b) => {
      // Sorting runs across the whole list, not inside each section. Sorting by
      // cost should give the dearest product there is, not the dearest in every
      // section. If you only want one section you use the buttons above the
      // table, which is what they are for.

      // Stock held for somebody else goes to the very bottom, under
      // everything including the drinks. It is on our shelf and it is not our
      // stock, so it has no business sitting in the middle of a list of things
      // we buy and sell. Checked first, so it beats every other rule.
      const aTheirs = !!heldFor(a)
      const bTheirs = !!heldFor(b)
      if (aTheirs !== bTheirs) return aTheirs ? 1 : -1

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
          <h2 className={pageTitle}>Products</h2>
          <p className="text-sm text-gray-500 mt-1">
            Showing prices for {activeRestaurant?.name}
          </p>
        </div>
        <div className="flex gap-3">
          <ShowInactiveButton
            showing={showInactive}
            onToggle={() => {
              const next = !showInactive
              setShowInactive(next)
              localStorage.setItem('productsShowInactive', next)
            }}
          />
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className={primaryButton()}
          >
            + Add Product
          </button>
        </div>
      </div>

      {error && (
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
      )}

      {/* The whole form takes the lightest shade of whatever section is chosen,
          so the answer to "which one am I filling in" is the paper rather than
          a field somebody has to go back and read. */}
      {showForm && !editingProduct && (
        <div className={`${cardEdge} ${sectionColour(formData.section).bg} p-6 mb-6`}>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">New Product</h3>
          <ProductForm
            problem={formProblem}
            formData={formData}
            onChange={handleFieldChange}
            onSubmit={handleSave}
            onCancel={resetForm}
            submitLabel="Add Product"
            saving={saving && !asking}
            errors={errors}
            extras
            priceForm={priceForm}
            onPriceChange={handlePriceChange}
            priceErrors={priceErrors}
            nameClash={nameClash}
            heldForNames={heldForNames}
            suppliers={activeSuppliers}
            formats={formats}
            onFormatsChange={setFormats}
            allergens={allergens}
            onAllergenChange={handleAllergenChange}
            allergensAnswered={allergensTouched}
            allergensUnread={allergensUnread}
            onNoAllergens={handleNoAllergens}
            recipe={recipe}
            onRecipeChange={setRecipe}
            ingredientOptions={ingredientOptions}
            openExtra={openExtra}
            onOpenExtra={setOpenExtra}
          />
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search products"
        />
      </div>

      {/* Two rows because they are two questions. Where a thing is kept, and
          what kind of thing it is. Mixing them into one row of chips would
          leave somebody wondering why picking Drinks turned off Freezer. */}
      {/* All is not one of the sections, it is the way to clear them, which is
          why it lights up only when nothing else does. Everything else toggles,
          so Freezer and Cold Room together shows both. */}
      <div className="flex gap-2 mb-2 flex-wrap">
        <FilterChip
          label="All"
          isOn={activeSections.length === 0}
          onClick={() => setActiveSections([])}
        />
        {sections.map(section => (
          <FilterChip
            key={section}
            label={section}
            isOn={activeSections.includes(section)}
            ink={sectionColour(section).ink}
            onClick={() => toggleSection(section)}
          />
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {kinds.map(kind => (
          <FilterChip
            key={kind}
            label={kind}
            isOn={activeKind === kind}
            ink={kind === 'Drinks' ? DRINK_COLOUR.ink : null}
            onClick={() => setActiveKind(kind)}
          />
        ))}
      </div>

      {/* How many have no allergens set, while there are any, and a way to
          show only those. Its own line rather than a third row of chips: it
          is not a way of sorting the catalogue, it is a job to get done. */}
      {(answersFailed || recipesFailed) && (
        <p className={`${warningNote} mb-4`}>
          Could not check which products have allergens set. Check your connection and reload the page.
        </p>
      )}
      {noAllergens.size > 0 && (
        <div className={`${urgentNote} flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4`}>
          <p className="font-semibold">
            Allergens are not set for {noAllergens.size === 1 ? '1 product' : `${noAllergens.size} products`}.
          </p>
          <button type="button" onClick={() => showOnlyNoAllergens(!onlyThose)} className={secondaryButton}>
            {onlyThose ? 'Show all products' : 'Show only these'}
          </button>
        </div>
      )}

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
                // A line down the left in the colour of what it is. The card
                // keeps its own background, so a deactivated one still reads
                // as deactivated first and as a freezer product second.
                style={{ borderLeftWidth: '6px', borderLeftColor: productInk(p) }}
                className={`rounded-xl border p-4 ${!p.is_active
                  ? 'bg-red-100 border-red-200'
                  : p.is_mix
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-border'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`font-semibold ${p.is_active ? 'text-gray-900' : 'text-muted'}`}>
                    {p.name}
                  </p>
                  <span className={`${badge} flex-shrink-0 ${typeBadge(p).cls}`}>
                    {typeBadge(p).label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`${badge} ${sectionBadge(p.section, p.is_active).className}`}>
                    {p.section}
                  </span>
                  {(p.also_in || []).map(place => (
                    <span
                      key={place}
                      className={`${badge} ${extraPlaceBadge(place, p.is_active).className}`}
                      style={extraPlaceBadge(place, p.is_active).style}
                    >
                      {place}
                    </span>
                  ))}
                  {heldFor(p) && (
                    <span className={`${badge} bg-white text-gray-600 border border-gray-400`}>
                      {heldFor(p)}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {p.unit}
                    {/* The unit is right there in front of it, so the packs
                        do not repeat it. */}
                    {packsFor(p.id).length > 0 && (
                      <span className="text-muted">
                        {' '}· {packsFor(p.id)
                          .map(u => `${u.label} (${parseFloat(u.factor)})`)
                          .join(', ')}
                      </span>
                    )}
                  </span>
                  {/* The table says this with a red row, which a single card
                      cannot do on its own, so it says it in words instead. */}
                  {!p.is_active && (
                    <span className={`${badge} bg-red-200 text-red-800`}>Inactive</span>
                  )}
                  {noAllergensMark(p)}
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Cost/unit</dt>
                    <dd className={`font-medium text-right ${p.is_active ? 'text-gray-900' : 'text-muted'}`}>
                      {v.cost ?? (
                        <span className="text-amber-600 text-xs">
                          {p.is_mix ? 'Incomplete' : 'No price set'}
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Supplier</dt>
                    <dd className={`text-right ${p.is_active ? 'text-gray-700' : 'text-muted'} ${p.is_mix ? 'italic' : ''}`}>
                      {v.supplier}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-gray-500">Weight loss</dt>
                    <dd className={`text-right ${p.is_active ? 'text-gray-700' : 'text-muted'}`}>
                      {v.weightLoss}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/10">
                  {rowActions(p)}
                </div>

                {editingProduct?.id === p.id && (
                  <div className={`mt-3 pt-3 border-t border-black/10 ${sectionColour(formData.section).bg} -mx-4 -mb-4 px-4 pb-4 rounded-b-xl`}>
                    <ProductForm
                      problem={formProblem}
                      formData={formData}
                      onChange={handleFieldChange}
                      onSubmit={handleSave}
                      onCancel={resetForm}
                      submitLabel="Save Changes"
                      saving={saving && !asking}
                      errors={errors}
                      nameClash={nameClash}
                      heldForNames={heldForNames}
                      extras
                      recipeBlock={false}
                      priceForm={priceForm}
                      onPriceChange={handlePriceChange}
                      priceErrors={priceErrors}
                      suppliers={activeSuppliers}
                      formats={formats}
                      onFormatsChange={setFormats}
                      allergens={allergens}
                      onAllergenChange={handleAllergenChange}
                      allergensAnswered={allergensTouched}
                      allergensUnread={allergensUnread}
                      onNoAllergens={handleNoAllergens}
                      recipe={recipe}
                      onRecipeChange={setRecipe}
                      ingredientOptions={ingredientOptions}
                      openExtra={openExtra}
                      onOpenExtra={setOpenExtra}
                      otherPriceCount={Math.max(0, (priceCounts[editingProduct?.id] || 0) - 1)}
                      onOpenPrices={() => navigate(`/catalogue/products/${editingProduct.id}/prices`)}
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

        {/* No overflow of its own, on purpose. The heading sticks to whatever
            is scrolling above it, and any box in between with an overflow set
            becomes that thing instead, which is how a sticky heading ends up
            pinned to the top of a table nobody is scrolling.

            So the list stays one long list down the page and the heading rides
            along with it. Only on a computer: a phone gets cards and a card
            list has no heading to pin. */}
        <div ref={tableTop} className="h-px" />
        <div className={`${card} hidden md:block`}>
          <table className="w-full text-sm">
            {/* The heading row used to be bg-gray-50, exactly the same as every
                other striped row, so it did not read as a heading at all. It is
                the dark sidebar green now, which there is no mistaking. */}
            <thead>
              {/* The same left edge the rows below carry, in the heading's own
                  green. Without it the body rows sit six pixels further in than
                  the heading and the card shows through beside it as a white
                  strip. */}
              <tr className={tableHeadRow}>
                {COLUMNS.map((col, i) => (
                  <th
                    key={col.key}
                    // The colour goes on the cell rather than the row. A sticky
                    // cell leaves the row's own background and border behind
                    // as it moves, so the heading would go transparent the
                    // moment anybody scrolled.
                    // The corners are rounded on the cells rather than clipped
                    // by the card. Clipping means an overflow on the card, and
                    // an overflow on the card is what the heading would stick
                    // to instead of the page.
                    className={`text-left px-4 py-3 whitespace-nowrap sticky ${STICK_TOP} z-10 bg-sidebar ${i === 0 && !stuck ? 'rounded-tl-xl' : ''} ${col.width || ''}`}
                  >
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
                <th className={`text-left px-4 py-3 sticky ${STICK_TOP} z-10 bg-sidebar ${stuck ? '' : 'rounded-tr-xl'} ${tableHeadCell}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p, i) => {
                const price = getPreferredPrice(p.id)
                const mixResult = p.is_mix ? calculateMixCost(p, products, recipeLines, prices) : null
                const last = i === filteredProducts.length - 1
                return (
                  <Fragment key={p.id}>
                    {/* MIX rows are yellow the whole way across. They are costed
                        from a recipe instead of a supplier price, so it matters
                        which ones they are. Inactive still wins, because a
                        deactivated product matters more than how it is costed. */}
                    <tr
                      className={`${last ? '' : 'border-b border-border'} ${!p.is_active
                        ? 'bg-red-100'
                        : p.is_mix
                          ? 'bg-amber-50'
                          : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                    >
                      {/* The colour is drawn inside the cell rather than as a
                          border on it. A border sits outside the cell's
                          background, so it landed beside the heading instead of
                          under it and showed as a stripe running past it, and
                          it squared off through the card's rounded corner. A
                          block inside the cell is covered by the heading like
                          everything else and is clipped by the same radius. */}
                      <td
                        className={`relative overflow-hidden px-4 py-3 pl-6 font-medium ${last ? 'rounded-bl-xl' : ''} ${p.is_active ? 'text-gray-900' : 'text-muted'}`}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-0 bottom-0 w-1.5"
                          style={{ backgroundColor: productInk(p) }}
                        />
                        {p.name}
                        {/* Beside the name, because the name is what the eye
                            runs down. */}
                        {noAllergens.has(p.id) && <span className="ml-2">{noAllergensMark(p)}</span>}
                        {/* How it is counted, under the name rather than in a
                            column of its own. The table is wide enough, and
                            this is a thing you check rather than scan down. */}
                        {packsFor(p.id).length > 0 && (
                          <span className="block text-xs font-normal text-muted mt-0.5">
                            Counted in {packsFor(p.id)
                              .map(u => `${u.label} (${parseFloat(u.factor)} ${p.unit})`)
                              .join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1">
                          <span className={`${badge} ${sectionBadge(p.section, p.is_active).className}`}>
                            {p.section}
                          </span>
                          {(p.also_in || []).map(place => (
                            <span
                              key={place}
                              className={`${badge} ${extraPlaceBadge(place, p.is_active).className}`}
                              style={extraPlaceBadge(place, p.is_active).style}
                            >
                              {place}
                            </span>
                          ))}
                          {/* Not ours. Grey rather than a section colour,
                              because it is not about where it is kept. */}
                          {heldFor(p) && (
                            <span className={`${badge} bg-white text-gray-600 border border-gray-400`}>
                              {heldFor(p)}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${p.is_active ? 'text-gray-700' : 'text-muted'}`}>{p.unit}</td>
                      <td className="px-4 py-3">
                        <span className={`${badge} ${typeBadge(p).cls}`}>
                          {typeBadge(p).label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 ${p.is_active ? 'text-gray-700' : 'text-muted'}`}>
                        {p.is_mix ? <span className="italic">House-made</span> : getSupplierName(price?.supplier_id)}
                      </td>
                      <td className={`px-4 py-3 font-medium ${p.is_active ? 'text-gray-900' : 'text-muted'}`}>
                        {p.is_mix
                          ? (mixResult?.cost !== null
                              ? fmtUnitCost(mixResult.cost)
                              : <span className="text-amber-600 text-xs">Incomplete</span>)
                          : (price ? fmtUnitCost(parseFloat(price.price_per_unit)) : '—')}
                      </td>
                      <td className={`px-4 py-3 ${p.is_active ? 'text-gray-700' : 'text-muted'}`}>
                        {p.weight_loss_pct > 0 ? `${p.weight_loss_pct}%` : '—'}
                      </td>
                      <td className={`px-4 py-3 ${last ? 'rounded-br-xl' : ''}`}>
                        <RowActions label={p.name} {...rowActionList(p)} />
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {filteredProducts.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-500 rounded-b-xl">
              No products found.
            </div>
          )}
        </div>
      {/* Editing opens in a dialog rather than pushing a form into the middle
          of the table. In the table the row being edited was hard to pick out
          from the rows around it, and everything below it jumped down the page. */}
      {editingProduct && (
        <Modal title={`Edit ${editingProduct.name}`} onClose={resetForm} width="max-w-2xl">
          <div className={`px-6 py-4 ${sectionColour(formData.section).bg}`}>
            <ProductForm
              problem={formProblem}
              formData={formData}
              onChange={handleFieldChange}
              onSubmit={handleSave}
              onCancel={resetForm}
              submitLabel="Save changes"
              saving={saving && !asking}
              errors={errors}
              nameClash={nameClash}
              heldForNames={heldForNames}
              extras
              recipeBlock={false}
              priceForm={priceForm}
              onPriceChange={handlePriceChange}
              priceErrors={priceErrors}
              suppliers={activeSuppliers}
              formats={formats}
              onFormatsChange={setFormats}
              allergens={allergens}
              onAllergenChange={handleAllergenChange}
              allergensAnswered={allergensTouched}
              allergensUnread={allergensUnread}
              onNoAllergens={handleNoAllergens}
              recipe={recipe}
              onRecipeChange={setRecipe}
              ingredientOptions={ingredientOptions}
              openExtra={openExtra}
              onOpenExtra={setOpenExtra}
              otherPriceCount={Math.max(0, (priceCounts[editingProduct?.id] || 0) - 1)}
              onOpenPrices={() => navigate(`/catalogue/products/${editingProduct.id}/prices`)}
            />
          </div>
        </Modal>
      )}

        </>
      )}
    </div>
  )
}
