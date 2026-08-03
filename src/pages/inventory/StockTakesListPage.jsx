import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useRestaurant } from '../../context/RestaurantContext'
import { useAuth } from '../../context/AuthContext'
import StartStockTakeModal from '../../components/StartStockTakeModal'
import { friendlyError } from '../../lib/errors'
import PageContainer from '../../components/layout/PageContainer'

export default function StockTakesListPage() {
  const navigate = useNavigate()
  const { activeRestaurant } = useRestaurant()
  const { user } = useAuth()

  const [activeSession, setActiveSession] = useState(null)
  const [closedSessions, setClosedSessions] = useState([])
  const [activeProgress, setActiveProgress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showStartModal, setShowStartModal] = useState(false)
  const [error, setError] = useState('')

  const isManager = user && ['super_admin', 'owner', 'store_manager'].includes(user.role)

  useEffect(() => {
    if (!activeRestaurant) return
    fetchSessions()
  }, [activeRestaurant])

  async function fetchSessions() {
    setLoading(true)
    setError('')

    // The active session (if any) and the 10 most recent closed sessions.
    // Joins on users for the started_by / completed_by / reopened_by display names.
    const { data: sessions, error: sessionErr } = await supabase
      .from('stock_takes')
      .select(`
        *,
        starter:users!stock_takes_started_by_fkey(id, full_name),
        reopener:users!stock_takes_reopened_by_fkey(id, full_name)
      `)
      .eq('restaurant_id', activeRestaurant.id)
      .order('started_at', { ascending: false })
      .limit(11) // 1 active + 10 closed at most

    if (sessionErr) {
      setError(friendlyError(sessionErr))
      setLoading(false)
      return
    }

    const active = sessions.find(s => s.status === 'in_progress') || null
    const closed = sessions.filter(s => s.status !== 'in_progress').slice(0, 10)

    setActiveSession(active)
    setClosedSessions(closed)

    // If there's an active session, compute progress: how many products
    // have at least one line, vs total active products in the restaurant.
    if (active) {
      const [{ count: totalProducts }, { count: totalLines }] = await Promise.all([
        supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('stock_take_lines')
          .select('id', { count: 'exact', head: true })
          .eq('stock_take_id', active.id),
      ])

      // A count of stock_take_lines gives all line rows, not distinct products,
      // so fetch the product_ids and count the distinct ones instead.
      const { data: linesForDistinct } = await supabase
        .from('stock_take_lines')
        .select('product_id')
        .eq('stock_take_id', active.id)

      const distinctProductIds = new Set((linesForDistinct || []).map(l => l.product_id))

      setActiveProgress({
        productsCounted: distinctProductIds.size,
        productsTotal: totalProducts || 0,
        linesTotal: totalLines || 0,
      })
    } else {
      setActiveProgress(null)
    }

    setLoading(false)
  }

  function formatDateTime(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('en-IE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatDate(iso) {
    if (!iso) return '-'
    return new Date(iso).toLocaleDateString('en-IE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  function typeLabel(type) {
    if (type === 'daily') return 'Daily'
    if (type === 'weekly') return 'Weekly'
    if (type === 'monthly') return 'Monthly'
    return type
  }

  function typeBadgeClass(type) {
    if (type === 'daily') return 'bg-blue-50 text-blue-700 border-blue-200'
    if (type === 'weekly') return 'bg-purple-50 text-purple-700 border-purple-200'
    return 'bg-amber-50 text-amber-700 border-amber-200' // monthly default
  }

  if (!activeRestaurant) {
    return (
      <div>
        <p className="text-sm text-gray-500">Select a restaurant to view stock takes.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <p className="text-sm text-gray-500">Loading stock takes...</p>
      </div>
    )
  }

  return (
    <PageContainer>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Stock Takes</h1>
          <p className="text-sm text-muted mt-1">
            {activeRestaurant.name}
            {isManager ? ' | physical inventory counts and history.' : ' | count what is physically in the kitchen and storage.'}
          </p>
        </div>

        {/* Start new button only shown when there's no active session and the user can manage */}
        {!activeSession && isManager && (
          <button
            type="button"
            onClick={() => setShowStartModal(true)}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Start new
          </button>
        )}
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Active session card */}
      {activeSession && (
        <div className="bg-white border-2 border-accent rounded-xl p-5 mb-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-accent">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                  Active stock take
                </span>
                <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${typeBadgeClass(activeSession.type)}`}>
                  {typeLabel(activeSession.type)}
                </span>
              </div>
              <h2 className="font-serif text-lg font-bold text-gray-900">
                {activeSession.notes || `${typeLabel(activeSession.type)} count, ${formatDate(activeSession.started_at)}`}
              </h2>
              <p className="text-sm text-muted mt-1">
                Started by {activeSession.starter?.full_name || 'Unknown'} on {formatDateTime(activeSession.started_at)}
              </p>
            </div>
          </div>

          {activeProgress && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-gray-700">
                  <strong>{activeProgress.productsCounted}</strong> of <strong>{activeProgress.productsTotal}</strong> products counted
                </span>
                <span className="text-muted text-xs">
                  {activeProgress.linesTotal} {activeProgress.linesTotal === 1 ? 'line' : 'lines'} recorded
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent h-full transition-all"
                  style={{
                    width: activeProgress.productsTotal > 0
                      ? `${(activeProgress.productsCounted / activeProgress.productsTotal) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate(`/inventory/stock-takes/${activeSession.id}`)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Continue counting
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      )}

      {/* An employee with nothing to count needs to know why the page is empty.
          They do not get the history below, so without this they would see
          nothing at all. */}
      {!isManager && !activeSession && (
        <div className="bg-white border border-border rounded-xl p-10 text-center">
          <h3 className="font-serif text-lg font-bold text-gray-900 mb-2">Nothing to count right now</h3>
          <p className="text-sm text-muted max-w-sm mx-auto">
            A manager needs to start a stock take before you can count.
          </p>
        </div>
      )}

      {/* History is managers only. An employee cannot open a closed session, so
          listing them would only give them things to click that turn them away. */}
      {isManager && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted mb-3">
            {closedSessions.length === 0 && !activeSession ? '' : 'History'}
          </h2>

          {closedSessions.length === 0 && !activeSession ? (
            <div className="bg-white border border-border rounded-xl p-10 text-center">
              <h3 className="font-serif text-lg font-bold text-gray-900 mb-2">No stock takes yet</h3>
              <p className="text-sm text-muted mb-5 max-w-sm mx-auto">
                Stock takes record what is physically in your kitchen and storage. Start one to count what you have now.
              </p>
              <button
                type="button"
                onClick={() => setShowStartModal(true)}
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                Start your first stock take
              </button>
            </div>
          ) : closedSessions.length === 0 ? (
            <p className="text-sm text-muted italic">No closed stock takes yet.</p>
          ) : (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              {closedSessions.map((session, i) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => navigate(`/inventory/stock-takes/${session.id}/summary`)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${i < closedSessions.length - 1 ? 'border-b border-border' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${typeBadgeClass(session.type)}`}>
                          {typeLabel(session.type)}
                        </span>
                        {session.reopened_at && (
                          <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                            Reopened
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-gray-900">
                        {session.notes || `${typeLabel(session.type)} count, ${formatDate(session.started_at)}`}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        Started {formatDateTime(session.started_at)}
                        {session.completed_at && ` · Closed ${formatDateTime(session.completed_at)}`}
                        {session.starter?.full_name && ` · by ${session.starter.full_name}`}
                      </p>
                      {session.reopened_at && session.reopen_reason && (
                        <p className="text-xs text-amber-700 mt-1 italic">
                          Reopened {formatDateTime(session.reopened_at)} by {session.reopener?.full_name || 'Unknown'}: {session.reopen_reason}
                        </p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {showStartModal && (
        <StartStockTakeModal
          restaurantId={activeRestaurant.id}
          userId={user.id}
          onClose={() => setShowStartModal(false)}
          onCreated={(session) => {
            setShowStartModal(false)
            navigate(`/inventory/stock-takes/${session.id}`)
          }}
        />
      )}
    </PageContainer>
  )
}