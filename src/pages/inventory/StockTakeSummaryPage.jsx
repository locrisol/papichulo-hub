import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { exportStockTakePdf } from '../../lib/stockTakePdf'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney, fmtQty } from '../../lib/format'
import { sectionColour, sectionRank } from '../../lib/sections'
import { heldFor, partiesIn } from '../../lib/products'
import { friendlyError } from '../../lib/errors'
import PageContainer from '../../components/layout/PageContainer'
import { card } from '../../lib/controlStyles'

// A finished stock take: what was counted, what it was worth, and who did it.
//
// The value shown here is not worked out again from today's prices. Every line
// saved its own unit cost on the day it was counted, so a price change next
// month does not quietly rewrite what the stock was worth back then. That is the
// whole point of a stock take having a value at all.
//
// A manager can reopen a closed session from here. It asks for a reason and
// records who reopened it and when, because a closed count is a figure the
// business acts on, and changing one after the fact should leave a trail rather
// than just happening.
//
// This is also where the PDF comes from, which is the format the owner is used
// to seeing.

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function StockTakeSummaryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [session, setSession] = useState(null)
  const [starter, setStarter] = useState(null)
  const [reopener, setReopener] = useState(null)
  const [products, setProducts] = useState([])
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showReopen, setShowReopen] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [reopening, setReopening] = useState(false)

  const { activeRestaurant } = useRestaurant()

  const isManager = user && ['super_admin', 'owner', 'store_manager'].includes(user.role)

  useEffect(() => { fetchEverything() }, [id])

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

    // Look up display names for started_by / reopened_by
    const userIds = [sessionData.started_by, sessionData.reopened_by].filter(Boolean)
    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users').select('id, full_name').in('id', userIds)
      setStarter((usersData || []).find(u => u.id === sessionData.started_by) || null)
      setReopener((usersData || []).find(u => u.id === sessionData.reopened_by) || null)
    }

    const { data: productsData } = await supabase
      .from('products').select('*').eq('is_active', true).order('name')
    setProducts(productsData || [])

    const { data: linesData } = await supabase
      .from('stock_take_lines').select('*').eq('stock_take_id', id)
    setLines(linesData || [])

    setLoading(false)
  }

  const countedProductIds = useMemo(() => new Set(lines.map(l => l.product_id)), [lines])

  // All of these take the place as well as the product, because a product kept
  // in two of them has lines in both and each heading is only about its own.
  // Pass no section and you get the product's whole count, which is what the
  // total at the top is.
  function linesFor(productId, section) {
    return lines.filter(l =>
      l.product_id === productId
      && (!section || (l.section || 'Other') === section))
  }

  function getProductLines(productId, section) {
    return linesFor(productId, section)
      .sort((a, b) => new Date(a.counted_at) - new Date(b.counted_at))
  }

  function getProductTotal(productId, section) {
    return linesFor(productId, section).reduce((s, l) => s + Number(l.quantity_counted || 0), 0)
  }

  function getProductValue(productId, section) {
    return linesFor(productId, section).reduce((s, l) => s + Number(l.line_total || 0), 0)
  }

  function getSectionValue(items, section) {
    return items.reduce((s, p) => s + getProductValue(p.id, section), 0)
  }

  // Return a line's unit_breakdown as sorted parts (biggest format left,
  // loose last), or null for old-style lines without a breakdown.
  function breakdownParts(line, product) {
    const b = line.unit_breakdown
    if (!b || typeof b !== 'object') return null
    const parts = []
    for (const [label, info] of Object.entries(b)) {
      const qty = info?.qty
      if (qty == null) continue
      const factor = Number(info.factor ?? 1)
      if (label === 'loose') {
        parts.push({ key: 'loose', text: `${fmtQty(qty)} ${product.unit}`, factor, isLoose: true })
      } else {
        parts.push({ key: label, text: `${fmtQty(qty)} ${label}`, factor, isLoose: false })
      }
    }
    if (parts.length === 0) return null
    parts.sort((a, b) => {
      if (a.isLoose && !b.isLoose) return 1
      if (!a.isLoose && b.isLoose) return -1
      return b.factor - a.factor
    })
    return parts
  }

  // Sections containing only counted products, grouped and ordered.
  //
  // Grouped by where each line was actually counted rather than by the product's
  // own section, because a product can be kept in two places and this is a
  // valuation of what is sitting in each of them. Counting six in the cold room
  // and four in dry and then reading ten against dry would be a number that
  // matches nothing anybody saw on a shelf.
  //
  // A product kept in two places therefore appears under both headings, with
  // only that place's lines behind each. Nothing is counted twice: a line
  // belongs to one place and no more.
  const sections = useMemo(() => {
    const grouped = {}
    for (const line of lines) {
      const s = line.section || 'Other'
      const product = products.find(p => p.id === line.product_id)
      if (!product) continue
      if (!grouped[s]) grouped[s] = []
      if (!grouped[s].some(p => p.id === product.id)) grouped[s].push(product)
    }
    return Object.entries(grouped)
      .map(([section, items]) => ({ section, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => sectionRank(a.section) - sectionRank(b.section))
  }, [products, lines])

  const uncountedProducts = useMemo(() => {
    return products.filter(p => !countedProductIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [products, countedProductIds])

  function sessionTitle() {
    if (session.notes && session.notes.trim()) return session.notes.trim()
    const typeWord = session.type ? session.type.charAt(0).toUpperCase() + session.type.slice(1) : 'Stock'
    const monthYear = new Date(session.started_at).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
    return `${typeWord} Stock Take (${monthYear})`
  }

  function handleExportPdf() {
    exportStockTakePdf({
      session,
      restaurant: activeRestaurant || { name: 'Papi Chulo' },
      products,
      lines,
      generatedBy: user?.full_name || 'Unknown',
      title: sessionTitle(),
    })
  }

  async function handleReopen() {
    setReopening(true)
    setError('')

    const { error: updateErr } = await supabase
      .from('stock_takes')
      .update({
        status: 'in_progress',
        reopened_at: new Date().toISOString(),
        reopened_by: user.id,
        reopen_reason: reopenReason.trim() || null,
      })
      .eq('id', id)

    setReopening(false)

    if (updateErr) {
      if (updateErr.code === '23505') {
        setError('There is already an active stock take for this restaurant. Close it before reopening this one.')
      } else {
        setError(friendlyError(updateErr))
      }
      return
    }

    navigate(`/inventory/stock-takes/${id}`)
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

  const isClosed = session.status !== 'in_progress'

  return (
    <PageContainer>
      <button
        type="button"
        onClick={() => navigate('/inventory/stock-takes')}
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        All stock takes
      </button>

      {/* If somehow this is still in progress, point back to counting */}
      {!isClosed && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg mb-4">
          This stock take is still in progress.{' '}
          <button type="button" onClick={() => navigate(`/inventory/stock-takes/${id}`)} className="font-semibold underline">
            Continue counting
          </button>
        </div>
      )}

      <header className="mb-5">
        <h1 className="font-serif text-xl sm:text-2xl font-bold text-gray-900">{sessionTitle()}</h1>
        <p className="text-sm text-muted mt-1">
          Started by {starter?.full_name || 'Unknown'} on {fmtDateTime(session.started_at)}
          {session.completed_at && ` · Closed ${fmtDateTime(session.completed_at)}`}
        </p>
        {session.reopened_at && (
          <p className="text-sm text-amber-700 mt-1 italic">
            Reopened {fmtDateTime(session.reopened_at)} by {reopener?.full_name || 'Unknown'}
            {session.reopen_reason ? `: ${session.reopen_reason}` : ''}
          </p>
        )}
      </header>

      {isManager && (
        <button
          type="button"
          onClick={handleExportPdf}
          className="inline-flex items-center gap-2 bg-white border border-border hover:bg-gray-50 text-gray-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors mb-5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download PDF
        </button>
      )}

      {/* The three numbers.
          One card the width of the screen on a phone, split in two lines with
          the label beside the figure. Three across a phone gave each of them
          about a hundred points, which "Total value" cannot fit a heading in
          let alone a number, so the money ran off the edge of its own card. */}
      <div className={`${card} divide-y divide-border sm:divide-y-0 sm:grid sm:grid-cols-3 sm:divide-x mb-6`}>
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:block">
          <p className="text-xs text-muted uppercase tracking-wide">Counted</p>
          <p className="text-2xl font-bold text-gray-900 sm:mt-1">
            {countedProductIds.size}<span className="text-base text-muted">/{products.length}</span>
          </p>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:block">
          <p className="text-xs text-muted uppercase tracking-wide">Lines</p>
          <p className="text-2xl font-bold text-gray-900 sm:mt-1">{lines.length}</p>
        </div>
        <div className="flex items-baseline justify-between gap-3 px-4 py-3 sm:block">
          <p className="text-xs text-muted uppercase tracking-wide">Total value</p>
          <p className="text-2xl font-bold text-gray-900 sm:mt-1 whitespace-nowrap">
            {fmtMoney(session.total_value)}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {/* Counted products by section */}
      <div className="space-y-5 mb-6">
        {sections.map(({ section, items }) => {
          const colour = sectionColour(section)
          const sectionValue = getSectionValue(items, section)
          const parties = partiesIn(items)
          return (
            <div key={section}>
              <div className={`${colour.solid} rounded-lg px-3 py-2 mb-2 flex items-center justify-between`}>
                <h2 className="font-serif text-base font-bold text-white">{section}</h2>
                <span className="text-sm font-semibold text-white bg-white/20 px-2.5 py-0.5 rounded-full">
                  {fmtMoney(sectionValue)}
                </span>
              </div>

              {/* Split, but only where a section actually holds somebody
                  else's stock. Packaging does, because Pita Pit keep their
                  boxes in our cupboard; nothing else does, and putting a
                  breakdown under every heading to say one line would be noise
                  on five of them. The heading keeps the combined figure, since
                  that is what was counted off the shelf. */}
              {parties.length > 1 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 px-1">
                  {parties.map(party => (
                    <span key={party || 'ours'} className="text-xs text-gray-600">
                      {section} ({party || 'ours'}){' '}
                      <span className="font-semibold text-gray-900">
                        {fmtMoney(getSectionValue(items.filter(p => heldFor(p) === party), section))}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <div className={`${colour.bg} border ${colour.border} rounded-xl overflow-hidden`}>
                {items.map((product, i) => {
                  const productLines = getProductLines(product.id, section)
                  const total = getProductTotal(product.id, section)
                  const value = getProductValue(product.id, section)
                  return (
                    <div key={`${section}-${product.id}`} className={`px-4 py-3 ${i < items.length - 1 ? 'border-b border-border' : ''}`}>
                      {/* The name above the numbers on a phone, side by side
                          on anything wider. Squeezed side by side on a small
                          screen the name wrapped onto three lines and the
                          quantity onto two, and neither read as a row. */}
                      <div className="sm:flex sm:items-center sm:justify-between sm:gap-3">
                        <p className="font-medium text-gray-900 sm:flex-1 sm:min-w-0">
                          {product.name}
                          <span className="text-xs text-muted ml-2">{product.unit}</span>
                        </p>
                        <div className="flex items-baseline gap-2 mt-0.5 sm:mt-0 sm:block sm:text-right sm:flex-shrink-0">
                          <p className="font-semibold text-gray-900 whitespace-nowrap">
                            {fmtQty(total)} {product.unit}
                          </p>
                          <p className="text-xs text-muted whitespace-nowrap">{fmtMoney(value)}</p>
                        </div>
                      </div>
                      {(productLines.length > 1 || productLines.some(l => breakdownParts(l, product))) && (
                        <div className="mt-2 space-y-1.5">
                          {productLines.map(line => {
                            const parts = breakdownParts(line, product)
                            return (
                              <div key={line.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                                {parts ? (
                                  <>
                                    {parts.map(part => (
                                      <span key={part.key} className="bg-white border border-border rounded-md px-2 py-0.5 font-medium text-gray-700">
                                        {part.text}
                                      </span>
                                    ))}
                                    <span className="text-muted">= {fmtQty(line.quantity_counted)} {product.unit}</span>
                                  </>
                                ) : (
                                  <span className="bg-white border border-border rounded-full px-2 py-0.5 text-gray-600">
                                    {fmtQty(line.quantity_counted)} {product.unit}
                                  </span>
                                )}
                                {line.location_note && (
                                  <span className="text-muted">· {line.location_note}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Uncounted products note */}
      {uncountedProducts.length > 0 && (
        <div className="bg-gray-50 border border-border rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-1">
            {uncountedProducts.length} {uncountedProducts.length === 1 ? 'product was' : 'products were'} not counted this session
          </p>
          <p className="text-xs text-muted">
            {uncountedProducts.map(p => p.name).join(', ')}
          </p>
        </div>
      )}

      {/* Reopen (managers, closed sessions only) */}
      {isManager && isClosed && (
        <button
          type="button"
          onClick={() => setShowReopen(true)}
          className="w-full sm:w-auto bg-white border border-border hover:bg-gray-50 text-gray-900 font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Reopen stock take
        </button>
      )}

      {/* Reopen confirmation */}
      {showReopen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => !reopening && setShowReopen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-serif text-xl font-bold text-gray-900 mb-2">Reopen this stock take?</h2>
            <p className="text-sm text-gray-700 mb-3">
              This returns the stock take to in-progress so counts can be edited. The reopen is recorded with your name and the reason.
            </p>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Reason</label>
            <input
              type="text"
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="e.g. accountant flagged a discrepancy"
              maxLength={200}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowReopen(false)} disabled={reopening} className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={handleReopen} disabled={reopening} className="px-5 py-2 text-sm font-semibold bg-green-brand hover:bg-green-brand/90 text-white rounded-lg disabled:opacity-50">
                {reopening ? 'Reopening...' : 'Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}