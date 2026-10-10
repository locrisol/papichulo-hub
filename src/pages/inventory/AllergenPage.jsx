import { primaryButton, rowButton, badge, cardEdge } from '@/lib/controlStyles'
import { stampDateTime } from '@/lib/dates'
import { declaresAllergens } from '@/lib/products'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/context/restaurant'
import { friendlyError } from '@/lib/errors'
import { ALLERGENS, emptyAllergens } from '@/lib/allergens'
import { allergensChanged } from '@/lib/allergensChanged'
import AllergenPicker from '@/components/inventory/AllergenPicker'
import BackButton from '@/components/ui/BackButton'
import ErrorBanner from '@/components/ui/ErrorBanner'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'

// Tagging the 14 allergens on one product.
//
// This is where the raw answers are set for a product that already exists. The
// same fourteen can now be answered while the product is being added, on the
// product form, which is where you would rather say it. Both draw the list, the
// three states and the boxes from the same place.
//
// The 14 are fixed by EU 1169 and cannot be added to or renamed. The form opens
// at Not present for all of them, so only the ones that apply need changing,
// but a product with no record saved is not known rather than none, and the
// page says so until it is saved.
//
// Since 4 October a bought product has versions, the actual things bought for
// it, and each version has its own allergens: two makes of tortilla can
// differ. So the page lists the versions and answers one at a time. A MIX, or
// a product never priced, has no versions and keeps one answer of its own.

const answersOf = row => {
  const next = {}
  for (const a of ALLERGENS) next[a.key] = row?.[a.key] || 'none'
  return next
}

