import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { resolveUnitCost } from '../../lib/mixCost'
import { fmtMoney, fmtQty } from '../../lib/format'
import { friendlyError } from '../../lib/errors'
import { countName } from '../../lib/products'
import { sectionRank, sectionColour } from '../../lib/sections'
import PageContainer from '../../components/layout/PageContainer'
import { card } from '../../lib/controlStyles'

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

export default function StockTakeReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [session, setSession] = useState(null)
  const [products, setProducts] = useState([])
  const [lines, setLines] = useState([])
  const [preferredPrices, setPreferredPrices] = useState([])
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

  const isManager = user && ['super_admin', 'owner', 'store_manager'].includes(user.role)

  useEffect(() => {
    fetchEverything()
  }, [id])

  async function fetchEverything() {
    setLoading(true)
    setError('')

    const { data: sessionData, error: sessionErr } = await supabase
      .from('stock_takes').select('*').eq('id', id).single()
    if (sessionErr || !sessionData) {
      setError('Stock take session not found.')
      setLoading(false)
      return
    }
    setSession(sessionData)

    const { data: productsData } = await supabase
      .from('products').select('*').eq('is_active', true).order('name')
    setProducts(productsData || [])

    const { data: linesData } = await supabase
      .from('stock_take_lines').select('*').eq('stock_take_id', id)
    setLines(linesData || [])

    const { data: pricesData } = await supabase
      .from('product_supplier_prices').select('*').eq('is_preferred', true)
    setPreferredPrices(pricesData || [])

    const { data: recipesData } = await supabase
      .from('mix_recipes').select('*')
    setRecipeLines(recipesData || [])

    setLoading(false)
  }

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
        const places = [product.section || 'Other', ...(product.also_in || [])]
          .filter((place, i, all) => place && all.indexOf(place) === i)
        if (places.length < 2) return null

        const counted = places.filter(place =>
          lines.some(l => l.product_id === product.id && (l.section || 'Other') === place))
        if (counted.length === 0 || counted.length === places.length) return null

        return { product, counted, missing: places.filter(place => !counted.includes(place)) }
      })
      .filter(Boolean)
      .sort((a, b) => a.product.name.localeCompare(b.product.name))
  }, [products, lines])

  const totalValue = useMemo(() => {
    return lines.reduce((sum, l) => sum + Number(l.line_total || 0), 0)
  }, [lines])

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
    // genuine zero. Total value is the sum of what was actually counted.
    const { error: updateErr } = await supabase
      .from('stock_takes')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_value: totalValue,
      })
      .eq('id', id)

    setClosing(false)
    if (updateErr) { setError(friendlyError(updateErr)); return }

    navigate(`/inventory/stock-takes/${id}/summary`)
  }

  if (loading) {
    return <div><p className="text-sm text-gray-500">Loading...</p></div>
  }

  if (error && !session) {
    return (
      <div>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        <button type="button" onClick={() => navigate('/inventory/stock-takes')} className="mt-4 text-sm font-semibold text-accent-ink">← Back</button>
      </div>
    )
  }

  if (!isManager) {
    return (
      <div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          Only managers can review and close a stock take.
        </div>
        <button type="button" onClick={() => navigate(`/inventory/stock-takes/${id}`)} className="mt-4 text-sm font-semibold text-accent-ink">← Back to counting</button>
      </div>
    )
  }

  if (session.status !== 'in_progress') {
    return (
      <div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          This stock take is already closed.
        </div>
        <button type="button" onClick={() => navigate(`/inventory/stock-takes/${id}/summary`)} className="mt-4 text-sm font-semibold text-accent-ink">View summary →</button>
      </div>
    )
  }

  const countedCount = products.length - uncountedProducts.length

  return (
    <PageContainer>
      <button
        type="button"
        onClick={() => navigate(`/inventory/stock-takes/${id}`)}
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to counting
      </button>

      <header className="mb-6">
        <h1 className="font-serif text-2xl font-bold text-gray-900">Review &amp; close</h1>
        <p className="text-sm text-muted mt-1">
          Check the count, then close the stock take. Once closed it becomes read-only.
        </p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className={`${card} p-4`}>
          <p className="text-xs text-muted uppercase tracking-wide">Counted</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{countedCount}<span className="text-base text-muted">/{products.length}</span></p>
        </div>
        <div className={`${card} p-4`}>
          <p className="text-xs text-muted uppercase tracking-wide">Uncounted</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{uncountedProducts.length}</p>
        </div>
        <div className={`${card} p-4 col-span-2 sm:col-span-1`}>
          <p className="text-xs text-muted uppercase tracking-wide">Total value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtMoney(totalValue)}</p>
        </div>
      </div>

      {/* Not while the closing dialog is up, which covers the whole screen
          and would hide it. It goes inside the dialog instead. */}
      {error && !showCloseConfirm && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {/* Counted in one place only.
          Above the uncounted list because it is the shorter and stranger of the
          two, and it never blocks closing. */}
      {partlyCounted.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted">
              Counted in one place only
            </h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              {partlyCounted.length}
            </span>
          </div>

          <div className={`${card} p-4`}>
            <p className="text-xs text-muted mb-3">
              These are kept in more than one place and you counted them in one of them. Worth a
              look before closing, in case the other shelf was not empty. It does not stop you
              closing.
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
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
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
                      className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-white"
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
                className="mt-3 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-800 shadow-sm hover:bg-gray-50"
              >
                {allPlaces ? 'Show fewer' : `Show the other ${partlyCounted.length - 3}`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Uncounted products */}
      <section className="mb-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted mb-3">
          Uncounted products ({uncountedProducts.length})
        </h2>

        {uncountedProducts.length === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl p-4">
            Everything has been counted. Ready to close.
          </div>
        ) : (
          <>
            <p className="text-xs text-muted mb-3">
              These have no count for this session. You can count them now, or close without them (they will be left uncounted, not recorded as zero).
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
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
                            <label className="block text-xs font-medium text-muted mb-1">Quantity ({product.unit})</label>
                            <input
                              type="text" inputMode="decimal" value={draftQty}
                              onChange={e => setDraftQty(e.target.value.replace(/[^0-9.]/g, ''))}
                              placeholder="0"
                              className="w-full px-3 py-2.5 border border-border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-muted mb-1">Location <span className="font-normal">(optional)</span></label>
                            <input
                              type="text" value={draftLocation}
                              onChange={e => setDraftLocation(e.target.value)}
                              placeholder="e.g. back cold room"
                              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddLine(product)}
                            disabled={savingLine || draftQty === '' || isNaN(parseFloat(draftQty))}
                            className="bg-accent hover:bg-accent/90 disabled:opacity-40 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors"
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
        onClick={() => setShowCloseConfirm(true)}
        className="w-full sm:w-auto bg-green-brand hover:bg-green-brand/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        Close stock take
      </button>

      {/* Close confirmation */}
      {showCloseConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={closeConfirm}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif text-xl font-bold text-gray-900 mb-2">Close this stock take?</h2>
            <p className="text-sm text-gray-700 mb-3">
              Once closed, counts become read-only. You can reopen it later if a correction is needed.
            </p>
            {uncountedProducts.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2 mb-3">
                {uncountedProducts.length} {uncountedProducts.length === 1 ? 'product' : 'products'} will be left uncounted for this session (no count recorded). You can reopen and add them later if needed.
              </div>
            )}
            <p className="text-sm text-gray-700 mb-4">
              Total value: <strong>{fmtMoney(totalValue)}</strong>
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{error}</div>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeConfirm} disabled={closing} className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleCloseSession} disabled={closing} className="px-5 py-2 text-sm font-semibold bg-green-brand hover:bg-green-brand/90 text-white rounded-lg disabled:opacity-50">
                {closing ? 'Closing...' : 'Close stock take'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}