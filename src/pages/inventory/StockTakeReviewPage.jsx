import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/auth'
import { resolveUnitCost } from '@/lib/mixCost'
import { fmtMoney, fmtQty } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { countName } from '@/lib/products'
import { noPrice } from '@/lib/stockTakeSummary'
import { sectionRank, sectionColour } from '@/lib/sections'
import {
  badge, captionClass, card, fieldClass, labelClass, modalFooter, primaryButton, rowButton, secondaryButton,
} from '@/lib/controlStyles'
import BackButton from '@/components/ui/BackButton'
import Modal from '@/components/ui/Modal'
import Notice from '@/components/ui/Notice'
import PageHeader from '@/components/ui/PageHeader'
import { can, MANAGERS } from '@/lib/access'
import ErrorBanner from '@/components/ui/ErrorBanner'
import { placesFor } from '@/lib/brandVersions'

// The last look before a stock take is closed. Managers only.
//
// There is no approval queue while counting: employees add and change their own
// lines as they go and nothing waits on anyone. This screen is where the checking
// actually happens, which is why it leads with what has not been counted rather
// than with what has.
//
// Closing is a one-way door in practice. It stamps the time and saves the total
// value, and from then on the numbers are history. A manager can reopen a session
// afterwards, and that is recorded with who did it and why, so a late fix leaves
// a trail instead of quietly rewriting a closed count.
//
// A product nobody counted is left with no line at all. It is not written as
// zero, because zero means somebody looked and there was none, and those two
// things lead to completely different decisions about ordering.

// What a list of lines comes to. A line with no price adds nothing.
function valueOf(lines) {
  return (lines || []).reduce((sum, l) => sum + Number(l.line_total || 0), 0)
}

// The heading over a list worth a look before closing, with how many are in it.
function ListHeading({ children, count }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className={captionClass}>{children}</h2>
      <span className={`${badge} bg-amber-100 text-amber-800`}>{count}</span>
    </div>
  )
}

