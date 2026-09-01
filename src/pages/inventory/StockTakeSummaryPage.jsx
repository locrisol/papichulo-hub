import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { exportStockTakePdf } from '../../lib/stockTakePdf'
import { useRestaurant } from '../../context/RestaurantContext'
import { fmtMoney, fmtQty } from '../../lib/format'
import { sectionColour } from '../../lib/sections'
import { countName } from '../../lib/products'
import { bySection, summarise } from '../../lib/stockTakeSummary'
import StockTakeValue from '../../components/StockTakeValue'
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

// What a stock take is called, for any of them rather than only the one on
// screen. A session can be given a name when it is started, and where it was
// not it is named after the month it was counted in.
function titleOf(session) {
  if (!session) return 'the open stock take'
  if (session.notes && session.notes.trim()) return session.notes.trim()
  const typeWord = session.type ? session.type.charAt(0).toUpperCase() + session.type.slice(1) : 'Stock'
  const monthYear = new Date(session.started_at).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })
  return `${typeWord} Stock Take (${monthYear})`
}

// One loose entry is its own total, so "4.27 KG = 4.27 KG" says the same number
// twice. The equals sign is there to show the arithmetic when somebody counted
// in packs, and with a single loose entry there is no arithmetic to show.
function justLoose(parts) {
    return parts.length === 1 && parts[0].isLoose
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
  // The stock take standing in the way of this one being reopened, once we
  // know there is one. Only ever set by a failed reopen.
  const [blocker, setBlocker] = useState(null)
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

  // Where everything was counted and what each place came to, both worked out
  // in lib so the PDF gets the same answer. See stockTakeSummary for why a
  // line belongs to the place it was written down in and not to the product's
  // own section.
  const places = useMemo(() => bySection(products, lines), [products, lines])
  const summary = useMemo(() => summarise(products, lines), [products, lines])
  const rowFor = useMemo(() => new Map(summary.sections.map(s => [s.section, s])), [summary])

  function sessionTitle() {
    return titleOf(session)
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

  // Shutting the dialog takes its message with it, so a failed reopen does
  // not leave a red bar sitting on the page after you have walked away from it.
  function closeReopen() {
    if (reopening) return
    setShowReopen(false)
    setError('')
    setBlocker(null)
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
        setError('There is already a stock take open. Close it before reopening this one.')
        // Which one, so it is somewhere to go rather than something to go and
        // look for. Only asked for when the reopen has already failed, and if
        // the lookup itself fails the message above still stands on its own.
        const { data: open } = await supabase
          .from('stock_takes')
          .select('id, notes, type, started_at')
          .eq('restaurant_id', session.restaurant_id)
          .eq('status', 'in_progress')
          .maybeSingle()
        setBlocker(open || null)
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

      {/* The answer, above the working.
          A hundred and sixty products is a long way to scroll for five numbers
          and a total, and those are what anybody opening a finished count came
          for. Same block, same figures and the same order as the first page of
          the PDF. */}
      {lines.length > 0 && (
        <div className={`${card} p-4 sm:p-5 mb-6`}>
          <StockTakeValue summary={summary} />
        </div>
      )}

      {/* Not while the reopen dialog is up. The dialog covers the whole
          screen, so a message drawn out here is behind it and the reopen looks
          like it did nothing at all. It goes inside the dialog instead. */}
      {error && !showReopen && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
      )}

      {/* Counted products by section */}
      <div className="space-y-5 mb-6">
        {places.map(({ section, items }) => {
          const colour = sectionColour(section)
          const row = rowFor.get(section)
          const parties = row?.parties
          return (
            <div key={section}>
              <div className={`${colour.solid} rounded-lg px-3 py-2 mb-2 flex items-center justify-between`}>
                <h2 className="font-serif text-base font-bold text-white">{section}</h2>
                <span className="text-sm font-semibold text-white bg-white/20 px-2.5 py-0.5 rounded-full">
                  {fmtMoney(row?.value || 0)}
                </span>
              </div>

              {/* Split, but only where a section actually holds somebody
                  else's stock. Packaging does, because Pita Pit keep their
                  boxes in our cupboard; nothing else does, and putting a
                  breakdown under every heading to say one line would be noise
                  on five of them. The heading keeps the combined figure, since
                  that is what was counted off the shelf. */}
              {parties && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 px-1">
                  {parties.map(party => (
                    <span key={party.who || 'ours'} className="text-xs text-gray-600">
                      {section} ({party.who || 'ours'}){' '}
                      <span className="font-semibold text-gray-900">{fmtMoney(party.value)}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className={`${colour.bg} border ${colour.border} rounded-xl overflow-hidden`}>
                {items.map(({ product, lines: productLines, qty: total, value }, i) => {
                  return (
                    <div key={`${section}-${product.id}`} className={`px-4 py-3 ${i < items.length - 1 ? 'border-b border-border' : ''}`}>
                      {/* The name above the numbers on a phone, side by side
                          on anything wider. Squeezed side by side on a small
                          screen the name wrapped onto three lines and the
                          quantity onto two, and neither read as a row. */}
                      <div className="sm:flex sm:items-center sm:justify-between sm:gap-3">
                        <p className="font-medium text-gray-900 sm:flex-1 sm:min-w-0">
                          {countName(product)}
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
                                    {!justLoose(parts) && (
                                      <span className="text-muted">= {fmtQty(line.quantity_counted)} {product.unit}</span>
                                    )}
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

      {/* What the count does not cover, in two lists rather than one.
          A zero means somebody looked and there was none, which is an order to
          place. No line at all means nobody went to that shelf. Same two lists
          and the same words as the report, off the same figures. */}
      <NameList
        title="Counted as none in stock"
        note="Somebody looked and there was none. Worth an order."
        products={summary.noneInStock}
      />
      <NameList
        title="Not counted"
        note="No count was recorded this session, so nothing here is known either way."
        products={summary.notCounted}
      />

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={closeReopen}>
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

            {/* Why it did not work, where you are looking when it does not. The
                commonest reason is another stock take already open, which the
                database refuses outright. */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
                <p>{error}</p>
                {blocker && (
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory/stock-takes/${blocker.id}`)}
                    className="mt-1.5 font-semibold underline text-left"
                  >
                    Go to {titleOf(blocker)}
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={closeReopen} disabled={reopening} className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
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

// A list of names under a heading, grouped by where they belong.
//
// Names only, because there are no figures to give: that is the point of both
// of the lists that use this. Grouped by section so it reads as somewhere to
// walk back to rather than as a paragraph of product names, which is what the
// uncounted note used to be.
function NameList({ title, note, products }) {
  if (!products || products.length === 0) return null

  const groups = []
  for (const product of products) {
    const place = product.section || 'Other'
    const found = groups.find(g => g.place === place)
    if (found) found.items.push(product)
    else groups.push({ place, items: [product] })
  }

  return (
    <div className="bg-gray-50 border border-border rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white border border-border text-gray-700">
          {products.length}
        </span>
      </div>
      <p className="text-xs text-muted mb-2.5">{note}</p>

      <div className="space-y-2 sm:space-y-1.5">
        {groups.map(({ place, items }) => (
          <div key={place} className="sm:flex sm:gap-3 text-xs">
            {/* Its own line on a phone, beside the names on anything wider.
                Sharing the line on a narrow screen there is no gap to put
                between them, so the section ran straight into the first
                product. */}
            <span
              className="block font-bold whitespace-nowrap sm:w-24 sm:flex-shrink-0 sm:pt-0.5"
              style={{ color: sectionColour(place).ink }}
            >
              {place}
            </span>

            {/* A box each rather than commas between them. A product name can
                be one word or five, and run together with commas there was
                nothing saying where one stopped and the next started. These
                are the same boxes the counts use further up the page. */}
            <span className="flex flex-wrap gap-1">
              {items.map(product => (
                <span
                  key={product.id}
                  className="bg-white border border-border rounded-md px-2 py-0.5 text-gray-700"
                >
                  {countName(product)}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
