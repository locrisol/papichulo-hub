import { primaryButton } from '@/lib/controlStyles'
import { stampDateTime } from '@/lib/dates'
import { declaresAllergens } from '@/lib/products'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
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
// One row per product, so saving is an insert the first time and an update after.

export default function AllergenPage() {
  const { id } = useParams()

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

  

  const loadAll = useCallback(async () => {
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

    // maybeSingle returns null (not an error) if no row exists yet,
    // which is the case for a product that has never had allergens set.
    const { data: allergenData, error: allergenError } = await supabase
      .from('product_allergens')
      .select('*')
      .eq('product_id', id)
      .maybeSingle()

    if (allergenError) {
      setError(friendlyError(allergenError))
      setLoading(false)
      return
    }

    if (allergenData) {
      const next = {}
      for (const a of ALLERGENS) {
        next[a.key] = allergenData[a.key] || 'none'
      }
      setValues(next)
      setExisting(allergenData)
    }
    // else: keep the default emptyAllergens() initial state (all 'none')

    setLoading(false)
    }, [id])

  useEffect(() => {
    // The fetch sets a loading state before it starts, which is one render
    // this rule would rather avoid. The alternative is to leave it,
    // and then a change of what is shown keeps the previous one's figures
    // on screen under the new one's heading until the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [loadAll])

  function setAllergenState(key, value) {
    setValues({ ...values, [key]: value })
    setSavedMessage('')
  }

  async function handleSave() {
    setFormProblem('')
    setSavedMessage('')
    setSaving(true)

    // Upsert: insert if no row exists for this product, update if one does.
    // product_allergens has UNIQUE(product_id), so onConflict='product_id'
    // is the right key.
    const payload = {
      product_id: id,
      ...values,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('product_allergens')
      .upsert(payload, { onConflict: 'product_id' })

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
          {/* The boxes open at Not present so only the ones that apply need
              changing, but until something is saved that is where the form
              starts, not an answer. The customer sheet treats it as not
              known, so this says so rather than looking like none. */}
          {!existing && !error && declaresAllergens(product) && !hasRecipe && (
            <Notice tone="warn" className="mb-4">
              Nothing has been saved for {product.name} yet. Until it is, the allergen sheet asks
              customers to speak to a member of staff about any dish it goes into. Set what applies,
              or leave all fourteen at Not present, and save.
            </Notice>
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
              {saving ? 'Saving...' : 'Save allergens'}
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