export default function StockTakeReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [session, setSession] = useState(null)
  const [products, setProducts] = useState([])
  const [lines, setLines] = useState([])
  const [preferredPrices, setPreferredPrices] = useState([])
  const [kept, setKept] = useState([])
  const [recipeLines, setRecipeLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [expandedProductId, setExpandedProductId] = useState(null)
  // Folded to three, because the block has to be the same height holding
  // two of these or forty.
  const [allPlaces, setAllPlaces] = useState(false)
  const [draftQty, setDraftQty] = useState('')
  const [draftLocation, setDraftLocation] = useState('')
  const [savingLine, setSavingLine] = useState(false)

  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [closing, setClosing] = useState(false)

  const isManager = can(user, MANAGERS)

  

  const fetchEverything = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: sessionData, error: sessionErr } = await supabase
      .from('stock_takes').select('*').eq('id', id).single()
    if (sessionErr || !sessionData) {
      setError('This stock take could not be found.')
      setLoading(false)
      return
    }

    // Any of these failing stops the page rather than carrying on with an
    // empty list: no lines showed every product as uncounted, and no prices
    // saved anything counted here with no value.
    const { data: productsData, error: productsErr } = await supabase
      .from('products').select('*').eq('is_active', true).order('name')

    const { data: linesData, error: linesErr } = await supabase
      .from('stock_take_lines').select('*').eq('stock_take_id', id)

    // The stock take's own restaurant, for the same reason as on the count:
    // a super admin can read every restaurant's prices.
    const { data: pricesData, error: pricesErr } = await supabase
      .from('product_supplier_prices').select('*')
      .eq('restaurant_id', sessionData.restaurant_id).eq('is_preferred', true)

    const { data: recipesData, error: recipesErr } = await supabase
      .from('mix_recipes').select('*')

    // Where each product is kept there, from the versions it buys.
    const { data: keptData, error: keptErr } = await supabase
      .from('restaurant_kept_in').select('*').eq('restaurant_id', sessionData.restaurant_id)

    const failed = productsErr || linesErr || pricesErr || recipesErr || keptErr
    if (failed) {
      setError(friendlyError(failed))
      setLoading(false)
      return
    }

    setSession(sessionData)
    setProducts(productsData || [])
    setLines(linesData || [])
    setPreferredPrices(pricesData || [])
    setRecipeLines(recipesData || [])
    setKept(keptData || [])
    setLoading(false)
    }, [id])

  useEffect(() => {
    // The fetch sets a loading state before it starts, which is one render
    // this rule would rather avoid. The alternative is to leave it,
    // and then a change of session keeps the previous one's figures
    // on screen under the new one's heading until the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEverything()
  }, [fetchEverything])

  const countedProductIds = useMemo(() => new Set(lines.map(l => l.product_id)), [lines])

  const uncountedProducts = useMemo(() => {
    return products
      .filter(p => !countedProductIds.has(p.id))
      .sort((a, b) => {
        const r = sectionRank(a.section) - sectionRank(b.section)
        return r !== 0 ? r : a.name.localeCompare(b.name)
      })
  }, [products, countedProductIds])

  // Kept in more than one place, counted in some of them.
  //
  // A second place is a might be there, so it does not hold the count up and it
  // is not treated as missing. It is worth one look before closing though, in
  // case the other shelf was not empty after all, which is why it says which
  // place was counted and which was not rather than only that something is odd.
  const partlyCounted = useMemo(() => {
    return products
      .map(product => {
        const places = placesFor(product, kept,
          lines.filter(l => l.product_id === product.id).map(l => l.section || 'Other'))
        if (places.length < 2) return null

        const counted = places.filter(place =>
          lines.some(l => l.product_id === product.id && (l.section || 'Other') === place))
        if (counted.length === 0 || counted.length === places.length) return null

        return { product, counted, missing: places.filter(place => !counted.includes(place)) }
      })
      .filter(Boolean)
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
  }, [products, lines, kept])

  // Counted while they had no price, so they add nothing to the total about
  // to be saved. Nothing on this page said so, and the total read as the
  // whole count. See noPrice.
  const unpricedProducts = useMemo(() => {
    const unpriced = new Set(lines.filter(noPrice).map(l => l.product_id))
    return products
      .filter(p => unpriced.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [products, lines])

  const totalValue = useMemo(() => valueOf(lines), [lines])

  // The lines as they are now. Staff can go on counting on their phones while
  // a manager has this screen open, so what it read on the way in is not what
  // there is at Close.
  async function readLines() {
    const { data, error: readErr } = await supabase
      .from('stock_take_lines').select('*').eq('stock_take_id', id)
    if (!readErr) setLines(data || [])
    return { data, error: readErr }
  }

  // The figure in the dialog is the one that will be saved, so it is read
  // again first. If that fails the dialog still opens, and Close reads again
  // and says so.
  async function openCloseConfirm() {
    await readLines()
    setShowCloseConfirm(true)
  }

  function getProductLines(productId) {
    return lines
      .filter(l => l.product_id === productId)
      .sort((a, b) => new Date(a.counted_at) - new Date(b.counted_at))
  }

  function toggleExpand(productId) {
    if (expandedProductId === productId) {
      setExpandedProductId(null)
    } else {
      setExpandedProductId(productId)
      setDraftQty('')
      setDraftLocation('')
    }
  }

  async function handleAddLine(product) {
    const qty = parseFloat(draftQty)
    if (isNaN(qty) || qty < 0) return
    setSavingLine(true)

    const unitCost = resolveUnitCost(product, products, recipeLines, preferredPrices)
    const lineTotal = unitCost != null ? qty * unitCost : null

    const { data, error: insertErr } = await supabase
      .from('stock_take_lines')
      .insert({
        stock_take_id: id,
        product_id: product.id,
        section: product.section || null,
        quantity_counted: qty,
        unit_cost: unitCost,
        line_total: lineTotal,
        counted_by: user.id,
        location_note: draftLocation.trim() || null,
      })
      .select()
      .single()

    setSavingLine(false)
    if (insertErr) { setError(friendlyError(insertErr)); return }

    setLines(prev => [...prev, data])
    setDraftQty('')
    setDraftLocation('')
  }

  // Shutting the dialog takes its message with it, so a failed close does not
  // leave a red bar sitting on the page after you have walked away from it.
  function closeConfirm() {
    if (closing) return
    setShowCloseConfirm(false)
    setError('')
  }

  async function handleCloseSession() {
    setClosing(true)
    setError('')

    // We do NOT create lines for uncounted products. They simply have no
    // observation this session, which keeps "not counted" distinct from a
    // genuine zero. Total value is the sum of what was actually counted, from
    // the lines read again at this moment rather than the list on screen,
    // which leaves out anything counted since the page opened.
    const { data: fresh, error: readErr } = await readLines()
    if (readErr) {
      setClosing(false)
      setError(friendlyError(readErr))
      return
    }

    const { error: updateErr } = await supabase
      .from('stock_takes')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_value: valueOf(fresh),
      })
      .eq('id', id)

    setClosing(false)
    if (updateErr) { setError(friendlyError(updateErr)); return }

    navigate(`/inventory/stock-takes/${id}/summary`)
  }

  if (loading) {
    return <div><p className="text-sm text-muted">Loading...</p></div>
  }

  if (error && !session) {
    return (
      <div>
        <ErrorBanner>{error}</ErrorBanner>
        <BackButton to="/inventory/stock-takes" className="mt-4">Back to stock takes</BackButton>
      </div>
    )
  }

  if (!isManager) {
    return (
      <div>
        <Notice tone="warn">
          Only managers can review and close a stock take.
        </Notice>
        <BackButton to={`/inventory/stock-takes/${id}`} className="mt-4">Back to counting</BackButton>
      </div>
    )
  }

  if (session.status !== 'in_progress') {
    return (
      <div>
        <Notice tone="warn">
          This stock take is already closed.
        </Notice>
        <button type="button" onClick={() => navigate(`/inventory/stock-takes/${id}/summary`)} className={`${secondaryButton} mt-4`}>View summary →</button>
      </div>
    )
  }

  const countedCount = products.length - uncountedProducts.length

  return (
    <>
      <BackButton to={`/inventory/stock-takes/${id}`} className="mb-4">Back to counting</BackButton>

      <PageHeader
        title="Review & close"
        subtitle="Check the entries, then close the stock take. After that, they cannot be changed."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className={`${card} p-4`}>
          <p className={captionClass}>Counted</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{countedCount}<span className="text-base text-muted">/{products.length}</span></p>
        </div>
        <div className={`${card} p-4`}>
          <p className={captionClass}>Uncounted</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{uncountedProducts.length}</p>
        </div>
        <div className={`${card} p-4 col-span-2 sm:col-span-1`}>
          <p className={captionClass}>Total value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(totalValue)}</p>
        </div>
      </div>

      {/* Not while the closing dialog is up, which covers the whole screen
          and would hide it. It goes inside the dialog instead. */}
      {error && !showCloseConfirm && (
        <ErrorBanner className="mb-4">{error}</ErrorBanner>
      )}

      {/* Counted with no price. First, because it is the one that changes
          the total value, and like the list under it it never blocks closing. */}
      {unpricedProducts.length > 0 && (
        <section className="mb-6">
          <ListHeading count={unpricedProducts.length}>Counted with no price</ListHeading>
          <div className={`${card} p-4`}>
            <p className="text-xs text-muted mb-3">
              These had no price when they were counted, so they are not in the total value. You can
              still close the stock take.
            </p>
            <div className="space-y-2">
              {unpricedProducts.map(product => (
                <p key={product.id} className="text-sm font-medium text-gray-900">{countName(product)}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Counted in one place only.
          Above the uncounted list because it is the shorter and stranger of the
          two, and it never blocks closing. */}
      {partlyCounted.length > 0 && (
        <section className="mb-6">
          <ListHeading count={partlyCounted.length}>Counted in one place only</ListHeading>

          <div className={`${card} p-4`}>
            <p className="text-xs text-muted mb-3">
              These are kept in more than one place but were not counted in all of them. Check the
              other places are empty before closing. You can still close the stock take.
            </p>

            <div className="space-y-2">
              {(allPlaces ? partlyCounted : partlyCounted.slice(0, 3)).map(({ product, counted, missing }) => (
                <div key={product.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900 flex-1 min-w-0">{countName(product)}</span>
                  {/* Filled where it was counted, outlined where it was not,
                      each in that section's own colour, so the pair reads
                      without being read. */}
                  {counted.map(place => (
                    <span
                      key={place}
                      className={badge}
                      style={{
                        color: sectionColour(place).ink,
                        backgroundColor: `${sectionColour(place).ink}1a`,
                      }}
                    >
                      {place}
                    </span>
                  ))}
                  {missing.map(place => (
                    <span
                      key={place}
                      className={`${badge} border bg-white`}
                      style={{ color: sectionColour(place).ink, borderColor: sectionColour(place).ink }}
                    >
                      not {place}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            {partlyCounted.length > 3 && (
              <button
                type="button"
                onClick={() => setAllPlaces(!allPlaces)}
                className={`${rowButton('plain')} mt-3`}
              >
                {allPlaces ? 'Show fewer' : `Show the other ${partlyCounted.length - 3}`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Uncounted products */}
      <section className="mb-6">
        <h2 className={`${captionClass} mb-3`}>
          Uncounted products ({uncountedProducts.length})
        </h2>

        {uncountedProducts.length === 0 ? (
          <Notice tone="good">
            Everything has been counted. Ready to close.
          </Notice>
        ) : (
          <>
            <p className="text-xs text-muted mb-3">
              Nobody has counted these yet. Count them now, or close without them. They will show as not counted, not as zero.
            </p>
            <div className={`${card} overflow-hidden`}>
              {uncountedProducts.map((product, i) => {
                const isExpanded = expandedProductId === product.id
                const productLines = getProductLines(product.id)
                return (
                  <div key={product.id} className={i < uncountedProducts.length - 1 ? 'border-b border-border' : ''}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(product.id)}
                      className="w-full text-left px-4 py-3"
                      style={{ minHeight: '52px' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-gray-900">
                          {countName(product)}
                          <span className="text-xs text-muted ml-2">{product.section} · {product.unit}</span>
                        </p>
                        <svg className={`w-4 h-4 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4">
                        {productLines.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {productLines.map(line => (
                              <div key={line.id} className="text-sm bg-white border border-border rounded-lg px-3 py-2 shadow-sm">
                                <span className="font-semibold text-gray-900">{fmtQty(line.quantity_counted)} {product.unit}</span>
                                {line.location_note && <span className="text-muted"> · {line.location_note}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                          <div className="flex-1">
                            <label htmlFor="review-quantity" className={labelClass}>Quantity ({product.unit})</label>
                            <input
                              id="review-quantity"
                              type="text" inputMode="decimal" onFocus={e => e.target.select()} value={draftQty}
                              onChange={e => setDraftQty(e.target.value.replace(/[^0-9.]/g, ''))}
                              placeholder="0"
                              className={fieldClass}
                            />
                          </div>
                          <div className="flex-1">
                            <label htmlFor="review-location" className={labelClass}>Location (optional)</label>
                            <input
                              id="review-location"
                              type="text" value={draftLocation}
                              onChange={e => setDraftLocation(e.target.value)}
                              placeholder="e.g. back cold room"
                              className={fieldClass}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddLine(product)}
                            disabled={savingLine || draftQty === '' || isNaN(parseFloat(draftQty))}
                            className={primaryButton('md')}
                            style={{ minHeight: '44px' }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* Close button */}
      <button
        type="button"
        onClick={openCloseConfirm}
        className={`${primaryButton('xl', 'good')} w-full sm:w-auto`}
      >
        Close stock take
      </button>

      {/* Close confirmation.

          In the shared shell rather than its own overlay. The hand rolled one
          had no Escape key, did not stop the page scrolling underneath it and
          told a screen reader nothing, all of which the shell has had for
          months. */}
      {showCloseConfirm && (
        <Modal title="Close this stock take?" onClose={closeConfirm} width="max-w-md">
          <div className="px-6 py-4 space-y-3">
            <p className="text-sm text-gray-700">
              After closing, the entries cannot be changed. You can reopen it later to correct them.
            </p>
            {uncountedProducts.length > 0 && (
              <Notice tone="warn">
                {uncountedProducts.length} {uncountedProducts.length === 1 ? 'product has' : 'products have'} not been counted. You can reopen the stock take later to add more entries.
              </Notice>
            )}
            <p className="text-sm text-gray-700">
              Total value: <strong>{fmtMoney(totalValue)}</strong>
            </p>
            <ErrorBanner>{error}</ErrorBanner>
          </div>
          <div className={modalFooter}>
            <button type="button" onClick={closeConfirm} disabled={closing} className={secondaryButton}>
              Cancel
            </button>
            <button type="button" onClick={handleCloseSession} disabled={closing} className={primaryButton('lg', 'good')}>
              {closing ? 'Closing...' : 'Close stock take'}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}