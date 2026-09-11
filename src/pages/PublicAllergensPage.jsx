import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { sheetRows } from '../lib/allergenSheet'
import AllergenList from '../components/allergens/AllergenList'
import { card } from '../lib/controlStyles'
import { stampDate } from '../lib/dates'


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
// And there is one thing still open, worth knowing before trusting this page.
//
// For a customer the database hides deactivated rows on its own, because the
// public policies are written as auth.uid() IS NULL AND is_active = true. That
// applies to products too. So if a dish that is still on sale contains an
// ingredient somebody has since deactivated, the customer's copy of that product
// never arrives, the component is skipped, and the allergens it carried are
// quietly missing from what they are shown.
//
// Nothing triggers it today: no active dish currently contains a deactivated
// product. But nothing stops it either, and this is the one page where being
// quietly incomplete matters, so it wants either a policy that lets the public
// read every product, or a warning when deactivating something still used in a
// dish that is on sale.
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

  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchAll()
  }, [slug])

  async function fetchAll() {
    setLoading(true)

    // Find the restaurant by slug. Even though selling prices are uniform,
    // the page is keyed to a restaurant so the displayed name and any
    // future per-restaurant tweaks work.
    const restRes = await supabase
      .from('restaurants')
      .select('id, name, slug')
      .eq('slug', slug)
      .maybeSingle()

    if (restRes.error || !restRes.data) {
      setError('Restaurant not found')
      setLoading(false)
      return
    }
    setRestaurant(restRes.data)

    // Categories and dishes are filtered here as well as by the database. For a
    // customer the public policies already do it, but the manager previewing
    // this page is signed in, and the signed-in policies have no is_active
    // condition, so without this the preview showed dishes a customer never
    // gets. Asking for it explicitly means the page behaves the same whoever is
    // looking at it.
    //
    // Products deliberately are not filtered. They are not a list on screen,
    // they are what the allergens are worked out from, and a dish can contain a
    // product that has since been deactivated. Leaving it out would drop that
    // product's allergens from the answer, which is the one thing this page
    // cannot get wrong.
    const [categoriesRes, menuItemsRes, componentsRes, productsRes, recipesRes, allergensRes] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('menu_items').select('*').eq('is_active', true).order('name'),
      supabase.from('menu_item_components').select('*'),
      supabase.from('products').select('*').order('name'),
      supabase.from('mix_recipes').select('*'),
      supabase.from('product_allergens').select('*'),
    ])

    if (categoriesRes.data) setCategories(categoriesRes.data)
    if (menuItemsRes.data) setMenuItems(menuItemsRes.data)
    if (componentsRes.data) setComponents(componentsRes.data)
    if (productsRes.data) setProducts(productsRes.data)
    if (recipesRes.data) setRecipeLines(recipesRes.data)
    if (allergensRes.data) setAllergens(allergensRes.data)

    setLoading(false)
  }

  // Which rows there are, what each one carries, and whether everything it is
  // built from actually arrived, all worked out in lib/allergenSheet. It used
  // to be three functions here, and the printed sheet had its own copy of the
  // same reasoning a few hundred lines away in another file.
  //
  // The one worth keeping in mind: a customer is not signed in, so the database
  // only hands an anonymous reader active products. An ingredient deactivated
  // while the dish is still on sale simply does not arrive, and a list that
  // looks whole is the worst way to be wrong on this page in particular. When
  // that happens the row says to ask staff. A manager viewing this through the
  // preview is signed in and gets everything, so it never fires for them.


  // Build the grouped, ordered, filtered structure for rendering.
  //
  // Rows rather than menu items. Two sizes of one dish are one row, and
  // something handed over beside it gets a row of its own. Worked out in
  // lib/allergenSheet so the printed sheet cannot come out saying anything
  // different from this.
  const itemsByCategory = categories
    // A category can be kept off the sheet: cans and bottled water carry none
    // of the fourteen and fill it with rows saying so. Older rows have no
    // answer here, and no answer means shown.
    .filter(c => c.on_allergen_sheet !== false)
    .map(c => ({
      category: c,
      rows: sheetRows(
        menuItems.filter(i => i.category_id === c.id),
        components, products, recipeLines, allergens,
      ),
    }))
    .filter(group => group.rows.length > 0)

  // Find the most recent update across all allergen rows so we can show
  // a "last updated" timestamp. If no allergens have ever been edited,
  // we'll show today's date as a fallback so the page doesn't look stale.
  const lastUpdated = allergens.reduce((latest, a) => {
    if (!a.updated_at) return latest
    if (!latest || a.updated_at > latest) return a.updated_at
    return latest
  }, null)

  // The day the sheet was last touched. Falls back to today, because a sheet
  // with no date on it reads as one nobody has checked.
  function formatDate(iso) {
    return stampDate(iso || new Date().toISOString())
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">Loading allergen information...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow">
          <p className="text-4xl mb-3">🚫</p>
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
          <p className="text-xs font-bold text-accent-ink uppercase tracking-widest mb-1">Allergen Information</p>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900">{restaurant.name}</h1>
          <p className="text-xs text-gray-500 mt-2">Last updated: {formatDate(lastUpdated)}</p>
        </header>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4 mb-6">
          <p className="font-semibold mb-1">Important</p>
          <p>If you have a severe allergy, please speak to a member of staff before ordering. While we take great care, our kitchen handles many allergens and we cannot guarantee zero cross-contamination.</p>
        </div>

        <div className={`${card} p-4 mb-6 text-xs text-gray-600`}>
          <p className="mb-2">Tap a dish to see its full allergen breakdown. The summary shows allergens that the dish either contains or may contain.</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              Contains
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              May contain
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300"></span>
              Not present
            </span>
          </div>
        </div>

        {itemsByCategory.length === 0 ? (
          <div className={`${card} p-8 text-center`}>
            <p className="text-sm text-gray-500">No menu items available.</p>
          </div>
        ) : (
          <AllergenList
            groups={itemsByCategory}
            expandedId={expandedId}
            onToggle={setExpandedId}
          />
        )}

        <footer className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Allergen information provided by {restaurant.name}. For the most current information, please ask a member of staff.
          </p>
        </footer>
      </div>
    </div>
  )
}