export default function AllergenPage() {
  const { id } = useParams()
  const { activeRestaurant } = useRestaurant()

  const [product, setProduct] = useState(null)
  const [values, setValues] = useState(emptyAllergens())
  const [existing, setExisting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Kept apart from the page's error above. That one is for something that
  // would not load, which belongs at the top of the page because there is
  // nothing else up there to read. This is for a save that would not go
  // through, and that belongs beside the button you pressed: at the foot of
  // a form on a phone, the top of the page is not on the screen at all.
  const [formProblem, setFormProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  // A MIX with a recipe takes its allergens from what goes into it, so having
  // no row of its own is not a gap, and the note about nothing being saved
  // would send somebody to fix the wrong product.
  const [hasRecipe, setHasRecipe] = useState(false)

  // The versions, each with its supplier, its answers if it has any, and
  // whether the restaurant open buys it. Empty for a product with none.
  const [versions, setVersions] = useState([])
  const [chosen, setChosen] = useState(null)
  // The same, for the read after a save to keep the version asked about
  // without reading again every time another one is picked.
  const kept = useRef(null)
  // Which read is the latest, so one for the restaurant open before, answering
  // late, does not land on this one.
  const reading = useRef(0)

  const loadAll = useCallback(async () => {
    const ticket = ++reading.current
    const stale = () => ticket !== reading.current
    setLoading(true)

    const { data: productData, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (productError) {
      setError(friendlyError(productError))
      setLoading(false)
      return
    }
    setProduct(productData)

    if (productData.is_mix) {
      const { data: lines, error: recipeError } = await supabase
        .from('mix_recipes')
        .select('ingredient_product_id')
        .eq('mix_product_id', id)
        .limit(1)
      if (recipeError) {
        setError(friendlyError(recipeError))
        setLoading(false)
        return
      }
      setHasRecipe((lines || []).length > 0)
    }

    const [versionsRes, productRowRes] = await Promise.all([
      supabase.from('product_versions')
        .select('id, supplier_id, supplier_code, name, is_recommended, is_active, suppliers(name)')
        .eq('product_id', id)
        .order('created_at'),
      // maybeSingle returns null (not an error) if no row exists yet,
      // which is the case for a product that has never had allergens set.
      supabase.from('product_allergens').select('*').eq('product_id', id).maybeSingle(),
    ])
    if (stale()) return
    const failed = versionsRes.error || productRowRes.error
    if (failed) {
      setError(friendlyError(failed))
      setLoading(false)
      return
    }

    const list = versionsRes.data || []
    if (list.length) {
      const ids = list.map(v => v.id)
      const [answersRes, boughtRes] = await Promise.all([
        supabase.from('version_allergens').select('*').in('version_id', ids),
        activeRestaurant
          ? supabase.from('public_restaurant_versions').select('version_id')
            .eq('restaurant_id', activeRestaurant.id).in('version_id', ids)
          : Promise.resolve({ data: [] }),
      ])
      if (stale()) return
      const failedToo = answersRes.error || boughtRes.error
      if (failedToo) {
        setError(friendlyError(failedToo))
        setLoading(false)
        return
      }
      const here = new Set((boughtRes.data || []).map(b => b.version_id))
      const shaped = list.map(v => ({
        ...v,
        answer: (answersRes.data || []).find(a => a.version_id === v.id) || null,
        here: here.has(v.id),
      }))
      setVersions(shaped)
      // The one asked about stays chosen after a save; otherwise the first
      // bought here, then the first recommended, then the first.
      const keep = shaped.find(v => v.id === kept.current)
        || shaped.find(v => v.here) || shaped.find(v => v.is_recommended) || shaped[0]
      kept.current = keep.id
      setChosen(keep.id)
      setValues(answersOf(keep.answer))
      setExisting(keep.answer)
    } else {
      setVersions([])
      setChosen(null)
      if (productRowRes.data) {
        setValues(answersOf(productRowRes.data))
        setExisting(productRowRes.data)
      }
      // else: keep the default emptyAllergens() initial state (all 'none')
    }

    setLoading(false)
    }, [id, activeRestaurant])

  useEffect(() => {
    // The fetch sets a loading state before it starts, which is one render
    // this rule would rather avoid. The alternative is to leave it,
    // and then a change of what is shown keeps the previous one's figures
    // on screen under the new one's heading until the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  function choose(version) {
    kept.current = version.id
    setChosen(version.id)
    setValues(answersOf(version.answer))
    setExisting(version.answer)
    setSavedMessage('')
    setFormProblem('')
  }

  // A version with no answer starting from another's: the same thing in
  // another pack, or close enough to check box by box. Nothing is saved
  // until Save.
  function startFrom(version) {
    setValues(answersOf(version.answer))
    setSavedMessage('')
  }

  function setAllergenState(key, value) {
    setValues({ ...values, [key]: value })
    setSavedMessage('')
  }

  async function handleSave() {
    setFormProblem('')
    setSavedMessage('')
    setSaving(true)

    // Upsert: insert if no row exists yet, update if one does. One row per
    // version, or per product for one with no versions.
    const stamp = new Date().toISOString()
    const { error } = chosen
      ? await supabase.from('version_allergens')
        .upsert({ version_id: chosen, ...values, updated_at: stamp }, { onConflict: 'version_id' })
      : await supabase.from('product_allergens')
        .upsert({ product_id: id, ...values, updated_at: stamp }, { onConflict: 'product_id' })

    if (error) {
      setFormProblem(friendlyError(error))
    } else {
      setSavedMessage('Saved')
      // So the red count on Products in the sidebar goes down now, rather
      // than on the next page change.
      allergensChanged()
      // Refetch so the "Last updated" timestamp shown is the one
      // Postgres actually stored, not the client-side timestamp.
      loadAll()
    }
    setSaving(false)
  }

  const current = versions.find(v => v.id === chosen) || null
  const answeredOthers = versions.filter(v => v.id !== chosen && v.answer)

  const subtitle = [
    product?.section,
    product?.unit,
    existing?.updated_at && `Last updated: ${stampDateTime(existing.updated_at)}`,
  ].filter(Boolean).join(' · ')

  return (
    <div>
      <BackButton to="/catalogue/products" className="mb-4">Back to products</BackButton>

      <PageHeader title={`Allergens: ${product?.name || '...'}`} subtitle={subtitle} />

      {error && (
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
      )}

      <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3 mb-4">
        Set each of the 14 allergens listed by law. Not present: the product does not contain it. May contain: it could be there by accident, for example from shared equipment. Contains: it is an ingredient. Customers see these on the allergen page.
      </div>

      {loading ? (
        <div className="text-sm text-muted">Loading allergens...</div>
      ) : (
        <>
          {/* One version at a time. Each says where it comes from on a line
              of its own, and what it is to this restaurant in badges. */}
          {versions.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">
                {versions.length === 1 ? 'Its one version' : `Its ${versions.length} versions`}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {versions.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => choose(v)}
                    aria-pressed={v.id === chosen}
                    className={`${cardEdge} text-left p-3 bg-white transition-colors ${v.id === chosen
                      ? 'ring-2 ring-accent'
                      : 'hover:bg-gray-50'}`}
                  >
                    <span className="block text-sm font-semibold text-gray-900">{v.name || product?.name}</span>
                    <span className="block text-xs text-muted mt-0.5">
                      {v.suppliers?.name || 'Supplier'}{v.supplier_code ? `, code ${v.supplier_code}` : ', no code'}
                    </span>
                    <span className="flex flex-wrap gap-1.5 mt-2">
                      {v.here && <span className={`${badge} bg-sky-100 text-sky-900`}>Bought at {activeRestaurant?.name}</span>}
                      {v.is_recommended && <span className={`${badge} bg-green-100 text-green-800`}>Recommended</span>}
                      {!v.answer && <span className={`${badge} bg-red-600 text-white`}>Not answered</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The boxes open at Not present so only the ones that apply need
              changing, but until something is saved that is where the form
              starts, not an answer. The customer sheet treats it as not
              known, so this says so rather than looking like none. */}
          {!existing && !error && declaresAllergens(product) && !hasRecipe && (
            <Notice tone="warn" className="mb-4">
              {current
                ? `Nothing has been saved for this version yet. Until it is, the allergen sheet at a restaurant
                  that buys it asks customers to speak to a member of staff about any dish ${product.name} goes into.`
                : `Nothing has been saved for ${product.name} yet. Until it is, the allergen sheet asks
                  customers to speak to a member of staff about any dish it goes into.`}
              {' '}Set what applies, or leave all fourteen at Not present, and save.
            </Notice>
          )}
          {!existing && current && answeredOthers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs text-muted">Start from the answers for</span>
              {answeredOthers.map(v => (
                <button key={v.id} type="button" onClick={() => startFrom(v)} className={rowButton()}>
                  {v.name || v.supplier_code || v.suppliers?.name}
                </button>
              ))}
            </div>
          )}
          {hasRecipe && !error && (
            <p className="text-sm text-muted mb-4">
              The allergens for {product.name} come from the products in its recipe. Anything set
              here is added to them.
            </p>
          )}
          <AllergenPicker values={values} onChange={setAllergenState} className="mb-6" />

          {/* Above the button row rather than inside it. As a sibling of the
              button it sat beside it on one line, which squeezes both on a
              phone and is not where the eye goes after a press. */}
          {formProblem && (
            <ErrorBanner className="mb-3">{formProblem}</ErrorBanner>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className={primaryButton()}
            >
              {saving ? 'Saving...' : current ? 'Save this version' : 'Save allergens'}
            </button>
            {savedMessage && (
              <span className="text-xs text-green-700">{savedMessage}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
