import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, everyRow } from '@/lib/supabase'
import { everyReadArrived, sheetGroups, sheetSnapshot, sameSheet } from '@/lib/allergenSheet'
import { readAllergensAt } from '@/lib/allergensAt'
import AllergenList from '@/components/allergens/AllergenList'
import { card, primaryButton, warningNote } from '@/lib/controlStyles'
import { allergenLook } from '@/lib/allergens'
import { stampDate } from '@/lib/dates'


// The allergen page customers see, at /allergens/[slug]. No login.
//
// Nothing here is tagged by hand. Each dish works its allergens out from its
// ingredients, following recipes down through nested MIXes and taking the worst
// answer at every step, so the page cannot drift out of date the way the old
// spreadsheet did. That logic lives in lib/allergens.js.
//
// Two things to know about this file.
//
// It is used twice. A customer opens it from a QR code, and it is also embedded
// inside the manager's preview screen, which passes slugOverride instead of
// reading the slug from the address.
//
// And it reads views rather than tables. The six tables this used to read are
// closed to anybody not signed in, because a policy can say yes to
// a stranger asking for the menu but it cannot say which columns, and the same
// yes covered every recipe quantity, every selling price and the restaurant's
// pay rate. The public_ views carry the handful of columns this page actually
// uses and nothing else.
//
// That also settled something this comment used to describe as still open. The
// old public policy on products required is_active, so a dish still on sale
// containing an ingredient somebody had since deactivated lost that
// ingredient's allergens without saying so. public_products has no such
// condition, which is what the code here always intended.
export default function PublicAllergensPage({ slugOverride }) {
  const params = useParams()
  const slug = slugOverride ?? params.slug

  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [components, setComponents] = useState([])
  const [products, setProducts] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [allergens, setAllergens] = useState([])
  // The last printed sheet's lines and the day they last changed, for Last
  // updated. Null when none was printed since the Hub began keeping them.
  const [printed, setPrinted] = useState(null)

  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // A read that failed, as against an address that leads nowhere. Kept apart
  // from error because that one says Page not found, and a customer whose
  // phone lost signal halfway through is standing in the restaurant.
  const [loadFailed, setLoadFailed] = useState(false)

  // The tab and a saved bookmark said "Papi Chulo Hub" whatever restaurant it
  // was, which on a customer's phone reads as somebody else's app. Not in the
  // manager's preview, which sits inside the Hub and keeps the Hub's title.
  useEffect(() => {
    if (slugOverride || !restaurant?.name) return undefined
    const before = document.title
    document.title = `${restaurant.name} allergens`
    return () => { document.title = before }
  }, [slugOverride, restaurant?.name])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    setLoadFailed(false)
    // The manager's preview changes restaurant on the same page, and the card
    // below names whichever restaurant is held here. Kept, a failed read of
    // the next one would carry the last one's name.
    setRestaurant(null)

    // Find the restaurant by slug. Even though selling prices are uniform,
    // the page is keyed to a restaurant so the displayed name and any
    // future per-restaurant tweaks work.
    const restRes = await supabase
      .from('public_restaurants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (restRes.error) {
      setLoadFailed(true)
      setLoading(false)
      return
    }
    if (!restRes.data) {
      setError('Please ask a member of staff for allergen information.')
      setLoading(false)
      return
    }
    setRestaurant(restRes.data)

    // Seven views rather than seven tables, and they carry only the columns
    // this page reads. The tables themselves no longer answer to anybody who
    // is not signed in, because row level security cannot restrict columns:
    // it could say yes to a stranger asking for the menu, and the same yes
    // covered the pay rate, the cost targets and every recipe quantity in
    // the building.
    //
    // The is_active filtering lives inside the views now, so this page shows
    // the same thing to a customer and to a manager previewing it, without
    // having to ask for it twice.
    //
    // Every row, a page at a time, each in an order that cannot tie. The
    // database hands back a thousand rows at most and says nothing when it
    // stops, and the lines of every dish ever set up, switched off ones too,
    // pass that long before the menu does. A dish that lost one line past the
    // thousandth kept the rest, and with those answered its row looked whole
    // without the allergens the lost line carried.
    //
    // Products are still deliberately unfiltered, and that is now true rather
    // than merely intended. They are not a list on screen, they are what the
    // allergens are worked out from, and a dish can contain a product that has
    // since been deactivated. The old policy required is_active and quietly
    // dropped exactly that product's allergens from the answer, which is the
    // one thing this page cannot get wrong.
    const [printedRes, ...reads] = await Promise.all([
      // The sheet last printed, which a customer cannot read: its lines and
      // the day they last changed. Since 19 October 2026 the page says that
      // day only when it says the same as the paper. It was the change log's
      // last change to anything the sheet is made from, and before that
      // today's date on every visit.
      supabase.rpc('public_allergen_sheet', { restaurant: restRes.data.id }),
      everyRow(() => supabase.from('public_menu_categories').select('*').order('sort_order').order('id')),
      everyRow(() => supabase.from('public_menu_items').select('*').order('name').order('id')),
      everyRow(() => supabase.from('public_menu_item_components').select('*').order('id')),
      everyRow(() => supabase.from('public_products').select('*').order('name').order('id')),
      everyRow(() => supabase.from('public_mix_recipes').select('*').order('id')),
      // What this restaurant's products carry, from the versions it buys
      // (lib/allergensAt), in the shape the sheet has always read.
      readAllergensAt(restRes.data.id, { customer: true }),
    ])

    // All of them or none of them. A failed read of the allergens used to
    // leave every product with none, and every dish said No declared
    // allergens with nothing on the page to say anything had gone wrong.
    if (!everyReadArrived(reads)) {
      setLoadFailed(true)
      setLoading(false)
      return
    }

    const [categoriesRes, menuItemsRes, componentsRes, productsRes, recipesRes, allergensRes] = reads
    setCategories(categoriesRes.data)
    setMenuItems(menuItemsRes.data)
    setComponents(componentsRes.data)
    setProducts(productsRes.data)
    setRecipeLines(recipesRes.data)
    setAllergens(allergensRes.data)
    // Not one of the reads the rows need. A date that would not come back
    // is left off the page rather than guessed, and the dishes still show.
    setPrinted(printedRes.error ? null : printedRes.data)

    setLoading(false)
    }, [slug])

  useEffect(() => {
    // The fetch sets a loading state before it starts, which is one render
    // this rule would rather avoid. The alternative is to leave it,
    // and then a change of what is shown keeps the previous one's figures
    // on screen under the new one's heading until the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAll()
  }, [fetchAll])

  // Which rows there are, what each one carries, and whether everything it is
  // built from actually arrived, all worked out in lib/allergenSheet. It used
  // to be three functions here, and the printed sheet had its own copy of the
  // same reasoning a few hundred lines away in another file.
  //
  // The one worth keeping in mind: a list that looks whole is the worst way to
  // be wrong on this page in particular. So a row whose ingredients did not
  // all arrive says to ask staff rather than showing what it could work out.


  // Build the grouped, ordered, filtered structure for rendering.
  //
  // Rows rather than menu items. Two sizes of one dish are one row, and
  // something handed over beside it gets a row of its own. Worked out in
  // lib/allergenSheet (sheetGroups) so the printed sheet cannot come out
  // saying anything different from this, and a category kept off the sheet
  // is left off here too.
  const itemsByCategory = sheetGroups({ categories, menuItems, components, products, recipeLines, allergens })

  // The day the paper's lines last changed, only while this page says the
  // same as the paper. Once anything on it has changed the date would vouch
  // for a sheet nobody has printed, so it is left off until one is.
  const changedAt = printed?.changed_at && sameSheet(printed.rows, sheetSnapshot(itemsByCategory))
    ? printed.changed_at
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">Loading allergen information...</p>
      </div>
    )
  }

  // No rows at all, and the reason is not the customer's to work out. Asking
  // staff is the one answer that is right whatever did not arrive.
  if (loadFailed) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className={`${card} p-8 max-w-sm w-full text-center`} role="alert">
          <p className="text-xs font-bold text-accent-ink uppercase tracking-widest mb-1">Allergen information</p>
          {restaurant && (
            <h1 className="font-serif text-2xl font-bold text-gray-900 mb-3">{restaurant.name}</h1>
          )}
          <p className="text-sm text-gray-700 mb-5">
            We cannot show allergen information right now. Please ask a member of staff before ordering.
          </p>
          <button type="button" onClick={fetchAll} className={primaryButton()}>
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Page not found</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app-bg">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <header className="mb-6">
          <p className="text-xs font-bold text-accent-ink uppercase tracking-widest mb-1">Allergen information</p>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">{restaurant.name}</h1>
          {/* The day the printed sheet's lines last changed, and nothing
              when this page no longer says the same or nothing was printed.
              It used to fall back to today, which is a freshness nobody
              vouched for. */}
          {changedAt && (
            <p className="text-xs text-gray-500 mt-2">Last updated: {stampDate(changedAt)}</p>
          )}
        </header>

        <div className={`${warningNote} mb-6`}>
          <p className="font-semibold mb-1">Important</p>
          <p>If you have a food allergy or intolerance, please speak to a member of staff before ordering. We take great care, but our kitchen handles many allergens and we cannot guarantee that any dish is completely free of them.</p>
        </div>

        <div className={`${card} p-4 mb-6 text-xs text-gray-600`}>
          <p className="mb-2">Press a dish to see its full allergen breakdown. The summary shows allergens that the dish either contains or may contain.</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {/* The colours and the ~ come from the same place as the
                chips', so the key cannot say something they do not. */}
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${allergenLook('contains').dot}`}></span>
              Contains
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${allergenLook('may_contain').dot}`}></span>
              {allergenLook('may_contain').mark} May contain
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
              Not present
            </span>
          </div>
        </div>

        {itemsByCategory.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <p className="text-sm text-gray-500">No dishes to show. Please ask a member of staff about allergens.</p>
          </div>
        ) : (
          <AllergenList
            groups={itemsByCategory}
            expandedId={expandedId}
            onToggle={setExpandedId}
          />
        )}

        <footer className="mt-8 text-center">
          <p className="text-xs text-muted">
            If you have any questions about allergens, please ask a member of staff.
          </p>
        </footer>
      </div>
    </div>
  )
}